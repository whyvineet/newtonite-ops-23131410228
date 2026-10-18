import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError
from app.core.security import DUMMY_PASSWORD_HASH, verify_password
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
    password_hash = user.password_hash if user is not None else DUMMY_PASSWORD_HASH
    # Argon2 is CPU-heavy; keep it off the event loop.
    password_ok = await asyncio.to_thread(verify_password, password_hash, password)
    if user is None or not password_ok or not user.is_active:
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
