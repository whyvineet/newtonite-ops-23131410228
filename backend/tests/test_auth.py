import uuid
from datetime import timedelta

import jwt
import pytest
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


# ------------------------------------------------------------------ Priority 0 Registration Security


async def test_registration_rejects_client_supplied_role_as_extra_field(
    async_client: AsyncClient,
) -> None:
    """A registration request attempting to supply admin, lead or another role must be rejected as an extra field."""
    for role in ("admin", "lead", "member", "viewer", "superuser"):
        response = await async_client.post(
            "/api/v1/auth/register",
            json={
                "name": "Attacker",
                "email": f"attacker-{role}@example.com",
                "password": "strong-password-123",
                "team_name": f"Hacker Team {role}",
                "role": role,
            },
        )
        assert response.status_code == 422
        errors = response.json()["detail"]
        assert any(
            "extra" in err["msg"].lower() or "role" in str(err["loc"]) for err in errors
        )


async def test_registration_cannot_join_existing_team_and_returns_conflict(
    async_client: AsyncClient, world: World
) -> None:
    """Registration must never attach an anonymous registrant to an existing team merely because the name matches."""
    response = await async_client.post(
        "/api/v1/auth/register",
        json={
            "name": "Intruder",
            "email": "intruder@example.com",
            "password": "strong-password-123",
            "team_name": "Alpha",  # Existing team Alpha
        },
    )
    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "team_already_exists"

    # Verify team Alpha's membership remains untouched
    members_res = await async_client.get(
        f"/api/v1/teams/{world.team_a.id}/members",
        headers=world.headers(world.lead),
    )
    assert members_res.status_code == 200
    members = members_res.json()
    assert not any(m["name"] == "Intruder" for m in members)


async def test_registration_creates_new_team_and_assigns_lead_role_only(
    async_client: AsyncClient,
) -> None:
    """The registrant receives the Lead role only in their own newly created team."""
    response = await async_client.post(
        "/api/v1/auth/register",
        json={
            "name": "Founder",
            "email": "  FOUNDER@company.com ",  # Should be normalized
            "password": "correct-battery-horse-99",
            "team_name": "  Brand New Team  ",
        },
    )
    assert response.status_code == 201
    token_data = response.json()
    assert "access_token" in token_data
    assert token_data["token_type"] == "bearer"

    # Check /me
    me_res = await async_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token_data['access_token']}"},
    )
    assert me_res.status_code == 200
    me = me_res.json()
    assert me["email"] == "founder@company.com"
    assert len(me["memberships"]) == 1
    membership = me["memberships"][0]
    assert membership["team_name"] == "Brand New Team"
    assert membership["role"] == "lead"
    assert "password" not in str(me)


async def test_registration_rejects_duplicate_email(
    async_client: AsyncClient, world: World
) -> None:
    response = await async_client.post(
        "/api/v1/auth/register",
        json={
            "name": "Imposter",
            "email": "lead@example.com",  # Duplicate email
            "password": "strong-password-123",
            "team_name": "Unique Team Name",
        },
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "email_already_exists"


async def test_failed_registration_leaves_no_partial_database_state(
    async_client: AsyncClient, world: World
) -> None:
    """Failed registration attempts must leave behind no partial users, teams or memberships."""
    response = await async_client.post(
        "/api/v1/auth/register",
        json={
            "name": "Ghost User",
            "email": "ghost@company.com",
            "password": "strong-password-123",
            "team_name": "Alpha",  # Conflicting team name causes rollback
        },
    )
    assert response.status_code == 409

    # Verify ghost@company.com cannot log in
    login_res = await login(async_client, "ghost@company.com", "strong-password-123")
    assert login_res.status_code == 401


def test_production_environment_rejects_unsafe_secret() -> None:
    """If ENVIRONMENT=production, reject development example secrets and fail fast."""
    from pydantic import ValidationError

    from app.core.config import Settings

    with pytest.raises(ValidationError):
        Settings(
            database_url="postgresql+asyncpg://postgres:postgres@localhost:5432/test",
            secret_key="insecure-dev-secret-key-change-in-production-32-bytes!",
            environment="production",
            app_name="Test Prod",
            debug=False,
        )

    with pytest.raises(ValidationError):
        Settings(
            database_url="postgresql+asyncpg://postgres:postgres@localhost:5432/test",
            secret_key="short",
            environment="production",
            app_name="Test Prod",
            debug=False,
        )
