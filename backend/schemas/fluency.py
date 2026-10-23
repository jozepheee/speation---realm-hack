from pydantic import BaseModel
from typing import Optional, Dict, Any

class AcousticFeaturesOut(BaseModel):
    pitch_mean_hz: float
    pitch_std_hz: float
    jitter_local: float
    shimmer_local: float
    pause_ratio: float
    speaking_rate_syll_per_sec: float
    rms_energy_mean: float

class FluencyScoreResponse(BaseModel):
    score_id: Optional[str] = None
    composite: float
    acoustic: Optional[float] = None
    acoustic_weight: Optional[float] = None
    semantic_weight: Optional[float] = None
    semantic: Optional[float] = None
    rate: str
    transcript: str
    recommendation: str
    features: Optional[Dict[str, Any]] = None
