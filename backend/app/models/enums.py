from enum import StrEnum


class Role(StrEnum):
    VIEWER = "viewer"
    MEMBER = "member"
    LEAD = "lead"
    ADMIN = "admin"


class ItemType(StrEnum):
    INCIDENT = "incident"
    CUSTOMER_ISSUE = "customer_issue"
    PAYMENT = "payment"
    COMPLIANCE = "compliance"
    TASK = "task"


class Priority(StrEnum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class Status(StrEnum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    AWAITING_APPROVAL = "awaiting_approval"
    RESOLVED = "resolved"
    CLOSED = "closed"


class EventType(StrEnum):
    ITEM_CREATED = "item_created"
    ITEM_UPDATED = "item_updated"
    PRIORITY_CHANGED = "priority_changed"
    CLAIMED = "claimed"
    ASSIGNED = "assigned"
    STATUS_CHANGED = "status_changed"
    COMMENT_ADDED = "comment_added"


def sql_in(column: str, enum_cls: type[StrEnum]) -> str:
    """Render ``column IN ('a', 'b', ...)`` for a CHECK constraint over an enum's values."""
    values = ", ".join(f"'{member.value}'" for member in enum_cls)
    return f"{column} IN ({values})"
