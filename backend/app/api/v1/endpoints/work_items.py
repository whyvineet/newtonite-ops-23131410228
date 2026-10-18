import uuid
from typing import Annotated

from fastapi import APIRouter, Header, Query
from fastapi.responses import JSONResponse

from app.api.deps import CurrentUser, DbSession
from app.models.enums import ItemType, Priority, Status
from app.schemas.work_item import (
    AssignRequest,
    TransitionRequest,
    WorkItemCreate,
    WorkItemPage,
    WorkItemRead,
    WorkItemUpdate,
)
from app.services import idempotency
from app.services import work_items as svc

router = APIRouter(prefix="/items", tags=["work items"])


@router.get("", response_model=WorkItemPage)
async def list_items(
    user: CurrentUser,
    session: DbSession,
    team_id: uuid.UUID | None = None,
    status: Status | None = None,
    priority: Priority | None = None,
    assignee_id: uuid.UUID | None = None,
    type: ItemType | None = None,
    q: Annotated[str | None, Query(min_length=1, max_length=100)] = None,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> WorkItemPage:
    filters = svc.ItemFilters(
        team_id=team_id,
        status=status,
        priority=priority,
        assignee_id=assignee_id,
        type=type.value if type else None,
        q=q,
    )
    items, next_cursor = await svc.list_items(session, user, filters, cursor, limit)
    return WorkItemPage(
        items=[WorkItemRead.model_validate(i) for i in items],
        next_cursor=next_cursor,
        limit=limit,
    )


@router.post("", response_model=WorkItemRead, status_code=201)
async def create_item(
    payload: WorkItemCreate,
    user: CurrentUser,
    session: DbSession,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> JSONResponse:
    key = idempotency.validate_key(idempotency_key)
    result = await svc.create_item(session, user, payload, key)
    headers = {"Idempotent-Replayed": "true"} if result.replayed else None
    return JSONResponse(
        content=result.body, status_code=result.status_code, headers=headers
    )


@router.get("/{item_id}", response_model=WorkItemRead)
async def get_item(
    item_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> WorkItemRead:
    return WorkItemRead.model_validate(await svc.get_item(session, user, item_id))


@router.patch("/{item_id}", response_model=WorkItemRead)
async def update_item(
    item_id: uuid.UUID, payload: WorkItemUpdate, user: CurrentUser, session: DbSession
) -> WorkItemRead:
    return WorkItemRead.model_validate(
        await svc.update_item(session, user, item_id, payload)
    )


@router.post("/{item_id}/claim", response_model=WorkItemRead)
async def claim_item(
    item_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> WorkItemRead:
    return WorkItemRead.model_validate(await svc.claim_item(session, user, item_id))


@router.post("/{item_id}/assign", response_model=WorkItemRead)
async def assign_item(
    item_id: uuid.UUID, payload: AssignRequest, user: CurrentUser, session: DbSession
) -> WorkItemRead:
    item = await svc.assign_item(
        session, user, item_id, payload.assignee_id, payload.expected_version
    )
    return WorkItemRead.model_validate(item)


@router.post("/{item_id}/transition", response_model=WorkItemRead)
async def transition_item(
    item_id: uuid.UUID,
    payload: TransitionRequest,
    user: CurrentUser,
    session: DbSession,
) -> WorkItemRead:
    item = await svc.transition_item(
        session, user, item_id, payload.to_status, payload.expected_version
    )
    return WorkItemRead.model_validate(item)
