"""
Avatar Router — Production Multi-Modal Pipeline:
  GET  /avatar/greet       → Personalized opening message (buddy speaks first with ElevenLabs phoneme alignment)
  POST /avatar/chat        → Full context-aware text conversation turn
  POST /avatar/voice-chat  → End-to-end clinical voice pipeline:
                             1. Faster-Whisper ASR for distorted speech
                             2. GPT-5.6 Speech Pathology Normalizer
                             3. Real Bio-Acoustic Signal Extraction (Pitch, Jitter, Shimmer, Pause Ratio)
                             4. PyTorch Multimodal Attention Fusion Layer scoring
                             5. GPT-5.6 Luna context-aware clinical dialogue
                             6. ElevenLabs phoneme-aligned audio synthesis
"""
import json
import base64
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from database import get_db
from models.avatar_conversation import AvatarConversation
from models.fluency_score import FluencyScore
from models.session import PracticeSession
from models.user import User
from schemas.avatar import (
    AvatarChatRequest, AvatarChatResponse,
    AvatarGreetResponse, AvatarIntentSchema, HistoryMessage,
    SessionEndRequest, SessionEndResponse,
)
from config import settings
import httpx
from avatar.context import assemble_user_context
from avatar.dialogue import generate_avatar_reply, generate_greeting
from avatar.tts import generate_elevenlabs_speech_with_alignment
from avatar.vector_memory import store_conversation_memory
from auth.dependencies import get_optional_current_user, get_current_user

from fluency.asr import transcribe_audio
from translator.router import normalize_disordered_speech
from fluency.acoustic import extract_acoustic_features
from fluency.scorer import run_fluency_pipeline
from starlette.concurrency import run_in_threadpool
from ml_settings import InvalidAudioError, ModelUnavailableError, MAX_AUDIO_BYTES
from scheduler.service import complete_transition, validate_session
from uuid import UUID
from typing import Literal

router = APIRouter(tags=["avatar"])


def _parse_intent(raw_intent) -> AvatarIntentSchema:
    if not raw_intent or not isinstance(raw_intent, dict):
        return AvatarIntentSchema()
    return AvatarIntentSchema(
        action=raw_intent.get("action", "none"),
        exercise_type=raw_intent.get("exercise_type", ""),
        cta_label=raw_intent.get("cta_label", ""),
        duration_secs=int(raw_intent.get("duration_secs", 0)),
    )


async def _persist_turn(
    db: AsyncSession,
    user: User,
    user_message: str,
    reply_text: str,
    fluency_score: float,
    notes: str,
    history_len: int,
    acoustic_features: Optional[dict] = None,
):
    """Persist session, bio-acoustic score, conversation record and update user profile."""
    # Text-only conversations have no acoustic evidence and must not update fluency.
    db.add(AvatarConversation(user_id=user.id, messages=[
        {"role": "user", "content": user_message},
        {"role": "assistant", "content": reply_text}]))
    await db.commit()


# ─── GET /avatar/greet ────────────────────────────────────────────────────────

@router.get("/greet", response_model=AvatarGreetResponse)
async def greet_user(
    gender: str = "female",
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Called when the user opens the avatar page.
    Maya/Alex speaks FIRST with a personalized, data-driven greeting + phoneme alignment.
    """
    try:
        ctx = await assemble_user_context(
            user=current_user,
            user_message="[GREETING — no user message yet]",
            db=db,
        )

        result = await generate_greeting(ctx)
        reply_text = result["reply"]

        tts_res = await generate_elevenlabs_speech_with_alignment(reply_text, gender=gender)
        audio_b64 = tts_res.get("audio_base64")
        alignment = tts_res.get("alignment")

        return AvatarGreetResponse(
            reply=reply_text,
            audio_base64=audio_b64,
            alignment=alignment,
            fluency_score=result.get("fluency_score"),
            streak=current_user.streak if current_user else 0,
            composite_fluency=current_user.fluency_level if current_user else 0.0,
            notes=result.get("notes", ""),
            intent=_parse_intent(result.get("intent")),
        )
    except Exception as e:
        print(f"[Avatar /greet Error] {e}")
        name = current_user.name if current_user else "there"
        fallback_text = f"Hey {name}! Great to see you — I'm Maya, your practice buddy. What would you like to work on today?"
        tts_res = await generate_elevenlabs_speech_with_alignment(fallback_text, gender=gender)
        return AvatarGreetResponse(
            reply=fallback_text,
            audio_base64=tts_res.get("audio_base64"),
            alignment=tts_res.get("alignment"),
            streak=current_user.streak if current_user else 0,
            composite_fluency=current_user.fluency_level if current_user else 0.0,
        )


# ─── POST /avatar/chat ────────────────────────────────────────────────────────

@router.post("/chat", response_model=AvatarChatResponse)
async def chat_with_avatar(
    payload: AvatarChatRequest,
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Text-based conversation turn with phoneme alignment."""
    try:
        ctx = await assemble_user_context(
            user=current_user,
            user_message=payload.message,
            db=db,
            detected_emotion=payload.detected_emotion,
            facial_tension=payload.facial_tension,
            emotion_source=payload.emotion_source,
            visible_expression=payload.visible_expression,
        )

        history = [
            {"role": h.role, "content": h.content}
            for h in (payload.history or [])
        ]
        result = await generate_avatar_reply(
            message=payload.message,
            assembled_context=ctx,
            history=history,
        )

        reply_text    = result["reply"]
        fluency_score = None
        notes         = result.get("notes", "Good flow")
        intent        = _parse_intent(result.get("intent", {}))

        try:
            store_conversation_memory(
                user_id=str(current_user.id) if current_user else "guest",
                user_message=payload.message,
                avatar_reply=reply_text,
                fluency_score=fluency_score,
                notes=notes,
            )
        except Exception as e:
            print(f"[Avatar] Chroma memory store warning: {e}")

        if current_user:
            await _persist_turn(
                db=db,
                user=current_user,
                user_message=payload.message,
                reply_text=reply_text,
                fluency_score=fluency_score,
                notes=notes,
                history_len=len(history),
            )

        tts_res = await generate_elevenlabs_speech_with_alignment(reply_text, gender=payload.gender or "female")
        vocal_fatigue = min(10, max(1, 2 + int(len(history) * 0.4)))

        return AvatarChatResponse(
            reply=reply_text,
            audio_base64=tts_res.get("audio_base64"),
            alignment=tts_res.get("alignment"),
            fluency_score=fluency_score,
            vocal_fatigue=vocal_fatigue,
            streak=(current_user.streak or 0) if current_user else 0,
            composite_fluency=float(current_user.fluency_level if (current_user and current_user.fluency_level is not None) else 0.0),

            notes=notes,
            intent=intent,
            original_transcript=payload.message,
            normalized_transcript=payload.message,
            detected_emotion=payload.detected_emotion if payload.emotion_source == 'self_report' else None,
            facial_tension=None
        )

    except Exception as e:
        print(f"[Avatar /chat Error] {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── POST /avatar/voice-chat (Production End-to-End Voice Pipeline) ───────────

MODE_INSTRUCTIONS = {
    "companion": "Have a relaxed everyday conversation. Ask one open question at a time.",
    "qa": "Run a question-and-answer exercise. Ask one factual or opinion question and follow up on the answer.",
    "reading": "Discuss the passage the user has read. Do not invent pronunciation judgments.",
    "roleplay": "Roleplay a practical situation such as ordering food or a job interview. Stay in character.",
    "stress_test": "Offer a voluntary challenging speaking task with a follow-up question. Allow stopping at any time; never pressure the user.",
}

@router.post("/voice-chat", response_model=AvatarChatResponse)
async def voice_chat_with_avatar(
    audio: UploadFile = File(...), history_json: str = Form("[]"), gender: str = Form("female"),
    mode: Literal["companion", "qa", "reading", "roleplay", "stress_test"] = Form("companion"),
    difficulty: int = Form(1, ge=1, le=3), trajectory_id: UUID | None = Form(None),
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    try:
        parsed = json.loads(history_json)
        if not isinstance(parsed, list) or len(parsed) > 30:
            raise ValueError("At most 30 conversation messages are allowed")
        history = [{"role": h["role"], "content": str(h["content"])[:3000]} for h in parsed
                   if isinstance(h, dict) and h.get("role") in ["user", "assistant"]]
    except (ValueError, KeyError, TypeError):
        raise HTTPException(422, "Invalid conversation history")
    await validate_session(db, current_user.id, trajectory_id, mode, difficulty)
    data = await audio.read(MAX_AUDIO_BYTES + 1)
    try:
        scored = await run_in_threadpool(run_fluency_pipeline, data)
    except InvalidAudioError as exc:
        raise HTTPException(422, str(exc))
    except ModelUnavailableError as exc:
        raise HTTPException(503, str(exc))
    # Score original speech, never a normalized or LLM-rewritten transcript.
    transcript = scored["transcript"]
    ctx = await assemble_user_context(user=current_user, user_message=transcript, db=db)
    ctx["session_instruction"] = MODE_INSTRUCTIONS[mode] + f" Difficulty {difficulty}/3: " + {
        1: "Use short concrete prompts.", 2: "Ask for explanations and examples.",
        3: "Use multi-part prompts and more complex vocabulary."}[difficulty]
    result = await generate_avatar_reply(message=transcript, assembled_context=ctx, history=history)
    features = {**scored["features"], "mode": mode, "session_type": mode,
                "difficulty": difficulty, "trajectory_id": str(trajectory_id) if trajectory_id else None}
    record = FluencyScore(user_id=current_user.id, transcript=transcript,
                         acoustic_score=scored["acoustic"], semantic_score=None,
                         composite_score=scored["composite"], features=features)
    db.add(record)
    await db.flush()
    if trajectory_id:
        await complete_transition(db, current_user.id, trajectory_id, record)
    current_user.fluency_level = scored["composite"]
    db.add(AvatarConversation(user_id=current_user.id, messages=[
        {"role": "user", "content": transcript}, {"role": "assistant", "content": result["reply"]}]))
    await db.commit()
    tts = await generate_elevenlabs_speech_with_alignment(result["reply"], gender=gender)
    return AvatarChatResponse(reply=result["reply"], audio_base64=tts.get("audio_base64"),
        alignment=tts.get("alignment"), fluency_score=scored["composite"],
        composite_fluency=scored["composite"], vocal_fatigue=None,
        notes=scored["recommendation"], bio_acoustics=features, original_transcript=transcript,
        normalized_transcript=transcript, score_id=str(record.id))


SCENARIO_FIRST_MESSAGES = {
    "coffee_shop":      "*Ding!* ☕ Welcome to the café! I'm your barista today — absolutely no rush at all. Take a nice easy breath. What can I get started for you?",
    "phone_call":       "*Ring ring!* 📞 Hello, thank you for calling! How can I help you today?",
    "breath_control":   "Let's slow everything down together. Inhale gently through your nose for 4... hold for 2... and exhale softly for 4. Ready? Let's go.",
    "pronunciation":    "Let's do a quick articulation warm-up! Repeat after me: 'She sells seashells by the seashore.' Nice and easy, no rush.",
    "confidence_boost": "You showed up today, and that already takes courage. Let's talk — how are you feeling about speaking right now?",
}


@router.get("/convai-session")
async def get_convai_session(
    gender: str = Query("female"),
    scenario: Optional[str] = Query(None),
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Creates a personalised ElevenLabs Conversational AI session.

    Steps:
      1. Pull user analytics from Supabase + Chroma Cloud
      2. Build a rich, personalised system prompt
      3. Optionally inject a scenario roleplay context
      4. Patch the Maya/Alex ConvAI agent with this context
      5. Return a short-lived signed WebSocket URL to the browser

    The browser connects directly to ElevenLabs via this signed URL —
    audio never touches our backend, latency is <500 ms.
    """
    from avatar.convai import ensure_agent, patch_agent, get_signed_url
    from avatar.context import build_convai_prompt
    from avatar.redis_memory import build_hot_memory_block

    try:
        # 1. Personalised context from DB
        ctx = await assemble_user_context(
            user=current_user,
            user_message="[SESSION START]",
            db=db,
        )
        name        = ctx.get("user_name", "there")
        avatar_name = "Maya" if gender == "female" else "Alex"
        base_prompt = build_convai_prompt(ctx, avatar_name=avatar_name)
        streak      = ctx.get("streak", 0)
        fluency     = ctx.get("current_fluency", 0.0)
        user_id_str = str(current_user.id) if current_user else None

        # 2. Inject Redis hot memory — today's conversation turns
        hot_memory_block = build_hot_memory_block(user_id_str, n=8) if user_id_str else ""

        # 3. Scenario override — first message + appended roleplay instruction
        if scenario and scenario in SCENARIO_FIRST_MESSAGES:
            first_message = SCENARIO_FIRST_MESSAGES[scenario]
            scenario_addon = (
                f"\n\n=== ACTIVE PRACTICE SCENARIO: {scenario.upper().replace('_',' ')} ===\n"
                f"You are NOW in-character for this scenario. Stay fully in character "
                f"unless {name} explicitly asks to stop. Be warm, patient, and encouraging."
            )
            system_prompt = base_prompt + hot_memory_block + scenario_addon
        else:
            first_message = (
                f"Hey {name}! I'm {avatar_name}, your speech practice buddy. "
                f"Great to have you here — how are you feeling today?"
            )
            system_prompt = base_prompt + hot_memory_block

        # 4. Ensure agent exists, patch with personalised prompt + hot memory
        agent_id = await ensure_agent(gender)
        await patch_agent(agent_id, system_prompt, first_message)

        # 4. Get signed WebSocket URL (keeps API key server-side)
        signed_url = await get_signed_url(agent_id)

        return {
            "signed_url":  signed_url,
            "agent_id":    agent_id,
            "avatar_name": avatar_name,
            "user_name":   name,
            "streak":      streak,
            "fluency":     fluency,
        }

    except Exception as e:
        print(f"[ConvAI Session Error] {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Legacy snapshot inference is retired: never upload faces or invent confidence.
@router.post("/analyze-emotion", deprecated=True)
async def analyze_facial_emotion(current_user: User = Depends(get_current_user)):
    raise HTTPException(status_code=410, detail="Camera analysis now runs locally. Update the app and enable camera feedback there.")


# ─── POST /avatar/session-end (Scores + stores ConvAI session) ────────────────

@router.post("/session-end", response_model=SessionEndResponse)
async def session_end(payload: SessionEndRequest,
                      current_user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    turns = [t for t in payload.transcript if t.sender == "user"]
    db.add(AvatarConversation(user_id=current_user.id, messages=[
        {"role": "user" if t.sender == "user" else "assistant", "content": t.text}
        for t in payload.transcript]))
    await db.commit()
    return SessionEndResponse(fluency_score=None, streak=current_user.streak or 0,
        feedback="Conversation saved. This text-only session does not have an audio fluency score.",
        improvement_tip="Use recorded practice for multimodal speech analysis.", turns_completed=len(turns))
