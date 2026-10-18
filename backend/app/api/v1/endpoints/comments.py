import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.schemas.activity import ActorRead, CommentCreate, CommentPage, CommentRead
from app.services import activity as activity_service
from app.services import work_items as svc
from app.services.permissions import Action, get_item_with_role, require

router = APIRouter(prefix="/items/{item_id}/comments", tags=["comments"])


@router.get("", response_model=CommentPage)
async def list_comments(
    item_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> CommentPage:
    item, role = await get_item_with_role(session, user.id, item_id)
    require(Action.VIEW, role, user_id=user.id, item=item)
    comments, next_cursor = await activity_service.list_comments(
        session, item_id, cursor, limit
    )
    return CommentPage(comments=comments, next_cursor=next_cursor)


@router.post("", response_model=CommentRead, status_code=201)
async def add_comment(
    item_id: uuid.UUID, payload: CommentCreate, user: CurrentUser, session: DbSession
) -> CommentRead:
    comment = await svc.add_comment(session, user, item_id, payload.body)
    return CommentRead(
        id=comment.id,
        work_item_id=comment.work_item_id,
        author=ActorRead(id=user.id, name=user.name),
        body=comment.body,
        created_at=comment.created_at,
    )
