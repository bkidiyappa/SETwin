"""Initialize local workspace directories and the database schema."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.orm import Session

from setwin import __version__
from setwin.config import Settings, get_settings
from setwin.db import MetaEntry, check_database, create_db_engine

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ALEMBIC_INI = PROJECT_ROOT / "alembic.ini"


@dataclass(frozen=True)
class InitResult:
    data_dir: str
    workspace_dir: str
    database_reachable: bool
    database_detail: str
    migrations_applied: bool
    initialized_at: str | None
    already_initialized: bool
    message: str


def initialize(settings: Settings | None = None) -> InitResult:
    settings = settings or get_settings()
    data_dir = Path(settings.data_dir)
    workspace_dir = Path(settings.workspace_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    workspace_dir.mkdir(parents=True, exist_ok=True)

    health = check_database(settings.database_url)
    if not health.reachable:
        return InitResult(
            data_dir=str(data_dir),
            workspace_dir=str(workspace_dir),
            database_reachable=False,
            database_detail=health.detail,
            migrations_applied=False,
            initialized_at=None,
            already_initialized=False,
            message="Local directories created. Database is unreachable; migrations were not applied.",
        )

    _run_migrations(settings.database_url)
    engine = create_db_engine(settings.database_url)
    now = datetime.now(timezone.utc).isoformat()
    already_initialized = False
    try:
        with Session(engine) as session:
            existing = session.get(MetaEntry, "initialized_at")
            already_initialized = existing is not None
            initialized_at = existing.value if existing is not None else now
            _upsert_meta(session, "initialized_at", initialized_at)
            _upsert_meta(session, "version", __version__)
            session.commit()
    finally:
        engine.dispose()

    message = (
        "SETwin is already initialized."
        if already_initialized
        else "SETwin initialized."
    )
    return InitResult(
        data_dir=str(data_dir),
        workspace_dir=str(workspace_dir),
        database_reachable=True,
        database_detail="reachable",
        migrations_applied=True,
        initialized_at=initialized_at,
        already_initialized=already_initialized,
        message=message,
    )


def format_init_result(result: InitResult) -> str:
    lines = [
        result.message,
        "",
        f"Data directory:   {result.data_dir}",
        f"Workspace:        {result.workspace_dir}",
        f"Database health:  {'reachable' if result.database_reachable else 'unreachable'}",
        f"Migrations:       {'applied' if result.migrations_applied else 'not applied'}",
    ]
    if result.initialized_at:
        lines.append(f"Initialized at:   {result.initialized_at}")
    if not result.database_reachable:
        lines.append(f"Database detail:  {result.database_detail}")
    return "\n".join(lines)


def _run_migrations(database_url: str) -> None:
    if not ALEMBIC_INI.exists():
        raise FileNotFoundError(f"Alembic configuration not found: {ALEMBIC_INI}")
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "head")


def _upsert_meta(session: Session, key: str, value: str) -> None:
    entry = session.get(MetaEntry, key)
    now = datetime.now(timezone.utc)
    if entry is None:
        session.add(MetaEntry(key=key, value=value, updated_at=now))
        return
    entry.value = value
    entry.updated_at = now
