"""Central model registry: importing this package registers every table on ``Base.metadata``.

Alembic (``migrations/env.py``) and the tests import it so autogenerate sees all models.
"""

from app.models.activity_event import ActivityEvent
from app.models.comment import Comment
from app.models.idempotency_key import IdempotencyKey
from app.models.membership import Membership
from app.models.team import Team
from app.models.user import User
from app.models.work_item import WorkItem

__all__ = [
    "ActivityEvent",
    "Comment",
    "IdempotencyKey",
    "Membership",
    "Team",
    "User",
    "WorkItem",
]
