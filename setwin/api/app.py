"""FastAPI application. Authorization, workflow, and audit land in later phases."""

from __future__ import annotations

import logging
import uuid

from fastapi import FastAPI, Request, Response

from setwin import __version__
from setwin.config import get_settings
from setwin.logging import set_correlation_id, setup_logging
from setwin.status import build_status

logger = logging.getLogger("setwin.api")


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings.log_level)

    application = FastAPI(
        title="SETwin",
        description="Software Engineering Twin — persistent engineering intelligence and governance.",
        version=__version__,
    )

    @application.middleware("http")
    async def correlation_id_middleware(request: Request, call_next) -> Response:
        correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())
        set_correlation_id(correlation_id)
        response = await call_next(request)
        response.headers["x-correlation-id"] = correlation_id
        return response

    @application.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "name": "SETwin", "version": __version__}

    @application.get("/status")
    def status() -> dict[str, object]:
        report = build_status()
        logger.debug("status requested")
        return report.to_dict()

    return application


app = create_app()
