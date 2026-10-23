"""Store observed transitions; predictions are never used as rewards."""
from datetime import timezone
from sqlalchemy import select
from fastapi import HTTPException
from models.fluency_score import FluencyScore
from models.rl_trajectory import RLTrajectory
from models.user import User
from scheduler.state import MODES, SCHEMA_VERSION, outcome_reward, next_difficulty, mode_streak

async def user_history(db,user_id):
    result=await db.execute(select(FluencyScore).where(
        FluencyScore.user_id==user_id,
        FluencyScore.features['source'].as_string()=='multimodal_v3'
    ).order_by(FluencyScore.recorded_at.desc()))
    scores=list(reversed(result.scalars().all()))
    if scores:
        # Never compare values from different model versions or legacy random scores.
        version=scores[-1].features['model_version']
        scores=[s for s in scores if s.features.get('model_version')==version]
    actions=[s.features['mode'] for s in scores if s.features.get('mode') in MODES]
    return scores,actions

async def validate_session(db,user_id,trajectory_id,mode,difficulty):
    if not trajectory_id: return
    result=await db.execute(select(RLTrajectory).where(RLTrajectory.id==trajectory_id,
                                                    RLTrajectory.user_id==user_id))
    traj=result.scalar_one_or_none()
    if traj is None: raise HTTPException(404,'Recommendation not found')
    if traj.next_state is not None: raise HTTPException(409,'This recommendation is already completed')
    if (traj.state.get('schema_version')!=SCHEMA_VERSION or not 0<=traj.action<len(MODES)
        or MODES[traj.action]!=mode or traj.state['difficulty']!=difficulty):
        raise HTTPException(422,'Session mode or difficulty differs from the recommendation')

async def complete_transition(db,user_id,trajectory_id,score):
    # Serialize updates for a user, making score reuse checks and one-shot completion atomic.
    await db.execute(select(User).where(User.id==user_id).with_for_update())
    result=await db.execute(select(RLTrajectory).where(RLTrajectory.id==trajectory_id,
                            RLTrajectory.user_id==user_id).with_for_update())
    traj=result.scalar_one_or_none()
    if traj is None: raise HTTPException(404,'Recommendation not found')
    if traj.next_state is not None:
        if traj.next_state.get('score_id')==str(score.id): return traj
        raise HTTPException(409,'This recommendation already has an outcome')
    if score.user_id!=user_id or (score.features or {}).get('source')!='multimodal_v3':
        raise HTTPException(422,'Outcome must be an owned recording scored by the trained model')
    if traj.state.get('schema_version')!=SCHEMA_VERSION:
        raise HTTPException(409,'Legacy recommendations cannot be used for training')
    if score.recorded_at.replace(tzinfo=timezone.utc)<traj.ts.replace(tzinfo=timezone.utc):
        raise HTTPException(422,'Outcome recording predates the recommendation')
    if (score.features.get('mode')!=MODES[traj.action]
        or score.features.get('difficulty')!=traj.state['difficulty']
        or score.features.get('trajectory_id')!=str(traj.id)
        or score.features.get('model_version')!=traj.state.get('model_version')):
        raise HTTPException(422,'Outcome mode, recommendation, or scorer version does not match')
    used=await db.execute(select(RLTrajectory.id).where(RLTrajectory.user_id==user_id,
             RLTrajectory.next_state['score_id'].as_string()==str(score.id)))
    if used.first(): raise HTTPException(409,'This score is already used by another transition')
    history=traj.state['fluency_history']+[score.composite_score]
    modes=traj.state['mode_history']+[MODES[traj.action]]
    traj.reward=outcome_reward(history[-2],history[-1],traj.action,
                              traj.state['mode_history'][-1] if traj.state['mode_history'] else None,
                              mode_streak(traj.state['mode_history']))
    traj.next_state={'schema_version':SCHEMA_VERSION,'fluency_history':history[-3:],
                     'mode_history':modes[-10:],'total_sessions':traj.state['total_sessions']+1,
                     'difficulty':next_difficulty(history,traj.state['difficulty']),
                     'score_id':str(score.id),'model_version':score.features['model_version']}
    traj.done=False
    return traj
