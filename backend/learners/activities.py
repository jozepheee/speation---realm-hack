"""Clinician-authored language content. Syllables are never guessed from spelling."""
import uuid
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from auth.dependencies import get_current_user
from database import get_db
from models.user import User
from models.care import CareGoal
from models.experience import ReviewedActivity
from learners.care_router import clinician_access
from learners.access import accessible_learner, lock_learner, require_practice_consent

router = APIRouter(tags=['reviewed-activity-catalog'])
PICTURES = ['water', 'apple', 'home', 'car', 'tree', 'sun', 'cat', 'ball']


class ActivityRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    kind: Literal['syllable', 'picture', 'rhythm']
    language: Literal['en', 'hi', 'ml']
    difficulty: Literal['starter', 'growing', 'challenge'] = 'starter'
    goal_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=120)
    word: str = Field(min_length=1, max_length=120)
    instruction: str = Field(min_length=1, max_length=1500)
    min_age: int = Field(default=4, ge=4, le=21)
    max_age: int = Field(default=21, ge=4, le=21)
    syllables: list[str] = Field(default_factory=list, max_length=8)
    picture: Literal['water', 'apple', 'home', 'car', 'tree', 'sun', 'cat', 'ball'] | None = None
    beat_intervals: list[float] = Field(default_factory=list, max_length=8)

    @model_validator(mode='after')
    def reviewed_content(self):
        if self.min_age > self.max_age:
            raise ValueError('Age range must be ordered')
        if self.kind == 'syllable' and (len(self.syllables) < 2 or any(not item.strip() or len(item) > 40 for item in self.syllables)):
            raise ValueError('Provide 2–8 explicitly reviewed syllable pieces')
        if self.kind == 'picture' and self.picture is None:
            raise ValueError('Select the reviewed picture association')
        if self.kind == 'rhythm' and (len(self.beat_intervals) < 2 or any(not .25 <= item <= 2.5 for item in self.beat_intervals)):
            raise ValueError('Provide 2–8 pacing intervals of 0.25–2.5 seconds')
        return self


def public_activity(activity):
    return {name: getattr(activity, name) for name in ['title', 'kind', 'language', 'word', 'instruction', 'min_age', 'max_age', 'content', 'active']} | {
        'id': str(activity.id), 'goal_id': str(activity.goal_id) if activity.goal_id else None,
        'source': 'clinician_authored', 'clinician_id': str(activity.clinician_id)}


@router.post('/learners/{learner_id}/activities', status_code=201)
async def create(learner_id: uuid.UUID, payload: ActivityRequest,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await lock_learner(db, user, learner_id)
    await clinician_access(db, user, learner_id)
    await require_practice_consent(db, learner_id)
    if payload.goal_id:
        goal = await db.get(CareGoal, payload.goal_id)
        if not goal or goal.learner_id != learner_id or not goal.active or goal.language != payload.language:
            raise HTTPException(404, 'Active goal in this language not found')
    activity = ReviewedActivity(learner_id=learner_id, clinician_id=user.id,
        **payload.model_dump(exclude={'syllables', 'picture', 'beat_intervals', 'difficulty'}),
        content={'syllables': payload.syllables, 'picture': payload.picture, 'beat_intervals': payload.beat_intervals, 'difficulty': payload.difficulty})
    db.add(activity); await db.commit()
    return public_activity(activity)


@router.get('/learners/{learner_id}/activities')
async def list_activities(learner_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    learner = await accessible_learner(db, user, learner_id)
    result = (await db.execute(select(ReviewedActivity).where(ReviewedActivity.learner_id == learner_id,
        ReviewedActivity.active.is_(True), ReviewedActivity.min_age <= learner.age,
        ReviewedActivity.max_age >= learner.age).order_by(ReviewedActivity.created_at.desc()).limit(100))).scalars().all()
    return [public_activity(item) for item in result]


@router.patch('/activities/{activity_id}/archive')
async def archive(activity_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    activity = await db.get(ReviewedActivity, activity_id)
    if not activity:
        raise HTTPException(404, 'Activity not found')
    await lock_learner(db, user, activity.learner_id)
    await clinician_access(db, user, activity.learner_id)
    activity.active = False; await db.commit()
    return {'active': False}
