import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.schemas.activity import ActivityPage
from app.services import activity as activity_service
from app.services.permissions import Action, get_item_with_role, require

router = APIRouter(prefix="/items/{item_id}/activity", tags=["activity"])


@router.get("", response_model=ActivityPage)
async def list_activity(
    item_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> ActivityPage:
    # Read-only: there is intentionally no POST/PATCH/DELETE for activity events.
    item, role = await get_item_with_role(session, user.id, item_id)
    require(Action.VIEW, role, user_id=user.id, item=item)
    events, next_cursor = await activity_service.list_activity(
        session, item_id, cursor, limit
    )
    return ActivityPage(events=events, next_cursor=next_cursor)
