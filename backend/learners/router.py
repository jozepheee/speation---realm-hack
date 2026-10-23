import uuid
from datetime import datetime, timezone
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, EmailStr, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from auth.dependencies import get_current_user
from database import get_db
from models.user import User
from models.learner import Learner, ConsentEvent, ClinicianAssignment
from models.care import SpeechRecording, StorageDeletion, ProviderDeletion
from models.experience import VoiceProfile
from models.speech_workflow import LiveCall
from learners.access import accessible_learner, lock_learner, is_clinician, latest_consent, POLICY_VERSION

router = APIRouter(tags=["learners"])


class ConsentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    practice_allowed: bool
    cloud_processing_allowed: bool = False
    retain_audio_allowed: bool = False
    policy_version: Literal["2026-10-14-v1"]
    authorized_to_consent: Literal[True]

    @model_validator(mode="after")
    def check_scope(self):
        if not self.practice_allowed and (self.cloud_processing_allowed or self.retain_audio_allowed):
            raise ValueError("Withdraw all processing and retention permissions when withdrawing practice consent")
        return self


class LearnerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    display_name: str = Field(min_length=1, max_length=80)
    age: int = Field(ge=4, le=21)
    language: Literal["en", "hi", "ml"]
    relationship: Literal["guardian", "self"]
    consent: ConsentRequest

    @model_validator(mode="after")
    def check_relationship(self):
        if (self.age < 18) != (self.relationship == "guardian"):
            raise ValueError("Under 18 requires a guardian-managed profile; ages 18–21 require self management")
        return self


class AssignmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    clinician_email: EmailStr
    active: bool = True


def consent_data(consent):
    if consent is None:
        return None
    return {"practice_allowed": consent.practice_allowed,
            "cloud_processing_allowed": consent.cloud_processing_allowed,
            "retain_audio_allowed": consent.retain_audio_allowed,
            "policy_version": consent.policy_version, "recorded_at": consent.created_at.isoformat()}


async def learner_data(db, learner):
    return {"id": str(learner.id), "display_name": learner.display_name, "age": learner.age,
            "language": learner.language, "relationship": learner.relationship,
            "consent": consent_data(await latest_consent(db, learner.id))}


@router.get("/workspace/me")
async def workspace_me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return {"role": "clinician" if await is_clinician(db, user.id) else "guardian_or_participant",
            "consent_policy_version": POLICY_VERSION}


@router.get("/learners")
async def list_learners(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    learners = (await db.execute(select(Learner).where(Learner.owner_id == user.id)
                                .order_by(Learner.created_at.desc()))).scalars().all()
    return [await learner_data(db, learner) for learner in learners]


@router.post("/learners", status_code=201)
async def create_learner(payload: LearnerRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    learner = Learner(owner_id=user.id, **payload.model_dump(exclude={"consent"}))
    db.add(learner)
    await db.flush()
    db.add(ConsentEvent(learner_id=learner.id, actor_id=user.id,
                       **payload.consent.model_dump(exclude={"authorized_to_consent"})))
    await db.commit()
    return await learner_data(db, learner)


@router.get("/learners/{learner_id}")
async def get_learner(learner_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await learner_data(db, await accessible_learner(db, user, learner_id))


@router.post("/learners/{learner_id}/consent", status_code=201)
async def update_consent(learner_id: uuid.UUID, payload: ConsentRequest,
                         user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await lock_learner(db, user, learner_id, owner_only=True)
    event = ConsentEvent(learner_id=learner_id, actor_id=user.id,
                        **payload.model_dump(exclude={"authorized_to_consent"}))
    db.add(event)
    if not payload.cloud_processing_allowed:
        voices = (await db.execute(select(VoiceProfile).where(VoiceProfile.learner_id == learner_id))).scalars().all()
        for voice in voices:
            db.add(ProviderDeletion(provider_id=voice.provider_id))
            await db.delete(voice)
        # Consent withdrawal also removes the private live-call provider resources.
        from learners.live_calls import queue_cleanup
        calls = (await db.execute(select(LiveCall).where(LiveCall.learner_id == learner_id,
            LiveCall.status.in_(['preparing', 'prepared', 'connected', 'finalizing'])))).scalars().all()
        for call in calls:
            queue_cleanup(db, call)
            call.status = 'revoked'; call.ended_at = datetime.now(timezone.utc)
    if not payload.retain_audio_allowed:
        references=(await db.execute(select(VoiceProfile).where(VoiceProfile.learner_id==learner_id,VoiceProfile.provider_id.like('fish_ref:%')))).scalars().all()
        for voice in references:
            db.add(ProviderDeletion(provider_id=voice.provider_id));await db.delete(voice)
        retained = (await db.execute(select(SpeechRecording).where(SpeechRecording.learner_id == learner_id,
            SpeechRecording.storage_key.is_not(None)))).scalars().all()
        for recording in retained:
            db.add(StorageDeletion(storage_key=recording.storage_key))
            recording.storage_key = None
    await db.commit()
    return consent_data(event)


@router.get("/learners/{learner_id}/consent-history")
async def consent_history(learner_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await accessible_learner(db, user, learner_id, owner_only=True)
    events = (await db.execute(select(ConsentEvent).where(ConsentEvent.learner_id == learner_id)
                              .order_by(ConsentEvent.created_at.desc()).limit(100))).scalars().all()
    return [consent_data(event) for event in events]


@router.put("/learners/{learner_id}/clinician")
async def assign_clinician(learner_id: uuid.UUID, payload: AssignmentRequest,
                          user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await lock_learner(db, user, learner_id, owner_only=True)
    clinician = (await db.execute(select(User).where(User.email == payload.clinician_email))).scalar_one_or_none()
    if not clinician or not await is_clinician(db, clinician.id):
        raise HTTPException(404, "Provisioned clinician account not found")
    assignment = (await db.execute(select(ClinicianAssignment).where(
        ClinicianAssignment.learner_id == learner_id, ClinicianAssignment.clinician_id == clinician.id))).scalar_one_or_none()
    if assignment is None:
        assignment = ClinicianAssignment(learner_id=learner_id, clinician_id=clinician.id,
                                        assigned_by=user.id, active=payload.active)
        db.add(assignment)
    else:
        assignment.active = payload.active
        assignment.updated_at = datetime.now(timezone.utc)
    try:
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(409, "Assignment changed concurrently; retry") from error
    return {"clinician_email": clinician.email, "active": assignment.active}


@router.get("/clinical/learners")
async def clinical_learners(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not await is_clinician(db, user.id):
        raise HTTPException(403, "Clinician access required")
    learners = (await db.execute(select(Learner).join(ClinicianAssignment,
        ClinicianAssignment.learner_id == Learner.id).where(
            ClinicianAssignment.clinician_id == user.id, ClinicianAssignment.active.is_(True))
        .order_by(Learner.created_at.desc()))).scalars().all()
    return [await learner_data(db, learner) for learner in learners]
