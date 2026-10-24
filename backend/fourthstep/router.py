import os
import uuid
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
import httpx
from config import settings
from avatar.tts import generate_elevenlabs_speech

router = APIRouter(tags=["fourthstep"])

class VoiceProcessRequest(BaseModel):
    text: str
    gender: str = "female"
    age: str = "child"

STATIC_AUDIO_DIR = os.path.join(os.path.dirname(__file__), "..", "static")
os.makedirs(STATIC_AUDIO_DIR, exist_ok=True)

@router.post("/process-voice/")
async def process_voice_chat(payload: VoiceProcessRequest):
    """
    Processes user conversational speech, provides warm empathetic therapeutic response via OpenRouter GPT-4o,
    and returns synthesized audio URL using ElevenLabs.
    """
    try:
        system_prompt = (
            f"You are a friendly, encouraging speech practice companion with a {payload.gender} {payload.age} persona. "
            "You are having a casual therapeutic conversation with a learner working on speech fluency. "
            "Keep your responses warm, supportive, natural, and concise (1-2 sentences). "
            "End with an open, friendly follow-up question to encourage them to speak more."
        )

        headers = {
            "Authorization": f"Bearer {settings.OPENROUTER_KEY}",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "NeuroNudge AI Speech Fluency System",
            "Content-Type": "application/json"
        }

        body = {
            "model": settings.OPENROUTER_MODEL or "openai/gpt-4o",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": payload.text}
            ],
            "max_tokens": 120,
            "temperature": 0.7
        }

        reply_text = "That's wonderful! Tell me more about what you enjoy doing most."
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=body)
            if res.status_code == 200:
                reply_text = res.json()["choices"][0]["message"]["content"].strip()

        # Generate ElevenLabs audio
        audio_bytes = await generate_elevenlabs_speech(reply_text)
        audio_url = None
        if audio_bytes:
            filename = f"reply_{uuid.uuid4().hex[:10]}.mp3"
            filepath = os.path.join(STATIC_AUDIO_DIR, filename)
            with open(filepath, "wb") as f:
                f.write(audio_bytes)
            audio_url = f"/static/{filename}"

        return {
            "reply": reply_text,
            "audio_url": audio_url
        }

    except Exception as e:
        print(f"[FourthStep Error] {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/text-to-speech/")
async def stream_fourthstep_tts(text: str, gender: str = "female", age: str = "child"):
    """
    Text to speech synthesis stream for fourthstep.
    """
    try:
        audio_bytes = await generate_elevenlabs_speech(text)
        if not audio_bytes:
            raise HTTPException(status_code=500, detail="Failed to synthesize voice audio.")
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
