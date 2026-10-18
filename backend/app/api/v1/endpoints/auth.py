from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.core.security import create_access_token
from app.schemas.auth import LoginRequest, MembershipRead, MeResponse, TokenResponse
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, session: DbSession) -> TokenResponse:
    user = await auth_service.authenticate(session, payload.email, payload.password)
    token, expires_in = create_access_token(user.id)
    return TokenResponse(access_token=token, expires_in=expires_in)


@router.get("/me", response_model=MeResponse)
async def me(user: CurrentUser, session: DbSession) -> MeResponse:
    memberships = await auth_service.list_memberships(session, user)
    return MeResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        memberships=[
            MembershipRead(team_id=team.id, team_name=team.name, role=role)
            for team, role in memberships
        ],
    )
