import asyncio

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError, BadRequestError, ConflictError
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
) -> User:
    normalized = normalize_email(email)
    clean_team_name = team_name.strip()
    if not clean_team_name:
        raise BadRequestError("Team name cannot be empty", code="invalid_team_name")

    # Registration must never attach an anonymous registrant to an existing team.
    existing_team = await session.scalar(
        select(Team).where(Team.name == clean_team_name)
    )
    if existing_team is not None:
        raise ConflictError(
            f"A team named '{clean_team_name}' already exists",
            code="team_already_exists",
        )

    existing_user = await session.scalar(select(User).where(User.email == normalized))
    if existing_user is not None:
        raise ConflictError(
            "An account with this email already exists", code="email_already_exists"
        )

    password_hash = await asyncio.to_thread(hash_password, password)

    try:
        async with transaction(session):
            user = User(
                name=name.strip(),
                email=normalized,
                password_hash=password_hash,
                is_active=True,
            )
            session.add(user)

            team = Team(name=clean_team_name)
            session.add(team)
            await session.flush()

            # Creator becomes Lead only in their own newly created team
            membership = Membership(
                user_id=user.id, team_id=team.id, role=Role.LEAD.value
            )
            session.add(membership)
    except IntegrityError as exc:
        orig_msg = str(getattr(exc, "orig", exc)).lower()
        if "users_email" in orig_msg or "email" in orig_msg:
            raise ConflictError(
                "An account with this email already exists", code="email_already_exists"
            ) from None
        if "teams_name" in orig_msg or "team" in orig_msg:
            raise ConflictError(
                f"A team named '{clean_team_name}' already exists",
                code="team_already_exists",
            ) from None
        raise ConflictError(
            "Registration conflict occurred due to duplicate unique data",
            code="registration_conflict",
        ) from None

    return user
