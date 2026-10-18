from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PROJECT_ROOT = BASE_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env", BASE_DIR / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str
    secret_key: str
    app_name: str
    debug: bool
    environment: str


settings = Settings()
