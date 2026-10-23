import uuid
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession
from auth.dependencies import get_current_user
from database import get_db
from models.user import User
from knowledge_graph.outbox import deliver_reviews
from learners.access import accessible_learner, is_clinician, require_practice_consent, lock_learner
from knowledge_graph.service import get_graph, GraphStore

router = APIRouter(tags=['knowledge-graph'])

class ObservationRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    attempt_id: uuid.UUID
    sound: str = Field(min_length=1, max_length=16)
    language: Literal['en', 'hi', 'ml']
    outcome: Literal['independent', 'supported', 'difficulty', 'uncertain']
    context: Literal['sound', 'syllable', 'word', 'sentence', 'conversation', 'listening']
    notes: str = Field(min_length=1, max_length=1500)

class CueRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    sound: str = Field(min_length=1, max_length=16)
    language: Literal['en', 'hi', 'ml']
    label: str = Field(min_length=1, max_length=100)
    instruction: str = Field(min_length=1, max_length=1500)


class RetireCueRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    reason: str = Field(min_length=1, max_length=800)

@router.get('/health')
async def health(user: User = Depends(get_current_user), graph: GraphStore = Depends(get_graph)):
    await graph.ready()
    return {'status': 'ready', 'backend': 'memgraph'}

@router.get('/learners/{learner_id}')
async def learner_graph(learner_id: uuid.UUID, user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db), graph: GraphStore = Depends(get_graph)):
    await accessible_learner(db, user, learner_id)
    return await graph.snapshot(str(learner_id))

async def authorize_review(db, user, learner_id):
    if not await is_clinician(db, user.id):
        raise HTTPException(403, 'A provisioned clinician must author observations and cues')
    await accessible_learner(db, user, learner_id)
    await require_practice_consent(db, learner_id)

@router.post('/learners/{learner_id}/observations', status_code=201)
async def add_observation(learner_id: uuid.UUID, payload: ObservationRequest,
                          user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
                          graph: GraphStore = Depends(get_graph)):
    await authorize_review(db, user, learner_id)
    return await graph.observe(str(learner_id), str(user.id), payload.model_dump(mode='json'))

@router.post('/learners/{learner_id}/cues', status_code=201)
async def add_cue(learner_id: uuid.UUID, payload: CueRequest,
                  user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
                  graph: GraphStore = Depends(get_graph)):
    await authorize_review(db, user, learner_id)
    return await graph.add_cue(str(learner_id), str(user.id), str(uuid.uuid4()), payload.model_dump())


@router.post('/learners/{learner_id}/sync')
async def sync_reviews(learner_id: uuid.UUID, user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db), graph: GraphStore = Depends(get_graph)):
    await accessible_learner(db, user, learner_id)
    await require_practice_consent(db, learner_id)
    delivered = await deliver_reviews(db, graph, learner_id)
    return {'delivered': delivered, 'backend': 'memgraph'}


@router.patch('/learners/{learner_id}/cues/{cue_id}/retire')
async def retire_cue(learner_id: uuid.UUID, cue_id: str, payload: RetireCueRequest,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
    graph: GraphStore = Depends(get_graph)):
    if not await is_clinician(db, user.id):
        raise HTTPException(403, 'Clinician access required')
    await lock_learner(db, user, learner_id)
    rows = await graph.query('MATCH (c:NNCue {id:$id, learner_id:$learner_id}) RETURN properties(c) AS properties',
        {'id': cue_id, 'learner_id': str(learner_id)})
    if not rows:
        raise HTTPException(404, 'Reviewed cue not found')
    if rows[0]['properties'].get('goal_id'):
        # A goal's approved instruction is also available through SQL. Retiring
        # that cue must retire the goal so the companion cannot still use it.
        from learners.care_router import archive_goal
        from models.care import CareGoal
        goal = await db.get(CareGoal, uuid.UUID(rows[0]['properties']['goal_id']))
        if not goal or goal.learner_id != learner_id:
            raise HTTPException(404, 'Reviewed goal not found for this learner')
        await archive_goal(goal.id, user, db)
    return await graph.retire_cue(str(learner_id), str(user.id), cue_id, payload.reason)
