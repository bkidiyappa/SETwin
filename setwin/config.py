"""Application configuration loaded from environment variables."""

from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings. Secrets stay in the environment, never in Git."""

    model_config = SettingsConfigDict(
        env_prefix="SETWIN_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: str = "development"
    log_level: str = "INFO"
    database_url: str = "postgresql+psycopg://setwin:setwin@127.0.0.1:5432/setwin"
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    data_dir: Path = Field(default=Path("data"))
    workspace_dir: Path = Field(default=Path("workspace"))

    @field_validator("log_level")
    @classmethod
    def normalize_log_level(cls, value: str) -> str:
        return value.upper()

    @property
    def database_url_redacted(self) -> str:
        return redact_database_url(self.database_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()


def clear_settings_cache() -> None:
    get_settings.cache_clear()


def redact_database_url(url: str) -> str:
    """Replace the password in a database URL so it can be displayed safely."""
    parts = urlsplit(url)
    if not parts.netloc or "@" not in parts.netloc:
        return url
    userinfo, hostinfo = parts.netloc.rsplit("@", 1)
    if ":" not in userinfo:
        return url
    username, _password = userinfo.split(":", 1)
    redacted_netloc = f"{username}:***@{hostinfo}"
    return urlunsplit((parts.scheme, redacted_netloc, parts.path, parts.query, parts.fragment))
