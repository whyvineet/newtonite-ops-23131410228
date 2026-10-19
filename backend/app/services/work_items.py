"""Work-item business logic.

Every mutation follows the same shape, inside ``async with transaction(session)``:
  1. load the item together with the caller's role in its team (404 if not in the team)
  2. authorize (403) and validate business rules (409/422)
  3. compare-and-swap UPDATE guarded by ``version`` (or by a state predicate for claim)
  4. stage activity events on the same session
  5. commit (or roll back everything)
"""

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import ColumnElement, Select, func, or_, select, tuple_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, UnprocessableError
from app.db.session import transaction
from app.models.comment import Comment
from app.models.enums import EventType, Priority, Role, Status
from app.models.membership import Membership
from app.models.user import User
from app.models.work_item import WorkItem
from app.schemas.work_item import WorkItemCreate, WorkItemRead, WorkItemUpdate
from app.services import idempotency, workflow
from app.services.activity import record_event
from app.services.pagination import decode_cursor, encode_cursor
from app.services.permissions import (
    Action,
    get_item_with_role,
    get_team_role,
    require,
)

CREATE_ENDPOINT = "POST /api/v1/items"
_BASIC_FIELDS = frozenset({"title", "description", "type", "due_at"})
_ASSIGNABLE_ROLES = (Role.MEMBER, Role.LEAD, Role.ADMIN)


def _json_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    return getattr(value, "value", value)


def _snapshot(source: Any, fields: list[str] | tuple[str, ...]) -> dict[str, Any]:
    getter = (
        source.get if isinstance(source, dict) else lambda name: getattr(source, name)
    )
    return {name: _json_value(getter(name)) for name in fields}


async def _compare_and_swap(
    session: AsyncSession, item: WorkItem, expected_version: int, values: dict[str, Any]
) -> WorkItem:
    """UPDATE ... WHERE id = :id AND version = :expected RETURNING *.

    If anyone changed the row since it was read, version no longer matches, zero rows are updated
    and the caller gets 409 - a stale write can never overwrite a newer one.
    """
    stmt = (
        update(WorkItem)
        .where(WorkItem.id == item.id, WorkItem.version == expected_version)
        .values(**values, version=WorkItem.version + 1, updated_at=func.now())
        .returning(WorkItem)
        .execution_options(populate_existing=True)
    )
    updated = (await session.execute(stmt)).scalar_one_or_none()
    if updated is None:
        raise ConflictError(
            "The work item was modified by someone else; reload and retry",
            code="version_conflict",
        )
    return updated


def _check_version(item: WorkItem, expected_version: int | None) -> None:
    if expected_version is not None and item.version != expected_version:
        raise ConflictError(
            "The work item was modified by someone else; reload and retry",
            code="version_conflict",
        )


async def _require_assignable(
    session: AsyncSession, team_id: uuid.UUID, assignee_id: uuid.UUID
) -> None:
    """The assignee must be an active member (not a viewer) of the item's team."""
    row = await session.execute(
        select(Membership.role, User.is_active)
        .join(User, User.id == Membership.user_id)
        .where(Membership.team_id == team_id, Membership.user_id == assignee_id)
    )
    found = row.first()
    if (
        found is None
        or not found.is_active
        or Role(found.role) not in _ASSIGNABLE_ROLES
    ):
        raise UnprocessableError(
            "Assignee must be an active member of the item's team",
            code="invalid_assignee",
        )


def visible_team_ids(user_id: uuid.UUID) -> Select[tuple[uuid.UUID]]:
    return select(Membership.team_id).where(Membership.user_id == user_id)


@dataclass
class ItemFilters:
    team_id: uuid.UUID | None = None
    status: Status | None = None
    priority: Priority | None = None
    assignee_id: uuid.UUID | None = None
    type: str | None = None
    q: str | None = None


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _filter_conditions(filters: ItemFilters) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = []
    if filters.team_id:
        conditions.append(WorkItem.team_id == filters.team_id)
    if filters.status:
        conditions.append(WorkItem.status == filters.status.value)
    if filters.priority:
        conditions.append(WorkItem.priority == filters.priority.value)
    if filters.assignee_id:
        conditions.append(WorkItem.assignee_id == filters.assignee_id)
    if filters.type:
        conditions.append(WorkItem.type == filters.type)
    if filters.q:
        pattern = f"%{_escape_like(filters.q.strip())}%"
        conditions.append(
            or_(
                WorkItem.title.ilike(pattern, escape="\\"),
                WorkItem.description.ilike(pattern, escape="\\"),
            )
        )
    return conditions


async def fetch_page(
    session: AsyncSession,
    conditions: list[ColumnElement[bool]],
    cursor: str | None,
    limit: int,
) -> tuple[list[WorkItem], str | None]:
    """Keyset pagination in SQL: ORDER BY created_at DESC, id DESC and (created_at, id) < cursor."""
    stmt = select(WorkItem).where(*conditions)
    if cursor:
        ts, row_id = decode_cursor(cursor)
        stmt = stmt.where(tuple_(WorkItem.created_at, WorkItem.id) < tuple_(ts, row_id))
    stmt = stmt.order_by(WorkItem.created_at.desc(), WorkItem.id.desc()).limit(
        limit + 1
    )
    rows = list((await session.scalars(stmt)).all())
    page, next_cursor = rows[:limit], None
    if len(rows) > limit:
        next_cursor = encode_cursor(page[-1].created_at, page[-1].id)
    return page, next_cursor


async def list_items(
    session: AsyncSession,
    user: User,
    filters: ItemFilters,
    cursor: str | None,
    limit: int,
) -> tuple[list[WorkItem], str | None]:
    if (
        filters.team_id is not None
        and await get_team_role(session, user.id, filters.team_id) is None
    ):
        raise NotFoundError("Team not found", code="team_not_found")
    conditions = [
        WorkItem.team_id.in_(visible_team_ids(user.id)),
        *_filter_conditions(filters),
    ]
    return await fetch_page(session, conditions, cursor, limit)


async def get_item(session: AsyncSession, user: User, item_id: uuid.UUID) -> WorkItem:
    item, role = await get_item_with_role(session, user.id, item_id)
    require(Action.VIEW, role, user_id=user.id, item=item)
    return item


@dataclass
class CreateResult:
    status_code: int
    body: dict[str, Any]
    replayed: bool


async def create_item(
    session: AsyncSession, user: User, payload: WorkItemCreate, idempotency_key: str
) -> CreateResult:
    role = await get_team_role(session, user.id, payload.team_id)
    if role is None:
        raise NotFoundError("Team not found", code="team_not_found")
    require(Action.CREATE, role, user_id=user.id)
    if payload.assignee_id is not None:
        await _require_assignable(session, payload.team_id, payload.assignee_id)

    request_hash = idempotency.hash_request(payload.model_dump(mode="json"))
    key_kwargs = {
        "user_id": user.id,
        "endpoint": CREATE_ENDPOINT,
        "key": idempotency_key,
    }

    async with transaction(session):
        key_id = await idempotency.claim_key(
            session, request_hash=request_hash, **key_kwargs
        )
        if key_id is None:
            status_code, body = await idempotency.replay(
                session, request_hash=request_hash, **key_kwargs
            )
            return CreateResult(status_code, body, replayed=True)

        item = WorkItem(
            team_id=payload.team_id,
            title=payload.title,
            description=payload.description,
            type=payload.type.value,
            priority=payload.priority.value,
            status=Status.OPEN.value,
            assignee_id=payload.assignee_id,
            created_by_id=user.id,
            due_at=payload.due_at,
            version=1,
        )
        session.add(item)
        await session.flush()
        await session.refresh(item)
        record_event(
            session,
            work_item_id=item.id,
            actor_id=user.id,
            event_type=EventType.ITEM_CREATED,
            new_value=_snapshot(
                item,
                [
                    "title",
                    "type",
                    "priority",
                    "status",
                    "assignee_id",
                    "due_at",
                    "team_id",
                ],
            ),
        )
        body = WorkItemRead.model_validate(item).model_dump(mode="json")
        await idempotency.store_response(session, key_id=key_id, status=201, body=body)
    return CreateResult(201, body, replayed=False)


async def update_item(
    session: AsyncSession, user: User, item_id: uuid.UUID, payload: WorkItemUpdate
) -> WorkItem:
    item, role = await get_item_with_role(session, user.id, item_id)
    provided = payload.model_fields_set - {"expected_version"}

    if provided & _BASIC_FIELDS:
        require(Action.EDIT_BASIC, role, user_id=user.id, item=item)
    if "priority" in provided and payload.priority.value != item.priority:
        require(Action.CHANGE_PRIORITY, role, user_id=user.id, item=item)

    _check_version(item, payload.expected_version)
    if item.status == Status.CLOSED:
        raise ConflictError("Closed work items cannot be edited", code="item_closed")

    values: dict[str, Any] = {}
    old: dict[str, Any] = {}
    new: dict[str, Any] = {}
    for name in provided:
        new_value = getattr(payload, name)
        new_value = getattr(new_value, "value", new_value)
        if new_value != getattr(item, name):
            values[name] = new_value
            old[name] = _json_value(getattr(item, name))
            new[name] = _json_value(new_value)
    if not values:
        return item

    async with transaction(session):
        updated = await _compare_and_swap(
            session, item, payload.expected_version, values
        )
        basic_old = {k: v for k, v in old.items() if k != "priority"}
        basic_new = {k: v for k, v in new.items() if k != "priority"}
        if basic_new:
            record_event(
                session,
                work_item_id=item.id,
                actor_id=user.id,
                event_type=EventType.ITEM_UPDATED,
                old_value=basic_old,
                new_value=basic_new,
            )
        if "priority" in new:
            record_event(
                session,
                work_item_id=item.id,
                actor_id=user.id,
                event_type=EventType.PRIORITY_CHANGED,
                old_value={"priority": old["priority"]},
                new_value={"priority": new["priority"]},
            )
    return updated


async def claim_item(session: AsyncSession, user: User, item_id: uuid.UUID) -> WorkItem:
    item, role = await get_item_with_role(session, user.id, item_id)
    require(Action.CLAIM, role, user_id=user.id, item=item)

    async with transaction(session):
        stmt = (
            update(WorkItem)
            .where(
                WorkItem.id == item_id,
                WorkItem.assignee_id.is_(None),
                WorkItem.status == Status.OPEN.value,
            )
            .values(
                assignee_id=user.id,
                status=Status.IN_PROGRESS.value,
                version=WorkItem.version + 1,
                updated_at=func.now(),
            )
            .returning(WorkItem)
            .execution_options(populate_existing=True)
        )
        claimed = (await session.execute(stmt)).scalar_one_or_none()
        if claimed is None:
            raise ConflictError(
                "This work item is already assigned or no longer open",
                code="claim_conflict",
            )
        record_event(
            session,
            work_item_id=item_id,
            actor_id=user.id,
            event_type=EventType.CLAIMED,
            old_value={"assignee_id": None, "status": Status.OPEN.value},
            new_value={"assignee_id": str(user.id), "status": Status.IN_PROGRESS.value},
        )
    return claimed


async def assign_item(
    session: AsyncSession,
    user: User,
    item_id: uuid.UUID,
    assignee_id: uuid.UUID,
    expected_version: int | None,
) -> WorkItem:
    item, role = await get_item_with_role(session, user.id, item_id)
    require(Action.ASSIGN, role, user_id=user.id, item=item)
    if item.status in (Status.RESOLVED, Status.CLOSED):
        raise ConflictError(
            "Resolved or closed work items cannot be reassigned", code="invalid_state"
        )
    _check_version(item, expected_version)
    await _require_assignable(session, item.team_id, assignee_id)
    if item.assignee_id == assignee_id:
        return item

    old_assignee = item.assignee_id
    async with transaction(session):
        updated = await _compare_and_swap(
            session, item, item.version, {"assignee_id": assignee_id}
        )
        record_event(
            session,
            work_item_id=item_id,
            actor_id=user.id,
            event_type=EventType.ASSIGNED,
            old_value={"assignee_id": _json_value(old_assignee)},
            new_value={"assignee_id": str(assignee_id)},
        )
    return updated


async def transition_item(
    session: AsyncSession,
    user: User,
    item_id: uuid.UUID,
    target: Status,
    expected_version: int,
) -> WorkItem:
    item, role = await get_item_with_role(session, user.id, item_id)
    action = workflow.required_action(item.status, target)
    require(action, role, user_id=user.id, item=item)
    _check_version(item, expected_version)
    if target is Status.IN_PROGRESS and item.assignee_id is None:
        raise ConflictError(
            "Assign the work item before starting it", code="assignee_required"
        )

    old_status = item.status
    async with transaction(session):
        updated = await _compare_and_swap(
            session, item, expected_version, workflow.transition_values(target)
        )
        record_event(
            session,
            work_item_id=item_id,
            actor_id=user.id,
            event_type=EventType.STATUS_CHANGED,
            old_value={"status": old_status},
            new_value={"status": target.value},
        )
    return updated


async def add_comment(
    session: AsyncSession, user: User, item_id: uuid.UUID, body: str
) -> Comment:
    item, role = await get_item_with_role(session, user.id, item_id)
    require(Action.COMMENT, role, user_id=user.id, item=item)
    async with transaction(session):
        comment = Comment(work_item_id=item_id, author_id=user.id, body=body)
        session.add(comment)
        await session.flush()
        await session.refresh(comment)
        record_event(
            session,
            work_item_id=item_id,
            actor_id=user.id,
            event_type=EventType.COMMENT_ADDED,
            new_value={"comment_id": str(comment.id)},
        )
    return comment
