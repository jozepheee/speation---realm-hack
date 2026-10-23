"""Versioned contract shared by training and inference."""
import os
from pathlib import Path
os.environ.setdefault("USE_TF", "0")
ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path(os.getenv("MODEL_ARTIFACT_DIR", str(ROOT / "artifacts")))
os.environ.setdefault("HF_HOME", str(ARTIFACTS / 'hf-cache'))
WAV2VEC_MODEL = "facebook/wav2vec2-base-960h"
SEMANTIC_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
ASR_MODEL = "medium"
ACOUSTIC_DIM, SEMANTIC_DIM, SAMPLE_RATE = 768, 384, 16000
MAX_AUDIO_SECONDS, MAX_AUDIO_BYTES = 60, 20 * 1024 * 1024
DEVICE = os.getenv("ML_DEVICE", "cpu")
FUSION_CHECKPOINT = ARTIFACTS / "fluency_v3" / "best.pt"
DQN_CHECKPOINT = ARTIFACTS / "scheduler_v3" / "dqn.zip"
EVENT_LABELS = ["Prolongation", "Block", "SoundRep", "WordRep", "Interjection", "NoStutteredWords"]
SCHEMA_VERSION = 3
SCORE_KIND = "annotator_vote_penalty_proxy"
class ModelUnavailableError(RuntimeError):
    pass
class InvalidAudioError(ValueError):
    pass
