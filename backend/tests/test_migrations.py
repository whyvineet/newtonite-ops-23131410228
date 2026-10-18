import asyncio

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect, text

from app.db.base import Base
from app.db.session import get_engine
from tests.conftest import alembic_config

EXPECTED_TABLES = {
    "users",
    "teams",
    "memberships",
    "work_items",
    "activity_events",
    "comments",
    "idempotency_keys",
}


async def table_names() -> set[str]:
    async with get_engine().connect() as conn:
        return set(await conn.run_sync(lambda c: inspect(c).get_table_names())) - {
            "alembic_version"
        }


async def test_fresh_database_migrates_to_head_and_matches_models() -> None:
    assert await table_names() == EXPECTED_TABLES

    async with get_engine().connect() as conn:
        diff = await conn.run_sync(
            lambda c: compare_metadata(MigrationContext.configure(c), Base.metadata)
        )
        revision = await conn.scalar(text("SELECT version_num FROM alembic_version"))
    assert diff == [], f"models and migrations have drifted: {diff}"
    assert revision == "0001"


async def test_downgrade_to_base_and_upgrade_again() -> None:
    cfg = alembic_config()
    # Alembic's async env.py calls asyncio.run(), so run it off the test's event loop.
    await asyncio.to_thread(command.downgrade, cfg, "base")
    assert await table_names() == set()
    await asyncio.to_thread(command.upgrade, cfg, "head")
    assert await table_names() == EXPECTED_TABLES


async def test_database_enforces_core_invariants() -> None:
    """The DB itself rejects states the service layer should never produce."""
    import uuid

    import pytest
    from sqlalchemy.exc import IntegrityError

    team, user = uuid.uuid4(), uuid.uuid4()
    async with get_engine().begin() as conn:
        await conn.execute(
            text("INSERT INTO teams (id, name) VALUES (:i, 'T')"), {"i": team}
        )
        await conn.execute(
            text(
                "INSERT INTO users (id, name, email, password_hash) VALUES (:i, 'U', 'u@example.com', 'x')"
            ),
            {"i": user},
        )

    async def insert_item(**cols):
        values = {
            "team": team,
            "user": user,
            "status": "open",
            "assignee": None,
            "title": "t",
            **cols,
        }
        async with get_engine().begin() as conn:
            await conn.execute(
                text(
                    "INSERT INTO work_items (team_id, title, type, priority, status, assignee_id, created_by_id) "
                    "VALUES (:team, :title, 'task', 'normal', :status, :assignee, :user)"
                ),
                values,
            )

    await insert_item()  # baseline is valid
    with pytest.raises(IntegrityError):  # in_progress needs an owner
        await insert_item(status="in_progress")
    with pytest.raises(IntegrityError):  # assignee must be a member of the item's team
        await insert_item(assignee=user)
    with pytest.raises(IntegrityError):  # unknown status
        await insert_item(status="done")
    with pytest.raises(IntegrityError):  # blank title
        await insert_item(title="   ")
    with pytest.raises(IntegrityError):  # e-mail must be stored normalized
        async with get_engine().begin() as conn:
            await conn.execute(
                text(
                    "INSERT INTO users (name, email, password_hash) VALUES ('X', 'Mixed@Example.com', 'x')"
                )
            )
