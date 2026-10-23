from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator
from typing import Optional, Literal
from datetime import datetime

class ClinicianDetails(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    professional_title: str = Field(min_length=2, max_length=120)
    registration_number: str = Field(min_length=2, max_length=120)
    jurisdiction: str = Field(min_length=2, max_length=120)
    organization: str = Field(default='', max_length=160)


class UserRegister(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    personality: Optional[str] = "auditory"
    account_type: Literal['family', 'clinician'] = 'family'
    clinician_application: ClinicianDetails | None = None

    @model_validator(mode='after')
    def require_professional_details(self):
        if self.account_type == 'clinician' and self.clinician_application is None:
            raise ValueError('Clinician registration requires professional details')
        return self

class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

import uuid

class UserOut(BaseModel):
    id: str | uuid.UUID
    email: str
    name: Optional[str] = None
    personality: Optional[str] = "auditory"
    streak: int = 0
    fluency_level: float = 0.0

    class Config:
        from_attributes = True

class AuthenticatedUserOut(UserOut):
    workspace_role: Literal['clinician','guardian_or_participant']

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
