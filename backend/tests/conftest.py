import asyncio
import importlib
import os
import uuid
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.engine import make_url

# --------------------------------------------------------------------------------------
# Test configuration is forced BEFORE any application module is imported. Tests always use
# TEST_DATABASE_URL (never the developer's DATABASE_URL) and refuse to run unless the database
# name contains "test", because the fixtures TRUNCATE tables and the migration test downgrades.
# --------------------------------------------------------------------------------------
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/test_newtonite",
)
if "test" not in (make_url(TEST_DATABASE_URL).database or ""):
    raise RuntimeError(
        "Refusing to run tests: TEST_DATABASE_URL must point at a database with 'test' in its name"
    )

os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["SECRET_KEY"] = "test-secret-key-at-least-32-bytes-long-for-testing"
os.environ["APP_NAME"] = "Operations Under Pressure"
os.environ["DEBUG"] = "false"
os.environ["ENVIRONMENT"] = "test"

from alembic import command
from alembic.config import Config

from app.core.security import create_access_token, hash_password
from app.db.session import close_db_engine, get_engine, get_session_factory
from app.main import app
from app.models import Membership, Team, User, WorkItem
from app.models.enums import ItemType, Priority, Role, Status

BACKEND_DIR = Path(__file__).resolve().parent.parent
PASSWORD = "correct-horse-battery"
# Argon2 is deliberately slow; hash once and reuse for every fixture user.
PASSWORD_HASH = hash_password(PASSWORD)


def alembic_config() -> Config:
    return Config(str(BACKEND_DIR / "alembic.ini"))


def _ensure_test_database_exists() -> None:
    """Create the (already name-checked) test database if it is missing, so `uv run pytest` works
    on a fresh checkout without a manual `createdb` step."""
    import asyncpg

    url = make_url(TEST_DATABASE_URL)

    async def _create() -> None:
        try:
            conn = await asyncpg.connect(
                user=url.username,
                password=url.password,
                host=url.host,
                port=url.port,
                database=url.database,
            )
        except asyncpg.InvalidCatalogNameError:
            admin = await asyncpg.connect(
                user=url.username,
                password=url.password,
                host=url.host,
                port=url.port,
                database="postgres",
            )
            try:
                await admin.execute(f'CREATE DATABASE "{url.database}"')
            finally:
                await admin.close()
        else:
            await conn.close()

    asyncio.run(_create())


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> None:
    """Bring the dedicated test database to the latest revision (also exercises the migration)."""
    _ensure_test_database_exists()
    command.upgrade(alembic_config(), "head")


@pytest.fixture(autouse=True)
async def clean_database(migrated_database: None) -> AsyncGenerator[None, None]:
    """Fresh data for every test. Engines are bound to the running loop, so dispose after each test."""
    await close_db_engine()
    async with get_engine().begin() as conn:
        await conn.execute(
            text(
                "TRUNCATE activity_events, comments, idempotency_keys, work_items, memberships, "
                "teams, users CASCADE"
            )
        )
    yield
    await close_db_engine()


@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
async def crash_client() -> AsyncGenerator[AsyncClient, None]:
    """Like async_client but turns unhandled server exceptions into 500 responses."""
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


# ------------------------------------------------------------------------------ world data
@dataclass
class World:
    """Two teams. alpha: viewer, member, member2, lead, admin. beta: lead_b, member_b.
    `outsider` belongs to no team; `disabled` is a deactivated alpha member."""

    team_a: Team
    team_b: Team
    users: dict[str, User] = field(default_factory=dict)

    def __getattr__(self, name: str) -> User:
        try:
            return self.users[name]
        except KeyError:
            raise AttributeError(name) from None

    @staticmethod
    def headers(user: User) -> dict[str, str]:
        token, _ = create_access_token(user.id)
        return {"Authorization": f"Bearer {token}"}

    async def make_item(self, **overrides: Any) -> WorkItem:
        values: dict[str, Any] = {
            "team_id": self.team_a.id,
            "title": "Seed item",
            "description": "",
            "type": ItemType.TASK.value,
            "priority": Priority.NORMAL.value,
            "status": Status.OPEN.value,
            "assignee_id": None,
            "created_by_id": self.member.id,
        }
        values.update(overrides)
        if values["status"] in (Status.RESOLVED.value, Status.CLOSED.value):
            from sqlalchemy import func

            values.setdefault("resolved_at", func.now())
            if values["status"] == Status.CLOSED.value:
                values.setdefault("closed_at", func.now())
        async with get_session_factory()() as session:
            item = WorkItem(**values)
            session.add(item)
            await session.commit()
            await session.refresh(item)
            return item


@pytest.fixture
async def world() -> World:
    async with get_session_factory()() as session:
        team_a, team_b = Team(name="Alpha"), Team(name="Beta")
        session.add_all([team_a, team_b])
        users: dict[str, User] = {}
        for name in (
            "viewer",
            "member",
            "member2",
            "lead",
            "admin",
            "lead_b",
            "member_b",
            "outsider",
            "disabled",
        ):
            users[name] = User(
                name=name.title(),
                email=f"{name}@example.com",
                password_hash=PASSWORD_HASH,
                is_active=name != "disabled",
            )
        session.add_all(users.values())
        await session.flush()
        memberships = [
            ("viewer", team_a, Role.VIEWER),
            ("member", team_a, Role.MEMBER),
            ("member2", team_a, Role.MEMBER),
            ("lead", team_a, Role.LEAD),
            ("admin", team_a, Role.ADMIN),
            ("disabled", team_a, Role.MEMBER),
            ("lead_b", team_b, Role.LEAD),
            ("member_b", team_b, Role.MEMBER),
        ]
        for user_name, team, role in memberships:
            session.add(
                Membership(
                    user_id=users[user_name].id, team_id=team.id, role=role.value
                )
            )
        await session.commit()
        return World(team_a=team_a, team_b=team_b, users=users)


def new_key() -> str:
    return f"key-{uuid.uuid4()}"


@pytest.fixture
def rendezvous(monkeypatch: pytest.MonkeyPatch):
    """Make a race deterministic instead of hoping requests overlap.

    ``rendezvous("pkg.module.func", parties)`` wraps ``func`` so that ``parties`` concurrent callers
    all meet at an asyncio.Barrier before any of them continues. With ``after=True`` (default) the
    barrier sits right AFTER ``func`` returns - e.g. after every request has read the item - so all
    racers hold the same stale snapshot and the outcome depends only on the database's guards
    (row locks, WHERE predicates, unique indexes), never on request timing.
    """

    def install(target: str, parties: int, *, after: bool = True) -> None:
        module_path, name = target.rsplit(".", 1)
        module = importlib.import_module(module_path)
        original = getattr(module, name)
        barrier = asyncio.Barrier(parties)

        async def wrapper(*args, **kwargs):
            if not after:
                await asyncio.wait_for(barrier.wait(), 10)
            try:
                return await original(*args, **kwargs)
            finally:
                if after:
                    await asyncio.wait_for(barrier.wait(), 10)

        monkeypatch.setattr(module, name, wrapper)

    return install
