"""Centralised, team-scoped authorization policy.

The matrix below is the single source of truth. Endpoints and services never compare roles
directly; they call ``require`` / ``roles_for`` so the policy can change in one place.
"""

import uuid
from enum import StrEnum

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, PermissionDeniedError
from app.models.enums import Role
from app.models.membership import Membership
from app.models.work_item import WorkItem


class Action(StrEnum):
    VIEW = "view"
    CREATE = "create"
    EDIT_BASIC = "edit_basic"
    CHANGE_PRIORITY = "change_priority"
    CLAIM = "claim"
    ASSIGN = "assign"
    START_WORK = "start_work"
    SUBMIT_FOR_APPROVAL = "submit_for_approval"
    APPROVE = "approve"
    CLOSE = "close"
    COMMENT = "comment"
    MANAGE_MEMBERSHIPS = "manage_memberships"


_ALL = frozenset(Role)
_MEMBER_UP = frozenset({Role.MEMBER, Role.LEAD, Role.ADMIN})
_LEAD_ADMIN = frozenset({Role.LEAD, Role.ADMIN})

# Roles allowed to perform an action unconditionally.
_UNCONDITIONAL: dict[Action, frozenset[Role]] = {
    Action.VIEW: _ALL,
    Action.CREATE: _MEMBER_UP,
    Action.EDIT_BASIC: _LEAD_ADMIN,
    Action.CHANGE_PRIORITY: _LEAD_ADMIN,
    Action.CLAIM: _MEMBER_UP,
    Action.ASSIGN: _LEAD_ADMIN,
    Action.START_WORK: _LEAD_ADMIN,
    Action.SUBMIT_FOR_APPROVAL: _LEAD_ADMIN,
    # Lead-only: Admin deliberately does NOT inherit approval.
    Action.APPROVE: frozenset({Role.LEAD}),
    Action.CLOSE: _LEAD_ADMIN,
    Action.COMMENT: _MEMBER_UP,
    Action.MANAGE_MEMBERSHIPS: frozenset({Role.ADMIN}),
}

# Roles that may act only when an item-specific condition holds.
_ASSIGNEE_ONLY = frozenset({Action.START_WORK, Action.SUBMIT_FOR_APPROVAL})
_CREATOR_OR_ASSIGNEE = frozenset({Action.EDIT_BASIC})
_CONDITIONAL_ROLE = Role.MEMBER


def roles_for(action: Action) -> frozenset[Role]:
    """Roles that can perform ``action`` with no extra condition (used by dashboard queries)."""
    return _UNCONDITIONAL[action]


def is_allowed(
    action: Action, role: Role, *, user_id: uuid.UUID, item: WorkItem | None = None
) -> bool:
    if role in _UNCONDITIONAL[action]:
        return True
    if role != _CONDITIONAL_ROLE or item is None:
        return False
    if action in _ASSIGNEE_ONLY:
        return item.assignee_id == user_id
    if action in _CREATOR_OR_ASSIGNEE:
        return user_id in (item.created_by_id, item.assignee_id)
    return False


def require(
    action: Action, role: Role, *, user_id: uuid.UUID, item: WorkItem | None = None
) -> None:
    if not is_allowed(action, role, user_id=user_id, item=item):
        raise PermissionDeniedError(
            f"Your role does not allow this action ({action.value})", code="forbidden"
        )


async def get_team_role(
    session: AsyncSession, user_id: uuid.UUID, team_id: uuid.UUID
) -> Role | None:
    role = await session.scalar(
        select(Membership.role).where(
            Membership.user_id == user_id, Membership.team_id == team_id
        )
    )
    return Role(role) if role is not None else None


async def get_item_with_role(
    session: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID
) -> tuple[WorkItem, Role]:
    """Fetch an item only if the user belongs to its team (one query, membership in the JOIN).

    Items of other teams are indistinguishable from missing ones: both give 404, so UUIDs of
    other teams' items cannot be probed. Role problems inside the team give 403 (see ``require``).
    """
    stmt = (
        select(WorkItem, Membership.role)
        .join(
            Membership,
            and_(Membership.team_id == WorkItem.team_id, Membership.user_id == user_id),
        )
        .where(WorkItem.id == item_id)
    )
    row = (await session.execute(stmt)).first()
    if row is None:
        raise NotFoundError("Work item not found", code="item_not_found")
    return row[0], Role(row[1])
