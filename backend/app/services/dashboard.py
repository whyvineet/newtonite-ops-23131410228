import uuid

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import Priority, Status
from app.models.membership import Membership
from app.models.user import User
from app.models.work_item import WorkItem
from app.schemas.dashboard import DashboardView
from app.services.permissions import Action, roles_for
from app.services.work_items import fetch_page, visible_team_ids


def _view_conditions(
    view: DashboardView, user_id: uuid.UUID
) -> list[ColumnElement[bool]]:
    # Every view is restricted to the caller's teams, exactly like the item list.
    conditions: list[ColumnElement[bool]] = [
        WorkItem.team_id.in_(visible_team_ids(user_id))
    ]
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
) -> tuple[int, list[WorkItem], str | None]:
    conditions = _view_conditions(view, user.id)
    total = await session.scalar(
        select(func.count()).select_from(WorkItem).where(*conditions)
    )
    items, next_cursor = await fetch_page(session, conditions, cursor, limit)
    return total or 0, items, next_cursor
