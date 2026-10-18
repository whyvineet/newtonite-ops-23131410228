from enum import StrEnum

from pydantic import BaseModel

from app.schemas.work_item import WorkItemRead


class DashboardView(StrEnum):
    ASSIGNED_TO_ME = "assigned_to_me"
    UNASSIGNED_URGENT = "unassigned_urgent"
    AWAITING_MY_APPROVAL = "awaiting_my_approval"


class DashboardResponse(BaseModel):
    view: DashboardView
    total: int
    items: list[WorkItemRead]
    next_cursor: str | None
    limit: int


class DashboardSummary(BaseModel):
    open: int
    in_progress: int
    urgent: int
    awaiting_approval: int
    assigned_to_me: int
    unassigned_urgent: int
    total: int

