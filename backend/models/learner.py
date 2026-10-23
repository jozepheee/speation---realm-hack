import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Uuid, CheckConstraint, UniqueConstraint
from database import Base


class LocalCredential(Base):
    __tablename__ = "local_credentials"
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True)
    password_hash = Column(String, nullable=False)


class AccountRole(Base):
    __tablename__ = "account_roles"
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True)
    role = Column(String, nullable=False)
    __table_args__ = (CheckConstraint("role = 'clinician'", name="account_role_allowed"),)


class ClinicianApplication(Base):
    __tablename__ = 'clinician_applications'
    user_id = Column(Uuid, ForeignKey('profiles.id', ondelete='CASCADE'), primary_key=True)
    professional_title = Column(String(120), nullable=False)
    registration_number = Column(String(120), nullable=False)
    jurisdiction = Column(String(120), nullable=False)
    organization = Column(String(160), nullable=False, default='')
    submitted_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class Learner(Base):
    __tablename__ = "learners"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    display_name = Column(String(80), nullable=False)
    age = Column(Integer, nullable=False)
    language = Column(String(2), nullable=False)
    relationship = Column(String(10), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    __table_args__ = (
        CheckConstraint("age BETWEEN 4 AND 21", name="learner_age_range"),
        CheckConstraint("language IN ('en','hi','ml')", name="learner_language"),
        CheckConstraint("(age < 18 AND relationship = 'guardian') OR (age >= 18 AND relationship = 'self')", name="learner_relationship"),
    )


class ConsentEvent(Base):
    __tablename__ = "learner_consent_events"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    learner_id = Column(Uuid, ForeignKey("learners.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id = Column(Uuid, ForeignKey("profiles.id"), nullable=False)
    practice_allowed = Column(Boolean, nullable=False)
    cloud_processing_allowed = Column(Boolean, nullable=False, default=False)
    retain_audio_allowed = Column(Boolean, nullable=False, default=False)
    policy_version = Column(String(40), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class ClinicianAssignment(Base):
    __tablename__ = "clinician_assignments"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    learner_id = Column(Uuid, ForeignKey("learners.id", ondelete="CASCADE"), nullable=False, index=True)
    clinician_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_by = Column(Uuid, ForeignKey("profiles.id"), nullable=False)
    active = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    __table_args__ = (UniqueConstraint("learner_id", "clinician_id", name="clinician_assignment_unique"),)
