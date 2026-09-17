import json
import logging

from setwin.logging import JsonFormatter, correlation_id_var, setup_logging


def test_json_formatter_includes_correlation_id() -> None:
    correlation_id_var.set("corr-123")
    record = logging.LogRecord(
        name="setwin.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="hello",
        args=(),
        exc_info=None,
    )

    payload = json.loads(JsonFormatter().format(record))

    assert payload["message"] == "hello"
    assert payload["correlation_id"] == "corr-123"
    assert payload["level"] == "INFO"


def test_setup_logging_is_idempotent() -> None:
    setup_logging("INFO")
    setup_logging("DEBUG")
    root = logging.getLogger()
    assert root.level == logging.DEBUG
    assert len(root.handlers) == 1
