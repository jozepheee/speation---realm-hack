import uuid
from sqlalchemy import Column, String, Integer, Boolean, ForeignKey, JSON, DateTime, Uuid, UniqueConstraint
from database import Base
from models.care import now


class CompanionTurn(Base):
    __tablename__ = "companion_turns"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    learner_id = Column(Uuid, ForeignKey("learners.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(Uuid, ForeignKey("profiles.id"), nullable=False)
    mode = Column(String(30), nullable=False)
    language = Column(String(2), nullable=True)
    evidence_context = Column(JSON, nullable=True)
    user_text = Column(String(2000), nullable=False)
    reply = Column(String(4000), nullable=False)
    model = Column(String(100), nullable=False)
    goal_id = Column(Uuid, ForeignKey("care_goals.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)


class VoiceProfile(Base):
    __tablename__ = "learner_voices"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    learner_id = Column(Uuid, ForeignKey("learners.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_id = Column(Uuid, ForeignKey("profiles.id"), nullable=False)
    provider_id = Column(String(100), nullable=False)
    label = Column(String(80), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)


class ReviewedActivity(Base):
    __tablename__ = 'reviewed_activities'
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    learner_id = Column(Uuid, ForeignKey('learners.id', ondelete='CASCADE'), nullable=False, index=True)
    clinician_id = Column(Uuid, ForeignKey('profiles.id'), nullable=False)
    goal_id = Column(Uuid, ForeignKey('care_goals.id'), nullable=True)
    kind = Column(String(20), nullable=False)
    language = Column(String(2), nullable=False)
    title = Column(String(120), nullable=False)
    word = Column(String(120), nullable=False)
    instruction = Column(String(1500), nullable=False)
    min_age = Column(Integer, nullable=False)
    max_age = Column(Integer, nullable=False)
    content = Column(JSON, nullable=False)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)


class GameRecording(Base):
    __tablename__ = 'game_recordings'
    session_id = Column(Uuid, ForeignKey('learner_game_sessions.id', ondelete='CASCADE'), primary_key=True)
    recording_id = Column(Uuid, ForeignKey('learner_recordings.id', ondelete='CASCADE'), primary_key=True)
    linked_by = Column(Uuid, ForeignKey('profiles.id'), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)


class GameSession(Base):
    __tablename__ = "learner_game_sessions"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    learner_id = Column(Uuid, ForeignKey("learners.id", ondelete="CASCADE"), nullable=False, index=True)
    game = Column(String(30), nullable=False)
    challenges = Column(JSON, nullable=False)
    responses = Column(JSON, nullable=False, default=list)
    completed = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class LearnerReward(Base):
    __tablename__ = "learner_rewards"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    learner_id = Column(Uuid, ForeignKey("learners.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(Uuid, ForeignKey("learner_game_sessions.id", ondelete="CASCADE"), nullable=False, unique=True)
    stars = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)


class FamilyMission(Base):
    __tablename__ = "family_missions"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    learner_id = Column(Uuid, ForeignKey("learners.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(Uuid, ForeignKey("profiles.id"), nullable=False)
    title = Column(String(120), nullable=False)
    instruction = Column(String(1500), nullable=False)
    goal_id = Column(Uuid, ForeignKey("care_goals.id", ondelete="SET NULL"), nullable=True)
    proposal_id = Column(Uuid, ForeignKey('mission_proposals.id'), nullable=True)
    kind = Column(String(20), nullable=False, default='practice', server_default='practice')
    due_at = Column(DateTime(timezone=True), nullable=True)
    recording_id = Column(Uuid, ForeignKey('learner_recordings.id', ondelete='SET NULL'), nullable=True)
    report = Column(String(1500), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)


class MissionProposal(Base):
    __tablename__ = 'mission_proposals'
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    learner_id = Column(Uuid, ForeignKey('learners.id', ondelete='CASCADE'), nullable=False, index=True)
    requested_by = Column(Uuid, ForeignKey('profiles.id'), nullable=False)
    model = Column(String(100), nullable=False)
    content = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)


class WeeklyRoutine(Base):
    __tablename__ = 'weekly_routines'
    learner_id = Column(Uuid, ForeignKey('learners.id', ondelete='CASCADE'), primary_key=True)
    target_days = Column(Integer, nullable=False)
    timezone = Column(String(80), nullable=False)
    updated_by = Column(Uuid, ForeignKey('profiles.id'), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=now)


class CommunicationPhrase(Base):
    __tablename__ = "communication_phrases"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    learner_id = Column(Uuid, ForeignKey("learners.id", ondelete="CASCADE"), nullable=False, index=True)
    language = Column(String(2), nullable=False)
    text = Column(String(300), nullable=False)
    symbol = Column(String(30), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)
