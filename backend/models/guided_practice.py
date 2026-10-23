import uuid
from sqlalchemy import Column, String, ForeignKey, JSON, DateTime, Uuid, CheckConstraint
from database import Base
from models.care import now

class GuidedPracticeSession(Base):
    __tablename__ = 'guided_practice_sessions'
    __table_args__ = (CheckConstraint("kind IN ('exercise','picture','word','intake')", name='guided_practice_sessions_kind_check'),)
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    learner_id = Column(Uuid, ForeignKey('learners.id', ondelete='CASCADE'), nullable=False, index=True)
    created_by = Column(Uuid, ForeignKey('profiles.id'), nullable=False)
    kind = Column(String(16), nullable=False)
    language = Column(String(2), nullable=False)
    content = Column(JSON, nullable=False)
    recording_id = Column(Uuid, ForeignKey('learner_recordings.id', ondelete='SET NULL'), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)
