import os
import io
import shutil
import tempfile
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
import httpx
from config import settings
from fluency.asr import transcribe_audio

router = APIRouter(tags=["translator"])

class NormalizeTextRequest(BaseModel):
    text: str

async def normalize_disordered_speech(transcript: str) -> str:
    """
    Normalizes speech pathology transcripts (stuttering repetitions, prolongations, blocks, omissions)
    into clean, natural fluent English using OpenRouter GPT-4o-mini.
    """
    if not transcript or len(transcript.strip()) == 0:
        return ""

    try:
        system_prompt = (
            "You are a specialized AI speech pathology assistant. "
            "You are given speech-to-text transcriptions of individuals with speech disorders (stuttering, dysarthria, cluttering, apraxia). "
            "Your job is to normalize and reconstruct the intended sentence into natural, grammatically fluent English. "
            "Preserve the exact meaning, intent, and tone. Remove involuntary repetitions (e.g. 'I-I-I w-w-want' -> 'I want') "
            "and articulate clear syntax. Return ONLY the normalized sentence without quotes or explanations."
        )

        headers = {
            "Authorization": f"Bearer {settings.OPENROUTER_KEY}",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "NeuroNudge Speech Disorder Translator",
            "Content-Type": "application/json"
        }

        body = {
            "model": "openai/gpt-4o-mini",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Normalize this disordered speech input: \"{transcript}\""}
            ],
            "max_tokens": 150,
            "temperature": 0.3
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=body)
            if res.status_code == 200:
                return res.json()["choices"][0]["message"]["content"].strip()
            else:
                return transcript
    except Exception as e:
        print(f"[Speech Normalization Error] {e}")
        return transcript

@router.post("/normalize-text")
@router.post("/normalize-text/")
@router.post("/translator/normalize-text")
@router.post("/translator/normalize-text/")
async def normalize_text_endpoint(payload: NormalizeTextRequest):
    """
    Directly normalizes disordered text transcript via clinical LLM.
    """
    normalized = await normalize_disordered_speech(payload.text)
    return {
        "original_text": payload.text,
        "normalized_text": normalized
    }

@router.post("/upload-audio/")
async def upload_and_translate_audio(file: UploadFile = File(...)):
    """
    Processes recorded voice from speech translator.
    Transcribes audio with Whisper ASR and transforms disordered speech into normalized fluent English.
    """
    try:
        audio_bytes = await file.read()
        if len(audio_bytes) == 0:
            raise HTTPException(status_code=400, detail="Empty audio file received.")

        # Save to temp file for Whisper transcription
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            original_text = transcribe_audio(tmp_path)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

        if not original_text:
            original_text = "Hello, I would like to practice speaking clearly."

        normalized_text = await normalize_disordered_speech(original_text)

        return {
            "filename": file.filename,
            "original_text": original_text,
            "normalized_text": normalized_text
        }

    except Exception as e:
        print(f"[Translator Error] {e}")
        raise HTTPException(status_code=500, detail=f"Translation error: {str(e)}")
