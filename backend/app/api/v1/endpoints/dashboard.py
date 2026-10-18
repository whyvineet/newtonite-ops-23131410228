import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.schemas.dashboard import DashboardResponse, DashboardSummary, DashboardView
from app.schemas.work_item import WorkItemRead
from app.services import dashboard as dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def dashboard_summary(
    user: CurrentUser,
    session: DbSession,
    team_id: uuid.UUID | None = None,
) -> DashboardSummary:
    return await dashboard_service.get_dashboard_summary(session, user, team_id=team_id)


@router.get("", response_model=DashboardResponse)
async def dashboard(
    user: CurrentUser,
    session: DbSession,
    view: DashboardView,
    team_id: uuid.UUID | None = None,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> DashboardResponse:
    total, items, next_cursor = await dashboard_service.get_dashboard(
        session, user, view, cursor, limit, team_id=team_id
    )
    return DashboardResponse(
        view=view,
        total=total,
        items=[WorkItemRead.model_validate(i) for i in items],
        next_cursor=next_cursor,
        limit=limit,
    )

