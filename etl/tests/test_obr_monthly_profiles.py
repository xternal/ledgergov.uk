"""
OBR monthly profiles: the March 2026 file, end to end from recorded copies (no network).

fixtures/obr_monthly_profiles holds the workbook as OBR serves it (downloaded on 2026-10-12, byte for
byte) and a verbatim slice of https://obr.uk/monthly-public-finances-briefing/ with the link to it.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import httpx
import openpyxl
import pytest

from etl import build, core
from etl.core import RawArtifact
from etl.sources import obr_monthly_profiles as mp

FIX = Path(__file__).parent / "fixtures" / "obr_monthly_profiles"
WORKBOOK = FIX / "March_2026_EFO_monthly_profiles.xlsx"
LINK = "https://obr.uk/download/march-2026-economic-and-fiscal-outlook-monthly-profiles/"
FILE = "https://obr.uk/docs/c70cb44b22c00a610/March_2026_EFO_monthly_profiles.xlsx"

# Public sector net borrowing, March 2026 EFO profile, £bn (rounded to £m), April 2026 to March 2027.
PATH = [20.941, 17.665, 16.268, -0.496, 14.778, 22.647, 16.244, 13.314, 9.804, -34.252, 4.855, 13.694]
MONTHS = [f"2026-{m:02d}" for m in range(4, 13)] + [f"2027-{m:02d}" for m in range(1, 4)]


def raw(path: Path = WORKBOOK, vintage: str | None = "EFO-2026-03") -> RawArtifact:
    return RawArtifact("obr_monthly_profiles", LINK, path, "0" * 64, "2026-10-12T00:00:00+00:00", vintage=vintage)


@pytest.fixture(autouse=True)
def keep_source(monkeypatch):
    # fetch() and parse() describe the edition they read on SOURCE; put it back afterwards.
    for attr in ("url", "title", "published_on"):
        monkeypatch.setattr(mp.SOURCE, attr, getattr(mp.SOURCE, attr))


def test_borrowing_month_by_month():
    obs = mp.parse([raw()])
    months = {o.period: o for o in obs if o.series_id == "psf.psnb_ex"}
    assert sorted(months) == MONTHS
    assert [round(months[m].value, 3) for m in MONTHS] == PATH
    [year] = [o for o in obs if o.series_id == "fiscal.psnb"]
    # The year is the March 2026 EFO's own figure for 2026-27, and the months add up to it.
    assert (year.period, round(year.value, 3)) == ("2026-27", 115.461)
    assert sum(o.value for o in months.values()) == pytest.approx(year.value, abs=1e-6)
    efo = {o.period: o.value for o in build.read_committed("obr_efo") if o.series_id == "fiscal.psnb" and o.vintage == "EFO-2026-03"}
    assert year.value == pytest.approx(efo["2026-27"], abs=1e-6)


def test_provenance():
    obs = mp.parse([raw()])
    assert {(o.kind, o.unit, o.quality, o.vintage, o.source_id) for o in obs} == {("forecast", "gbp_bn", "sourced", "EFO-2026-03", "obr_monthly_profiles")}
    assert all("March 2026 forecast" in (o.method_note or "") for o in obs)
    # The date on the notes sheet, not the "November 2026 EFO" slip in its text.
    assert mp.SOURCE.published_on == date(2026, 4, 23)


def test_the_link_and_the_title_must_agree():
    with pytest.raises(ValueError, match="the link says EFO-2025-11"):
        mp.parse([raw(vintage="EFO-2025-11")])


def _edited(tmp_path: Path, row_label: str, column: int, value) -> Path:
    wb = openpyxl.load_workbook(WORKBOOK)
    ws = wb["Monthly Profiles"]
    for row in ws.iter_rows():
        if row[1].value and " ".join(str(row[1].value).split()).lower() == row_label:
            row[column].value = value
    path = tmp_path / WORKBOOK.name
    wb.save(path)
    return path


def test_months_must_add_up_to_the_year(tmp_path):
    path = _edited(tmp_path, "public sector net borrowing", 4, 30.0)  # April
    with pytest.raises(ValueError, match="add up to"):
        mp.parse([raw(path)])


def test_a_renamed_row_fails_the_parse(tmp_path):
    path = _edited(tmp_path, "public sector net borrowing", 1, "Net borrowing")
    with pytest.raises(ValueError, match="expected one row 'public sector net borrowing', found 0"):
        mp.parse([raw(path)])


def test_newest_profiles_on_the_page():
    html = (FIX / "briefing.html").read_text()
    assert mp.find_profiles_link(html) == (LINK, "EFO-2026-03", "OBR March 2026 Economic and fiscal outlook monthly profiles")
    more = html + '<a href="https://obr.uk/download/november-2026-economic-and-fiscal-outlook-monthly-profiles/?tmstv=2">n</a>'
    assert mp.find_profiles_link(more)[:2] == ("https://obr.uk/download/november-2026-economic-and-fiscal-outlook-monthly-profiles/", "EFO-2026-11")
    with pytest.raises(ValueError, match="no '<Month YYYY> Economic and fiscal outlook monthly profiles' link"):
        mp.find_profiles_link("<a href='https://obr.uk/data/'>data</a>")


def test_fetch_end_to_end(monkeypatch, tmp_path):
    """obr.uk answering as it does to a home connection: the page, then the /download/ link redirecting to the file."""
    seen: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        seen.append(url)
        if url == mp.PAGE_URL:
            return httpx.Response(200, content=(FIX / "briefing.html").read_bytes(), headers={"content-type": "text/html; charset=UTF-8"})
        if url == LINK:
            return httpx.Response(302, headers={"location": FILE})
        if url == FILE:
            return httpx.Response(200, content=WORKBOOK.read_bytes(), headers={"content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})
        return httpx.Response(404)

    monkeypatch.setattr(core, "client", lambda: httpx.Client(transport=httpx.MockTransport(handle), follow_redirects=True))
    monkeypatch.setattr(core, "RAW_DIR", tmp_path)
    [r] = mp.fetch()
    assert (r.url, r.fetched_url, r.vintage, r.archived_at) == (LINK, FILE, "EFO-2026-03", None)
    assert seen == [mp.PAGE_URL, LINK, FILE]
    assert (mp.SOURCE.url, mp.SOURCE.title) == (LINK, "OBR March 2026 Economic and fiscal outlook monthly profiles")
    # The same observations as the committed edition.
    key = lambda o: (o.series_id, o.period, round(o.value, 6), o.kind, o.vintage, o.method_note)
    assert {key(o) for o in mp.parse([r])} == {key(o) for o in build.read_committed("obr_monthly_profiles")}


def test_fetch_asks_the_archive_when_obr_refuses(monkeypatch):
    """OBR refuses GitHub's servers: both requests must allow the Internet Archive fallback (core.download, etl/wayback.py)."""
    calls: list[tuple[str, bool]] = []

    def download(source_id, url, filename=None, *, vintage=None, archive=False, **_):
        calls.append((url, archive))
        path = FIX / ("briefing.html" if filename == mp.PAGE_NAME else WORKBOOK.name)
        return RawArtifact(source_id, url, path, "0" * 64, "2026-10-12T00:00:00+00:00", vintage=vintage)

    monkeypatch.setattr(mp, "download", download)
    mp.fetch()
    assert calls == [(mp.PAGE_URL, True), (LINK, True)]
