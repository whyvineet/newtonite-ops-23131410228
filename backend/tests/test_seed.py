from app.core.security import create_access_token
from app.db.session import get_session_factory, transaction
from app.models import ActivityEvent, Team, User, WorkItem
from app.seed import _seed
from httpx import AsyncClient
from sqlalchemy import func, select

from tests.helpers import count_rows


async def _run_seed(bulk: int) -> dict[str, int]:
    async with get_session_factory()() as session, transaction(session):
        return await _seed(session, bulk)


async def test_bulk_seed_is_complete_idempotent_and_paginates(
    async_client: AsyncClient,
) -> None:
    first = await _run_seed(250)
    assert first["items"] == 10 + 250
    assert await run_twice_adds_nothing()

    # Every item has history, and constraints (assignee in team, started => assigned) held.
    async with get_session_factory()() as session:
        orphans = await session.scalar(
            select(func.count())
            .select_from(WorkItem)
            .where(
                ~select(ActivityEvent.id)
                .where(ActivityEvent.work_item_id == WorkItem.id)
                .exists()
            )
        )
        assert orphans == 0
        alice = await session.scalar(
            select(User).where(User.email == "alice.lead@demo.test")
        )
        team = await session.scalar(select(Team).where(Team.name == "Platform Ops"))
        expected = await session.scalar(
            select(func.count())
            .select_from(WorkItem)
            .where(WorkItem.team_id == team.id)
        )
    token, _ = create_access_token(alice.id)
    headers = {"Authorization": f"Bearer {token}"}

    seen: list[str] = []
    cursor = None
    while True:
        params = {"team_id": str(team.id), "limit": 100}
        if cursor:
            params["cursor"] = cursor
        page = (
            await async_client.get("/api/v1/items", params=params, headers=headers)
        ).json()
        seen += [i["id"] for i in page["items"]]
        cursor = page["next_cursor"]
        if not cursor:
            break
    assert len(seen) == len(set(seen)) == expected


async def run_twice_adds_nothing() -> bool:
    before = await count_rows(WorkItem)
    again = await _run_seed(250)
    return again["items"] == 0 and await count_rows(WorkItem) == before
