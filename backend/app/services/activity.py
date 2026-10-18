import uuid
from typing import Any

from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_event import ActivityEvent
from app.models.comment import Comment
from app.models.enums import EventType
from app.models.user import User
from app.schemas.activity import ActivityEventRead, ActorRead, CommentRead
from app.services.pagination import decode_cursor, encode_cursor


def record_event(
    session: AsyncSession,
    *,
    work_item_id: uuid.UUID,
    actor_id: uuid.UUID,
    event_type: EventType,
    old_value: dict[str, Any] | None = None,
    new_value: dict[str, Any] | None = None,
) -> ActivityEvent:
    """Stage an audit row on the caller's session. It is flushed and committed together with the
    mutation it describes - this function never commits, so there is no separate transaction."""
    event = ActivityEvent(
        work_item_id=work_item_id,
        actor_id=actor_id,
        event_type=event_type.value,
        old_value=old_value,
        new_value=new_value,
    )
    session.add(event)
    return event


async def list_activity(
    session: AsyncSession, work_item_id: uuid.UUID, cursor: str | None, limit: int
) -> tuple[list[ActivityEventRead], str | None]:
    stmt = (
        select(ActivityEvent, User.name)
        .join(
            User, User.id == ActivityEvent.actor_id
        )  # one JOIN, no per-row actor lookups
        .where(ActivityEvent.work_item_id == work_item_id)
        .order_by(ActivityEvent.created_at, ActivityEvent.id)
        .limit(limit + 1)
    )
    if cursor:
        ts, row_id = decode_cursor(cursor)
        stmt = stmt.where(
            tuple_(ActivityEvent.created_at, ActivityEvent.id) > tuple_(ts, row_id)
        )
    rows = (await session.execute(stmt)).all()
    page, next_cursor = rows[:limit], None
    if len(rows) > limit:
        last = page[-1][0]
        next_cursor = encode_cursor(last.created_at, last.id)
    events = [
        ActivityEventRead(
            id=e.id,
            work_item_id=e.work_item_id,
            event_type=EventType(e.event_type),
            actor=ActorRead(id=e.actor_id, name=name),
            old_value=e.old_value,
            new_value=e.new_value,
            created_at=e.created_at,
        )
        for e, name in page
    ]
    return events, next_cursor


async def list_comments(
    session: AsyncSession, work_item_id: uuid.UUID, cursor: str | None, limit: int
) -> tuple[list[CommentRead], str | None]:
    stmt = (
        select(Comment, User.name)
        .join(User, User.id == Comment.author_id)
        .where(Comment.work_item_id == work_item_id)
        .order_by(Comment.created_at, Comment.id)
        .limit(limit + 1)
    )
    if cursor:
        ts, row_id = decode_cursor(cursor)
        stmt = stmt.where(tuple_(Comment.created_at, Comment.id) > tuple_(ts, row_id))
    rows = (await session.execute(stmt)).all()
    page, next_cursor = rows[:limit], None
    if len(rows) > limit:
        last = page[-1][0]
        next_cursor = encode_cursor(last.created_at, last.id)
    comments = [
        CommentRead(
            id=c.id,
            work_item_id=c.work_item_id,
            author=ActorRead(id=c.author_id, name=name),
            body=c.body,
            created_at=c.created_at,
        )
        for c, name in page
    ]
    return comments, next_cursor
