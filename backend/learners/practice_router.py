"""A persisted practice sequence using authored guidance and actual recordings."""
import uuid
from datetime import datetime, timezone
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from auth.dependencies import get_current_user
from database import get_db
from models.user import User
from models.care import CareGoal, SpeechRecording, RecordingReview
from models.speech_workflow import PracticeCycle
from learners.access import accessible_learner, lock_learner, require_practice_consent
from learners.speech_output import synthesize
from knowledge_graph.workflow import queue_workflow
from learners.review_evidence import current_review_filter

router = APIRouter(tags=['reviewed-practice-path'])
STAGES = ['understand', 'listen', 'baseline', 'teach', 'retest', 'transfer', 'complete']


def public_cycle(cycle):
    return {'id': str(cycle.id), 'goal_id': str(cycle.goal_id), 'stage': cycle.stage,
        'stage_name': STAGES[cycle.stage], 'goal': cycle.goal_snapshot, 'events': cycle.events,
        'completed': cycle.stage == 6, 'completion_basis': 'participation_requires_review',
        'created_at': cycle.created_at.isoformat(), 'automatic_pronunciation_score': None}


class StartCycle(BaseModel):
    model_config = ConfigDict(extra='forbid')
    goal_id: uuid.UUID


@router.post('/learners/{learner_id}/practice-cycles', status_code=201)
async def start_cycle(learner_id: uuid.UUID, payload: StartCycle,
                      user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await lock_learner(db, user, learner_id)
    await require_practice_consent(db, learner_id)
    goal = await db.get(CareGoal, payload.goal_id)
    if not goal or goal.learner_id != learner_id or not goal.active:
        raise HTTPException(404, 'Active reviewed goal not found')
    cycle = PracticeCycle(learner_id=learner_id, goal_id=goal.id, started_by=user.id,
        goal_snapshot={'title': goal.title, 'sound': goal.sound, 'word': goal.practice_word,
            'instruction': goal.instruction, 'language': goal.language, 'phase': goal.phase,
            'source': 'clinician_authored', 'clinician_id': str(goal.clinician_id)}, events=[])
    db.add(cycle)
    await db.flush()
    queue_workflow(db, learner_id, user.id, 'cycle', cycle.id, {'goal_id': str(goal.id), 'stage': 'understand',
        'source': 'participation_sequence_not_mastery', 'language': goal.language})
    await db.commit()
    return public_cycle(cycle)


async def cycle_access(db, user, identifier, lock=False):
    query = select(PracticeCycle).where(PracticeCycle.id == identifier)
    cycle = (await db.execute((query.with_for_update() if lock else query).execution_options(populate_existing=True))).scalar_one_or_none()
    if not cycle:
        raise HTTPException(404, 'Practice cycle not found')
    await accessible_learner(db, user, cycle.learner_id)
    return cycle


@router.get('/learners/{learner_id}/practice-cycles')
async def list_cycles(learner_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await accessible_learner(db, user, learner_id)
    cycles = (await db.execute(select(PracticeCycle).where(PracticeCycle.learner_id == learner_id)
        .order_by(PracticeCycle.created_at.desc()).limit(50))).scalars().all()
    return [public_cycle(cycle) for cycle in cycles]


@router.get('/practice-cycles/{cycle_id}')
async def get_cycle(cycle_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    cycle = await cycle_access(db, user, cycle_id)
    recording_ids = [uuid.UUID(event['recording_id']) for event in cycle.events if event.get('recording_id')]
    reviews = (await db.execute(select(RecordingReview).where(RecordingReview.recording_id.in_(recording_ids))
        .where(current_review_filter())
        .order_by(RecordingReview.created_at.desc()))).scalars().all() if recording_ids else []
    return {**public_cycle(cycle), 'reviews': [{'id': str(review.id), 'recording_id': str(review.recording_id),
        'sound': review.sound, 'outcome': review.outcome, 'context': review.context, 'notes': review.notes,
        'source': 'clinician_review'} for review in reviews]}


class AdvanceCycle(BaseModel):
    model_config = ConfigDict(extra='forbid')
    request_id: uuid.UUID
    expected_stage: int = Field(ge=0, le=5)
    recording_id: uuid.UUID | None = None
    acknowledges_guidance: bool = False
    support_used: Literal['not_recorded', 'none_reported', 'verbal', 'visual', 'modelled', 'mixed'] = 'not_recorded'
    reviewed_cue_used: bool = False
    listening_source: Literal['provider_audio', 'clinician_live'] | None = None


@router.post('/practice-cycles/{cycle_id}/advance')
async def advance(cycle_id: uuid.UUID, payload: AdvanceCycle,
                  user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    cycle = await cycle_access(db, user, cycle_id, lock=True)
    await lock_learner(db, user, cycle.learner_id)
    await require_practice_consent(db, cycle.learner_id)
    prior = next((event for event in cycle.events if event['request_id'] == str(payload.request_id)), None)
    fingerprint = payload.model_dump(mode='json')
    if prior:
        if prior.get('request') != fingerprint:
            raise HTTPException(409, 'Request identifier was used for another practice event')
        return public_cycle(cycle)
    goal = await db.get(CareGoal, cycle.goal_id, populate_existing=True)
    if not goal or not goal.active:
        raise HTTPException(409, 'This goal has been retired; ask your clinician for the current plan')
    if cycle.stage != payload.expected_stage:
        raise HTTPException(409, 'Practice stage changed; reload the saved cycle')
    if cycle.stage in [2, 4, 5]:
        record = await db.get(SpeechRecording, payload.recording_id) if payload.recording_id else None
        if not record or record.learner_id != cycle.learner_id or record.language != cycle.goal_snapshot['language']:
            raise HTTPException(422, 'Submit an actual recording in this goal language for this learner')
        if any(event.get('recording_id') == str(record.id) for event in cycle.events):
            raise HTTPException(409, 'Test, retest and transfer require separate recordings')
        entered = next((event['created_at'] for event in reversed(cycle.events) if event.get('stage')), cycle.created_at.isoformat())
        recorded_at = record.created_at.replace(tzinfo=timezone.utc) if record.created_at.tzinfo is None else record.created_at
        entered_at = datetime.fromisoformat(entered)
        if entered_at.tzinfo is None:
            entered_at = entered_at.replace(tzinfo=timezone.utc)
        if recorded_at < entered_at:
            raise HTTPException(422, 'Record a fresh attempt after entering this practice stage')
        if cycle.stage in [2, 4] and (record.task != 'word' or record.expected_text != cycle.goal_snapshot['word']):
            raise HTTPException(422, 'Test and retest must be recordings of this reviewed word task')
        if cycle.stage == 5 and record.task not in ['sentence', 'conversation', 'daily_moment', 'story']:
            raise HTTPException(422, 'Transfer requires a sentence or everyday communication task')
    else:
        if payload.recording_id is not None:
            raise HTTPException(422, 'Guidance steps do not accept a recording link')
        if not payload.acknowledges_guidance:
            raise HTTPException(422, 'Confirm that the reviewed guidance was presented')
    if cycle.stage == 1 and payload.listening_source is None:
        raise HTTPException(422, 'Identify whether the reference was heard through provider audio or a clinician')
    if cycle.stage == 1 and payload.listening_source == 'provider_audio' and not any(
        event.get('reference_delivered') for event in cycle.events):
        raise HTTPException(422, 'Request the actual reference audio before confirming provider playback')
    event = {'request_id': str(payload.request_id), 'request': fingerprint, 'stage': STAGES[cycle.stage],
        'recording_id': str(payload.recording_id) if payload.recording_id else None,
        'actor_id': str(user.id), 'source': 'participant_or_supporter_report',
        'support_used': payload.support_used, 'reviewed_cue_used': payload.reviewed_cue_used,
        'created_at': datetime.now(timezone.utc).isoformat()}
    cycle.events = [*cycle.events, event]
    cycle.stage += 1
    queue_workflow(db, cycle.learner_id, user.id, 'cycle', cycle.id, {'goal_id': str(cycle.goal_id),
        'stage': STAGES[cycle.stage], 'language': cycle.goal_snapshot['language'], 'source': 'participation_sequence_not_mastery'})
    if payload.recording_id:
        queue_workflow(db, cycle.learner_id, user.id, 'transfer' if payload.expected_stage == 5 else 'recording',
            payload.request_id if payload.expected_stage == 5 else payload.recording_id,
            {'goal_id': str(cycle.goal_id), 'recording_id': str(payload.recording_id), 'context': STAGES[payload.expected_stage],
                'support_used': payload.support_used, 'reviewed_cue_used': payload.reviewed_cue_used,
                'language': cycle.goal_snapshot['language'], 'source': 'recorded_attempt_requires_review'})
    if cycle.stage == 6:
        cycle.completed_at = datetime.now(timezone.utc)
    await db.commit()
    return public_cycle(cycle)


@router.post('/practice-cycles/{cycle_id}/reference')
async def reference(cycle_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    cycle = await cycle_access(db, user, cycle_id)
    if cycle.stage != 1:
        raise HTTPException(409, 'Reference audio is available in the listening stage')
    if not (await require_practice_consent(db, cycle.learner_id)).cloud_processing_allowed:
        raise HTTPException(403, 'Cloud permission is required for the synthesized reference')
    speech = await synthesize(cycle.goal_snapshot['word'], cycle.goal_snapshot['language'])
    cycle = await cycle_access(db, user, cycle_id, lock=True)
    await lock_learner(db, user, cycle.learner_id)
    if not (await require_practice_consent(db, cycle.learner_id)).cloud_processing_allowed:
        raise HTTPException(403, 'Cloud permission was withdrawn')
    if cycle.stage != 1:
        raise HTTPException(409, 'The listening stage changed while the audio was prepared')
    cycle.events = [*[event for event in cycle.events if not event.get('reference_delivered')], {'request_id': str(uuid.uuid4()), 'reference_delivered': True,
        'source': 'speech_provider', 'model': speech['model'], 'created_at': datetime.now(timezone.utc).isoformat()}]
    await db.commit()
    return speech
