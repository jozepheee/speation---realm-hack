"""Untrusted client geometry summary. No images, landmarks or sound grades."""
import json
from pydantic import BaseModel,ConfigDict,Field,ValidationError
from typing import Literal
class VisualArticulation(BaseModel):
 model_config=ConfigDict(extra='forbid',allow_inf_nan=False)
 version:Literal[1]
 source:Literal['browser_visible_lip_geometry']
 duration_seconds:float=Field(ge=0,le=120)
 frames:int=Field(ge=0,le=2000)
 valid_frames:int=Field(ge=0,le=2000)
 tracking_fraction:float=Field(ge=0,le=1)
 opening_min:float|None=Field(default=None,ge=0,le=2)
 opening_max:float|None=Field(default=None,ge=0,le=2)
 closure_fraction:float|None=Field(default=None,ge=0,le=1)
 rounding_max:float|None=Field(default=None,ge=0,le=1)
 pronunciation_grade:Literal[False]=False

def checked_visual_summary(raw):
 if not raw:return None
 if len(raw)>2000:raise ValueError('Camera summary is too large')
 value=VisualArticulation.model_validate_json(raw)
 if value.valid_frames>value.frames:raise ValueError('Invalid camera frame counts')
 if abs(value.tracking_fraction-(value.valid_frames/value.frames if value.frames else 0))>.02:raise ValueError('Invalid camera tracking fraction')
 return {**value.model_dump(),'trust':'client_reported_not_independently_verified','scope':'visible_movement_support_only'}


def movement_support(summary,phone):
 """Select a visible teaching cue; never change the acoustic result."""
 if not summary:return {'state':'unavailable','pronunciation_grade':False}
 if summary['tracking_fraction']<.7 or summary['valid_frames']<5:
  return {'state':'tracking_unavailable','cue':'Face the camera in good light to use the mouth mirror.','pronunciation_grade':False}
 if phone in ['p','b','m']:
  return {'state':'visible_support','kind':'lip_closure','cue':'Watch your lips meet in the mirror. Copy the example gently.','observed_closure_fraction':summary.get('closure_fraction'),'pronunciation_grade':False}
 if phone in ['w','u','uː']:
  return {'state':'visible_support','kind':'lip_rounding','cue':'Make a small round shape with your lips. Watch and copy.','observed_rounding_max':summary.get('rounding_max'),'pronunciation_grade':False}
 return {'state':'audio_required','cue':'Watch the mouth picture and listen. The camera cannot check the hidden tongue movement.','pronunciation_grade':False}
