import uuid
from typing import Any

from sqlalchemy import func, select

from app.db.session import get_session_factory
from app.models import ActivityEvent, WorkItem


async def db_item(item_id: uuid.UUID | str) -> WorkItem:
    async with get_session_factory()() as session:
        item = await session.get(WorkItem, uuid.UUID(str(item_id)))
        assert item is not None
        return item


async def event_types(item_id: uuid.UUID | str) -> list[str]:
    async with get_session_factory()() as session:
        rows = await session.scalars(
            select(ActivityEvent.event_type)
            .where(ActivityEvent.work_item_id == uuid.UUID(str(item_id)))
            .order_by(ActivityEvent.created_at, ActivityEvent.id)
        )
        return list(rows)


async def count_rows(model: Any) -> int:
    async with get_session_factory()() as session:
        return await session.scalar(select(func.count()).select_from(model)) or 0
