import socket

import pytest

from setwin.config import Settings, clear_settings_cache
from setwin.db import DatabaseHealth


def postgres_listening(host: str = "127.0.0.1", port: int = 5432) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.2):
            return True
    except OSError:
        return False


@pytest.fixture
def tmp_settings(tmp_path, monkeypatch) -> Settings:
    data_dir = tmp_path / "data"
    workspace_dir = tmp_path / "workspace"
    monkeypatch.setenv("SETWIN_ENV", "test")
    monkeypatch.setenv("SETWIN_LOG_LEVEL", "INFO")
    monkeypatch.setenv(
        "SETWIN_DATABASE_URL",
        "postgresql+psycopg://setwin:super-secret@localhost:5432/setwin",
    )
    monkeypatch.setenv("SETWIN_DATA_DIR", str(data_dir))
    monkeypatch.setenv("SETWIN_WORKSPACE_DIR", str(workspace_dir))
    monkeypatch.setenv("SETWIN_API_HOST", "127.0.0.1")
    monkeypatch.setenv("SETWIN_API_PORT", "8000")
    clear_settings_cache()
    settings = Settings(
        env="test",
        log_level="INFO",
        database_url="postgresql+psycopg://setwin:super-secret@localhost:5432/setwin",
        data_dir=data_dir,
        workspace_dir=workspace_dir,
    )
    yield settings
    clear_settings_cache()


@pytest.fixture
def unreachable_database(monkeypatch) -> None:
    monkeypatch.setattr(
        "setwin.status.check_database",
        lambda _url: DatabaseHealth(reachable=False, detail="connection refused"),
    )
    monkeypatch.setattr(
        "setwin.bootstrap.check_database",
        lambda _url: DatabaseHealth(reachable=False, detail="connection refused"),
    )
