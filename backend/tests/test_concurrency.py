"""Real concurrency against PostgreSQL: requests are fired together with asyncio.gather, each on
its own pooled connection/transaction, so these tests exercise row locks and unique indexes."""

import asyncio
from collections import Counter

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.db.session import get_session_factory
from app.models import ActivityEvent, Membership, User, WorkItem
from app.models.enums import Role
from tests.conftest import PASSWORD_HASH, World, new_key
from tests.helpers import count_rows, db_item, event_types

RACERS = 8


async def add_user(world: World, name: str, role: Role) -> User:
    async with get_session_factory()() as session:
        user = User(name=name, email=f"{name}@example.com", password_hash=PASSWORD_HASH)
        session.add(user)
        await session.flush()
        session.add(
            Membership(user_id=user.id, team_id=world.team_a.id, role=role.value)
        )
        await session.commit()
        return user


# ------------------------------------------------------------------------------ claims
async def test_concurrent_claims_exactly_one_wins(
    async_client: AsyncClient, world: World, rendezvous
) -> None:
    # every claimer has read the open, unassigned item before any issues its UPDATE
    rendezvous("app.services.work_items.get_item_with_role", RACERS)
    item = await world.make_item(priority="urgent")
    claimers = [
        await add_user(world, f"claimer{n}", Role.MEMBER) for n in range(RACERS)
    ]

    responses = await asyncio.gather(
        *[
            async_client.post(
                f"/api/v1/items/{item.id}/claim", headers=world.headers(user)
            )
            for user in claimers
        ]
    )

    codes = Counter(r.status_code for r in responses)
    assert codes == {200: 1, 409: RACERS - 1}, codes
    winner_response = next(r for r in responses if r.status_code == 200)
    assert all(
        r.json()["error"]["code"] == "claim_conflict"
        for r in responses
        if r.status_code == 409
    )

    stored = await db_item(item.id)
    assert str(stored.assignee_id) == winner_response.json()["assignee_id"]
    assert stored.status == "in_progress" and stored.version == 2
    # Only the successful claim produced history.
    assert await event_types(item.id) == ["claimed"]


async def test_repeated_claim_of_same_item_by_many_rounds(
    async_client: AsyncClient, world: World, rendezvous
) -> None:
    # barrier is reusable across rounds
    rendezvous("app.services.work_items.get_item_with_role", 5)
    """Run the race several times on fresh items to make a lucky pass unlikely."""
    claimers = [await add_user(world, f"c{n}", Role.MEMBER) for n in range(5)]
    for _ in range(5):
        item = await world.make_item()
        responses = await asyncio.gather(
            *[
                async_client.post(
                    f"/api/v1/items/{item.id}/claim", headers=world.headers(u)
                )
                for u in claimers
            ]
        )
        assert sorted(r.status_code for r in responses) == [200, 409, 409, 409, 409]


async def test_claim_of_assigned_or_started_item_conflicts(
    async_client: AsyncClient, world: World
) -> None:
    assigned = await world.make_item(
        assignee_id=world.member2.id
    )  # open but already assigned
    started = await world.make_item(status="in_progress", assignee_id=world.member2.id)
    for item in (assigned, started):
        response = await async_client.post(
            f"/api/v1/items/{item.id}/claim", headers=world.headers(world.member)
        )
        assert response.status_code == 409
        after = await db_item(item.id)
        assert after.assignee_id == world.member2.id and after.version == 1
    assert await count_rows(ActivityEvent) == 0


# ------------------------------------------------------------------------------ optimistic locking
async def test_concurrent_patches_with_same_version_one_wins(
    async_client: AsyncClient, world: World, rendezvous
) -> None:
    # all writers pass the Python version pre-check holding version 1
    rendezvous("app.services.work_items.get_item_with_role", RACERS)
    item = await world.make_item(created_by_id=world.member.id)
    h = world.headers(world.lead)
    responses = await asyncio.gather(
        *[
            async_client.patch(
                f"/api/v1/items/{item.id}",
                json={"expected_version": 1, "title": f"writer {n}"},
                headers=h,
            )
            for n in range(RACERS)
        ]
    )
    codes = Counter(r.status_code for r in responses)
    assert codes == {200: 1, 409: RACERS - 1}, codes
    winner = next(r for r in responses if r.status_code == 200).json()
    stored = await db_item(item.id)
    assert (stored.title, stored.version) == (winner["title"], 2)
    assert await event_types(item.id) == ["item_updated"]


async def test_outdated_version_cannot_overwrite_newer_update(
    async_client: AsyncClient, world: World
) -> None:
    item = await world.make_item(created_by_id=world.member.id)
    url = f"/api/v1/items/{item.id}"
    a = await async_client.patch(
        url,
        json={"expected_version": 1, "title": "from user A"},
        headers=world.headers(world.lead),
    )
    assert a.status_code == 200
    b = await async_client.patch(
        url,
        json={"expected_version": 1, "title": "from user B"},
        headers=world.headers(world.member),
    )
    assert b.status_code == 409
    assert (await db_item(item.id)).title == "from user A"


# ------------------------------------------------------------------------------ transitions
async def test_concurrent_approvals_only_a_lead_can_win(
    async_client: AsyncClient, world: World, rendezvous
) -> None:
    # all six requests hold the same awaiting_approval snapshot
    rendezvous("app.services.work_items.get_item_with_role", 6)
    """Member, Admin and a foreign Lead race a real Lead. Only the Lead's request may succeed."""
    item = await world.make_item(
        status="awaiting_approval", assignee_id=world.member.id
    )

    def approve(user):
        return async_client.post(
            f"/api/v1/items/{item.id}/transition",
            json={"to_status": "resolved", "expected_version": 1},
            headers=world.headers(user),
        )

    resp = await asyncio.gather(
        approve(world.member),
        approve(world.admin),
        approve(world.lead_b),
        approve(world.lead),
        approve(world.member),
        approve(world.admin),
    )
    assert [r.status_code for r in resp] == [403, 403, 404, 200, 403, 403]
    stored = await db_item(item.id)
    assert (
        stored.status == "resolved"
        and stored.version == 2
        and stored.resolved_at is not None
    )
    assert await event_types(item.id) == ["status_changed"]


async def test_two_leads_approving_at_once_only_one_succeeds(
    async_client: AsyncClient, world: World, rendezvous
) -> None:
    # both leads hold the same snapshot
    rendezvous("app.services.work_items.get_item_with_role", 4)
    second_lead = await add_user(world, "lead2", Role.LEAD)
    item = await world.make_item(
        status="awaiting_approval", assignee_id=world.member.id
    )
    responses = await asyncio.gather(
        *[
            async_client.post(
                f"/api/v1/items/{item.id}/transition",
                json={"to_status": "resolved", "expected_version": 1},
                headers=world.headers(lead),
            )
            for lead in (world.lead, second_lead, world.lead, second_lead)
        ]
    )
    assert Counter(r.status_code for r in responses) == {200: 1, 409: 3}
    assert await event_types(item.id) == ["status_changed"]
    assert (await db_item(item.id)).version == 2


# ------------------------------------------------------------------------------ idempotent create
def create_request(client: AsyncClient, world: World, key: str, user=None, **overrides):
    body = {
        "team_id": str(world.team_a.id),
        "title": "Payment stuck",
        "type": "payment",
        **overrides,
    }
    return client.post(
        "/api/v1/items",
        json=body,
        headers={**world.headers(user or world.member), "Idempotency-Key": key},
    )


async def item_count() -> int:
    return await count_rows(WorkItem)


async def test_same_key_same_payload_creates_one_item_even_when_simultaneous(
    async_client: AsyncClient, world: World, rendezvous
) -> None:
    # all racers hit INSERT .. ON CONFLICT at the same instant
    rendezvous("app.services.idempotency.claim_key", RACERS, after=False)
    key = new_key()
    responses = await asyncio.gather(
        *[create_request(async_client, world, key) for _ in range(RACERS)]
    )

    assert all(r.status_code == 201 for r in responses), [r.text for r in responses]
    assert len({r.json()["id"] for r in responses}) == 1
    replays = [r for r in responses if r.headers.get("idempotent-replayed") == "true"]
    assert len(replays) == RACERS - 1
    assert await item_count() == 1
    assert await event_types(responses[0].json()["id"]) == ["item_created"]


async def test_sequential_retry_returns_original_result(
    async_client: AsyncClient, world: World
) -> None:
    key = new_key()
    first = await create_request(async_client, world, key)
    second = await create_request(async_client, world, key)
    assert first.status_code == second.status_code == 201
    assert first.json() == second.json()
    assert (
        "idempotent-replayed" not in first.headers
        and second.headers["idempotent-replayed"] == "true"
    )
    assert await item_count() == 1


async def test_same_key_different_payload_conflicts(
    async_client: AsyncClient, world: World
) -> None:
    key = new_key()
    assert (await create_request(async_client, world, key)).status_code == 201
    other = await create_request(async_client, world, key, title="A different request")
    assert other.status_code == 409
    assert other.json()["error"]["code"] == "idempotency_key_reused"
    assert await item_count() == 1


async def test_concurrent_same_key_different_payloads_create_one_item(
    async_client: AsyncClient, world: World, rendezvous
) -> None:
    # all racers hit INSERT .. ON CONFLICT at the same instant
    rendezvous("app.services.idempotency.claim_key", RACERS, after=False)
    key = new_key()
    responses = await asyncio.gather(
        *[
            create_request(async_client, world, key, title=f"variant {n % 2}")
            for n in range(RACERS)
        ]
    )
    assert await item_count() == 1
    assert 201 in {r.status_code for r in responses} and {
        r.status_code for r in responses
    } <= {201, 409}


async def test_keys_are_scoped_per_user(
    async_client: AsyncClient, world: World
) -> None:
    key = new_key()
    a = await create_request(async_client, world, key, user=world.member)
    b = await create_request(async_client, world, key, user=world.lead)
    assert a.status_code == b.status_code == 201 and a.json()["id"] != b.json()["id"]
    assert await item_count() == 2


async def test_unauthorized_create_does_not_consume_the_key(
    async_client: AsyncClient, world: World
) -> None:
    key = new_key()
    denied = await create_request(async_client, world, key, user=world.viewer)
    assert denied.status_code == 403
    from app.models import IdempotencyKey

    assert await count_rows(IdempotencyKey) == 0


# ------------------------------------------------------------------------------ transactional integrity
async def test_failed_claim_transaction_leaves_no_partial_state(
    crash_client: AsyncClient, world: World, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If writing the activity event blows up after the UPDATE ran, the UPDATE must roll back too."""
    item = await world.make_item()

    def boom(*args, **kwargs):
        raise RuntimeError("simulated failure while writing activity")

    monkeypatch.setattr("app.services.work_items.record_event", boom)
    response = await crash_client.post(
        f"/api/v1/items/{item.id}/claim", headers=world.headers(world.member)
    )
    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "internal_error", "message": "Internal server error"}
    }

    after = await db_item(item.id)
    assert after.assignee_id is None and after.status == "open" and after.version == 1
    assert await count_rows(ActivityEvent) == 0

    monkeypatch.undo()  # and the system is healthy afterwards
    ok = await crash_client.post(
        f"/api/v1/items/{item.id}/claim", headers=world.headers(world.member)
    )
    assert ok.status_code == 200


async def test_failed_create_rolls_back_item_and_idempotency_key(
    crash_client: AsyncClient, world: World, monkeypatch: pytest.MonkeyPatch
) -> None:
    key = new_key()

    def boom(*args, **kwargs):
        raise RuntimeError("simulated failure")

    monkeypatch.setattr("app.services.work_items.record_event", boom)
    failed = await create_request(crash_client, world, key)
    assert failed.status_code == 500
    from app.models import IdempotencyKey

    assert await item_count() == 0 and await count_rows(IdempotencyKey) == 0

    monkeypatch.undo()
    retry = await create_request(
        crash_client, world, key
    )  # same key is still usable after the rollback
    assert retry.status_code == 201 and await item_count() == 1


async def test_failed_transition_and_patch_leave_no_partial_state(
    crash_client: AsyncClient, world: World, monkeypatch: pytest.MonkeyPatch
) -> None:
    item = await world.make_item(
        status="awaiting_approval", assignee_id=world.member.id
    )
    monkeypatch.setattr("app.services.work_items.record_event", lambda *a, **k: 1 / 0)
    r = await crash_client.post(
        f"/api/v1/items/{item.id}/transition",
        json={"to_status": "resolved", "expected_version": 1},
        headers=world.headers(world.lead),
    )
    assert r.status_code == 500
    after = await db_item(item.id)
    assert (after.status, after.version, after.resolved_at) == (
        "awaiting_approval",
        1,
        None,
    )
    assert await count_rows(ActivityEvent) == 0


async def test_every_version_bump_has_matching_history(
    async_client: AsyncClient, world: World
) -> None:
    """Invariant check after a mixed workload: version-1 == number of state-changing events."""
    item = await world.make_item(created_by_id=world.member.id)
    h_lead, h_member = world.headers(world.lead), world.headers(world.member)
    base = f"/api/v1/items/{item.id}"
    await async_client.patch(
        base, json={"expected_version": 1, "title": "t"}, headers=h_lead
    )
    await async_client.post(
        f"{base}/assign", json={"assignee_id": str(world.member.id)}, headers=h_lead
    )
    await async_client.post(
        f"{base}/transition",
        json={"to_status": "in_progress", "expected_version": 3},
        headers=h_member,
    )
    await async_client.post(
        f"{base}/comments", json={"body": "note"}, headers=h_member
    )  # no version bump
    stored = await db_item(item.id)
    async with get_session_factory()() as session:
        state_events = await session.scalar(
            select(func.count())
            .select_from(ActivityEvent)
            .where(
                ActivityEvent.work_item_id == item.id,
                ActivityEvent.event_type != "comment_added",
            )
        )
    assert stored.version - 1 == state_events == 3
