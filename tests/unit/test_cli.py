from typer.testing import CliRunner

from setwin import __version__
from setwin.cli import app

runner = CliRunner()


def test_help_lists_foundation_commands() -> None:
    result = runner.invoke(app, ["--help"])

    assert result.exit_code == 0
    assert "status" in result.stdout
    assert "init" in result.stdout
    assert "serve" in result.stdout


def test_version() -> None:
    result = runner.invoke(app, ["--version"])

    assert result.exit_code == 0
    assert __version__ in result.stdout


def test_status_command_hides_secrets(tmp_settings, unreachable_database) -> None:
    result = runner.invoke(app, ["status"])

    assert result.exit_code == 0
    assert "SETwin" in result.stdout
    assert "super-secret" not in result.stdout
    assert "***" in result.stdout
    assert "unreachable" in result.stdout


def test_init_creates_directories_when_database_is_down(tmp_settings, unreachable_database) -> None:
    result = runner.invoke(app, ["init"])

    assert result.exit_code == 1
    assert tmp_settings.data_dir.exists()
    assert tmp_settings.workspace_dir.exists()
    assert "Database is unreachable" in result.stdout
    assert "super-secret" not in result.stdout
