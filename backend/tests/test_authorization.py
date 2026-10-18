import uuid

import pytest
from httpx import AsyncClient

from app.models import ActivityEvent, Comment
from app.models.enums import Priority, Status
from tests.conftest import World, new_key
from tests.helpers import count_rows, db_item, event_types


def create_payload(world: World, **overrides) -> dict:
    payload = {"team_id": str(world.team_a.id), "title": "New thing", "type": "task"}
    payload.update(overrides)
    return payload


async def post_create(client: AsyncClient, world: World, user, **overrides):
    return await client.post(
        "/api/v1/items",
        json=create_payload(world, **overrides),
        headers={**world.headers(user), "Idempotency-Key": new_key()},
    )


# ------------------------------------------------------------------------------ create
async def test_viewer_cannot_create_items(
    async_client: AsyncClient, world: World
) -> None:
    response = await post_create(async_client, world, world.viewer)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"
    assert await count_rows(ActivityEvent) == 0


@pytest.mark.parametrize("who", ["member", "lead", "admin"])
async def test_member_lead_admin_can_create(
    async_client: AsyncClient, world: World, who: str
) -> None:
    response = await post_create(async_client, world, world.users[who])
    assert response.status_code == 201
    assert response.json()["created_by_id"] == str(world.users[who].id)


async def test_cannot_create_in_a_team_you_do_not_belong_to(
    async_client: AsyncClient, world: World
) -> None:
    response = await post_create(async_client, world, world.member_b)
    assert response.status_code == 404
    assert await count_rows(ActivityEvent) == 0


# ------------------------------------------------------------------------------ approval
async def awaiting_item(world: World):
    return await world.make_item(
        status=Status.AWAITING_APPROVAL.value, assignee_id=world.member.id
    )


async def transition(
    client: AsyncClient, world: World, user, item, to: str, version: int | None = None
):
    return await client.post(
        f"/api/v1/items/{item.id}/transition",
        json={"to_status": to, "expected_version": version or item.version},
        headers=world.headers(user),
    )


async def test_member_cannot_approve(async_client: AsyncClient, world: World) -> None:
    item = await awaiting_item(world)
    response = await transition(async_client, world, world.member, item, "resolved")
    assert response.status_code == 403
    after = await db_item(item.id)
    assert after.status == Status.AWAITING_APPROVAL and after.version == item.version
    assert await event_types(item.id) == []


async def test_admin_cannot_bypass_lead_only_approval(
    async_client: AsyncClient, world: World
) -> None:
    item = await awaiting_item(world)
    response = await transition(async_client, world, world.admin, item, "resolved")
    assert response.status_code == 403
    after = await db_item(item.id)
    assert after.status == Status.AWAITING_APPROVAL and after.resolved_at is None
    assert await event_types(item.id) == []


async def test_lead_of_the_team_can_approve(
    async_client: AsyncClient, world: World
) -> None:
    item = await awaiting_item(world)
    response = await transition(async_client, world, world.lead, item, "resolved")
    assert response.status_code == 200
    body = response.json()
    assert (
        body["status"] == "resolved"
        and body["resolved_at"]
        and body["version"] == item.version + 1
    )
    assert await event_types(item.id) == ["status_changed"]


async def test_lead_of_another_team_cannot_approve(
    async_client: AsyncClient, world: World
) -> None:
    item = await awaiting_item(world)
    response = await transition(async_client, world, world.lead_b, item, "resolved")
    assert response.status_code == 404  # not a member of the item's team: concealed
    assert (await db_item(item.id)).status == Status.AWAITING_APPROVAL


# ------------------------------------------------------------------------------ isolation
async def test_other_team_items_are_invisible_everywhere(
    async_client: AsyncClient, world: World
) -> None:
    item = await world.make_item()
    h = world.headers(world.member_b)
    base = f"/api/v1/items/{item.id}"
    assert (await async_client.get(base, headers=h)).status_code == 404
    assert (
        await async_client.patch(
            base, json={"expected_version": 1, "title": "x"}, headers=h
        )
    ).status_code == 404
    assert (await async_client.post(f"{base}/claim", headers=h)).status_code == 404
    assert (
        await async_client.post(
            f"{base}/assign", json={"assignee_id": str(world.member_b.id)}, headers=h
        )
    ).status_code == 404
    assert (
        await async_client.post(
            f"{base}/transition",
            json={"to_status": "in_progress", "expected_version": 1},
            headers=h,
        )
    ).status_code == 404
    assert (await async_client.get(f"{base}/comments", headers=h)).status_code == 404
    assert (
        await async_client.post(f"{base}/comments", json={"body": "hi"}, headers=h)
    ).status_code == 404
    assert (await async_client.get(f"{base}/activity", headers=h)).status_code == 404
    assert (await db_item(item.id)).version == 1
    assert await count_rows(ActivityEvent) == 0 and await count_rows(Comment) == 0


async def test_list_never_leaks_other_teams_even_with_filters(
    async_client: AsyncClient, world: World
) -> None:
    mine = await world.make_item(
        team_id=world.team_b.id, created_by_id=world.member_b.id, title="beta item"
    )
    await world.make_item(title="alpha item")
    h = world.headers(world.member_b)
    ids = [
        i["id"]
        for i in (await async_client.get("/api/v1/items", headers=h)).json()["items"]
    ]
    assert ids == [str(mine.id)]
    # explicitly asking for another team's items is concealed, not silently empty
    other = await async_client.get(
        f"/api/v1/items?team_id={world.team_a.id}", headers=h
    )
    assert other.status_code == 404
    # outsider sees nothing
    out = await async_client.get("/api/v1/items", headers=world.headers(world.outsider))
    assert out.json()["items"] == []


# ------------------------------------------------------------------------------ assignment
async def test_cannot_assign_to_user_from_another_team(
    async_client: AsyncClient, world: World
) -> None:
    item = await world.make_item()
    response = await async_client.post(
        f"/api/v1/items/{item.id}/assign",
        json={"assignee_id": str(world.member_b.id)},
        headers=world.headers(world.lead),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_assignee"
    assert (await db_item(item.id)).assignee_id is None
    assert await event_types(item.id) == []


async def test_cannot_assign_to_viewer_or_disabled_user(
    async_client: AsyncClient, world: World
) -> None:
    item = await world.make_item()
    for user in (world.viewer, world.disabled):
        response = await async_client.post(
            f"/api/v1/items/{item.id}/assign",
            json={"assignee_id": str(user.id)},
            headers=world.headers(world.lead),
        )
        assert response.status_code == 422


async def test_create_with_cross_team_assignee_is_rejected(
    async_client: AsyncClient, world: World
) -> None:
    response = await post_create(
        async_client, world, world.member, assignee_id=str(world.member_b.id)
    )
    assert response.status_code == 422
    assert await count_rows(ActivityEvent) == 0


@pytest.mark.parametrize("who", ["viewer", "member"])
async def test_only_lead_or_admin_can_assign(
    async_client: AsyncClient, world: World, who: str
) -> None:
    item = await world.make_item()
    response = await async_client.post(
        f"/api/v1/items/{item.id}/assign",
        json={"assignee_id": str(world.member2.id)},
        headers=world.headers(world.users[who]),
    )
    assert response.status_code == 403
    assert (await db_item(item.id)).assignee_id is None


# ------------------------------------------------------------------------------ edits
async def patch(client: AsyncClient, world: World, user, item, **body):
    return await client.patch(
        f"/api/v1/items/{item.id}",
        json={"expected_version": item.version, **body},
        headers=world.headers(user),
    )


async def test_member_can_edit_only_own_or_assigned_items(
    async_client: AsyncClient, world: World
) -> None:
    others = await world.make_item(created_by_id=world.member2.id)
    mine = await world.make_item(created_by_id=world.member.id)
    assigned = await world.make_item(
        created_by_id=world.member2.id,
        assignee_id=world.member.id,
        status="in_progress",
    )

    assert (
        await patch(async_client, world, world.member, others, title="hijack")
    ).status_code == 403
    assert (await db_item(others.id)).title == "Seed item"
    assert (
        await patch(async_client, world, world.member, mine, title="mine")
    ).status_code == 200
    assert (
        await patch(async_client, world, world.member, assigned, title="assigned")
    ).status_code == 200
    assert (
        await patch(async_client, world, world.viewer, mine, title="nope")
    ).status_code == 403


async def test_priority_changes_are_lead_or_admin_only(
    async_client: AsyncClient, world: World
) -> None:
    item = await world.make_item(created_by_id=world.member.id)
    denied = await patch(async_client, world, world.member, item, priority="urgent")
    assert denied.status_code == 403
    after = await db_item(item.id)
    assert after.priority == Priority.NORMAL and after.version == 1

    allowed = await patch(async_client, world, world.lead, item, priority="urgent")
    assert allowed.status_code == 200 and allowed.json()["priority"] == "urgent"
    assert await event_types(item.id) == ["priority_changed"]


# ------------------------------------------------------------------------------ claim / close / comment
async def test_viewer_cannot_claim(async_client: AsyncClient, world: World) -> None:
    item = await world.make_item()
    response = await async_client.post(
        f"/api/v1/items/{item.id}/claim", headers=world.headers(world.viewer)
    )
    assert response.status_code == 403
    assert (await db_item(item.id)).assignee_id is None and await event_types(
        item.id
    ) == []


async def test_close_is_lead_or_admin_only(
    async_client: AsyncClient, world: World
) -> None:
    item = await world.make_item(status="resolved", assignee_id=world.member.id)
    assert (
        await transition(async_client, world, world.member, item, "closed")
    ).status_code == 403
    assert (await db_item(item.id)).status == Status.RESOLVED
    admin_close = await transition(async_client, world, world.admin, item, "closed")
    assert admin_close.status_code == 200 and admin_close.json()["closed_at"]


async def test_viewer_cannot_comment_but_can_read(
    async_client: AsyncClient, world: World
) -> None:
    item = await world.make_item()
    h = world.headers(world.viewer)
    assert (
        await async_client.post(
            f"/api/v1/items/{item.id}/comments", json={"body": "hi"}, headers=h
        )
    ).status_code == 403
    assert (
        await async_client.get(f"/api/v1/items/{item.id}/comments", headers=h)
    ).status_code == 200
    assert (
        await async_client.get(f"/api/v1/items/{item.id}", headers=h)
    ).status_code == 200
    assert await count_rows(Comment) == 0 and await event_types(item.id) == []


async def test_submit_for_approval_requires_assignee_for_members(
    async_client: AsyncClient, world: World
) -> None:
    item = await world.make_item(status="in_progress", assignee_id=world.member2.id)
    response = await transition(
        async_client, world, world.member, item, "awaiting_approval"
    )
    assert response.status_code == 403
    ok = await transition(async_client, world, world.member2, item, "awaiting_approval")
    assert ok.status_code == 200


async def test_unknown_item_is_404(async_client: AsyncClient, world: World) -> None:
    response = await async_client.get(
        f"/api/v1/items/{uuid.uuid4()}", headers=world.headers(world.lead)
    )
    assert (
        response.status_code == 404
        and response.json()["error"]["code"] == "item_not_found"
    )
