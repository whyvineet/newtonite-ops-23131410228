from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError
from app.core.security import decode_access_token
from app.db.session import get_db_session
from app.models.user import User

_bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_db_session)]


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    session: DbSession,
) -> User:
    """Single place where tokens are parsed. Identity comes only from the verified JWT subject;
    the user row is re-read on every request so disabling an account takes effect immediately."""
    if credentials is None:
        raise AuthenticationError("Not authenticated", code="not_authenticated")
    user_id = decode_access_token(credentials.credentials)
    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("Invalid or expired token", code="invalid_token")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
