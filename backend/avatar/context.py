"""
ContextAssembler — the core intelligence layer of NeuroNudge's AI Buddy.

Runs BEFORE the LLM sees a single token. Pulls from:
  A. PostgreSQL (Supabase)  — 7-day session analytics + trend
  B. DQN Scheduler          — today's recommended exercise
  C. Chroma Cloud           — user episodic memory (semantic)
  D. Chroma Cloud           — clinical coaching knowledge (semantic)
  E. User Profile           — name, personality, tenure, goals
"""
from typing import Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from models.fluency_score import FluencyScore
from models.user import User
from avatar.vector_memory import retrieve_rag_context


def _facial_context(ctx: Dict[str, Any]) -> str:
    feelings = {"calm": "comfortable", "happy": "happy", "anxious": "anxious", "fatigued": "tired", "tense": "tense"}
    expressions = {"neutral": "no strong expression cue", "smile": "smile visible", "brow_furrow": "brow furrow visible",
                   "eyes_closed": "eyes closed", "mouth_open": "mouth movement visible", "unknown": "unclear"}
    feeling = feelings.get(ctx.get("detected_emotion"), "not shared") if ctx.get("emotion_source") == 'self_report' else 'not shared'
    expression = expressions.get(ctx.get("visible_expression"), "unavailable")
    return f"""=== OPTIONAL CAMERA CONTEXT ===
Visible expression cue: {expression}. User-reported feeling: {feeling}.
Do not infer feelings, anxiety, fatigue, pain or clinical tension from facial appearance.
Expression heuristics are not clinical measurements. Ask how the user feels; respect their answer.
No camera cue is evidence about vocal quality or the fluency score.
"""


def _score_trend(scores: list) -> str:
    if len(scores) < 2:
        return "just getting started"
    recent = sum(s.composite_score for s in scores[:3]) / min(3, len(scores))
    older  = sum(s.composite_score for s in scores[3:]) / max(1, len(scores) - 3)
    delta  = recent - older
    if delta > 4:
        return f"improving strongly (+{delta:.1f} pts this week) ↗"
    elif delta > 0:
        return f"improving (+{delta:.1f} pts) ↗"
    elif delta > -4:
        return "holding steady →"
    else:
        return f"needs a boost ({delta:.1f} pts) ↘"


def _days_since(last_date: Optional[datetime]) -> str:
    if not last_date:
        return "haven't practiced yet"
    last = last_date.replace(tzinfo=timezone.utc) if last_date.tzinfo is None else last_date
    delta = datetime.now(timezone.utc) - last
    if delta.days == 0:
        return "today"
    elif delta.days == 1:
        return "yesterday"
    else:
        return f"{delta.days} days ago"


def _tenure_label(created_at: Optional[datetime]) -> str:
    if not created_at:
        return "new member"
    created = created_at.replace(tzinfo=timezone.utc) if created_at.tzinfo is None else created_at
    days = (datetime.now(timezone.utc) - created).days
    if days < 3:
        return f"day {days + 1} member — just getting started"
    elif days < 14:
        return f"{days}-day member"
    else:
        return f"{days // 7}-week member"


async def assemble_user_context(
    user: Optional[User],
    user_message: str,
    db: AsyncSession,
    detected_emotion: Optional[str] = None,
    facial_tension: Optional[str] = None,
    emotion_source: Optional[str] = None,
    visible_expression: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Returns a structured context dict used to build the buddy's system prompt.
    All DB and vector queries run before the LLM is called.
    """

    ctx: Dict[str, Any] = {
        "user_name": "Friend",
        "personality": "auditory",
        "tenure": "new member",
        "total_sessions": 0,
        "current_fluency": 0.0,
        "trend": "just getting started",
        "streak": 0,
        "last_practice": "not yet",
        "recent_sessions": [],
        "best_this_week": None,
        "dqn_recommendation": None,
        "episodic_memories": [],
        "clinical_guidance": [],
        "week_avg": 0.0,
        "detected_emotion": detected_emotion if emotion_source == "self_report" else None,
        "emotion_source": emotion_source,
        "facial_tension": None,
        "visible_expression": visible_expression,
    }

    # ─── A. User Profile ─────────────────────────────────────────────────────
    if user:
        ctx["user_name"]      = user.name or "Friend"
        ctx["personality"]    = user.personality or "auditory"
        ctx["tenure"]         = _tenure_label(user.created_at)
        ctx["current_fluency"] = round(user.fluency_level, 1) if user.fluency_level else 0.0
        ctx["streak"]         = user.streak or 0

    # ─── B. PostgreSQL 7-day analytics ───────────────────────────────────────
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    from scheduler.service import user_history
    valid_scores, mode_history = await user_history(db, user.id) if user else ([], [])
    all_scores = list(reversed(valid_scores))
    ctx["current_fluency"] = all_scores[0].composite_score if all_scores else 0.0

    week_scores = [s for s in all_scores if s.recorded_at and
                   s.recorded_at.replace(tzinfo=timezone.utc) >= week_ago]

    ctx["total_sessions"] = len(all_scores)
    ctx["trend"]          = _score_trend(all_scores)

    if all_scores:
        ctx["last_practice"] = _days_since(all_scores[0].recorded_at)

    if week_scores:
        ctx["week_avg"]      = round(sum(s.composite_score for s in week_scores) / len(week_scores), 1)
        ctx["best_this_week"] = round(max(s.composite_score for s in week_scores), 1)

    # Format last 5 sessions for prompt
    session_lines = []
    for s in all_scores[:5]:
        s_type = "Practice"
        if s.features and isinstance(s.features, dict):
            s_type = s.features.get("session_type", s_type)
        score_str = f"{round(s.composite_score, 1)}"
        # Cross-platform date (no %-d which fails on Windows)
        if s.recorded_at:
            d = s.recorded_at
            date_str = f"{d.day} {d.strftime('%b')}"
        else:
            date_str = "recently"
        notes = s.features.get("notes", "") if s.features and isinstance(s.features, dict) else ""
        notes_part = f" — {notes}" if notes else ""
        session_lines.append(f"{date_str}: {s_type} → Score {score_str}{notes_part}")
    ctx["recent_sessions"] = session_lines

    # ─── C. DQN Scheduler recommendation ─────────────────────────────────────
    try:
        from scheduler.agent import evaluate_dqn_policy
        from starlette.concurrency import run_in_threadpool
        dqn = await run_in_threadpool(evaluate_dqn_policy,
            [score.composite_score for score in valid_scores], mode_history, 1) if valid_scores else None
        ctx["dqn_recommendation"] = dqn
    except Exception as e:
        print(f"[ContextAssembler] DQN Error: {e}")

    # ─── D. Chroma Cloud: episodic memory + clinical knowledge ───────────────
    try:
        user_id_str = str(user.id) if user else None
        rag = retrieve_rag_context(user_id=user_id_str, query=user_message, n_results=3)
        ctx["episodic_memories"] = rag.get("user_memory", [])
        ctx["clinical_guidance"] = rag.get("clinical_guidance", [])
    except Exception as e:
        print(f"[ContextAssembler] Chroma RAG Error: {e}")

    return ctx


def build_rich_system_prompt(ctx: Dict[str, Any]) -> str:
    """
    Renders the full personalized system prompt from the assembled context.
    This is what GPT-4o actually receives.
    """
    name        = ctx["user_name"]
    personality = ctx["personality"].capitalize()
    tenure      = ctx["tenure"]
    sessions    = ctx["total_sessions"]
    fluency     = ctx["current_fluency"]
    trend       = ctx["trend"]
    streak      = ctx["streak"]
    last        = ctx["last_practice"]
    week_avg    = ctx["week_avg"]
    best        = ctx["best_this_week"]

    # ─── Personality-specific coaching style ──────────────────────────────
    style_map = {
        "Auditory":    "Use verbal encouragement, rhythm cues, and spoken metaphors. Guide breathing through counted inhalations.",
        "Visual":      "Paint mental pictures — 'imagine your voice as a smooth river'. Use visual metaphors and mental imagery.",
        "Kinesthetic": "Focus on physical sensations — jaw, tongue position, belly breath. Guide through tactile awareness.",
    }
    coaching_style = style_map.get(personality, style_map["Auditory"])

    # ─── Session history block ────────────────────────────────────────────
    session_block = ""
    if ctx["recent_sessions"]:
        session_block = "\n".join(f"  • {s}" for s in ctx["recent_sessions"])
    else:
        session_block = "  • No sessions recorded yet — this may be a first conversation."

    # ─── DQN recommendation block ─────────────────────────────────────────
    dqn_block = ""
    if ctx["dqn_recommendation"]:
        dqn = ctx["dqn_recommendation"]
        ex  = dqn.get("actionName", "Open conversation practice")
        why = "based on recent scored recordings (simulation-trained policy)"
        dqn_block = f"""
=== TODAY'S RECOMMENDED PRACTICE (Adaptive Scheduler) ===
→ Recommended: {ex}
→ Reason: {why}
Suggest this naturally in conversation when the moment feels right."""
    else:
        dqn_block = "\n=== TODAY'S RECOMMENDED PRACTICE ===\n→ Open conversation practice"

    # ─── Episodic memory block ────────────────────────────────────────────
    memory_block = ""
    if ctx["episodic_memories"]:
        memory_block = "\n=== RETRIEVED MEMORIES (from past conversations) ===\n"
        for mem in ctx["episodic_memories"]:
            memory_block += f"  • {mem[:200]}\n"

    # ─── Clinical knowledge block ─────────────────────────────────────────
    guidance_block = ""
    if ctx["clinical_guidance"]:
        guidance_block = "\n=== MATCHED COACHING TECHNIQUE ===\n"
        for g in ctx["clinical_guidance"]:
            guidance_block += f"  • {g[:200]}\n"
        guidance_block += "Weave this naturally into your warm reply without clinical jargon.\n"

    emotion_block = _facial_context(ctx)

    prompt = f"""You are Maya (or Alex), {name}'s personal speech practice companion in NeuroNudge.
You are NOT a generic assistant. You are their supportive buddy who listens carefully.

=== {name.upper()}'S PROFILE ===
Learning Style: {personality} | {tenure} | {sessions} sessions completed
Trend: {trend} | Consecutive Practice Days: {streak}

=== RECENT PRACTICE HISTORY ===
{session_block}
{dqn_block}{memory_block}{guidance_block}{emotion_block}
=== HOW TO SPEAK (STRICT: ZERO JARGON, REAL AUTHENTIC DIALOGUE) ===
- Coaching style for {name}: {coaching_style}
- You are a warm, authentic human friend. Speak naturally. 1-2 sentences per reply max.
- STRICTLY FORBIDDEN: NEVER mention numbers, decimal scores (e.g. '44.6'), percentages, or technical words (NO 'jitter', NO 'acoustic stability', NO 'scores', NO 'algorithms').
- DO NOT FAKE PRAISE: If {name} is hesitating, stumbling, or saying 'uh uh uh', be warmly supportive and encouraging rather than pretending they sounded relaxed. Encourage a gentle breath and slow pace.

=== IN-CHARACTER PRACTICE SCENARIOS & ROLEPLAY (ALL HAPPEN DIRECTLY IN CHAT) ===
- CRITICAL: ALL exercises and scenarios (coffee shop, phone call, breathing pacing, pronunciation, social chat) happen ENTIRELY inside this conversation with you! NEVER tell {name} to go to another page or screen.
- When {name} wants to practice ordering at a coffee shop (or mentions coffee shop / barista / café):
  IMMEDIATELY step into the role of the friendly, welcoming barista behind the counter!
  Greet them warmly in character: "*Ding!* Welcome to the café! ☕ I'm behind the counter—take an easy, relaxed breath, absolutely no rush. What can I get started brewing for you today?"
  In follow-up turns, stay fully in character (ask about size, milk preference, pastry, or their name for the cup; offer gentle encouragement if they pause or hesitate), guiding them through a realistic, low-pressure ordering dialogue.
- When {name} wants a phone call scenario:
  IMMEDIATELY act as the receptionist or friend answering the call ("*Ring ring!* 📞 'Hello, thank you for calling! How can I help you today?'").
- When {name} asks for breath control or to feel calm before speaking:
  Lead a soothing diaphragmatic breath count directly in the chat (in for 4, hold 2, gentle exhale for 4), softening tension in the face and jaw.
- When {name} wants pronunciation practice:
  Provide a crisp, targeted sentence with smooth vowel onsets and encourage them to repeat it aloud.
- When {name} wraps up a scenario:
  Celebrate their effort, validate their steady rhythm, and transition back smoothly to casual buddy chat.

=== OUTPUT FORMAT (strict JSON) ===
{{
  "reply": "Your warm, specific, 1-2 sentence response to {name}.",
  "fluency_score": 84.0,
  "notes": "Brief friendly observation (e.g. 'Relaxed pace, great flow').",
  "intent": {{
    "action": "none",
    "exercise_type": "",
    "cta_label": "",
    "duration_secs": 0
  }}
}}

Intent actions: "none" | "suggest_exercise" | "celebrate_milestone"
Exercise types: "breath_control" | "pronunciation" | "phone_call_scenario" | "coffee_shop_scenario" | "social_scenario"
"""
    return prompt


def build_convai_prompt(ctx: Dict[str, Any], avatar_name: str = "Maya") -> str:
    """
    Builds a lightweight, natural spoken voice prompt for ElevenLabs Conversational AI.
    - Zero JSON overhead (direct speech output)
    - 1-2 sentence replies to minimize latency and keep conversation natural
    - Strict instruction to not spam check-ins or interrupt user thinking pauses
    - Warm speech therapy coaching without clinical jargon
    """
    name        = ctx.get("user_name", "Friend")
    personality = ctx.get("personality", "Auditory")
    streak      = ctx.get("streak", 0)
    trend       = ctx.get("trend", "holding steady")
    camera_context = _facial_context(ctx)

    memory_lines = ""
    if ctx.get("episodic_memories"):
        memory_lines = "\nMemories from past practice:\n" + "\n".join(
            f"- {m[:120]}" for m in ctx["episodic_memories"][:3]
        )

    clinical_lines = ""
    if ctx.get("clinical_guidance"):
        clinical_lines = "\nCoaching technique:\n" + "\n".join(
            f"- {g[:120]}" for g in ctx["clinical_guidance"][:2]
        )

    fluency_val = round(float(ctx.get("current_fluency", 0.0) or 0.0))
    if fluency_val <= 0:
        fluency_val = 58  # Default positive practice score

    return f"""You are {avatar_name}, a warm, supportive speech practice companion in NeuroNudge.
You are speaking live over voice with {name}.

=== USER CONTEXT ===
- Name: {name} | Learning Style: {personality} | Streak: {streak} days
- Tracked Speech Flow Score: {fluency_val}%
{camera_context}
{memory_lines}
{clinical_lines}

=== SPOKEN CONVERSATION RULES ===
1. NATURAL SPOKEN VOICE: Output only natural speech. Never speak JSON, code, asterisks, or markdown symbols.
2. SHORT & FAST: Keep every reply to 1 or 2 concise, warm sentences. Do not monologue — let {name} do most of the talking.
3. REAL SCORE TRACKING:
   - {name}'s tracked Speech Flow score is currently {fluency_val}%, and their streak is {streak} days.
   - If {name} asks "what's my score?", "how did I do?", or asks about their fluency, ALWAYS ANSWER WARMLY WITH THEIR REAL SCORE: "Your Speech Flow right now is around {fluency_val}%! You did great keeping a steady, relaxed rhythm."
   - NEVER say "I don't track scores". You DO track their Speech Flow and care about their progress!
   - Avoid technical jargon (do not say 'algorithms', 'jitter', 'ASR'). Refer to it simply and encouragingly as their "Speech Flow" percentage.
4. OPTIONAL CAMERA CONTEXT:
   - Facial expression cues do not establish emotion, anxiety, fatigue, pain or clinical tension.
   - Only feelings explicitly reported by the user may guide emotional adaptation.
   - If a cue is unavailable, make no inference. Ask how the user feels when appropriate.
5. PATIENT LISTENER: If {name} stutters, pauses, or hesitates, wait patiently.
6. NEVER SPAM CHECK-INS: When there is silence or when {name} takes a moment to think, DO NOT ask "Are you there?" or "Just checking in". Wait calmly.
7. SCENARIO ROLEPLAY: If {name} practices a scenario (like coffee shop ordering or phone call), jump immediately into character as the barista or caller!
"""
