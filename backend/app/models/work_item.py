import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import ItemType, Priority, Status, sql_in


class WorkItem(Base):
    __tablename__ = "work_items"
    __table_args__ = (
        # DB-level backstop for "assignee must be a member of the item's team".
        # MATCH SIMPLE: the constraint is skipped while assignee_id IS NULL.
        # The service layer still validates first so users get a clean 422 instead of an FK error.
        ForeignKeyConstraint(
            ["assignee_id", "team_id"],
            ["memberships.user_id", "memberships.team_id"],
            name="fk_work_items_assignee_id_memberships",
            ondelete="RESTRICT",
        ),
        CheckConstraint(sql_in("type", ItemType), name="type_valid"),
        CheckConstraint(sql_in("priority", Priority), name="priority_valid"),
        CheckConstraint(sql_in("status", Status), name="status_valid"),
        CheckConstraint("version >= 1", name="version_positive"),
        CheckConstraint(
            "char_length(btrim(title)) BETWEEN 1 AND 200", name="title_length"
        ),
        # Once work has started somebody must own it.
        CheckConstraint(
            "status = 'open' OR assignee_id IS NOT NULL", name="started_has_assignee"
        ),
        CheckConstraint(
            "resolved_at IS NULL OR status IN ('resolved', 'closed')",
            name="resolved_at_matches_status",
        ),
        CheckConstraint(
            "closed_at IS NULL OR status = 'closed'", name="closed_at_matches_status"
        ),
        CheckConstraint(
            "status <> 'closed' OR closed_at IS NOT NULL", name="closed_has_timestamp"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("teams.id", ondelete="RESTRICT")
    )
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(
        Text, default="", server_default=text("''")
    )
    type: Mapped[str] = mapped_column(String(32))
    priority: Mapped[str] = mapped_column(String(16), default=Priority.NORMAL.value)
    status: Mapped[str] = mapped_column(String(32), default=Status.OPEN.value)
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT")
    )
    due_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    version: Mapped[int] = mapped_column(Integer, default=1, server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


# Indexes follow the real query shapes (keyset pagination: created_at DESC, id DESC).
# 1. Team-scoped list, optionally filtered by status.
Index(
    "ix_work_items_team_status_created",
    WorkItem.team_id,
    WorkItem.status,
    WorkItem.created_at.desc(),
    WorkItem.id.desc(),
)
Index(
    "ix_work_items_team_created",
    WorkItem.team_id,
    WorkItem.created_at.desc(),
    WorkItem.id.desc(),
)
# 2. "Assigned to me" (partial: most rows may be unassigned).
Index(
    "ix_work_items_assignee_created",
    WorkItem.assignee_id,
    WorkItem.created_at.desc(),
    WorkItem.id.desc(),
    postgresql_where=text("assignee_id IS NOT NULL"),
)
# 3. Urgent + unassigned dashboard view.
Index(
    "ix_work_items_urgent_unassigned",
    WorkItem.team_id,
    WorkItem.created_at.desc(),
    WorkItem.id.desc(),
    postgresql_where=text("assignee_id IS NULL AND priority = 'urgent'"),
)
# 4. Awaiting-approval dashboard view.
Index(
    "ix_work_items_awaiting_approval",
    WorkItem.team_id,
    WorkItem.created_at.desc(),
    WorkItem.id.desc(),
    postgresql_where=text("status = 'awaiting_approval'"),
)
