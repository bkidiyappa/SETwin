from setwin.config import Settings, redact_database_url


def test_redact_database_url_hides_password() -> None:
    url = "postgresql+psycopg://setwin:super-secret@localhost:5432/setwin"
    assert redact_database_url(url) == "postgresql+psycopg://setwin:***@localhost:5432/setwin"


def test_redact_database_url_without_password() -> None:
    url = "postgresql+psycopg://localhost:5432/setwin"
    assert redact_database_url(url) == url


def test_settings_database_url_redacted(tmp_settings: Settings) -> None:
    assert "super-secret" not in tmp_settings.database_url_redacted
    assert tmp_settings.database_url_redacted.endswith("@localhost:5432/setwin")
