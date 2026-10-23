"""Shared rehearsal preferences and comparable, evidence-linked retry outcomes."""
from typing import Literal
import hashlib
import json
from pydantic import BaseModel, ConfigDict, Field


class Support(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    focus: Literal['clear_explanation', 'comfortable_pacing', 'target_word', 'responding'] = 'clear_explanation'
    target_word: str = Field(default='', max_length=100)
    pause_seconds: Literal[4, 6, 8] = 6
    manual_finish: bool = True
    repeat_questions: bool = False
    outline_prompts: bool = False
    discussion_mode: Literal['supportive', 'challenge'] = 'supportive'


def baseline_key(session):
    content = session.content if hasattr(session, 'content') else session['content']
    scenario = session.scenario if hasattr(session, 'scenario') else session['scenario']
    language = session.language if hasattr(session, 'language') else session['language']
    sections=(content.get('meeting',{}).get('material') or {}).get('sections',[])
    return {'scenario': scenario, 'language': language, 'goal': content.get('goal', '').strip().casefold(),
            'material_id': content.get('start_request', {}).get('material_id'),
            'material_revision':hashlib.sha256(json.dumps(sections,sort_keys=True).encode()).hexdigest(),
            'assigned_goals':content.get('assigned_goals',[]),
            'support': content.get('support', Support().model_dump())}


def retry_comparisons(content):
    turns = content.get('turns', [])
    by_id = {t['recording_id']: t for t in turns}
    result = []
    for retry in turns:
        original = by_id.get(retry.get('retry_of'))
        if not original:
            continue
        result.append({'original_recording_id': original['recording_id'], 'retry_recording_id': retry['recording_id'],
                       'position': original['position'], 'same_prompt': True,
                       'support_used': retry.get('support_used', ''),
                       'before': original.get('metrics'), 'after': retry.get('metrics'),
                       'before_feedback': original.get('feedback'), 'after_feedback': retry.get('feedback'),
                       'sound_check': retry.get('sound_check'),
                       'interpretation': 'Same prompt, supported retry. Metric changes alone do not establish improved pronunciation or communication.'})
    return result
