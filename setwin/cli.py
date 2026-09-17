"""CLI-first interface. Business logic lives in shared services, not here."""

from __future__ import annotations

import logging
import uuid
from typing import Annotated

import typer
import uvicorn

from setwin import __version__
from setwin.bootstrap import format_init_result, initialize
from setwin.config import get_settings
from setwin.logging import set_correlation_id, setup_logging
from setwin.status import build_status, format_status

app = typer.Typer(
    name="setwin",
    help="SETwin - Software Engineering Twin. AI proposes. SETwin remembers. Roles review. Humans approve.",
    no_args_is_help=True,
    add_completion=False,
)

logger = logging.getLogger("setwin.cli")


def _bootstrap_runtime() -> None:
    settings = get_settings()
    setup_logging(settings.log_level)
    set_correlation_id(str(uuid.uuid4()))


def _version_callback(ctx: typer.Context, value: bool) -> None:
    if ctx.resilient_parsing:
        return
    if value:
        typer.echo(f"setwin {__version__}")
        raise typer.Exit()


@app.callback()
def main(
    version: Annotated[
        bool | None,
        typer.Option(
            "--version",
            help="Show the SETwin version and exit.",
            callback=_version_callback,
            is_eager=True,
        ),
    ] = None,
) -> None:
    """SETwin command line interface."""
    _bootstrap_runtime()


@app.command()
def status() -> None:
    """Show configuration health without exposing secrets."""
    report = build_status()
    logger.debug("status requested")
    typer.echo(format_status(report))


@app.command("init")
def init_command() -> None:
    """Create local workspace directories and apply database migrations."""
    result = initialize()
    logger.debug("init completed", extra={"initialized": not result.already_initialized})
    typer.echo(format_init_result(result))
    if not result.database_reachable:
        raise typer.Exit(code=1)


@app.command()
def serve() -> None:
    """Start the SETwin HTTP API."""
    settings = get_settings()
    logger.info("starting api", extra={"host": settings.api_host, "port": settings.api_port})
    uvicorn.run(
        "setwin.api.app:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=False,
    )
