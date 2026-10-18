import uuid

from pydantic import BaseModel

from app.models.enums import Role


class TeamRead(BaseModel):
    id: uuid.UUID
    name: str
    role: Role  # the caller's role in this team


class TeamMemberRead(BaseModel):
    user_id: uuid.UUID
    name: str
    role: Role
    is_active: bool
