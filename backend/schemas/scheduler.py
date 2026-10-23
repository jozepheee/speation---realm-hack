from typing import Literal, Annotated
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict
Mode = Literal['companion','qa','reading','roleplay','stress_test']
class SchedulerStateInput(BaseModel):
    model_config = ConfigDict(extra='forbid',allow_inf_nan=False)
    fluency_history: list[Annotated[float, Field(ge=0, le=100)]] = Field(default_factory=list,max_length=30)
    mode_history: list[Mode] = Field(default_factory=list,max_length=30)
    difficulty: int = Field(default=1,ge=1,le=3)
    total_sessions: int | None = Field(default=None,ge=0)
class SchedulerStartInput(BaseModel):
    difficulty: int = Field(default=1,ge=1,le=3)
class SchedulerOutcomeInput(BaseModel):
    trajectory_id: UUID
    score_id: UUID
class QValueItem(BaseModel):
    action: str
    q: float
    best: bool
class SchedulerRecommendationResponse(BaseModel):
    action: int
    mode: Mode
    actionName: str
    title: str
    difficulty: int
    route: str
    trainingSource: str
    qValues: list[QValueItem]
    trajectory_id: str | None = None
