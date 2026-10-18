from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

_engine: AsyncEngine | None = None
_session_maker: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    """Lazily initialize and return the async SQLAlchemy engine."""
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(
            settings.database_url,
            echo=settings.debug,
            future=True,
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Lazily initialize and return the async session maker."""
    global _session_maker
    if _session_maker is None:
        engine = get_engine()
        _session_maker = async_sessionmaker(
            bind=engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
    return _session_maker


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session within a context-managed transaction boundary."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        yield session


async def close_db_engine() -> None:
    """Properly dispose of the async engine and its connection pool."""
    global _engine, _session_maker
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_maker = None


@asynccontextmanager
async def transaction(session: AsyncSession) -> AsyncGenerator[None, None]:
    """Explicit unit of work: commit if the block succeeds, roll everything back if it raises.

    Services wrap every state-changing operation (mutation + activity events + idempotency record)
    in one ``async with transaction(session):`` so they commit or fail together.
    """
    try:
        yield
        await session.commit()
    except Exception:
        await session.rollback()
        raise
