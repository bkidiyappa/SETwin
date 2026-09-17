"""Shared status report used by the CLI and HTTP API."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path

from setwin import __version__
from setwin.config import Settings, get_settings
from setwin.db import check_database, create_db_engine, read_meta


@dataclass(frozen=True)
class StatusReport:
    name: str
    version: str
    env: str
    log_level: str
    api_host: str
    api_port: int
    data_dir: str
    data_dir_exists: bool
    workspace_dir: str
    workspace_dir_exists: bool
    database_url: str
    database_reachable: bool
    database_detail: str
    initialized: bool

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def build_status(settings: Settings | None = None) -> StatusReport:
    settings = settings or get_settings()
    data_dir = Path(settings.data_dir)
    workspace_dir = Path(settings.workspace_dir)
    health = check_database(settings.database_url)
    initialized = False
    if health.reachable:
        engine = create_db_engine(settings.database_url)
        try:
            initialized = read_meta(engine, "initialized_at") is not None
        except Exception:
            initialized = False
        finally:
            engine.dispose()

    return StatusReport(
        name="SETwin",
        version=__version__,
        env=settings.env,
        log_level=settings.log_level,
        api_host=settings.api_host,
        api_port=settings.api_port,
        data_dir=str(data_dir),
        data_dir_exists=data_dir.exists(),
        workspace_dir=str(workspace_dir),
        workspace_dir_exists=workspace_dir.exists(),
        database_url=settings.database_url_redacted,
        database_reachable=health.reachable,
        database_detail=health.detail,
        initialized=initialized,
    )


def format_status(report: StatusReport) -> str:
    db_health = "reachable" if report.database_reachable else f"unreachable ({report.database_detail})"
    initialized = "yes" if report.initialized else "no"
    return "\n".join(
        [
            f"{report.name} {report.version}",
            "",
            f"Environment:      {report.env}",
            f"Log level:        {report.log_level}",
            f"API:              {report.api_host}:{report.api_port}",
            f"Data directory:   {report.data_dir} ({_exists(report.data_dir_exists)})",
            f"Workspace:        {report.workspace_dir} ({_exists(report.workspace_dir_exists)})",
            f"Database:         {report.database_url}",
            f"Database health:  {db_health}",
            f"Initialized:      {initialized}",
        ]
    )


def _exists(value: bool) -> str:
    return "exists" if value else "missing"
