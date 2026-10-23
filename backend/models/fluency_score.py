import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, JSON, Uuid
from database import Base

class FluencyScore(Base):
    __tablename__ = "fluency_scores"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    session_id = Column(Uuid, ForeignKey("practice_sessions.id", ondelete="SET NULL"), nullable=True)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=True)
    transcript = Column(String, nullable=True)
    acoustic_score = Column(Float, nullable=True)   # Unavailable for single-head regression
    semantic_score = Column(Float, nullable=True)   # 0.0 - 100.0
    composite_score = Column(Float, nullable=False)  # 0.0 - 100.0
    features = Column(JSON, nullable=True)           # Detailed acoustic/phonetic feature vectors
    audio_url = Column(String, nullable=True)        # Storage URL
    recorded_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
