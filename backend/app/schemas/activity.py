import uuid
from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.models.enums import EventType

CommentBody = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)
]


class ActorRead(BaseModel):
    id: uuid.UUID
    name: str


class ActivityEventRead(BaseModel):
    id: uuid.UUID
    work_item_id: uuid.UUID
    event_type: EventType
    actor: ActorRead
    old_value: dict[str, Any] | None
    new_value: dict[str, Any] | None
    created_at: datetime


class ActivityPage(BaseModel):
    events: list[ActivityEventRead]
    next_cursor: str | None


class CommentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: CommentBody


class CommentRead(BaseModel):
    id: uuid.UUID
    work_item_id: uuid.UUID
    author: ActorRead
    body: str
    created_at: datetime


class CommentPage(BaseModel):
    comments: list[CommentRead]
    next_cursor: str | None
