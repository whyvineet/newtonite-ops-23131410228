import hashlib
import json
import uuid
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError
from app.models.idempotency_key import IdempotencyKey

MAX_KEY_LENGTH = 255


def validate_key(key: str | None) -> str:
    if key is None or not key.strip():
        raise BadRequestError(
            "Idempotency-Key header is required", code="idempotency_key_required"
        )
    key = key.strip()
    if len(key) > MAX_KEY_LENGTH or not key.isprintable():
        raise BadRequestError(
            "Idempotency-Key is invalid", code="idempotency_key_invalid"
        )
    return key


def hash_request(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


async def claim_key(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    endpoint: str,
    key: str,
    request_hash: str,
) -> uuid.UUID | None:
    """Try to become the one request that owns this key. Returns the row id, or None if taken.

    INSERT .. ON CONFLICT DO NOTHING on the unique (user_id, endpoint, key) index: if another
    transaction holds the same key but has not committed yet, this statement WAITS for it. When it
    commits we get no row back (key taken); if it rolls back we insert successfully. Either way two
    concurrent duplicates can never both proceed to create the resource.
    """
    stmt = (
        pg_insert(IdempotencyKey)
        .values(user_id=user_id, endpoint=endpoint, key=key, request_hash=request_hash)
        .on_conflict_do_nothing(constraint="uq_idempotency_keys_user_endpoint_key")
        .returning(IdempotencyKey.id)
    )
    return await session.scalar(stmt)


async def replay(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    endpoint: str,
    key: str,
    request_hash: str,
) -> tuple[int, dict[str, Any]]:
    """Return the stored response for an already-used key, or 409 if the payload differs."""
    record = await session.scalar(
        select(IdempotencyKey).where(
            IdempotencyKey.user_id == user_id,
            IdempotencyKey.endpoint == endpoint,
            IdempotencyKey.key == key,
        )
    )
    # A conflicting insert only returns None once the owning transaction committed, so the row
    # exists and is complete.
    if record is None or record.response_status is None or record.response_body is None:
        raise RuntimeError(
            "Idempotency record missing after a key conflict"
        )  # invariant violation -> 500
    if record.request_hash != request_hash:
        raise ConflictError(
            "This Idempotency-Key was already used with a different request payload",
            code="idempotency_key_reused",
        )
    return record.response_status, record.response_body


async def store_response(
    session: AsyncSession, *, key_id: uuid.UUID, status: int, body: dict[str, Any]
) -> None:
    await session.execute(
        update(IdempotencyKey)
        .where(IdempotencyKey.id == key_id)
        .values(response_status=status, response_body=body)
    )
