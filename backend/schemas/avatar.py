from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Literal


class HistoryMessage(BaseModel):
    role: str       # 'user' | 'assistant'
    content: str


class AvatarChatRequest(BaseModel):
    message: str
    gender: Optional[str] = "female"
    detected_emotion: Optional[Literal['calm', 'happy', 'anxious', 'fatigued', 'tense', 'unknown']] = None
    emotion_source: Optional[Literal['self_report']] = None
    visible_expression: Optional[Literal['neutral', 'smile', 'brow_furrow', 'eyes_closed', 'mouth_open', 'unknown']] = None
    facial_tension: Optional[str] = None
    history: Optional[List[HistoryMessage]] = None


class AvatarIntentSchema(BaseModel):
    action: str = "none"       # "none" | "suggest_exercise" | "celebrate_milestone"
    exercise_type: str = ""    # "breath_control" | "pronunciation" | "phone_call_scenario" | etc.
    cta_label: str = ""        # e.g. "Try Phone Call Practice"
    duration_secs: int = 0


class AvatarChatResponse(BaseModel):
    reply: str
    audio_base64: Optional[str] = None
    alignment: Optional[Dict[str, Any]] = None
    visemes: Optional[List[float]] = None
    fluency_score: Optional[float] = None
    score_id: Optional[str] = None
    vocal_fatigue: Optional[int] = 3
    streak: Optional[int] = 0
    composite_fluency: Optional[float] = 0.0
    notes: Optional[str] = None
    intent: Optional[AvatarIntentSchema] = None
    bio_acoustics: Optional[Dict[str, Any]] = None
    original_transcript: Optional[str] = None
    normalized_transcript: Optional[str] = None
    detected_emotion: Optional[str] = None
    facial_tension: Optional[str] = None


class AvatarGreetResponse(BaseModel):
    reply: str
    audio_base64: Optional[str] = None
    alignment: Optional[Dict[str, Any]] = None
    fluency_score: Optional[float] = None
    streak: Optional[int] = None
    composite_fluency: Optional[float] = None
    notes: Optional[str] = None
    intent: Optional[AvatarIntentSchema] = None


class SessionTurn(BaseModel):
    sender: str   # 'user' | 'buddy'
    text: str
    time: Optional[str] = None


class SessionEndRequest(BaseModel):
    transcript: List[SessionTurn]
    scenario: Optional[str] = None
    gender: Optional[str] = "female"
    duration_secs: Optional[int] = 0


class SessionEndResponse(BaseModel):
    fluency_score: Optional[float] = None
    streak: int
    feedback: str            # human-friendly, no jargon
    improvement_tip: str     # single warm suggestion
    turns_completed: int
