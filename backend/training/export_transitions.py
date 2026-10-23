"""Export only completed, observed v2 transitions for offline analysis.

This is not online learning. Retraining a deployed policy requires an evaluated release.
User identifiers and transcripts are deliberately excluded.
"""
import argparse
import asyncio
import json
from pathlib import Path
from sqlalchemy import select
from database import AsyncSessionLocal
from models.rl_trajectory import RLTrajectory
from scheduler.state import encode_state, SCHEMA_VERSION, outcome_reward, mode_streak

async def export(path):
    rows=[]
    async with AsyncSessionLocal() as db:
        result=await db.execute(select(RLTrajectory).where(RLTrajectory.next_state.is_not(None),RLTrajectory.reward.is_not(None)))
        for t in result.scalars():
            s,n=t.state,t.next_state
            if s.get('schema_version')!=SCHEMA_VERSION or n.get('schema_version')!=SCHEMA_VERSION: continue
            if not 0<=t.action<5: continue
            if s.get('model_version')!=n.get('model_version'): continue
            reward=outcome_reward(s['fluency_history'][-1],n['fluency_history'][-1],t.action,
                                 s['mode_history'][-1] if s['mode_history'] else None,mode_streak(s['mode_history']))
            if abs(reward-t.reward)>1e-6: raise ValueError('Stored reward does not match observed scores')
            rows.append({'state':encode_state(s['fluency_history'],s['mode_history'],s['difficulty'],s['total_sessions']).tolist(),
                         'action':t.action,'reward':reward,
                         'next_state':encode_state(n['fluency_history'],n['mode_history'],n['difficulty'],n['total_sessions']).tolist(),
                         'done':t.done,'schema_version':SCHEMA_VERSION,
                         'scorer_version':s['model_version'],'source':'observed_audio_outcome'})
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(''.join(json.dumps(r)+'\n' for r in rows))
    print(f'Exported {len(rows)} observed transitions')
if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('--out',type=Path,required=True)
    asyncio.run(export(p.parse_args().out))
