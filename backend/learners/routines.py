"""Flexible participation days based on persisted activity, never speech accuracy."""
import uuid
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from auth.dependencies import get_current_user
from database import get_db
from models.user import User
from models.care import SpeechRecording
from models.experience import WeeklyRoutine, FamilyMission, GameSession
from learners.access import accessible_learner, lock_learner

router = APIRouter(tags=['flexible-family-routines'])


class RoutineRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    target_days: int = Field(ge=1, le=7)
    timezone: str = Field(min_length=1, max_length=80)

    @field_validator('timezone')
    @classmethod
    def valid_zone(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError('Choose a supported IANA timezone') from error
        return value


@router.put('/learners/{learner_id}/routine')
async def save(learner_id: uuid.UUID, payload: RoutineRequest,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await lock_learner(db, user, learner_id, owner_only=True)
    row = await db.get(WeeklyRoutine, learner_id)
    if row is None:
        row = WeeklyRoutine(learner_id=learner_id); db.add(row)
    row.target_days = payload.target_days; row.timezone = payload.timezone
    row.updated_by = user.id; row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {'saved': True}


@router.get('/learners/{learner_id}/routine')
async def summary(learner_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await accessible_learner(db, user, learner_id)
    row = await db.get(WeeklyRoutine, learner_id)
    if row is None:
        return {'configured': False, 'source': 'persisted_participation_only'}
    zone = ZoneInfo(row.timezone)
    today = datetime.now(zone).date()
    monday = today - timedelta(days=today.weekday())
    start = datetime.combine(monday, time.min, tzinfo=zone).astimezone(timezone.utc)
    end = datetime.combine(monday + timedelta(days=7), time.min, tzinfo=zone).astimezone(timezone.utc)
    dates, truncated = set(), False
    for model, column in [(SpeechRecording, SpeechRecording.created_at),
                          (GameSession, GameSession.completed_at), (FamilyMission, FamilyMission.completed_at)]:
        times = (await db.execute(select(column).where(model.learner_id == learner_id,
            column >= start, column < end).order_by(column).limit(2001))).scalars().all()
        truncated |= len(times) > 2000
        for timestamp in times[:2000]:
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)
            dates.add(timestamp.astimezone(zone).date().isoformat())
    return {'configured': True, 'week_start': monday.isoformat(), 'timezone': row.timezone,
        'target_days': row.target_days, 'participation_days': sorted(dates), 'truncated': truncated,
        'source': 'recordings_completed_games_and_family_reports', 'clinical_assessment': False}
