from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from database import engine
from knowledge_graph.service import get_graph
from config import settings
from redis.asyncio import Redis

router = APIRouter(tags=["operations"])


@router.get("/health/live")
async def live():
    return {"status": "alive"}


@router.get("/health/ready")
async def ready():
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        await get_graph().ready()
        if settings.APP_ENV == 'production':
            from learners.storage import cipher
            cipher()
            redis = Redis.from_url(settings.REDIS_URL, socket_connect_timeout=2, socket_timeout=2)
            try:
                await redis.ping()
            finally:
                await redis.aclose()
    except Exception as error:
        raise HTTPException(503, "A required data service is unavailable") from error
    return {"status": "ready", "database": "connected", "memgraph": "connected",
            "speech_assessment": "automatic_practice_feedback_with_human_review",
            "automatic_phoneme_assessor": "practice_feedback_configured" if settings.OPENROUTER_KEY or (settings.AZURE_SPEECH_KEY and settings.AZURE_SPEECH_REGION) else "not_configured",
            "clinical_validation": "not_established",
            "pronunciation_capabilities": {
                "audio_coaching_configured": bool(settings.OPENROUTER_KEY or (settings.AZURE_SPEECH_KEY and settings.AZURE_SPEECH_REGION)),
                "english_feedback": "bounded_dedicated_audio_assessment_with_uncertainty",
                "personal_recognition_model": "not_trained",
                "azure_english_hindi_configured": bool(settings.AZURE_SPEECH_KEY and settings.AZURE_SPEECH_REGION),
                "local_phone_hypotheses_configured": bool(settings.PHONE_MODEL_DIR or settings.MALAYALAM_PHONE_MODEL_DIR),
                "malayalam_feedback": "experimental_audio_grounded_practice",
            },
            "conversation_configured": bool(settings.OPENROUTER_KEY),
            "speech_output_configured": bool(settings.ELEVENLABS_API_KEY or settings.SARVAM_API_KEY),
            "voice_cloning_provider": settings.VOICE_CLONING_PROVIDER,
            "voice_cloning_model": settings.OPENROUTER_CLONE_MODEL if settings.VOICE_CLONING_PROVIDER=='openrouter_fish' else None}
