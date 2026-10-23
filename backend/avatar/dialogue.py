"""
Dialogue generation layer.
Uses the pre-assembled context from ContextAssembler to call the LLM.
The LLM receives a fully personalized system prompt and returns structured JSON.
"""
import json
from typing import List, Dict, Optional, Any
import openai
from config import settings
from avatar.context import build_rich_system_prompt


_DEFAULT_RESULT = {
    "reply": "I'm right here with you! Take your time — what's on your mind today?",
    "fluency_score": 82.0,
    "notes": "Steady and relaxed",
    "intent": {"action": "none", "exercise_type": "", "cta_label": "", "duration_secs": 0}
}


def _parse_llm_json(raw: str) -> Dict[str, Any]:
    """Safely parse LLM JSON output, stripping markdown fences or extracting JSON substring."""
    raw = raw.strip()
    try:
        return json.loads(raw)
    except Exception:
        pass

    # Strip markdown code blocks
    if "```" in raw:
        parts = raw.split("```")
        for part in parts:
            p = part.strip()
            if p.startswith("json"):
                p = p[4:].strip()
            try:
                return json.loads(p)
            except Exception:
                continue

    # Extract outer braces
    first_brace = raw.find("{")
    last_brace = raw.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        candidate = raw[first_brace:last_brace + 1]
        try:
            return json.loads(candidate)
        except Exception:
            pass

    return json.loads(raw)


async def generate_avatar_reply(
    message: str,
    assembled_context: Dict[str, Any],
    history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    Generate the buddy's reply using the pre-assembled context.

    Args:
        message:           The user's latest message.
        assembled_context: Output from ContextAssembler.assemble_user_context()
        history:           Last N conversation turns for in-context memory.

    Returns:
        dict with keys: reply, fluency_score, notes, intent
    """
    system_prompt = build_rich_system_prompt(assembled_context)
    if assembled_context.get("session_instruction"):
        system_prompt += "\nSession task: " + assembled_context["session_instruction"]

    messages = [{"role": "system", "content": system_prompt}]
    if history:
        for item in history:
            messages.append({"role": item.get("role", "user"), "content": item.get("content", "")})
    messages.append({"role": "user", "content": message})

    result = dict(_DEFAULT_RESULT)

    # ─── Try OpenRouter (GPT-4o) ──────────────────────────────────────────
    if settings.OPENROUTER_KEY and len(settings.OPENROUTER_KEY) > 5:
        try:
            import httpx
            headers = {
                "Authorization": f"Bearer {settings.OPENROUTER_KEY}",
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "NeuroNudge AI Speech Buddy",
                "Content-Type": "application/json",
            }
            payload = {
                "model": settings.OPENROUTER_MODEL or "openai/gpt-4o",
                "messages": messages,
                "max_tokens": 300,
                "temperature": 0.72,
                "response_format": {"type": "json_object"},
            }
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers=headers,
                    json=payload
                )
            if res.status_code == 200:
                raw = res.json()["choices"][0]["message"]["content"].strip()
                parsed = _parse_llm_json(raw)
                result["reply"]         = parsed.get("reply", result["reply"])
                result["fluency_score"] = float(parsed.get("fluency_score", 82.0))
                result["notes"]         = parsed.get("notes", "Good flow")
                result["intent"]        = parsed.get("intent", result["intent"])
                return result
            else:
                raise Exception(f"OpenRouter HTTP {res.status_code}: {res.text[:200]}")
        except Exception as e:
            print(f"[Dialogue] OpenRouter error: {e}")
            return result

    # ─── Fallback: direct OpenAI ──────────────────────────────────────────
    if settings.OPENAI_API_KEY and len(settings.OPENAI_API_KEY) > 5:
        try:
            client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                max_tokens=300,
                temperature=0.72,
                response_format={"type": "json_object"}
            )
            raw = response.choices[0].message.content.strip()
            parsed = _parse_llm_json(raw)
            result["reply"]         = parsed.get("reply", result["reply"])
            result["fluency_score"] = float(parsed.get("fluency_score", 82.0))
            result["notes"]         = parsed.get("notes", "Good flow")
            result["intent"]        = parsed.get("intent", result["intent"])
            return result
        except Exception as e:
            print(f"[Dialogue] OpenAI error: {e}")

    return result


async def generate_greeting(assembled_context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generates a personalized opening message from Maya/Alex when the user
    lands on the avatar page. Called by GET /avatar/greet.
    No user message — the buddy speaks first based on their history.
    """
    name  = assembled_context["user_name"]
    last  = assembled_context["last_practice"]
    trend = assembled_context["trend"]
    sessions = assembled_context["total_sessions"]
    best  = assembled_context.get("best_this_week")
    dqn   = assembled_context.get("dqn_recommendation")

    # Build a greet-specific prompt that starts the conversation
    greet_prompt = build_rich_system_prompt(assembled_context)
    greet_prompt += f"""

SPECIAL INSTRUCTION — GREETING MESSAGE:
This is the FIRST message {name} sees when opening the app.
Do NOT wait for them to speak. YOU speak first.
Generate a warm, specific, personalized greeting based on their actual history above.
Reference their REAL data (sessions, scores, trend, when they last practiced).
If they've done {sessions} sessions, mention that. If trend is '{trend}', reflect it warmly.
{"Mention their best score this week: " + str(best) if best else ""}
{("Naturally suggest today's recommended exercise: " + str(dqn.get("exercise", ""))) if dqn else ""}
Keep it to 2 sentences max. Warm, specific, and inviting. End with a question.
"""
    greet_messages = [
        {"role": "system", "content": greet_prompt},
        {"role": "user",   "content": "[USER OPENED THE APP — GENERATE PERSONALIZED GREETING]"}
    ]

    result = dict(_DEFAULT_RESULT)

    if settings.OPENROUTER_KEY and len(settings.OPENROUTER_KEY) > 5:
        try:
            import httpx
            headers = {
                "Authorization": f"Bearer {settings.OPENROUTER_KEY}",
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "NeuroNudge AI Speech Buddy",
                "Content-Type": "application/json",
            }
            payload = {
                "model": settings.OPENROUTER_MODEL or "openai/gpt-4o",
                "messages": greet_messages,
                "max_tokens": 450,
                "temperature": 0.75,
                "response_format": {"type": "json_object"},
            }
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers=headers,
                    json=payload
                )
            if res.status_code == 200:
                raw = res.json()["choices"][0]["message"]["content"].strip()
                parsed = _parse_llm_json(raw)
                result["reply"]         = parsed.get("reply", result["reply"])
                result["fluency_score"] = float(parsed.get("fluency_score", 82.0))
                result["notes"]         = parsed.get("notes", "")
                result["intent"]        = parsed.get("intent", result["intent"])
                return result
        except Exception as e:
            print(f"[Dialogue] Greeting OpenRouter error: {e}")

    # Intelligent fallback greeting
    if sessions == 0:
        result["reply"] = f"Hey {name}! Welcome to NeuroNudge — I'm Maya, your personal practice buddy. I'm here whenever you want to talk or practice. What's on your mind today?"
    elif last == "today":
        result["reply"] = f"Hey {name}! Great to see you again today — you've been on a roll lately. Ready to keep the momentum going?"
    else:
        result["reply"] = f"Welcome back, {name}! You last practiced {last}. I've been keeping track — you've done {sessions} sessions so far. Ready to pick up where we left off?"

    return result
