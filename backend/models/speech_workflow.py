import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, JSON, Uuid, UniqueConstraint
from database import Base
from models.care import now


class MessageTranslation(Base):
    __tablename__ = 'message_translations'
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    learner_id = Column(Uuid, ForeignKey('learners.id', ondelete='CASCADE'), nullable=False, index=True)
    recording_id = Column(Uuid, ForeignKey('learner_recordings.id', ondelete='CASCADE'), nullable=False)
    request_id = Column(Uuid, nullable=False)
    proposed_by = Column(Uuid, ForeignKey('profiles.id'), nullable=False)
    candidates = Column(JSON, nullable=False, default=list)
    provenance = Column(JSON, nullable=False)
    confirmed_text = Column(String(1000), nullable=True)
    confirmed_by = Column(Uuid, ForeignKey('profiles.id'), nullable=True)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)
    __table_args__ = (UniqueConstraint('recording_id', 'request_id', name='translation_request_unique'),)


class PracticeCycle(Base):
    __tablename__ = 'practice_cycles'
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    learner_id = Column(Uuid, ForeignKey('learners.id', ondelete='CASCADE'), nullable=False, index=True)
    goal_id = Column(Uuid, ForeignKey('care_goals.id'), nullable=False)
    started_by = Column(Uuid, ForeignKey('profiles.id'), nullable=False)
    stage = Column(Integer, nullable=False, default=0)
    goal_snapshot = Column(JSON, nullable=False)
    events = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class LiveCall(Base):
    __tablename__ = 'learner_live_calls'
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    learner_id = Column(Uuid, ForeignKey('learners.id', ondelete='CASCADE'), nullable=False, index=True)
    started_by = Column(Uuid, ForeignKey('profiles.id'), nullable=False)
    request_id = Column(Uuid, nullable=False)
    provider_agent_id = Column(String(100), nullable=True)
    provider_conversation_id = Column(String(100), nullable=True, unique=True)
    language = Column(String(2), nullable=False)
    mode = Column(String(30), nullable=False)
    model = Column(String(100), nullable=False)
    status = Column(String(30), nullable=False, default='preparing')
    context = Column(JSON, nullable=False)
    transcript = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)
    last_seen_at = Column(DateTime(timezone=True), default=now, nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    __table_args__ = (UniqueConstraint('learner_id', 'request_id', name='live_call_request_unique'),)


class CallRecording(Base):
    __tablename__ = 'live_call_recordings'
    call_id = Column(Uuid, ForeignKey('learner_live_calls.id', ondelete='CASCADE'), primary_key=True)
    recording_id = Column(Uuid, ForeignKey('learner_recordings.id', ondelete='CASCADE'), primary_key=True)
    linked_by = Column(Uuid, ForeignKey('profiles.id'), nullable=False)
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)
