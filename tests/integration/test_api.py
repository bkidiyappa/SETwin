from fastapi.testclient import TestClient

from setwin.api.app import create_app


def test_health(tmp_settings) -> None:
    client = TestClient(create_app())
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["name"] == "SETwin"
    assert "x-correlation-id" in response.headers


def test_status_endpoint_hides_secrets(tmp_settings, unreachable_database) -> None:
    client = TestClient(create_app())
    response = client.get("/status")

    assert response.status_code == 200
    body = response.json()
    assert body["database_url"] == "postgresql+psycopg://setwin:***@localhost:5432/setwin"
    assert "super-secret" not in response.text
    assert body["database_reachable"] is False
