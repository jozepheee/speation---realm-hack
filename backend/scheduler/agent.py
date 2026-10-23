import hashlib
import json
from functools import lru_cache
import numpy as np
import torch
from ml_settings import DQN_CHECKPOINT, ModelUnavailableError
from scheduler.state import MODES, MODE_NAMES, STATE_DIM, SCHEMA_VERSION, encode_state, next_difficulty

@lru_cache(maxsize=1)
def get_dqn_model():
    try:
        from stable_baselines3 import DQN
        meta=json.loads(DQN_CHECKPOINT.with_name('metadata.json').read_text())
        if (meta['schema_version']!=SCHEMA_VERSION or meta['modes']!=MODES
                or meta['state_dim']!=STATE_DIM or meta['steps']<1
                or hashlib.sha256(DQN_CHECKPOINT.read_bytes()).hexdigest()!=meta['sha256']):
            raise ValueError('Checkpoint contract or checksum mismatch')
        model=DQN.load(DQN_CHECKPOINT,device='cpu')
        if model.observation_space.shape!=(STATE_DIM,) or model.action_space.n!=len(MODES):
            raise ValueError('Incompatible policy dimensions')
        return model,meta
    except Exception as exc:
        raise ModelUnavailableError('Scheduler model unavailable. Train and evaluate the SB3 DQN first.') from exc

def evaluate_dqn_policy(fluency_history, mode_history, difficulty=1, total_sessions=None):
    model,meta=get_dqn_model()
    if not fluency_history:
        raise ValueError('Complete one scored recording before requesting a personalized session.')
    level=next_difficulty(fluency_history,difficulty)
    state=encode_state(fluency_history,mode_history,level,total_sessions)
    with torch.inference_mode():
        q=model.q_net(torch.from_numpy(state).unsqueeze(0)).cpu().numpy()[0]
    if not np.isfinite(q).all():
        raise ModelUnavailableError('Invalid scheduler output')
    action=int(np.argmax(q))
    mode=MODES[action]
    return {'action':action,'mode':mode,'actionName':MODE_NAMES[action],
            'title':f'{MODE_NAMES[action]} practice','difficulty':level,
            'route':f"{'/session' if mode=='reading' else '/practice'}?mode={mode}&difficulty={level}",
            'trainingSource':meta['training_source'],
            'qValues':[{'action':MODE_NAMES[i],'q':round(float(v),5),'best':i==action} for i,v in enumerate(q)]}
