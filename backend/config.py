"""Configuration comes exclusively from the environment or an ignored .env."""
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Speation"
    API_V1_STR: str = "/api"
    APP_ENV: Literal["development", "test", "production"] = "development"
    AUTH_PROVIDER: Literal["supabase", "local"] = "supabase"
    OPENROUTER_KEY: str = ""
    OPENROUTER_MODEL: str = "openai/gpt-5.6-luna"
    OPENROUTER_CARE_REPORT_MODEL: str = 'anthropic/claude-opus-5.5'
    OPENROUTER_VISION_MODEL: str = "openai/gpt-4o-mini"
    OPENROUTER_AUDIO_MODEL: str = 'google/gemini-3-flash-preview'
    MALAYALAM_PHONE_MODEL_DIR: str = ''
    PHONE_MODEL_DIR: str = ''
    INDIC_MALAYALAM_MODEL_DIR: str = ''
    RHUBARB_PATH: str = ''
    REVOICE_SELECTOR_ENABLED: bool = False
    REVOICE_SELECTOR_ARTIFACT: str = ''
    ENGLISH_ADAPTED_MODEL_DIR: str = ''
    ENGLISH_ADAPTED_EVALUATION: str = ''
    AZURE_SPEECH_KEY: str = ''
    AZURE_SPEECH_REGION: str = ''
    OPENROUTER_IMAGE_MODEL: str = 'google/gemini-2.5-flash-image'
    OPENAI_API_KEY: str = ""
    ELEVENLABS_API_KEY: str = ""
    VOICE_CLONING_PROVIDER: Literal['openrouter_fish','elevenlabs'] = 'openrouter_fish'
    OPENROUTER_CLONE_MODEL: str = 'fish-audio/drama-3'
    ELEVENLABS_MINOR_APP_APPROVED: bool = False
    SARVAM_API_KEY: str = ""
    DEEPGRAM_API_KEY: str = ""
    CARE_ASR_MODEL: str = 'large-v3'
    CARE_ASR_CACHE_DIR: str = ''
    SARVAM_ASR_MODEL: str = 'saaras:v4'
    DEEPGRAM_ASR_MODEL: str = 'nova-3'
    ELEVENLABS_VOICE_ID: str = ""
    ELEVENLABS_ASHA_VOICE_ID: str = 'EXAVITQu4vr4xnSDxMaL'
    ELEVENLABS_ROHAN_VOICE_ID: str = 'bIHbv24MWmeRgasZH58o'
    ELEVENLABS_NEHA_VOICE_ID: str = 'pFZP5JQG7iQjIQuC4Bku'
    ELEVENLABS_AGENT_LLM: str = 'gpt-5.6-sol'
    ELEVENLABS_AGENT_TTS_MODEL: str = 'eleven_v3_conversational'
    LIVE_CALL_MAX_SECONDS: int = 600
    ELEVENLABS_MODEL_ID: str = "eleven_v3"
    DATABASE_URL: str = "sqlite+aiosqlite:///./neuronudge.db"
    DATABASE_CA_CERT: str = ""
    REDIS_URL: str = "redis://localhost:6379/0"
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    NEXT_PUBLIC_SUPABASE_URL: str = ""
    NEXT_PUBLIC_SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_SECRET_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""
    CHROMA_API_KEY: str = ""
    CHROMA_TENANT: str = ""
    CHROMA_DATABASE: str = "neuronudge"
    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    MEMGRAPH_URI: str = "bolt://127.0.0.1:7688"
    MEMGRAPH_USER: str = ""
    MEMGRAPH_PASSWORD: str = ""
    AUDIO_STORAGE_DIR: str = "private-audio"
    AUDIO_ENCRYPTION_KEY: str = ""
    ELEVENLABS_REGIONAL_MODEL_ID: str = "eleven_v3"
    ALLOWED_ORIGINS: list[str] = []
    ENABLE_LEGACY_RESEARCH_ROUTES: bool = False
    model_config = SettingsConfigDict(env_file=(".env", ".env.runtime"), env_file_encoding="utf-8", extra="ignore")

    @property
    def auth_url(self):
        return (self.SUPABASE_URL or self.NEXT_PUBLIC_SUPABASE_URL).rstrip("/")

    @property
    def auth_key(self):
        return self.SUPABASE_KEY or self.NEXT_PUBLIC_SUPABASE_ANON_KEY

settings = Settings()
