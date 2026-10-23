import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, JSON, Uuid, UniqueConstraint
from database import Base


def now():
    return datetime.now(timezone.utc)


class SpeechRecording(Base):
    __tablename__ = "learner_recordings"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    learner_id = Column(Uuid, ForeignKey("learners.id", ondelete="CASCADE"), nullable=False, index=True)
    submitted_by = Column(Uuid, ForeignKey("profiles.id"), nullable=False)
    attempt_id = Column(Uuid, nullable=False)
    language = Column(String(2), nullable=False)
    task = Column(String(30), nullable=False)
    expected_text = Column(String(2000), nullable=True)
    transcript = Column(String, nullable=True)
    words = Column(JSON, nullable=False, default=list)
    duration_seconds = Column(Float, nullable=False)
    quality = Column(JSON, nullable=False)
    audio_sha256 = Column(String(64), nullable=False)
    storage_key = Column(String(80), nullable=True)
    recognition_model = Column(String(100), nullable=True)
    recognition_error = Column(String(80), nullable=True)
    review_status = Column(String(30), nullable=False, default="pending")
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)
    __table_args__ = (UniqueConstraint("learner_id", "attempt_id", name="learner_recording_attempt_unique"),)


class RecordingReview(Base):
    __tablename__ = "recording_reviews"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    recording_id = Column(Uuid, ForeignKey("learner_recordings.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id = Column(Uuid, ForeignKey("profiles.id"), nullable=False)
    supersedes_review_id = Column(Uuid, ForeignKey('recording_reviews.id'), nullable=True, unique=True)
    proposal_id = Column(Uuid, ForeignKey('acoustic_proposals.id'), nullable=True, unique=True)
    sound = Column(String(16), nullable=False)
    outcome = Column(String(20), nullable=False)
    context = Column(String(20), nullable=False)
    start_seconds = Column(Float, nullable=False)
    end_seconds = Column(Float, nullable=False)
    intended_text = Column(String(2000), nullable=True)
    notes = Column(String(1500), nullable=False)
    expected_phone = Column(String(16), nullable=True)
    produced_phone = Column(String(16), nullable=True)
    error_category = Column(String(20), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)


class AcousticProposal(Base):
    __tablename__ = 'acoustic_proposals'
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    recording_id = Column(Uuid, ForeignKey('learner_recordings.id', ondelete='CASCADE'), nullable=False, index=True)
    requested_by = Column(Uuid, ForeignKey('profiles.id'), nullable=False)
    model = Column(String(100), nullable=False)
    request = Column(JSON, nullable=False)
    content = Column(JSON, nullable=False)
    decision = Column(String(20), nullable=False, default='pending')
    decided_by = Column(Uuid, ForeignKey('profiles.id'), nullable=True)
    decision_note = Column(String(1500), nullable=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)


class CareGoal(Base):
    __tablename__ = "care_goals"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    learner_id = Column(Uuid, ForeignKey("learners.id", ondelete="CASCADE"), nullable=False, index=True)
    clinician_id = Column(Uuid, ForeignKey("profiles.id"), nullable=False)
    title = Column(String(120), nullable=False)
    sound = Column(String(16), nullable=False)
    language = Column(String(2), nullable=False)
    practice_word = Column(String(120), nullable=False)
    instruction = Column(String(1500), nullable=False)
    phase = Column(String(30), nullable=False)
    active = Column(Boolean, nullable=False, default=True)
    archived_by = Column(Uuid, ForeignKey("profiles.id"), nullable=True)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)


class GraphOutbox(Base):
    __tablename__ = "graph_outbox"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    learner_id = Column(Uuid, ForeignKey("learners.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id = Column(Uuid, ForeignKey("profiles.id"), nullable=False)
    payload = Column(JSON, nullable=False)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)


class StorageDeletion(Base):
    __tablename__ = "storage_deletions"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    storage_key = Column(String(80), nullable=False)
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)


class ProviderDeletion(Base):
    __tablename__ = 'provider_deletions'
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    provider_id = Column(String(100), nullable=False, unique=True)
    resource_type = Column(String(20), nullable=False, default='voice', server_default='voice')
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)
