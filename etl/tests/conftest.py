import pytest


def pytest_addoption(parser):
    parser.addoption("--offline", action="store_true", help="skip tests that need to download source files")


@pytest.fixture
def offline(request):
    return request.config.getoption("--offline")


@pytest.fixture(autouse=True)
def _no_polite_waits(monkeypatch):
    """Tests never wait for download spacing or 429/503 retries (etl.core.polite_get), and start with no host history."""
    from etl import core

    monkeypatch.setattr(core, "_sleep", lambda s: None)
    monkeypatch.setattr(core, "_last_request", {})
    monkeypatch.setattr(core, "_gave_up", set())
