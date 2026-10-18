import os
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient

# Establish explicit test-only configuration before importing any application modules.
# This ensures test collection and execution do not depend on a developer's real secret,
# an existing local .env file, or a live PostgreSQL database.
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/test_newtonite",
)
os.environ.setdefault(
    "SECRET_KEY",
    "test-secret-key-at-least-32-bytes-long-for-testing",
)
os.environ.setdefault("APP_NAME", "Operations Under Pressure")
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("ENVIRONMENT", "test")

from app.main import app


@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
