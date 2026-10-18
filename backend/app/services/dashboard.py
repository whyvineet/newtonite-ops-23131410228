import uuid

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.enums import Priority, Status
from app.models.membership import Membership
from app.models.user import User
from app.models.work_item import WorkItem
from app.schemas.dashboard import DashboardSummary, DashboardView
from app.services.permissions import Action, get_team_role, roles_for
from app.services.work_items import fetch_page, visible_team_ids


def _view_conditions(
    view: DashboardView, user_id: uuid.UUID, team_id: uuid.UUID | None = None
) -> list[ColumnElement[bool]]:
    # Every view is restricted to the caller's teams, or a specific team if provided.
    if team_id is not None:
        conditions: list[ColumnElement[bool]] = [WorkItem.team_id == team_id]
    else:
        conditions = [WorkItem.team_id.in_(visible_team_ids(user_id))]

    if view is DashboardView.ASSIGNED_TO_ME:
        conditions += [
            WorkItem.assignee_id == user_id,
            WorkItem.status != Status.CLOSED.value,
        ]
    elif view is DashboardView.UNASSIGNED_URGENT:
        conditions += [
            WorkItem.assignee_id.is_(None),
            WorkItem.priority == Priority.URGENT.value,
            WorkItem.status != Status.CLOSED.value,
        ]
    else:  # AWAITING_MY_APPROVAL: teams where my role may approve (derived from the policy)
        approver_teams = select(Membership.team_id).where(
            Membership.user_id == user_id,
            Membership.role.in_([role.value for role in roles_for(Action.APPROVE)]),
        )
        if team_id is not None:
            approver_teams = approver_teams.where(Membership.team_id == team_id)
        conditions += [
            WorkItem.status == Status.AWAITING_APPROVAL.value,
            WorkItem.team_id.in_(approver_teams),
        ]
    return conditions


async def get_dashboard(
    session: AsyncSession,
    user: User,
    view: DashboardView,
    cursor: str | None,
    limit: int,
    team_id: uuid.UUID | None = None,
) -> tuple[int, list[WorkItem], str | None]:
    if team_id is not None:
        if await get_team_role(session, user.id, team_id) is None:
            raise NotFoundError("Team not found", code="team_not_found")
    conditions = _view_conditions(view, user.id, team_id=team_id)
    total = await session.scalar(
        select(func.count()).select_from(WorkItem).where(*conditions)
    )
    items, next_cursor = await fetch_page(session, conditions, cursor, limit)
    return total or 0, items, next_cursor


async def get_dashboard_summary(
    session: AsyncSession,
    user: User,
    team_id: uuid.UUID | None = None,
) -> DashboardSummary:
    if team_id is not None:
        if await get_team_role(session, user.id, team_id) is None:
            raise NotFoundError("Team not found", code="team_not_found")
        team_scope: ColumnElement[bool] = WorkItem.team_id == team_id
        approver_teams = select(Membership.team_id).where(
            Membership.user_id == user.id,
            Membership.team_id == team_id,
            Membership.role.in_([role.value for role in roles_for(Action.APPROVE)]),
        )
    else:
        team_scope = WorkItem.team_id.in_(visible_team_ids(user.id))
        approver_teams = select(Membership.team_id).where(
            Membership.user_id == user.id,
            Membership.role.in_([role.value for role in roles_for(Action.APPROVE)]),
        )

    stmt = (
        select(
            func.count().label("total"),
            func.count().filter(WorkItem.status == Status.OPEN.value).label("open"),
            func.count().filter(WorkItem.status == Status.IN_PROGRESS.value).label("in_progress"),
            func.count().filter(
                WorkItem.priority == Priority.URGENT.value,
                WorkItem.status.notin_([Status.RESOLVED.value, Status.CLOSED.value]),
            ).label("urgent"),
            func.count().filter(
                WorkItem.status == Status.AWAITING_APPROVAL.value,
                WorkItem.team_id.in_(approver_teams),
            ).label("awaiting_approval"),
            func.count().filter(
                WorkItem.assignee_id == user.id,
                WorkItem.status != Status.CLOSED.value,
            ).label("assigned_to_me"),
            func.count().filter(
                WorkItem.assignee_id.is_(None),
                WorkItem.priority == Priority.URGENT.value,
                WorkItem.status != Status.CLOSED.value,
            ).label("unassigned_urgent"),
        )
        .select_from(WorkItem)
        .where(team_scope)
    )
    row = (await session.execute(stmt)).one()
    return DashboardSummary(
        total=row.total or 0,
        open=row.open or 0,
        in_progress=row.in_progress or 0,
        urgent=row.urgent or 0,
        awaiting_approval=row.awaiting_approval or 0,
        assigned_to_me=row.assigned_to_me or 0,
        unassigned_urgent=row.unassigned_urgent or 0,
    )

