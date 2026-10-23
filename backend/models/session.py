import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Uuid
from database import Base

class PracticeSession(Base):
    __tablename__ = "practice_sessions"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=True)
    session_type = Column(String, nullable=False)  # 'oral_breath', 'pronunciation', 'avatar_dialogue'
    difficulty = Column(Integer, default=1)
    duration_secs = Column(Integer, default=0)
    started_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    ended_at = Column(DateTime(timezone=True), nullable=True)
