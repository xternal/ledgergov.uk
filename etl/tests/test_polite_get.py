"""polite_get: a minimum gap between requests to one host, and retries on 429/503 (ONS, 14 Nov 2026)."""

import httpx
import pytest

from etl import core


@pytest.fixture
def clock(monkeypatch):
    """A fake clock: sleeping advances it, and every sleep is recorded."""
    state = {"t": 1000.0, "slept": []}

    def sleep(s):
        state["slept"].append(round(s, 3))
        state["t"] += s

    monkeypatch.setattr(core, "_sleep", sleep)
    monkeypatch.setattr(core, "_now", lambda: state["t"])
    monkeypatch.setattr(core, "_last_request", {})
    monkeypatch.setattr(core, "_gave_up", set())
    return state


def serve(*answers):
    """A client whose server gives these (status, headers) answers in turn; returns (client, list of requested urls)."""
    seen, queue = [], list(answers)

    def handler(request):
        seen.append(str(request.url))
        status, headers = queue.pop(0) if queue else (200, {})
        return httpx.Response(status, headers=headers, content=b"ok")

    return httpx.Client(transport=httpx.MockTransport(handler)), seen


ONS = "https://www.ons.gov.uk/a"


def test_spaces_requests_to_ons_but_not_across_hosts(clock):
    http, seen = serve()
    core.polite_get(http, ONS)
    core.polite_get(http, "https://www.ons.gov.uk/b")
    core.polite_get(http, "https://example.org/c")
    assert len(seen) == 3
    assert clock["slept"] == [core.HOST_GAP_S["www.ons.gov.uk"]]


def test_429_waits_for_retry_after_then_succeeds(clock):
    http, seen = serve((429, {"Retry-After": "30"}), (200, {}))
    r = core.polite_get(http, ONS)
    assert r.status_code == 200 and len(seen) == 2
    assert clock["slept"] == [30.0]


def test_retry_after_is_capped_and_backoff_used_without_it(clock):
    http, _ = serve((429, {"Retry-After": "3600"}), (503, {}), (200, {}))
    assert core.polite_get(http, ONS).status_code == 200
    assert clock["slept"] == [core.MAX_WAIT_S, core.BACKOFF_S[1]]


def test_gives_up_after_retries_and_then_fails_fast_for_that_host(clock):
    http, seen = serve(*[(429, {})] * (core.RETRIES + 2))
    assert core.polite_get(http, ONS).status_code == 429
    assert len(seen) == core.RETRIES + 1
    clock["slept"].clear()
    assert core.polite_get(http, "https://www.ons.gov.uk/b").status_code == 429
    assert len(seen) == core.RETRIES + 2  # one request, no retries
    assert all(s <= core.HOST_GAP_S["www.ons.gov.uk"] for s in clock["slept"])


def test_403_is_not_retried(clock):
    http, seen = serve((403, {}))
    assert core.polite_get(http, "https://obr.uk/data/").status_code == 403
    assert len(seen) == 1 and clock["slept"] == []
