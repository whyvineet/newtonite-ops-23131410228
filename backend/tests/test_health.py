import pytest
from httpx import AsyncClient
from pydantic import ValidationError
from pydantic_settings import SettingsConfigDict

from app.core.config import Settings


@pytest.mark.asyncio
async def test_root(async_client: AsyncClient) -> None:
    response = await async_client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert "name" in data


@pytest.mark.asyncio
async def test_health_check(async_client: AsyncClient) -> None:
    response = await async_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_missing_settings_raise_informative_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for key in ["DATABASE_URL", "SECRET_KEY", "APP_NAME", "DEBUG", "ENVIRONMENT"]:
        monkeypatch.delenv(key, raising=False)

    class IsolatedSettings(Settings):
        model_config = SettingsConfigDict(env_file=(), extra="ignore")

    with pytest.raises(ValidationError) as exc_info:
        IsolatedSettings()

    error_str = str(exc_info.value)
    assert "database_url" in error_str
    assert "secret_key" in error_str
