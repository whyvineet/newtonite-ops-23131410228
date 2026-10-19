import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient

from app.models import IdempotencyKey
from tests.conftest import World, new_key
from tests.helpers import count_rows, db_item, event_types


def payload(world: World, **overrides) -> dict:
    body = {"team_id": str(world.team_a.id), "title": "Disk full", "type": "incident"}
    body.update(overrides)
    return body


async def create(
    client: AsyncClient, world: World, user=None, key: str | None = None, **overrides
):
    return await client.post(
        "/api/v1/items",
        json=payload(world, **overrides),
        headers={
            **world.headers(user or world.member),
            "Idempotency-Key": key or new_key(),
        },
    )


# ------------------------------------------------------------------------------ creation
async def test_create_valid_item(async_client: AsyncClient, world: World) -> None:
    response = await create(
        async_client,
        world,
        description="details",
        priority="high",
        due_at="2030-01-01T10:00:00+02:00",
        assignee_id=str(world.member2.id),
    )
    assert response.status_code == 201
    body = response.json()
    assert (
        body["status"] == "open" and body["version"] == 1 and body["priority"] == "high"
    )
    assert body["assignee_id"] == str(world.member2.id)
    assert body["created_by_id"] == str(world.member.id)
    assert datetime.fromisoformat(body["due_at"]) == datetime(
        2030, 1, 1, 8, 0, tzinfo=UTC
    )
    assert body["created_at"].endswith(("Z", "+00:00"))
    assert body["resolved_at"] is None and body["closed_at"] is None
    assert await event_types(body["id"]) == ["item_created"]


@pytest.mark.parametrize(
    "overrides",
    [
        {"type": "bug"},
        {"priority": "critical"},
        {"title": ""},
        {"title": "   "},
        {"title": "x" * 201},
        {"description": "x" * 10_001},
        {"due_at": "next tuesday"},
        {"due_at": "2030-01-01T10:00:00"},  # naive timestamps are ambiguous
        {"team_id": "not-a-uuid"},
        {"status": "closed"},  # clients cannot choose status
        {"version": 7},
        {"created_by_id": str(uuid.uuid4())},
    ],
)
async def test_create_rejects_invalid_fields(
    async_client: AsyncClient, world: World, overrides: dict
) -> None:
    response = await create(async_client, world, **overrides)
    assert response.status_code == 422, overrides
    assert await count_rows(IdempotencyKey) == 0


async def test_idempotency_key_header_is_required(
    async_client: AsyncClient, world: World
) -> None:
    response = await async_client.post(
        "/api/v1/items", json=payload(world), headers=world.headers(world.member)
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "idempotency_key_required"
    blank = await async_client.post(
        "/api/v1/items",
        json=payload(world),
        headers={**world.headers(world.member), "Idempotency-Key": "  "},
    )
    assert blank.status_code == 400


# ------------------------------------------------------------------------------ list / filter / paginate
async def test_list_filters_and_search(async_client: AsyncClient, world: World) -> None:
    await world.make_item(
        title="Payment gateway down", type="payment", priority="urgent"
    )
    await world.make_item(title="Update 100% docs_v2", type="task", priority="low")
    await world.make_item(
        title="Other", type="task", status="in_progress", assignee_id=world.member2.id
    )
    h = world.headers(world.viewer)

    async def titles(query: str) -> list[str]:
        response = await async_client.get(f"/api/v1/items?{query}", headers=h)
        assert response.status_code == 200, response.text
        return sorted(i["title"] for i in response.json()["items"])

    assert await titles("type=payment") == ["Payment gateway down"]
    assert await titles("priority=low") == ["Update 100% docs_v2"]
    assert await titles("status=in_progress") == ["Other"]
    assert await titles(f"assignee_id={world.member2.id}") == ["Other"]
    assert await titles("q=GATEWAY") == ["Payment gateway down"]
    assert await titles("q=100%25") == [
        "Update 100% docs_v2"
    ]  # LIKE wildcards are escaped
    assert await titles("q=%25") == ["Update 100% docs_v2"]
    assert await titles("q=docs_v") == ["Update 100% docs_v2"]
    assert await titles("q=xyz-no-match") == []
    assert await titles("type=task&status=open") == ["Update 100% docs_v2"]


async def test_cursor_pagination_is_complete_and_ordered(
    async_client: AsyncClient, world: World
) -> None:
    created = [(await world.make_item(title=f"item {n}")).id for n in range(7)]
    h = world.headers(world.member)
    seen: list[str] = []
    cursor, pages = None, 0
    while True:
        url = "/api/v1/items?limit=3" + (f"&cursor={cursor}" if cursor else "")
        body = (await async_client.get(url, headers=h)).json()
        assert body["limit"] == 3 and len(body["items"]) <= 3
        seen += [i["id"] for i in body["items"]]
        pages += 1
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert pages == 3
    assert len(seen) == len(set(seen)) == 7
    assert seen == [str(i) for i in reversed(created)]  # newest first, deterministic


async def test_pagination_validation(async_client: AsyncClient, world: World) -> None:
    h = world.headers(world.member)
    assert (
        await async_client.get("/api/v1/items?limit=0", headers=h)
    ).status_code == 422
    assert (
        await async_client.get("/api/v1/items?limit=101", headers=h)
    ).status_code == 422
    assert (
        await async_client.get("/api/v1/items?status=bogus", headers=h)
    ).status_code == 422
    bad = await async_client.get("/api/v1/items?cursor=not-a-cursor", headers=h)
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "invalid_cursor"


@pytest.mark.parametrize(
    "raw",
    [
        '["2026-01-01T00:00:00+00:00", 5]',  # non-string id used to crash with a 500
        '[5, "ffffffff-ffff-4fff-8fff-ffffffffffff"]',
        '["0001-01-01T00:00:00+14:00", "ffffffff-ffff-4fff-8fff-ffffffffffff"]',
        '["9999-12-31T23:59:59-14:00", "ffffffff-ffff-4fff-8fff-ffffffffffff"]',
        '["2026-01-01T00:00:00", "ffffffff-ffff-4fff-8fff-ffffffffffff"]',  # naive
    ],
)
@pytest.mark.parametrize(
    "path", ["/api/v1/items", "/api/v1/dashboard?view=assigned_to_me"]
)
async def test_malformed_cursors_are_400_not_500(
    crash_client: AsyncClient, world: World, raw: str, path: str
) -> None:
    import base64

    cursor = base64.urlsafe_b64encode(raw.encode()).decode()
    sep = "&" if "?" in path else "?"
    res = await crash_client.get(
        f"{path}{sep}cursor={cursor}", headers=world.headers(world.member)
    )
    assert res.status_code == 400, res.text
    assert res.json()["error"]["code"] == "invalid_cursor"


# ------------------------------------------------------------------------------ workflow
async def step(client, world, user, item_id, to, version):
    return await client.post(
        f"/api/v1/items/{item_id}/transition",
        json={"to_status": to, "expected_version": version},
        headers=world.headers(user),
    )


async def test_full_happy_path_with_timestamps_and_events(
    async_client: AsyncClient, world: World
) -> None:
    item = await world.make_item(created_by_id=world.member.id)
    claimed = await async_client.post(
        f"/api/v1/items/{item.id}/claim", headers=world.headers(world.member2)
    )
    assert claimed.status_code == 200
    body = claimed.json()
    assert (body["status"], body["assignee_id"], body["version"]) == (
        "in_progress",
        str(world.member2.id),
        2,
    )

    r = await step(async_client, world, world.member2, item.id, "awaiting_approval", 2)
    assert r.status_code == 200 and r.json()["resolved_at"] is None
    r = await step(async_client, world, world.lead, item.id, "resolved", 3)
    assert (
        r.status_code == 200
        and r.json()["resolved_at"]
        and r.json()["closed_at"] is None
    )
    r = await step(async_client, world, world.lead, item.id, "closed", 4)
    final = r.json()
    assert r.status_code == 200 and final["closed_at"] and final["version"] == 5
    assert datetime.fromisoformat(final["closed_at"]) >= datetime.fromisoformat(
        final["resolved_at"]
    )
    assert datetime.fromisoformat(final["updated_at"]) >= datetime.fromisoformat(
        final["created_at"]
    )
    assert await event_types(item.id) == [
        "claimed",
        "status_changed",
        "status_changed",
        "status_changed",
    ]


@pytest.mark.parametrize(
    ("start", "target"),
    [
        ("open", "awaiting_approval"),
        ("open", "resolved"),
        ("open", "closed"),
        ("in_progress", "resolved"),
        ("in_progress", "open"),
        ("awaiting_approval", "in_progress"),
        ("awaiting_approval", "closed"),
        ("resolved", "open"),
        ("resolved", "awaiting_approval"),
        ("closed", "open"),
        ("open", "open"),
    ],
)
async def test_invalid_transitions_are_rejected(
    async_client: AsyncClient, world: World, start: str, target: str
) -> None:
    item = await world.make_item(
        status=start, assignee_id=None if start == "open" else world.member.id
    )
    response = await step(async_client, world, world.lead, item.id, target, 1)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "invalid_transition"
    assert (await db_item(item.id)).status == start and await event_types(item.id) == []


async def test_cannot_start_unassigned_item_and_stale_version_is_rejected(
    async_client: AsyncClient, world: World
) -> None:
    item = await world.make_item()
    r = await step(async_client, world, world.lead, item.id, "in_progress", 1)
    assert r.status_code == 409 and r.json()["error"]["code"] == "assignee_required"

    assigned = await world.make_item(assignee_id=world.member.id)
    stale = await step(async_client, world, world.lead, assigned.id, "in_progress", 99)
    assert (
        stale.status_code == 409 and stale.json()["error"]["code"] == "version_conflict"
    )
    ok = await step(async_client, world, world.lead, assigned.id, "in_progress", 1)
    assert ok.status_code == 200


async def test_status_cannot_be_changed_through_patch(
    async_client: AsyncClient, world: World
) -> None:
    item = await world.make_item(created_by_id=world.member.id)
    for body in (
        {"status": "closed"},
        {"assignee_id": str(world.member.id)},
        {"version": 9},
    ):
        response = await async_client.patch(
            f"/api/v1/items/{item.id}",
            json={"expected_version": 1, **body},
            headers=world.headers(world.lead),
        )
        assert response.status_code == 422, body
    after = await db_item(item.id)
    assert (after.status, after.assignee_id, after.version) == ("open", None, 1)


# ------------------------------------------------------------------------------ patch / versions
async def test_patch_updates_fields_bumps_version_and_logs_diff(
    async_client: AsyncClient, world: World
) -> None:
    item = await world.make_item(title="Old", created_by_id=world.member.id)
    response = await async_client.patch(
        f"/api/v1/items/{item.id}",
        json={
            "expected_version": 1,
            "title": "  New  ",
            "type": "payment",
            "due_at": "2031-05-05T00:00:00Z",
        },
        headers=world.headers(world.member),
    )
    assert response.status_code == 200
    body = response.json()
    assert (body["title"], body["type"], body["version"]) == ("New", "payment", 2)
    assert datetime.fromisoformat(body["updated_at"]) >= datetime.fromisoformat(
        body["created_at"]
    )

    events = (
        await async_client.get(
            f"/api/v1/items/{item.id}/activity", headers=world.headers(world.member)
        )
    ).json()["events"]
    assert [e["event_type"] for e in events] == ["item_updated"]
    assert (
        events[0]["old_value"]["title"] == "Old"
        and events[0]["new_value"]["title"] == "New"
    )
    assert events[0]["actor"] == {"id": str(world.member.id), "name": "Member"}

    cleared = await async_client.patch(
        f"/api/v1/items/{item.id}",
        json={"expected_version": 2, "due_at": None},
        headers=world.headers(world.member),
    )
    assert cleared.status_code == 200 and cleared.json()["due_at"] is None


async def test_patch_validation_and_noop(
    async_client: AsyncClient, world: World
) -> None:
    item = await world.make_item(created_by_id=world.member.id, title="Same")
    h = world.headers(world.member)
    url = f"/api/v1/items/{item.id}"
    assert (
        await async_client.patch(url, json={"title": "x"}, headers=h)
    ).status_code == 422  # no expected_version
    assert (
        await async_client.patch(url, json={"expected_version": 1}, headers=h)
    ).status_code == 422  # nothing to change
    assert (
        await async_client.patch(
            url, json={"expected_version": 1, "title": None}, headers=h
        )
    ).status_code == 422
    noop = await async_client.patch(
        url, json={"expected_version": 1, "title": "Same"}, headers=h
    )
    assert noop.status_code == 200 and noop.json()["version"] == 1
    assert await event_types(item.id) == []


async def test_stale_version_does_not_overwrite(
    async_client: AsyncClient, world: World
) -> None:
    item = await world.make_item(created_by_id=world.member.id)
    h = world.headers(world.member)
    url = f"/api/v1/items/{item.id}"
    first = await async_client.patch(
        url, json={"expected_version": 1, "title": "Winner"}, headers=h
    )
    assert first.status_code == 200
    stale = await async_client.patch(
        url, json={"expected_version": 1, "title": "Loser"}, headers=h
    )
    assert (
        stale.status_code == 409 and stale.json()["error"]["code"] == "version_conflict"
    )
    after = await db_item(item.id)
    assert (after.title, after.version) == ("Winner", 2)
    assert await event_types(item.id) == ["item_updated"]


async def test_closed_items_cannot_be_edited(
    async_client: AsyncClient, world: World
) -> None:
    item = await world.make_item(status="closed", assignee_id=world.member.id)
    response = await async_client.patch(
        f"/api/v1/items/{item.id}",
        json={"expected_version": 1, "title": "x"},
        headers=world.headers(world.lead),
    )
    assert (
        response.status_code == 409
        and response.json()["error"]["code"] == "item_closed"
    )


# ------------------------------------------------------------------------------ assign
async def test_assign_and_reassign_record_old_and_new(
    async_client: AsyncClient, world: World
) -> None:
    item = await world.make_item()
    h = world.headers(world.lead)
    url = f"/api/v1/items/{item.id}/assign"
    first = await async_client.post(
        url, json={"assignee_id": str(world.member.id)}, headers=h
    )
    assert first.status_code == 200 and first.json()["assignee_id"] == str(
        world.member.id
    )
    assert first.json()["version"] == 2 and first.json()["status"] == "open"
    second = await async_client.post(
        url,
        json={"assignee_id": str(world.member2.id), "expected_version": 2},
        headers=world.headers(world.admin),
    )
    assert second.status_code == 200 and second.json()["version"] == 3

    events = (
        await async_client.get(f"/api/v1/items/{item.id}/activity", headers=h)
    ).json()["events"]
    assert [e["event_type"] for e in events] == ["assigned", "assigned"]
    assert events[0]["old_value"] == {"assignee_id": None}
    assert events[1]["old_value"] == {"assignee_id": str(world.member.id)}
    assert events[1]["new_value"] == {"assignee_id": str(world.member2.id)}

    stale = await async_client.post(
        url,
        json={"assignee_id": str(world.member.id), "expected_version": 1},
        headers=h,
    )
    assert stale.status_code == 409
    again = await async_client.post(
        url, json={"assignee_id": str(world.member2.id)}, headers=h
    )
    assert (
        again.status_code == 200 and again.json()["version"] == 3
    )  # no-op: no new version or event


async def test_resolved_items_cannot_be_reassigned(
    async_client: AsyncClient, world: World
) -> None:
    item = await world.make_item(status="resolved", assignee_id=world.member.id)
    response = await async_client.post(
        f"/api/v1/items/{item.id}/assign",
        json={"assignee_id": str(world.member2.id)},
        headers=world.headers(world.lead),
    )
    assert response.status_code == 409


# ------------------------------------------------------------------------------ comments / activity
async def test_comments_and_activity_timeline(
    async_client: AsyncClient, world: World
) -> None:
    item = await world.make_item()
    h = world.headers(world.member)
    base = f"/api/v1/items/{item.id}"
    for body in ("first", "second", "third"):
        r = await async_client.post(
            f"{base}/comments", json={"body": f"  {body} "}, headers=h
        )
        assert (
            r.status_code == 201
            and r.json()["body"] == body
            and r.json()["author"]["name"] == "Member"
        )

    page = (await async_client.get(f"{base}/comments?limit=2", headers=h)).json()
    assert [c["body"] for c in page["comments"]] == ["first", "second"] and page[
        "next_cursor"
    ]
    rest = (
        await async_client.get(
            f"{base}/comments?limit=2&cursor={page['next_cursor']}", headers=h
        )
    ).json()
    assert [c["body"] for c in rest["comments"]] == ["third"] and rest[
        "next_cursor"
    ] is None

    activity = (await async_client.get(f"{base}/activity", headers=h)).json()
    assert [e["event_type"] for e in activity["events"]] == ["comment_added"] * 3
    assert all("comment_id" in e["new_value"] for e in activity["events"])

    for bad in (
        {"body": ""},
        {"body": "   "},
        {"body": "x" * 5001},
        {},
        {"body": "ok", "author_id": "x"},
    ):
        assert (
            await async_client.post(f"{base}/comments", json=bad, headers=h)
        ).status_code == 422, bad


async def test_activity_cannot_be_written_by_clients(
    async_client: AsyncClient, world: World
) -> None:
    item = await world.make_item()
    h = world.headers(world.admin)
    url = f"/api/v1/items/{item.id}/activity"
    for method in ("POST", "PUT", "PATCH", "DELETE"):
        assert (await async_client.request(method, url, headers=h)).status_code == 405


async def test_team_endpoints(async_client: AsyncClient, world: World) -> None:
    teams = (
        await async_client.get("/api/v1/teams", headers=world.headers(world.lead))
    ).json()
    assert teams == [{"id": str(world.team_a.id), "name": "Alpha", "role": "lead"}]
    members = (
        await async_client.get(
            f"/api/v1/teams/{world.team_a.id}/members",
            headers=world.headers(world.viewer),
        )
    ).json()
    assert {m["name"] for m in members} >= {"Lead", "Member", "Viewer"}
    assert "email" not in members[0] and "password_hash" not in str(members)
    other = await async_client.get(
        f"/api/v1/teams/{world.team_a.id}/members",
        headers=world.headers(world.member_b),
    )
    assert other.status_code == 404
