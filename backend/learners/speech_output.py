"""Provider capabilities are checked before requesting language-specific speech."""
import time
import httpx
from fastapi import HTTPException
from config import settings
from avatar.tts import VOICE_MAP
from learners.provider_http import client as provider_client

_capabilities = (0, [])
_eleven_retry_after = 0


async def sarvam_speech(text,language):
    if not settings.SARVAM_API_KEY or language not in ['en','hi','ml']:
        raise HTTPException(503,'Speech synthesis is unavailable')
    if len(text)>2500:raise HTTPException(422,'Use a shorter speech prompt')
    try:
        async with provider_client(timeout=30) as client:
            response=await client.post('https://api.sarvam.ai/text-to-speech',headers={'api-subscription-key':settings.SARVAM_API_KEY},
                json={'text':text,'language_code':{'en':'en-IN','hi':'hi-IN','ml':'ml-IN'}[language],
                    'model':'bulbul:v3','speaker':{'en':'ishita','hi':'priya','ml':'pooja'}[language],
                    'pace':.9,'temperature':.35,'output_audio_codec':'mp3','speech_sample_rate':22050})
            response.raise_for_status();body=response.json()
        audios=body.get('audios')
        if not isinstance(audios,list) or not audios or not isinstance(audios[0],str) or not audios[0]:
            raise ValueError('No speech audio')
        return {'audio_base64':audios[0],'alignment':None,'model':'sarvam/bulbul:v3','language':language,'synthetic':True}
    except (httpx.HTTPError,ValueError,TypeError) as error:
        raise HTTPException(503,'Speech synthesis is unavailable; check the configured provider account') from error


async def synthesize(text, language, voice_id=None):
    global _capabilities,_eleven_retry_after
    if voice_id and voice_id.startswith('fish_ref:'):
        from learners import storage
        from learners.fish_voice import synthesize_reference
        from starlette.concurrency import run_in_threadpool
        reference=await run_in_threadpool(storage.read,voice_id.removeprefix('fish_ref:'))
        return await synthesize_reference(text,language,reference)
    if not voice_id and settings.SARVAM_API_KEY and (not settings.ELEVENLABS_API_KEY or time.monotonic()<_eleven_retry_after):
        return await sarvam_speech(text,language)
    if not settings.ELEVENLABS_API_KEY:
        raise HTTPException(503, "Speech synthesis is not configured")
    headers = {"xi-api-key": settings.ELEVENLABS_API_KEY}
    model_id = settings.ELEVENLABS_REGIONAL_MODEL_ID if language == "ml" else settings.ELEVENLABS_MODEL_ID
    try:
        async with provider_client(timeout=30) as client:
            if not _capabilities[1] or time.monotonic() - _capabilities[0] > 300:
                response = await client.get("https://api.elevenlabs.io/v1/models", headers=headers)
                response.raise_for_status()
                _capabilities = (time.monotonic(), response.json())
            model = next((item for item in _capabilities[1] if item.get("model_id") == model_id), None)
            if not model or not model.get("can_do_text_to_speech") or not any(item.get("language_id") == language for item in model.get("languages", [])):
                raise HTTPException(422, "The configured speech model does not support this language")
            selected_voice = voice_id or settings.ELEVENLABS_VOICE_ID or VOICE_MAP["female"]
            response = await client.post(f"https://api.elevenlabs.io/v1/text-to-speech/{selected_voice}/with-timestamps",
                headers=headers, json={"text": text, "model_id": model_id, "language_code": language})
            response.raise_for_status()
            data = response.json()
            if not data.get("audio_base64"):
                raise HTTPException(502, "Speech provider returned no audio")
            return {"audio_base64": data["audio_base64"], "alignment": data.get("normalized_alignment") or data.get("alignment"),
                    "model": model_id, "language": language, "synthetic": True}
    except (httpx.HTTPError, ValueError, TypeError, AttributeError) as error:
        if not voice_id and settings.SARVAM_API_KEY:
            response=getattr(error,'response',None)
            if response is not None and response.status_code in [401,402,429]:
                _eleven_retry_after=time.monotonic()+300
                return await sarvam_speech(text,language)
        raise HTTPException(503, "Speech synthesis is unavailable") from error
