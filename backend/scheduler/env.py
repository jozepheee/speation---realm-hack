"""Specified synthetic response curves; no clinical efficacy claim."""
import gymnasium as gym
from gymnasium import spaces
import numpy as np
from scheduler.state import MODES, encode_state, mode_streak, outcome_reward


class SpeechFluencyEnv(gym.Env):
    metadata = {'render_modes': []}
    def __init__(self, horizon=20):
        super().__init__()
        self.observation_space = spaces.Box(np.array([0, 0, 0, -1, 0, 0], dtype=np.float32),
                                            np.array([1, 4, 10, 1, 1, 1], dtype=np.float32))
        self.action_space = spaces.Discrete(5)
        self.horizon = horizon

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self.scores = [float(self.np_random.uniform(.1, .9) * 100)]
        self.actions, self.difficulty, self.steps = [], int(self.np_random.integers(1, 4)), 0
        return encode_state(self.scores, self.actions, self.difficulty, 0), {'source': 'simulator_v3'}

    def step(self, action):
        if not self.action_space.contains(action): raise ValueError('Invalid dialogue mode')
        f = self.scores[-1] / 100
        # The description leaves some ranges unspecified; neutral fallback is explicit.
        bounds = (-.01, .03)
        if action == 0: bounds = (.01, .04)
        elif action == 1 and .4 <= f <= .7: bounds = (.03, .07)
        elif action == 1 and f < .4: bounds = (-.03, .02)
        elif action == 2 and f < .4: bounds = (.05, .10)
        elif action == 3 and .5 <= f <= .8: bounds = (.03, .08)
        elif action == 3 and f < .5: bounds = (-.05, .01)
        elif action == 4 and f > .7: bounds = (.02, .06)
        elif action == 4 and f < .5: bounds = (-.10, -.02)
        gain = self.np_random.uniform(*bounds) * {1: 1.1, 2: 1., 3: .9}[self.difficulty]
        after = float(np.clip(f + gain + self.np_random.normal(0, .03), 0, 1) * 100)
        reward = outcome_reward(self.scores[-1], after, int(action),
                                self.actions[-1] if self.actions else None, mode_streak(self.actions))
        self.scores.append(after); self.actions.append(MODES[action]); self.steps += 1
        # Initial baseline is not a completed session.
        obs = encode_state(self.scores[-3:], self.actions, self.difficulty, self.steps)
        return obs, reward, False, self.steps >= self.horizon, {'source': 'simulator_v3', 'fluency': after}
