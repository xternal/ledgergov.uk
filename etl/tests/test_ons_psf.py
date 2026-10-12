"""
ONS Public sector finances: parse the real PUSF CSV (downloaded once, cached 20 h), and, offline, the
release of 22 September 2026 end to end from recorded files (fixtures/ons_psf).
"""

import json
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

import httpx

from etl import build, core
from etl.core import Observation
from etl.sources import ons_psf

FYS = ["2019-20", "2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]


@pytest.fixture(scope="module")
def obs(request) -> list[Observation]:
    if request.config.getoption("--offline"):
        pytest.skip("needs the ONS PUSF download")
    raws = ons_psf.fetch(None)
    return ons_psf.parse(raws)


@pytest.fixture(scope="module")
def by(obs) -> dict[str, dict[str, Observation]]:
    d: dict[str, dict[str, Observation]] = defaultdict(dict)
    for o in obs:
        assert o.period not in d[o.series_id], f"duplicate {o.series_id} {o.period}"
        d[o.series_id][o.period] = o
    return d


def test_vintage_and_metadata(obs):
    assert {o.vintage for o in obs} == {obs[0].vintage}
    assert obs[0].vintage.startswith("PSF-20")
    assert {o.source_id for o in obs} == {"ons_psf"}
    assert {o.kind for o in obs} == {"outturn"}
    assert ons_psf.SOURCE.published_on is not None
    assert ons_psf.SOURCE.cadence_days == 31 and ons_psf.SOURCE.grace_days == 10


def test_core_fiscal_year_series_present(by):
    for sid in ["fiscal.psnb", "receipts.total", "spending.tme", "spending.debt_interest", "fiscal.psnd", "fiscal.psnd_pct_gdp"]:
        missing = [fy for fy in FYS if fy not in by[sid]]
        assert not missing, f"{sid} missing {missing}"
        # completed years only: nothing after the last full April-March year
        assert max(by[sid]) >= "2025-26"


def test_monthly_series_present(by):
    for sid in ["psf.psnb_ex", "psf.pscr_ex", "psf.tme_ex", "psf.cg_debt_interest", "psf.psnd_ex", "psf.psnd_ex_pct_gdp"]:
        periods = sorted(by[sid])
        assert periods[0] == "2019-04", sid
        assert periods[-1] >= "2026-08", sid
        assert all(len(p) == 7 and 1 <= int(p[5:]) <= 12 for p in periods)
        assert {o.unit for o in by[sid].values()} == ({"pct_gdp"} if sid.endswith("pct_gdp") else {"gbp_bn"})


def _months(fy: str) -> list[str]:
    s = int(fy[:4])
    return [f"{s}-{m:02d}" for m in range(4, 13)] + [f"{s + 1}-{m:02d}" for m in range(1, 4)]


@pytest.mark.parametrize("fy_series,monthly", [
    ("fiscal.psnb", "psf.psnb_ex"),
    ("receipts.total", "psf.pscr_ex"),
    ("spending.tme", "psf.tme_ex"),
    ("spending.debt_interest", "psf.cg_debt_interest_net_apf"),
])
def test_fiscal_year_equals_sum_of_months(by, fy_series, monthly):
    for fy in FYS:
        total = sum(by[monthly][m].value for m in _months(fy))
        assert by[fy_series][fy].value == pytest.approx(total, abs=0.05), fy


def test_stocks_are_end_march(by):
    for fy in FYS:
        end = f"{int(fy[:4]) + 1}-03"
        assert by["fiscal.psnd"][fy].value == by["psf.psnd_ex"][end].value
        assert by["fiscal.psnd_pct_gdp"][fy].value == by["psf.psnd_ex_pct_gdp"][end].value


def test_borrowing_identity(by):
    # PSNB ex = TME ex - PSCR ex, exactly in the ONS data (rounding only).
    for fy in FYS:
        gap = by["spending.tme"][fy].value - by["receipts.total"][fy].value - by["fiscal.psnb"][fy].value
        assert abs(gap) < 0.05, fy


def test_plausible_bands(by):
    for fy in FYS:
        assert 30 < by["fiscal.psnb"][fy].value < 350, fy          # 2020-21 peak ~311bn
        assert 700 < by["receipts.total"][fy].value < 1500, fy
        assert 800 < by["spending.tme"][fy].value < 1600, fy
        assert 15 < by["spending.debt_interest"][fy].value < 150, fy
        assert 1700 < by["fiscal.psnd"][fy].value < 3300, fy
        assert 75 < by["fiscal.psnd_pct_gdp"][fy].value < 110, fy
    # 2025-26 against the OBR March 2026 forecast the seed uses (PSNB 132.7, PSCR 1,235, DI 110, PSND 94.3%)
    assert 110 < by["fiscal.psnb"]["2025-26"].value < 160
    assert 1180 < by["receipts.total"]["2025-26"].value < 1290
    assert 95 < by["spending.debt_interest"]["2025-26"].value < 125
    assert 88 < by["fiscal.psnd_pct_gdp"]["2025-26"].value < 100


def test_debt_interest_definitions(by):
    # Net of APF = gross CG interest payable minus APF net interest receivable; APF has lost money since 2022-23.
    for fy in ["2022-23", "2023-24", "2024-25", "2025-26"]:
        assert by["spending.debt_interest"][fy].value > by["spending.cg_interest_payable"][fy].value
    assert by["spending.debt_interest"]["2025-26"].quality == "approx"
    assert by["spending.debt_interest"]["2025-26"].method_note
    assert by["fiscal.psnb"]["2025-26"].quality == "sourced"
    assert "Sum of the 12 monthly values" in by["fiscal.psnb"]["2025-26"].method_note


def test_title_check_rejects_redefined_cdid(tmp_path):
    rows = [
        ["Title", "something else"],
        ["CDID", "DZLS"],
        ["Release Date", "22-09-2026"],
    ]
    with pytest.raises(ValueError):
        ons_psf.read_series(rows)


# ------------------------------------------------------------------ offline: the release of 22 September 2026

FIX = Path(__file__).parent / "fixtures" / "ons_psf"
CALENDAR_AUG = "https://www.ons.gov.uk/releases/publicsectorfinancesukaugust2026/data"
CALENDAR_SEP = "https://www.ons.gov.uk/releases/publicsectorfinancesukseptember2026/data"
# Recorded on 2026-10-12 from ons.gov.uk: the release calendar entries as served, and the PUSF CSV of the
# 22 September 2026 release (sha256 541a0c2d…) cut to the seven CDIDs ons_psf reads, every row kept.
ROUTES = {
    ons_psf.CSV_URL: ("pusf_2026_09.csv", "text/csv;charset=utf-8"),
    CALENDAR_AUG: ("release_august2026.json", "application/json"),
    CALENDAR_SEP: ("release_september2026.json", "application/json"),
}


class Ons:
    """ons.gov.uk answering from the recorded files; `down` lists addresses that answer 503."""

    def __init__(self):
        self.requests: list[str] = []
        self.down: set[str] = set()

    def handle(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        self.requests.append(url)
        if url in self.down:
            return httpx.Response(503, text="Service unavailable")
        if url not in ROUTES:
            return httpx.Response(404, text="Not found")
        name, kind = ROUTES[url]
        return httpx.Response(200, content=(FIX / name).read_bytes(), headers={"content-type": kind})


@pytest.fixture
def ons(monkeypatch, tmp_path):
    site = Ons()
    monkeypatch.setattr(core, "client", lambda: httpx.Client(transport=httpx.MockTransport(site.handle), follow_redirects=True))
    monkeypatch.setattr(core, "RAW_DIR", tmp_path)
    # parse() describes the edition it read on SOURCE; put it back afterwards.
    for attr in ("published_on", "release"):
        monkeypatch.setattr(ons_psf.SOURCE, attr, getattr(ons_psf.SOURCE, attr))
    return site


def _key(o: Observation) -> tuple:
    return (o.series_id, o.period, o.geography, round(o.value, 6), o.unit, o.kind, o.vintage, o.quality, o.method_note or None)


def test_september_2026_release_end_to_end(ons):
    raws = ons_psf.fetch()
    assert [r.path.name for r in raws] == ["pusf.csv", ons_psf.RELEASE_NAME, ons_psf.NEXT_RELEASE_NAME]
    assert {r.vintage for r in raws} == {"PSF-2026-09"}
    assert ons.requests == [ons_psf.CSV_URL, CALENDAR_AUG, CALENDAR_SEP]
    obs = ons_psf.parse(raws)
    # The same observations as the committed edition, which was parsed from the full file.
    assert {_key(o) for o in obs} == {_key(o) for o in build.read_committed("ons_psf") if o.vintage == "PSF-2026-09"}
    assert ons_psf.SOURCE.published_on == date(2026, 9, 22)

    psnb = {o.period: o.value for o in obs if o.series_id == "psf.psnb_ex"}
    assert [psnb[f"2026-{m:02d}"] for m in range(4, 9)] == pytest.approx([23.401, 19.873, 13.719, 2.040, 18.268])
    assert max(psnb) == "2026-08"
    # The bulletin: "Borrowing in the financial year (FY) to August 2026 was £77.3 billion ... £2.2 billion less than in the same period last year".
    so_far = sum(psnb[f"2026-{m:02d}"] for m in range(4, 9))
    last_year = sum(psnb[f"2025-{m:02d}"] for m in range(4, 9))
    assert round(so_far, 1) == 77.3 and round(last_year - so_far, 1) == 2.2
    [fy] = [o for o in obs if o.series_id == "fiscal.psnb" and o.period == "2025-26"]
    assert fy.value == pytest.approx(134.286)


def test_release_is_read_from_the_calendar(ons):
    ons_psf.parse(ons_psf.fetch())
    r = ons_psf.SOURCE.release
    assert r.title == "Public sector finances, UK: August 2026"
    assert r.url == "https://www.ons.gov.uk/economy/governmentpublicsectorandtaxes/publicsectorfinance/bulletins/publicsectorfinances/august2026"
    assert r.calendar_url == "https://www.ons.gov.uk/releases/publicsectorfinancesukaugust2026"
    # 07:00 in London on both days (BST, UTC+1).
    assert r.released_at == datetime(2026, 9, 22, 6, 0, tzinfo=timezone.utc)
    assert r.next_on == date(2026, 10, 21)
    assert r.next_at == datetime(2026, 10, 21, 6, 0, tzinfo=timezone.utc)


def test_calendar_down_keeps_the_data(ons):
    ons.down = {CALENDAR_AUG, CALENDAR_SEP}
    raws = ons_psf.fetch()
    assert [r.path.name for r in raws] == ["pusf.csv"]
    obs = ons_psf.parse(raws)
    assert any(o.series_id == "psf.psnb_ex" and o.period == "2026-08" for o in obs)
    r = ons_psf.SOURCE.release
    # Date and addresses from the file itself; no time without the calendar.
    assert (r.title, r.released_at, r.next_on, r.next_at) == ("Public sector finances, UK: August 2026", None, date(2026, 10, 21), None)
    assert r.url.endswith("/bulletins/publicsectorfinances/august2026")


def test_calendar_for_another_release_is_not_used(ons, tmp_path):
    entry = json.loads((FIX / "release_august2026.json").read_text())
    entry["description"]["release_date"] = "2026-08-21T06:00:00.000Z"  # a different day from the CSV's release date
    rows = ons_psf._read_rows(ons_psf.fetch()[0])
    r = ons_psf.read_release(rows, entry, None)
    assert r.released_at is None and r.next_at is None
    entry["description"]["title"] = "Public sector finances, UK: July 2026"
    assert ons_psf.read_release(rows, entry, None).released_at is None


def test_month_after_december_is_january():
    assert ons_psf._next_month("2026-12") == "2027-01"
    assert ons_psf._next_month("2027-03") == "2027-04"
    assert ons_psf._slug("2027-01") == "january2027"
