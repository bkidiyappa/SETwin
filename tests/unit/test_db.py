from setwin.db import check_database


def test_check_database_reports_closed_port_without_leaking_password() -> None:
    health = check_database("postgresql+psycopg://setwin:super-secret@127.0.0.1:1/setwin")

    assert health.reachable is False
    assert "not listening on 127.0.0.1:1" in health.detail
    assert "super-secret" not in health.detail
