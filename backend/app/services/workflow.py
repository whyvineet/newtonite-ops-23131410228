"""Workflow policy: which status changes exist and which permission each one needs."""

from typing import Any

from sqlalchemy import func

from app.core.exceptions import ConflictError
from app.models.enums import Status
from app.services.permissions import Action

# (from, to) -> action the actor must be allowed to perform. Anything not listed is rejected.
TRANSITIONS: dict[tuple[Status, Status], Action] = {
    (Status.OPEN, Status.IN_PROGRESS): Action.START_WORK,
    (Status.IN_PROGRESS, Status.AWAITING_APPROVAL): Action.SUBMIT_FOR_APPROVAL,
    (Status.AWAITING_APPROVAL, Status.RESOLVED): Action.APPROVE,
    (Status.RESOLVED, Status.CLOSED): Action.CLOSE,
}


def required_action(current: str, target: Status) -> Action:
    try:
        return TRANSITIONS[(Status(current), target)]
    except KeyError:
        raise ConflictError(
            f"Cannot move a work item from '{current}' to '{target.value}'",
            code="invalid_transition",
        ) from None


def transition_values(target: Status) -> dict[str, Any]:
    """Column values to set alongside the new status."""
    values: dict[str, Any] = {"status": target.value}
    if target is Status.RESOLVED:
        values["resolved_at"] = func.now()
    if target is Status.CLOSED:
        values["closed_at"] = func.now()
    return values
