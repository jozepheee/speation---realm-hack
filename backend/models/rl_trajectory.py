import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, JSON, Uuid
from database import Base

class RLTrajectory(Base):
    __tablename__ = "rl_trajectories"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=True)
    state = Column(JSON, nullable=False)       # {fluency_level, streak, fatigue, personality}
    action = Column(Integer, nullable=False)   # 0 to 3
    reward = Column(Float, nullable=True)
    next_state = Column(JSON, nullable=True)
    done = Column(Boolean, default=False)
    ts = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
