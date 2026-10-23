"""
ElevenLabs Conversational AI — Production Agent Manager
========================================================
Manages Maya & Alex as persistent ConvAI agents.
Per-session system prompts are patched before each new conversation.

Architecture:
  1. ensure_agent()    — Lazily creates the agent if it doesn't exist yet
  2. patch_agent()     — Personalises system prompt + first message per user session
  3. get_signed_url()  — Exchanges the agent_id for a short-lived WebSocket URL
                         (keeps ElevenLabs API key server-side only)

The signed WebSocket URL is handed to the browser which connects directly to
ElevenLabs' Conversational AI infrastructure — no audio ever hits our backend.
"""
import httpx
from config import settings

ELEVENLABS_BASE = "https://api.elevenlabs.io/v1"

# Voice IDs (same as used by TTS pipeline)
VOICE_MAP = {
    "female": "cgSgspJ2msm6clMCkdW9",   # Jessica — warm, bright
    "male":   "bIHbv24MWmeRgasZH58o",   # Will    — relaxed, warm
}

# Runtime cache: {"female": "agent_xxx", "male": "agent_yyy"}
_AGENT_IDS: dict[str, str] = {}


def _headers() -> dict:
    return {
        "xi-api-key": settings.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
    }


def _base_agent_config(gender: str) -> dict:
    """Minimal agent config. System prompt is overwritten per session via patch_agent()."""
    voice_id    = VOICE_MAP.get(gender, VOICE_MAP["female"])
    avatar_name = "Maya" if gender == "female" else "Alex"
    return {
        "name": f"{avatar_name} — NeuroNudge Speech Buddy",
        "conversation_config": {
            "agent": {
                "prompt": {
                    "prompt": (
                        f"You are {avatar_name}, a warm and empathetic AI speech therapy companion "
                        "built into the NeuroNudge app. You help people with speech and fluency "
                        "challenges practice in a safe, encouraging, judgment-free space."
                    ),
                    "llm": "gpt-4o-mini",
                    "temperature": 0.7,
                    "max_tokens": 140,
                    "tools": [],
                    "knowledge_base": []
                },
                "first_message": f"Hey! I'm {avatar_name}, your practice buddy. How are you feeling today?",
                "language": "en",
            },
            "tts": {
                "model_id": "eleven_turbo_v2",
                "voice_id": voice_id,
                "voice_settings": {
                    "stability": 0.52,
                    "similarity_boost": 0.78,
                    "speed": 0.95,
                },
                "optimize_streaming_latency": 4,
                "agent_output_audio_format": "pcm_16000",
            },
            "asr": {
                "quality": "high",
                "provider": "elevenlabs",
                "user_input_audio_format": "pcm_16000",
            },
            "turn": {
                "turn_timeout": 20.0,
                "silence_end_call_timeout": 60.0,
                "turn_eagerness": "patient",
                "mode": "turn",
            },
            "conversation": {
                "max_duration_seconds": 1800,
                "client_events": ["agent_response", "user_transcript"],
            },
        },
        "platform_settings": {},
    }


async def ensure_agent(gender: str = "female") -> str:
    """
    Returns the ElevenLabs agent_id for the given gender, creating it if needed.
    Reuses existing agents on the ElevenLabs account to avoid duplicate proliferation.
    """
    gender = gender.lower() if gender in ("female", "male") else "female"
    if gender in _AGENT_IDS:
        return _AGENT_IDS[gender]

    avatar_name = "Maya" if gender == "female" else "Alex"

    async with httpx.AsyncClient(timeout=20.0) as client:
        # 1. Check if agent already exists in ElevenLabs
        try:
            list_res = await client.get(f"{ELEVENLABS_BASE}/convai/agents", headers=_headers())
            if list_res.status_code == 200:
                for a in list_res.json().get("agents", []):
                    if avatar_name in a.get("name", ""):
                        aid = a.get("agent_id")
                        _AGENT_IDS[gender] = aid
                        print(f"[ConvAI] Reusing existing {gender} agent ({avatar_name}): {aid}", flush=True)
                        return aid
        except Exception as e:
            print(f"[ConvAI] Note: could not query existing agents list: {e}", flush=True)

        # 2. If not found, create new agent
        config = _base_agent_config(gender)
        res = await client.post(
            f"{ELEVENLABS_BASE}/convai/agents/create",
            json=config,
            headers=_headers(),
        )
        if res.status_code in (200, 201):
            agent_id = res.json()["agent_id"]
            _AGENT_IDS[gender] = agent_id
            print(f"[ConvAI] Created new {gender} agent: {agent_id}", flush=True)
            return agent_id
        raise RuntimeError(
            f"ElevenLabs agent creation failed [{res.status_code}]: {res.text[:300]}"
        )


async def patch_agent(agent_id: str, system_prompt: str, first_message: str) -> None:
    """
    Overwrites the agent's system prompt, opening message, and turn settings
    with the personalised, user-specific context assembled from our DB.
    Uses gpt-4o-mini and latency level 4 for sub-second rapid voice replies.
    """
    body = {
        "conversation_config": {
            "agent": {
                "prompt": {
                    "prompt": system_prompt,
                    "llm": "gpt-4o-mini",
                    "temperature": 0.7,
                    "max_tokens": 140,
                },
                "first_message": first_message,
            },
            "turn": {
                "turn_timeout": 20.0,
                "silence_end_call_timeout": 60.0,
                "turn_eagerness": "patient",
                "mode": "turn",
            },
            "tts": {
                "optimize_streaming_latency": 4,
            },
        }
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.patch(
            f"{ELEVENLABS_BASE}/convai/agents/{agent_id}",
            json=body,
            headers=_headers(),
        )
        if res.status_code not in (200, 204):
            print(f"[ConvAI] Patch warning [{res.status_code}]: {res.text[:200]}")


async def get_signed_url(agent_id: str) -> str:
    """
    Exchanges agent_id for a short-lived signed WebSocket URL.
    The browser uses this URL to connect directly to ElevenLabs without
    ever seeing our API key.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.get(
            f"{ELEVENLABS_BASE}/convai/conversation/get_signed_url",
            params={"agent_id": agent_id},
            headers={"xi-api-key": settings.ELEVENLABS_API_KEY},
        )
        if res.status_code == 200:
            return res.json()["signed_url"]
        raise RuntimeError(
            f"ElevenLabs signed URL failed [{res.status_code}]: {res.text[:200]}"
        )
