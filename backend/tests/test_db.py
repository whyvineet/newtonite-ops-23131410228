import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from app.db.base import Base
from app.db.session import close_db_engine, get_engine, get_session_factory
from migrations.env import target_metadata


def test_declarative_base_is_configured() -> None:
    assert issubclass(Base, DeclarativeBase)
    assert Base.metadata is not None
    # Alembic env target_metadata must discover Base.metadata
    assert target_metadata is Base.metadata


@pytest.mark.asyncio
async def test_session_factory_initialization_and_disposal() -> None:
    engine = get_engine()
    assert isinstance(engine, AsyncEngine)

    session_maker = get_session_factory()
    session = session_maker()
    assert isinstance(session, AsyncSession)
    await session.close()

    # Verify disposal lifecycle without errors
    await close_db_engine()
