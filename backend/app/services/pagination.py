"""Opaque keyset cursors over (created_at, id)."""

import base64
import json
import uuid
from datetime import UTC, datetime

from app.core.exceptions import BadRequestError


def encode_cursor(created_at: datetime, row_id: uuid.UUID) -> str:
    raw = json.dumps([created_at.isoformat(), str(row_id)]).encode()
    return base64.urlsafe_b64encode(raw).decode()


def decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        ts_raw, id_raw = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        if not isinstance(ts_raw, str) or not isinstance(id_raw, str):
            raise TypeError("cursor fields must be strings")
        created_at = datetime.fromisoformat(ts_raw)
        if created_at.tzinfo is None:
            raise ValueError("naive timestamp")
        return created_at.astimezone(UTC), uuid.UUID(id_raw)
    except (ValueError, TypeError, KeyError, OverflowError):
        raise BadRequestError(
            "Invalid pagination cursor", code="invalid_cursor"
        ) from None
