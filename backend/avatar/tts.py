import base64
from typing import Dict, Any, Optional
import httpx
from config import settings

# Explicit Voice IDs from your ElevenLabs Account
VOICE_MAP = {
    "female": "cgSgspJ2msm6clMCkdW9",  # Jessica (Bright, Warm, Expressive Female for Maya)
    "male": "bIHbv24MWmeRgasZH58o",    # Will (Relaxed, Warm Male for Alex)
}

async def generate_elevenlabs_speech_with_alignment(text: str, gender: str = "female") -> Dict[str, Any]:
    """
    Calls ElevenLabs text-to-speech endpoint with character-level alignment timestamps.
    Selects female voice (Jessica) for Maya and male voice (Will) for Alex.
    """
    if not settings.ELEVENLABS_API_KEY or len(settings.ELEVENLABS_API_KEY) < 5:
        return {"audio_base64": None, "alignment": None}

    voice_id = VOICE_MAP.get(str(gender).lower(), VOICE_MAP["female"])
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps"

    headers = {
        "xi-api-key": settings.ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "text": text,
        "model_id": settings.ELEVENLABS_MODEL_ID or "eleven_turbo_v2_5",
        "voice_settings": {
            "stability": 0.52,
            "similarity_boost": 0.78
        }
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(url, json=payload, headers=headers)
            if res.status_code == 200:
                data = res.json()
                return {
                    "audio_base64": data.get("audio_base64"),
                    "alignment": data.get("alignment")
                }
            else:
                print(f"[ElevenLabs Warning] with-timestamps failed: {res.status_code}, falling back to standard TTS.")
                fallback_url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
                f_res = await client.post(fallback_url, json=payload, headers=headers)
                if f_res.status_code == 200:
                    b64 = base64.b64encode(f_res.content).decode("utf-8")
                    return {"audio_base64": b64, "alignment": None}
                return {"audio_base64": None, "alignment": None}
    except Exception as e:
        print(f"[ElevenLabs Request Exception] {e}")
        return {"audio_base64": None, "alignment": None}

async def generate_elevenlabs_speech(text: str, gender: str = "female") -> Optional[bytes]:
    """Legacy helper returning raw bytes."""
    res = await generate_elevenlabs_speech_with_alignment(text, gender=gender)
    if res.get("audio_base64"):
        return base64.b64decode(res["audio_base64"])
    return None
