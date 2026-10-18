import uuid
from datetime import datetime
from typing import Annotated

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from app.models.enums import ItemType, Priority, Status

Title = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]
Description = Annotated[str, StringConstraints(max_length=10_000)]


class WorkItemCreate(BaseModel):
    # extra="forbid": a client cannot smuggle in status, version, creator, etc.
    model_config = ConfigDict(extra="forbid")

    team_id: uuid.UUID
    title: Title
    description: Description = ""
    type: ItemType
    priority: Priority = Priority.NORMAL
    assignee_id: uuid.UUID | None = None
    due_at: AwareDatetime | None = None


class WorkItemUpdate(BaseModel):
    """Basic-field edit. Status and assignee are intentionally absent: they only change through
    the transition / claim / assign endpoints, which enforce their own rules."""

    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=1)
    title: Title | None = None
    description: Description | None = None
    type: ItemType | None = None
    priority: Priority | None = None
    due_at: AwareDatetime | None = None  # explicit null clears the due date

    @model_validator(mode="after")
    def _at_least_one_field(self) -> "WorkItemUpdate":
        editable = self.model_fields_set - {"expected_version"}
        if not editable:
            raise ValueError("At least one field to update is required")
        for name in ("title", "description", "type", "priority"):
            if name in editable and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class AssignRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assignee_id: uuid.UUID
    expected_version: int | None = Field(default=None, ge=1)


class TransitionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    to_status: Status
    expected_version: int = Field(ge=1)


class WorkItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    team_id: uuid.UUID
    title: str
    description: str
    type: ItemType
    priority: Priority
    status: Status
    assignee_id: uuid.UUID | None
    created_by_id: uuid.UUID
    due_at: datetime | None
    version: int
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    closed_at: datetime | None


class WorkItemPage(BaseModel):
    items: list[WorkItemRead]
    next_cursor: str | None
    limit: int
