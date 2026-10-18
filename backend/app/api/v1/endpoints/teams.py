import uuid

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import NotFoundError
from app.models.enums import Role
from app.models.membership import Membership
from app.models.team import Team
from app.models.user import User
from app.schemas.team import TeamMemberRead, TeamRead
from app.services.permissions import Action, get_team_role, require

router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("", response_model=list[TeamRead])
async def list_my_teams(user: CurrentUser, session: DbSession) -> list[TeamRead]:
    rows = await session.execute(
        select(Team, Membership.role)
        .join(Membership, Membership.team_id == Team.id)
        .where(Membership.user_id == user.id)
        .order_by(Team.name)
    )
    return [TeamRead(id=t.id, name=t.name, role=Role(r)) for t, r in rows.all()]


@router.get("/{team_id}/members", response_model=list[TeamMemberRead])
async def list_team_members(
    team_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> list[TeamMemberRead]:
    role = await get_team_role(session, user.id, team_id)
    if role is None:
        raise NotFoundError("Team not found", code="team_not_found")
    require(Action.VIEW, role, user_id=user.id)
    rows = await session.execute(
        select(User, Membership.role)
        .join(Membership, Membership.user_id == User.id)
        .where(Membership.team_id == team_id)
        .order_by(User.name)
    )
    return [
        TeamMemberRead(user_id=u.id, name=u.name, role=Role(r), is_active=u.is_active)
        for u, r in rows.all()
    ]
