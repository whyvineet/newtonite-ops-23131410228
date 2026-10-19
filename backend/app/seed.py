"""Idempotent local-development seed data.

    uv run python -m app.seed

SAFE TO RE-RUN: every row is created only if missing and nothing is ever deleted or reset.
LOCAL DEVELOPMENT ONLY: every demo account shares the publicly documented password below.
The command refuses to run when ENVIRONMENT is production-like.
"""

import asyncio
import os
import sys
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import insert, select
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


MAX_BULK_ITEMS = 200_000
_BULK_TITLES = {
    ItemType.INCIDENT: "Service alert",
    ItemType.CUSTOMER_ISSUE: "Customer escalation",
    ItemType.PAYMENT: "Payment reconciliation",
    ItemType.COMPLIANCE: "Compliance evidence request",
    ItemType.TASK: "Routine maintenance",
}
# Weighted toward open work, like a real queue.
_BULK_STATUSES = [Status.OPEN] * 3 + [
    Status.IN_PROGRESS,
    Status.AWAITING_APPROVAL,
    Status.RESOLVED,
    Status.CLOSED,
]


def _bulk_count() -> int:
    raw = os.environ.get("SEED_BULK_ITEMS", "0").strip() or "0"
    try:
        count = int(raw)
    except ValueError:
        sys.exit(f"SEED_BULK_ITEMS must be an integer, got {raw!r}")
    if not 0 <= count <= MAX_BULK_ITEMS:
        sys.exit(f"SEED_BULK_ITEMS must be between 0 and {MAX_BULK_ITEMS}")
    return count


def _guard_environment() -> None:
    environment = get_settings().environment.strip().lower()
    if environment not in _ALLOWED_ENVIRONMENTS:
        sys.exit(
            f"Refusing to seed: ENVIRONMENT={environment!r}. "
            "Demo accounts with a public password are for local development only."
        )


async def _seed(session: AsyncSession, bulk_items: int = 0) -> dict[str, int]:
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
    if bulk_items:
        created["items"] += await _seed_bulk(session, team_ids, user_ids, bulk_items)
    return created


async def _seed_bulk(
    session: AsyncSession,
    team_ids: dict[str, uuid.UUID],
    user_ids: dict[str, uuid.UUID],
    count: int,
) -> int:
    """Insert ``count`` deterministic generated items (plus their 'created' events) so pagination can
    be demonstrated at realistic volume. Ids derive from the index, so re-running adds nothing."""
    staff: dict[str, list[uuid.UUID]] = {name: [] for name in TEAMS}
    for email, (_, is_active, roles) in USERS.items():
        for team_name, role in roles.items():
            if is_active and role is not Role.VIEWER:
                staff[team_name].append(user_ids[email])

    now = datetime.now(UTC)
    types = list(ItemType)
    priorities = list(Priority)
    created = 0
    for start in range(0, count, 1000):
        rows: list[dict[str, Any]] = []
        for i in range(start, min(start + 1000, count)):
            team_name = TEAMS[i % len(TEAMS)]
            people = staff[team_name]
            item_type = types[i % len(types)]
            status = _BULK_STATUSES[i % len(_BULK_STATUSES)]
            created_at = now - timedelta(minutes=i)
            assignee = (
                people[i % len(people)] if status is not Status.OPEN or i % 2 else None
            )
            rows.append(
                {
                    "id": uuid.uuid5(_NAMESPACE, f"bulk-{i}"),
                    "team_id": team_ids[team_name],
                    "title": f"{_BULK_TITLES[item_type]} #{i + 1}",
                    "description": f"Generated demo item {i + 1}.",
                    "type": item_type.value,
                    "priority": priorities[(i // 2) % len(priorities)].value,
                    "status": status.value,
                    "assignee_id": assignee,
                    "created_by_id": people[(i + 1) % len(people)],
                    "created_at": created_at,
                    "updated_at": created_at,
                    "resolved_at": created_at
                    if status in (Status.RESOLVED, Status.CLOSED)
                    else None,
                    "closed_at": created_at if status is Status.CLOSED else None,
                }
            )
        inserted = (
            (
                await session.execute(
                    pg_insert(WorkItem)
                    .values(rows)
                    .on_conflict_do_nothing(index_elements=["id"])
                    .returning(WorkItem.id)
                )
            )
            .scalars()
            .all()
        )
        by_id = {row["id"]: row for row in rows}
        if inserted:
            await session.execute(
                insert(ActivityEvent),
                [
                    {
                        "work_item_id": item_id,
                        "actor_id": by_id[item_id]["created_by_id"],
                        "event_type": EventType.ITEM_CREATED.value,
                        "new_value": {
                            "title": by_id[item_id]["title"],
                            "status": by_id[item_id]["status"],
                            "seeded": True,
                        },
                    }
                    for item_id in inserted
                ],
            )
        created += len(inserted)
    return created


def pg_now() -> Any:
    from sqlalchemy import func

    return func.now()


async def main() -> None:
    _guard_environment()
    bulk_items = _bulk_count()
    try:
        async with get_session_factory()() as session, transaction(session):
            created = await _seed(session, bulk_items)
        print(f"Seed complete (new rows): {created}")
        print(f"Demo password for every account (LOCAL DEV ONLY): {DEMO_PASSWORD}")
    finally:
        await close_db_engine()


if __name__ == "__main__":
    asyncio.run(main())
