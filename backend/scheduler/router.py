from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool
from database import get_db
from models.rl_trajectory import RLTrajectory
from models.fluency_score import FluencyScore
from models.user import User
from schemas.scheduler import (SchedulerStateInput,SchedulerRecommendationResponse,
                               SchedulerStartInput,SchedulerOutcomeInput)
from scheduler.agent import evaluate_dqn_policy
from scheduler.service import user_history,complete_transition
from scheduler.state import SCHEMA_VERSION
from auth.dependencies import get_current_user
from ml_settings import ModelUnavailableError
router=APIRouter(tags=['scheduler'])

async def recommend(scores,actions,difficulty,total_sessions=None):
    try:
        return await run_in_threadpool(evaluate_dqn_policy,scores,actions,difficulty,total_sessions)
    except ModelUnavailableError as exc: raise HTTPException(503,str(exc))
    except ValueError as exc: raise HTTPException(422,str(exc))

@router.post('/recommend',response_model=SchedulerRecommendationResponse)
async def get_recommendation(payload:SchedulerStateInput,current_user:User=Depends(get_current_user)):
    # Preview only: changing controls must not create fake training transitions.
    return await recommend(payload.fluency_history,payload.mode_history,payload.difficulty,payload.total_sessions)

@router.post('/start',response_model=SchedulerRecommendationResponse)
async def start_session(payload:SchedulerStartInput,current_user:User=Depends(get_current_user),
                        db:AsyncSession=Depends(get_db)):
    scores,actions=await user_history(db,current_user.id)
    history=[s.composite_score for s in scores]
    rec=await recommend(history,actions,payload.difficulty,len(scores))
    traj=RLTrajectory(user_id=current_user.id,action=rec['action'],reward=None,
        state={'schema_version':SCHEMA_VERSION,'fluency_history':history[-3:],'mode_history':actions[-10:],
               'total_sessions':len(scores),
               'difficulty':rec['difficulty'],'model_version':scores[-1].features['model_version'],
               'policy_source':rec['trainingSource']})
    db.add(traj); await db.flush()
    rec['trajectory_id']=str(traj.id)
    rec['route']+=f'&trajectory_id={traj.id}'
    await db.commit()
    return rec

@router.post('/outcome')
async def record_outcome(payload:SchedulerOutcomeInput,current_user:User=Depends(get_current_user),
                         db:AsyncSession=Depends(get_db)):
    result=await db.execute(select(FluencyScore).where(FluencyScore.id==payload.score_id,
                             FluencyScore.user_id==current_user.id))
    score=result.scalar_one_or_none()
    if score is None: raise HTTPException(404,'Score not found')
    traj=await complete_transition(db,current_user.id,payload.trajectory_id,score)
    await db.commit()
    return {'trajectory_id':str(traj.id),'reward':traj.reward,'source':'observed_outcome_five_part_reward'}
