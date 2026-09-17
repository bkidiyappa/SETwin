from datetime import datetime, timezone

from setwin.bootstrap import format_init_result, initialize
from setwin.db import DatabaseHealth, MetaEntry


class _FakeResult:
    def __init__(self, existing: MetaEntry | None) -> None:
        self.existing = existing
        self.added: list[object] = []
        self.committed = False

    def get(self, _model, key: str):
        if self.existing is not None and key == "initialized_at":
            return self.existing
        return None

    def add(self, obj: object) -> None:
        self.added.append(obj)

    def commit(self) -> None:
        self.committed = True

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None


class _FakeEngine:
    def dispose(self) -> None:
        return None


def test_init_is_idempotent_when_already_initialized(tmp_settings, monkeypatch) -> None:
    existing = MetaEntry(
        key="initialized_at",
        value="2026-01-01T00:00:00+00:00",
        updated_at=datetime.now(timezone.utc),
    )
    fake_session = _FakeResult(existing)

    monkeypatch.setattr(
        "setwin.bootstrap.check_database",
        lambda _url: DatabaseHealth(reachable=True, detail="reachable"),
    )
    monkeypatch.setattr("setwin.bootstrap._run_migrations", lambda _url: None)
    monkeypatch.setattr("setwin.bootstrap.create_db_engine", lambda _url: _FakeEngine())
    monkeypatch.setattr("setwin.bootstrap.Session", lambda _engine: fake_session)

    result = initialize(tmp_settings)

    assert result.already_initialized is True
    assert result.migrations_applied is True
    assert result.initialized_at == "2026-01-01T00:00:00+00:00"
    assert tmp_settings.data_dir.exists()
    assert "already initialized" in result.message.lower()
    assert "super-secret" not in format_init_result(result)
