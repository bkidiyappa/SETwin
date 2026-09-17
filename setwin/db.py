"""PostgreSQL access and health checks."""

from __future__ import annotations

import socket
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import urlsplit

from sqlalchemy import DateTime, Text, create_engine, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from setwin.config import redact_database_url

CONNECT_TIMEOUT_SECONDS = 2
TCP_PROBE_SECONDS = 0.4


class Base(DeclarativeBase):
    pass


class MetaEntry(Base):
    """Key/value metadata written during `setwin init`."""

    __tablename__ = "setwin_meta"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


@dataclass(frozen=True)
class DatabaseHealth:
    reachable: bool
    detail: str


def create_db_engine(database_url: str) -> Engine:
    return create_engine(
        database_url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": CONNECT_TIMEOUT_SECONDS},
    )


def check_database(database_url: str) -> DatabaseHealth:
    host, port = _database_host_port(database_url)
    if host and not _tcp_reachable(host, port):
        return DatabaseHealth(reachable=False, detail=f"not listening on {host}:{port}")
    try:
        engine = create_db_engine(database_url)
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        engine.dispose()
    except Exception as exc:
        return DatabaseHealth(reachable=False, detail=_safe_error(str(exc), database_url))
    return DatabaseHealth(reachable=True, detail="reachable")


def _database_host_port(database_url: str) -> tuple[str | None, int]:
    parts = urlsplit(database_url)
    return parts.hostname, parts.port or 5432


def _tcp_reachable(host: str, port: int, timeout: float = TCP_PROBE_SECONDS) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def read_meta(engine: Engine, key: str) -> str | None:
    with Session(engine) as session:
        entry = session.get(MetaEntry, key)
        return None if entry is None else entry.value


def list_meta(engine: Engine) -> dict[str, str]:
    with Session(engine) as session:
        rows = session.scalars(select(MetaEntry)).all()
        return {row.key: row.value for row in rows}


def _safe_error(message: str, database_url: str) -> str:
    redacted = redact_database_url(database_url)
    parts = database_url.split("@", 1)
    if ":" in parts[0] and "@" in database_url:
        userinfo = parts[0]
        if "://" in userinfo:
            userinfo = userinfo.split("://", 1)[1]
        if ":" in userinfo:
            password = userinfo.split(":", 1)[1]
            if password:
                message = message.replace(password, "***")
    return message.replace(database_url, redacted)
