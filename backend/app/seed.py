"""Idempotent local-development seed data.

    uv run python -m app.seed

SAFE TO RE-RUN: every row is created only if missing and nothing is ever deleted or reset.
LOCAL DEVELOPMENT ONLY: every demo account shares the publicly documented password below.
The command refuses to run when ENVIRONMENT is production-like.
"""

import asyncio
import sys
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.session import close_db_engine, get_session_factory, transaction
from app.models.activity_event import ActivityEvent
from app.models.enums import EventType, ItemType, Priority, Role, Status
from app.models.membership import Membership
from app.models.team import Team
from app.models.user import User
from app.models.work_item import WorkItem

DEMO_PASSWORD = "demo-password-123"  # local development only - documented in the README
_ALLOWED_ENVIRONMENTS = {"development", "dev", "local", "test"}
_NAMESPACE = uuid.UUID(
    "6f1d2c1e-7a53-4a46-9f0e-0a8a3b8f6a10"
)  # stable ids for seeded items

TEAMS = ["Platform Ops", "Customer Support"]

# email -> (name, is_active, {team: role})
USERS: dict[str, tuple[str, bool, dict[str, Role]]] = {
    "alice.lead@demo.test": ("Alice Lead", True, {"Platform Ops": Role.LEAD}),
    "bob.member@demo.test": ("Bob Member", True, {"Platform Ops": Role.MEMBER}),
    "carol.admin@demo.test": ("Carol Admin", True, {"Platform Ops": Role.ADMIN}),
    "dave.viewer@demo.test": ("Dave Viewer", True, {"Platform Ops": Role.VIEWER}),
    "erin.lead@demo.test": (
        "Erin Lead",
        True,
        {"Customer Support": Role.LEAD, "Platform Ops": Role.MEMBER},
    ),
    "frank.member@demo.test": ("Frank Member", True, {"Customer Support": Role.MEMBER}),
    "grace.admin@demo.test": ("Grace Admin", True, {"Customer Support": Role.ADMIN}),
    "henry.disabled@demo.test": (
        "Henry Disabled",
        False,
        {"Platform Ops": Role.MEMBER},
    ),
}

# key, team, title, type, priority, status, assignee email, creator email
ITEMS: list[tuple[str, str, str, ItemType, Priority, Status, str | None, str]] = [
    (
        "p1",
        "Platform Ops",
        "Database failover alarm firing",
        ItemType.INCIDENT,
        Priority.URGENT,
        Status.OPEN,
        None,
        "alice.lead@demo.test",
    ),
    (
        "p2",
        "Platform Ops",
        "Rotate expiring TLS certificates",
        ItemType.TASK,
        Priority.HIGH,
        Status.IN_PROGRESS,
        "bob.member@demo.test",
        "alice.lead@demo.test",
    ),
    (
        "p3",
        "Platform Ops",
        "Payment gateway timeouts in EU",
        ItemType.PAYMENT,
        Priority.URGENT,
        Status.AWAITING_APPROVAL,
        "bob.member@demo.test",
        "bob.member@demo.test",
    ),
    (
        "p4",
        "Platform Ops",
        "Quarterly access review evidence",
        ItemType.COMPLIANCE,
        Priority.NORMAL,
        Status.RESOLVED,
        "erin.lead@demo.test",
        "carol.admin@demo.test",
    ),
    (
        "p5",
        "Platform Ops",
        "Decommission legacy queue",
        ItemType.TASK,
        Priority.LOW,
        Status.CLOSED,
        "bob.member@demo.test",
        "alice.lead@demo.test",
    ),
    (
        "p6",
        "Platform Ops",
        "Disk usage warning on batch hosts",
        ItemType.INCIDENT,
        Priority.HIGH,
        Status.OPEN,
        None,
        "bob.member@demo.test",
    ),
    (
        "s1",
        "Customer Support",
        "Customer double-charged for invoice",
        ItemType.CUSTOMER_ISSUE,
        Priority.URGENT,
        Status.OPEN,
        None,
        "frank.member@demo.test",
    ),
    (
        "s2",
        "Customer Support",
        "Refund request awaiting sign-off",
        ItemType.PAYMENT,
        Priority.HIGH,
        Status.AWAITING_APPROVAL,
        "frank.member@demo.test",
        "frank.member@demo.test",
    ),
    (
        "s3",
        "Customer Support",
        "Update GDPR deletion macro",
        ItemType.COMPLIANCE,
        Priority.NORMAL,
        Status.IN_PROGRESS,
        "frank.member@demo.test",
        "erin.lead@demo.test",
    ),
    (
        "s4",
        "Customer Support",
        "Slow response complaint triage",
        ItemType.CUSTOMER_ISSUE,
        Priority.NORMAL,
        Status.OPEN,
        None,
        "grace.admin@demo.test",
    ),
]


def _guard_environment() -> None:
    environment = get_settings().environment.strip().lower()
    if environment not in _ALLOWED_ENVIRONMENTS:
        sys.exit(
            f"Refusing to seed: ENVIRONMENT={environment!r}. "
            "Demo accounts with a public password are for local development only."
        )


async def _seed(session: AsyncSession) -> dict[str, int]:
    created = {"users": 0, "teams": 0, "memberships": 0, "items": 0}
    password_hash = hash_password(
        DEMO_PASSWORD
    )  # hashed once, never stored in plaintext

    team_ids: dict[str, uuid.UUID] = {}
    for name in TEAMS:
        team = await session.scalar(select(Team).where(Team.name == name))
        if team is None:
            team = Team(name=name)
            session.add(team)
            await session.flush()
            created["teams"] += 1
        team_ids[name] = team.id

    user_ids: dict[str, uuid.UUID] = {}
    for email, (name, is_active, roles) in USERS.items():
        user = await session.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                name=name, email=email, password_hash=password_hash, is_active=is_active
            )
            session.add(user)
            await session.flush()
            created["users"] += 1
        user_ids[email] = user.id
        for team_name, role in roles.items():
            result = await session.execute(
                pg_insert(Membership)
                .values(user_id=user.id, team_id=team_ids[team_name], role=role.value)
                .on_conflict_do_nothing()
            )
            created["memberships"] += result.rowcount or 0

    for key, team_name, title, item_type, priority, status, assignee, creator in ITEMS:
        values: dict[str, Any] = {
            "id": uuid.uuid5(_NAMESPACE, key),
            "team_id": team_ids[team_name],
            "title": title,
            "description": f"Seeded demo item: {title}.",
            "type": item_type.value,
            "priority": priority.value,
            "status": status.value,
            "assignee_id": user_ids[assignee] if assignee else None,
            "created_by_id": user_ids[creator],
        }
        if status in (Status.RESOLVED, Status.CLOSED):
            values["resolved_at"] = pg_now()
        if status is Status.CLOSED:
            values["closed_at"] = pg_now()
        result = await session.execute(
            pg_insert(WorkItem)
            .values(**values)
            .on_conflict_do_nothing(index_elements=["id"])
        )
        if result.rowcount:
            created["items"] += 1
            session.add(
                ActivityEvent(
                    work_item_id=values["id"],
                    actor_id=values["created_by_id"],
                    event_type=EventType.ITEM_CREATED.value,
                    new_value={"title": title, "status": status.value, "seeded": True},
                )
            )
    return created


def pg_now() -> Any:
    from sqlalchemy import func

    return func.now()


async def main() -> None:
    _guard_environment()
    try:
        async with get_session_factory()() as session, transaction(session):
            created = await _seed(session)
        print(f"Seed complete (new rows): {created}")
        print(f"Demo password for every account (LOCAL DEV ONLY): {DEMO_PASSWORD}")
    finally:
        await close_db_engine()


if __name__ == "__main__":
    asyncio.run(main())
