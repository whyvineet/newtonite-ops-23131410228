import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import Role, sql_in


class Membership(Base):
    """A user's role within one team. The composite PK is the required UNIQUE (user_id, team_id)
    and doubles as the index for "what is this user's role in this team?" lookups."""

    __tablename__ = "memberships"
    __table_args__ = (
        CheckConstraint(sql_in("role", Role), name="role_valid"),
        Index("ix_memberships_team_id", "team_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
