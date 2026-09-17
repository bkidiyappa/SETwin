from setwin.config import Settings
from setwin.status import build_status, format_status


def test_status_does_not_expose_database_password(tmp_settings: Settings, unreachable_database) -> None:
    report = build_status(tmp_settings)

    assert report.database_url == "postgresql+psycopg://setwin:***@localhost:5432/setwin"
    assert "super-secret" not in report.database_url
    assert report.database_reachable is False
    assert report.initialized is False
    assert "super-secret" not in format_status(report)


def test_status_reports_missing_directories(tmp_settings: Settings, unreachable_database) -> None:
    report = build_status(tmp_settings)

    assert report.data_dir_exists is False
    assert report.workspace_dir_exists is False
    assert report.name == "SETwin"
