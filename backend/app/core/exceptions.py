"""Application errors with a predictable JSON shape: {"error": {"code": ..., "message": ...}}."""

from typing import Any


class AppError(Exception):
    status_code = 400
    default_code = "bad_request"
    default_message = "Bad request"

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.message = message or self.default_message
        self.code = code or self.default_code
        self.details = details
        super().__init__(self.message)


class BadRequestError(AppError):
    status_code = 400


class AuthenticationError(AppError):
    status_code = 401
    default_code = "not_authenticated"
    default_message = "Not authenticated"


class PermissionDeniedError(AppError):
    status_code = 403
    default_code = "forbidden"
    default_message = "You do not have permission to perform this action"


class NotFoundError(AppError):
    status_code = 404
    default_code = "not_found"
    default_message = "Resource not found"


class ConflictError(AppError):
    status_code = 409
    default_code = "conflict"
    default_message = "The request conflicts with the current state of the resource"


class UnprocessableError(AppError):
    status_code = 422
    default_code = "unprocessable"
    default_message = "The request could not be processed"
