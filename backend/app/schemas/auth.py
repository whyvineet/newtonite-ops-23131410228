import uuid
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, StringConstraints

from app.models.enums import Role


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254)
    ]
    password: Annotated[str, StringConstraints(min_length=1, max_length=256)]


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
    ]
    email: EmailStr
    password: Annotated[str, StringConstraints(min_length=8, max_length=128)]
    team_name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
    ] = "Platform Ops"


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class MembershipRead(BaseModel):
    team_id: uuid.UUID
    team_name: str
    role: Role


class MeResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    memberships: list[MembershipRead]
