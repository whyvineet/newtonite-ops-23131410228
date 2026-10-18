import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError, ConflictError
from app.core.security import hash_password, verify_password
from app.db.session import transaction
from app.models.enums import Role
from app.models.membership import Membership
from app.models.team import Team
from app.models.user import User


def normalize_email(email: str) -> str:
    return email.strip().lower()


async def authenticate(session: AsyncSession, email: str, password: str) -> User:
    """Check credentials. Unknown e-mail, bad password and disabled account give the same 401."""
    user = await session.scalar(
        select(User).where(User.email == normalize_email(email))
    )
    if user is None or not user.is_active:
        raise AuthenticationError(
            "Invalid email or password", code="invalid_credentials"
        )
    password_ok = await asyncio.to_thread(verify_password, user.password_hash, password)
    if not password_ok:
        raise AuthenticationError(
            "Invalid email or password", code="invalid_credentials"
        )
    return user


async def list_memberships(session: AsyncSession, user: User) -> list[tuple[Team, str]]:
    rows = await session.execute(
        select(Team, Membership.role)
        .join(Membership, Membership.team_id == Team.id)
        .where(Membership.user_id == user.id)
        .order_by(Team.name)
    )
    return [(team, role) for team, role in rows.all()]


async def register(
    session: AsyncSession,
    name: str,
    email: str,
    password: str,
    team_name: str = "Platform Ops",
    role: Role = Role.LEAD,
) -> User:
    normalized = normalize_email(email)
    existing = await session.scalar(select(User).where(User.email == normalized))
    if existing is not None:
        raise ConflictError(
            "An account with this email already exists", code="email_already_exists"
        )

    password_hash = await asyncio.to_thread(hash_password, password)
    async with transaction(session):
        user = User(
            name=name.strip(),
            email=normalized,
            password_hash=password_hash,
            is_active=True,
        )
        session.add(user)
        await session.flush()

        clean_team_name = team_name.strip()
        team = await session.scalar(select(Team).where(Team.name == clean_team_name))
        if team is None:
            team = Team(name=clean_team_name)
            session.add(team)
            await session.flush()

        membership = Membership(user_id=user.id, team_id=team.id, role=role.value)
        session.add(membership)

    return user
