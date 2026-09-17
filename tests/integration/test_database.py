import pytest

from setwin.bootstrap import initialize
from setwin.config import Settings
from setwin.db import check_database, list_meta
from tests.conftest import postgres_listening


@pytest.mark.integration
def test_init_and_status_against_postgres(tmp_path) -> None:
    if not postgres_listening():
        pytest.skip("PostgreSQL is not listening on localhost:5432")

    settings = Settings(
        env="test",
        database_url="postgresql+psycopg://setwin:setwin@127.0.0.1:5432/setwin",
        data_dir=tmp_path / "data",
        workspace_dir=tmp_path / "workspace",
    )
    health = check_database(settings.database_url)
    if not health.reachable:
        pytest.skip(f"PostgreSQL is not reachable: {health.detail}")

    result = initialize(settings)

    assert result.database_reachable is True
    assert result.migrations_applied is True
    assert result.initialized_at is not None
    assert settings.data_dir.exists()

    from setwin.db import create_db_engine

    engine = create_db_engine(settings.database_url)
    try:
        meta = list_meta(engine)
        assert "initialized_at" in meta
        assert "version" in meta
    finally:
        engine.dispose()
