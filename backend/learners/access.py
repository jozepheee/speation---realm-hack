import uuid
from fastapi import HTTPException
from sqlalchemy import select
from models.learner import Learner, AccountRole, ClinicianAssignment, ConsentEvent

POLICY_VERSION = "2026-10-14-v1"


async def is_clinician(db, user_id):
    role = await db.get(AccountRole, user_id, populate_existing=True)
    return bool(role and role.role == "clinician")


async def accessible_learner(db, user, learner_id: uuid.UUID, owner_only=False):
    learner = await db.get(Learner, learner_id)
    if learner is None:
        raise HTTPException(404, "Learner not found")
    if learner.owner_id == user.id:
        return learner
    if not owner_only and await is_clinician(db, user.id):
        assignment = (await db.execute(select(ClinicianAssignment).where(
            ClinicianAssignment.learner_id == learner_id,
            ClinicianAssignment.clinician_id == user.id,
            ClinicianAssignment.active.is_(True)))).scalar_one_or_none()
        if assignment:
            return learner
    raise HTTPException(404, "Learner not found")


async def latest_consent(db, learner_id):
    return (await db.execute(select(ConsentEvent).where(ConsentEvent.learner_id == learner_id)
        .order_by(ConsentEvent.created_at.desc(), ConsentEvent.id.desc()).limit(1))).scalar_one_or_none()


async def lock_learner(db, user, learner_id, owner_only=False):
    # Retain the locked ORM row so the ownership check reuses it without another query.
    locked = (await db.execute(select(Learner).where(Learner.id == learner_id).with_for_update())).scalar_one_or_none()
    if locked is None:
        raise HTTPException(404, 'Learner not found')
    return await accessible_learner(db, user, learner_id, owner_only=owner_only)


async def require_practice_consent(db, learner_id):
    consent = await latest_consent(db, learner_id)
    if not consent or not consent.practice_allowed:
        raise HTTPException(403, "Practice consent is required")
    return consent


async def recheck_cloud_processing(db, user, learner_id, owner_only=False):
    await lock_learner(db, user, learner_id, owner_only=owner_only)
    consent = await require_practice_consent(db, learner_id)
    if not consent.cloud_processing_allowed:
        raise HTTPException(403, 'Cloud processing permission was withdrawn')
    return consent
