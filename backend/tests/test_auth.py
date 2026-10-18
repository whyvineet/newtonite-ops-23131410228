import uuid
from datetime import timedelta

import jwt
from httpx import AsyncClient

from app.core.security import create_access_token
from tests.conftest import PASSWORD, World


async def login(client: AsyncClient, email: str, password: str):
    return await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )


async def test_valid_login_returns_working_token(
    async_client: AsyncClient, world: World
) -> None:
    response = await login(
        async_client, "  LEAD@example.com ", PASSWORD
    )  # e-mail is normalized
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer" and body["expires_in"] > 0

    me = await async_client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert me.status_code == 200
    data = me.json()
    assert data["email"] == "lead@example.com"
    assert data["memberships"] == [
        {"team_id": str(world.team_a.id), "team_name": "Alpha", "role": "lead"}
    ]
    assert "password" not in str(data)


async def test_wrong_password_and_unknown_account_are_indistinguishable(
    async_client: AsyncClient, world: World
) -> None:
    wrong = await login(async_client, "lead@example.com", "nope")
    unknown = await login(async_client, "ghost@example.com", "nope")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert wrong.json()["error"]["code"] == "invalid_credentials"


async def test_disabled_account_cannot_log_in(
    async_client: AsyncClient, world: World
) -> None:
    response = await login(async_client, "disabled@example.com", PASSWORD)
    assert response.status_code == 401
    assert (
        response.json()["error"]["code"] == "invalid_credentials"
    )  # same message: no account oracle


async def test_disabled_account_with_valid_token_is_rejected(
    async_client: AsyncClient, world: World
) -> None:
    response = await async_client.get(
        "/api/v1/items", headers=world.headers(world.disabled)
    )
    assert response.status_code == 401


async def test_protected_routes_require_credentials(
    async_client: AsyncClient, world: World
) -> None:
    for method, url in [
        ("GET", "/api/v1/auth/me"),
        ("GET", "/api/v1/items"),
        ("POST", "/api/v1/items"),
        ("GET", "/api/v1/dashboard?view=assigned_to_me"),
        ("GET", f"/api/v1/items/{uuid.uuid4()}"),
    ]:
        response = await async_client.request(method, url)
        assert response.status_code == 401, (method, url)
        assert response.headers["www-authenticate"] == "Bearer"


async def test_expired_token_is_rejected(
    async_client: AsyncClient, world: World
) -> None:
    token, _ = create_access_token(world.lead.id, expires_delta=timedelta(seconds=-5))
    response = await async_client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_token"


async def test_invalid_and_forged_tokens_are_rejected(
    async_client: AsyncClient, world: World
) -> None:
    forged = jwt.encode(
        {"sub": str(world.lead.id), "exp": 9999999999, "iat": 1},
        "wrong-secret-key-wrong-secret-key!!",
        "HS256",
    )
    unsigned = jwt.encode(
        {"sub": str(world.lead.id), "exp": 9999999999, "iat": 1}, None, "none"
    )
    for token in ("garbage", forged, unsigned):
        response = await async_client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 401, token


async def test_client_supplied_identity_headers_are_ignored(
    async_client: AsyncClient, world: World
) -> None:
    response = await async_client.get(
        "/api/v1/auth/me", headers={"X-User-Id": str(world.lead.id), "X-Role": "admin"}
    )
    assert response.status_code == 401
