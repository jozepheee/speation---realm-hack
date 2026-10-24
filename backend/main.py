from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models
import os
from fastapi.staticfiles import StaticFiles
from auth.router import router as auth_router
from knowledge_graph.router import router as knowledge_graph_router
from learners.router import router as learners_router
from learners.care_router import router as care_router
from learners.companion_router import router as learner_companion_router
from learners.games_router import router as games_router
from learners.family_router import router as family_router
from learners.translation_router import router as translation_router
from learners.practice_router import router as practice_router
from learners.live_calls import router as live_calls_router
from learners.activities import router as activities_router
from learners.acoustic_router import router as acoustic_router
from learners.intake import router as intake_router
from learners.routines import router as routines_router
from learners.guided_practice import router as guided_practice_router
from learners.speech_coaching import router as speech_coaching_router
from config import settings
from middleware_limits import RequestLimits
from health_router import router as health_router
from learners.journey_router import router as journey_router
from learners.ai_care_reports import router as ai_care_reports_router
from knowledge_graph.service import get_graph
from sqlalchemy import text
from urllib.parse import urlsplit

static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(static_dir, exist_ok=True)


def verify_production_configuration():
    if settings.APP_ENV != 'production':
        return
    if settings.AUTH_PROVIDER != 'supabase' or not settings.auth_url.startswith('https://') or not settings.auth_key:
        raise RuntimeError('Production requires configured hosted Supabase authentication')
    if not settings.DATABASE_URL.startswith(('postgresql://', 'postgres://', 'postgresql+asyncpg://')):
        raise RuntimeError('Production requires PostgreSQL')
    if settings.ELEVENLABS_API_KEY and not settings.ELEVENLABS_MINOR_APP_APPROVED:
        raise RuntimeError('Record written ElevenLabs approval for this child-directed application')
    if settings.ENABLE_LEGACY_RESEARCH_ROUTES:
        raise RuntimeError('Legacy research routes must remain disabled in production')
    if not settings.ALLOWED_ORIGINS:
        raise RuntimeError('Configure explicit HTTPS application origins')
    for origin in settings.ALLOWED_ORIGINS:
        parsed = urlsplit(origin)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password or '*' in origin:
            raise RuntimeError('Application origins must be explicit HTTPS origins without paths or credentials')


def verify_schema(connection):
    # One bounded catalogue query avoids a round trip per reflected table on
    # the hosted pooler. Versioned migrations own the public application schema.
    actual = {}
    for row in connection.execute(text("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'")):
        actual.setdefault(row.table_name, set()).add(row.column_name)
    if set(Base.metadata.tables) - set(actual):
        raise RuntimeError('Apply versioned database migrations before startup')
    for name, table in Base.metadata.tables.items():
        if set(table.columns.keys()) - actual[name]:
            raise RuntimeError('A required schema column is missing; apply versioned migrations')

@asynccontextmanager
async def lifespan(app: FastAPI):
    verify_production_configuration()
    from learners import provider_http
    provider_http.start()
    # 1. Initialize database tables on startup
    try:
        async with engine.begin() as conn:
            if settings.APP_ENV == "production" or engine.dialect.name == 'postgresql':
                await conn.run_sync(verify_schema)
                if settings.APP_ENV == 'production':
                    await get_graph().ready()
            else:
                await conn.run_sync(Base.metadata.create_all)
        print("[Database] Schema synchronized successfully.")
    except Exception:
        if settings.APP_ENV == "production":
            raise RuntimeError("Database initialization failed")
        print("[Database Initialization Warning] Database is unavailable.")

    # 2. Warm up Chroma Cloud Vector Database
    try:
        if not settings.ENABLE_LEGACY_RESEARCH_ROUTES or not settings.CHROMA_API_KEY or not settings.CHROMA_TENANT:
            raise RuntimeError("Optional Chroma memory is not configured")
        from avatar.vector_memory import get_collections
        get_collections()
        print("[Chroma Cloud] Vector collections verified and warmed up.")
    except Exception:
        print("[Chroma Cloud] Optional vector memory is unavailable.")

    if settings.PHONE_MODEL_DIR or settings.MALAYALAM_PHONE_MODEL_DIR:
        try:
            from starlette.concurrency import run_in_threadpool
            from learners.phone_observation import _load
            await run_in_threadpool(_load, os.path.abspath(settings.PHONE_MODEL_DIR or settings.MALAYALAM_PHONE_MODEL_DIR))
            print("[Speech] English/Hindi/Malayalam phone hypotheses warmed; automatic grading remains unvalidated.")
        except (ImportError, OSError, RuntimeError, ValueError, KeyError):
            print("[Speech] Local phone hypotheses unavailable; no automatic correctness fallback.")

    if settings.INDIC_MALAYALAM_MODEL_DIR:
        try:
            from starlette.concurrency import run_in_threadpool
            from learners.indic_malayalam import load as load_indic_malayalam
            await run_in_threadpool(load_indic_malayalam, settings.INDIC_MALAYALAM_MODEL_DIR)
            print('[Speech] IndicWav2Vec Malayalam character assessor warmed; no verified phoneme score.')
        except (ImportError,OSError,RuntimeError,ValueError,KeyError):
            print('[Speech] IndicWav2Vec Malayalam unavailable; pronunciation praise disabled.')
    yield
    # Clean up connections on shutdown
    await provider_http.close()
    await engine.dispose()
    if get_graph.cache_info().currsize:
        await get_graph().close()

app = FastAPI(
    title="Speation Speech Practice and Communication",
    description="Private learner evidence, reviewed speech practice, confirmed-message communication and a multimodal companion",
    version="1.0.0",
    lifespan=lifespan
)
from learners.speaking_studio import router as speaking_studio_router
app.include_router(speaking_studio_router)
app.add_middleware(RequestLimits)

# CORS middleware with explicit origins and regex for local development
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:[0-9]+)?" if settings.APP_ENV != "production" else None,
    allow_origins=settings.ALLOWED_ORIGINS if settings.APP_ENV == "production" else [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount core Speation routers
app.include_router(auth_router, prefix="/auth")
if settings.ENABLE_LEGACY_RESEARCH_ROUTES:
    from fluency.router import router as fluency_router
    from scheduler.router import router as scheduler_router
    from avatar.router import router as avatar_router
    from session.router import router as session_router
    # Preserve the evaluated algorithm v3 research implementation. It is not a
    # pediatric pronunciation assessor and is not exposed by the child platform.
    app.include_router(fluency_router, prefix="/fluency")
    app.include_router(scheduler_router, prefix="/scheduler")
    app.include_router(avatar_router, prefix="/avatar")
    app.include_router(session_router, prefix="/session")
app.include_router(knowledge_graph_router, prefix="/knowledge-graph")
app.include_router(learners_router)
app.include_router(care_router)
app.include_router(learner_companion_router)
from learners.learning_adventures import router as learning_adventures_router
app.include_router(learning_adventures_router)
from learners.wordy import router as wordy_router
app.include_router(wordy_router)
from learners.learning_sessions import router as learning_sessions_router
app.include_router(learning_sessions_router)
from learners.learning_demonstrations import router as learning_demonstrations_router
app.include_router(learning_demonstrations_router)
app.include_router(games_router)
app.include_router(family_router)
app.include_router(translation_router)
app.include_router(practice_router)
app.include_router(live_calls_router)
app.include_router(activities_router)
app.include_router(acoustic_router)
app.include_router(routines_router)
app.include_router(intake_router)
app.include_router(guided_practice_router)
app.include_router(speech_coaching_router)
from learners.daily_observations import router as daily_observations_router
app.include_router(daily_observations_router)
from learners.conversation_intent import router as conversation_intent_router
app.include_router(conversation_intent_router)
from learners.personal_learning import router as personal_learning_router
app.include_router(personal_learning_router)
app.include_router(health_router)
app.include_router(journey_router)
app.include_router(ai_care_reports_router)

# Mount Fluention feature routers
if settings.ENABLE_LEGACY_RESEARCH_ROUTES:
    from secondstep.router import router as secondstep_router
    from thirdstep.router import router as thirdstep_router
    from fourthstep.router import router as fourthstep_router
    from translator.router import router as translator_router
    from lipsync.router import router as lipsync_router
    app.include_router(secondstep_router, prefix="/secondstep")
    app.include_router(thirdstep_router, prefix="/thirdstep")
    app.include_router(fourthstep_router, prefix="/fourthstep")
    app.include_router(translator_router, prefix="/translator")
    app.include_router(lipsync_router, prefix="/lipsync")

# Static files for audio/video media
if settings.ENABLE_LEGACY_RESEARCH_ROUTES:
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "Speation AI Clinical Speech Platform",
        "version": "1.0.0"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main.py:app", host="0.0.0.0", port=8000, reload=True)
