from functools import lru_cache
from pathlib import Path

from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PROJECT_ROOT = BASE_DIR.parent


class Settings(BaseSettings):
    """Application settings validated via pydantic-settings.

    Loads from system environment variables and optional .env files.
    All variables are required without insecure default fallbacks.
    """

    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env", BASE_DIR / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

    database_url: str
    secret_key: str
    app_name: str
    debug: bool
    environment: str
    # Non-secret tuning knob; safe default so existing .env files keep working.
    access_token_expire_minutes: int = 60


@lru_cache
def get_settings() -> Settings:
    """Load and cache validated application settings.

    Raises a RuntimeError detailing missing variables if configuration is incomplete,
    without leaking sensitive secret values in traceback strings.
    """
    try:
        return Settings()
    except ValidationError as exc:
        missing_fields = [
            str(err["loc"][0]) for err in exc.errors() if err.get("type") == "missing"
        ]
        if missing_fields:
            fields_str = ", ".join(f.upper() for f in missing_fields)
            raise RuntimeError(
                f"Application configuration error: Missing required environment variable(s): {fields_str}. "
                "Ensure a valid .env file exists or required environment variables are set."
            ) from None
        raise RuntimeError(
            f"Application configuration error: Invalid configuration settings. {exc.error_count()} error(s) detected."
        ) from None
