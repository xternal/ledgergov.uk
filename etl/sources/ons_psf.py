"""
ONS Public sector finances, UK: monthly outturn from the PUSF time-series dataset.

One request per run: the whole PUSF dataset as CSV (every CDID in the release,
so all series share one vintage). The CDIDs below were checked against the
titles in that file (release of 22 Sep 2026, data to August 2026) and parse()
refuses to run if ONS changes a title, so a redefinition cannot slip through.

Definitions (all "excluding public sector banks"; since NatWest left the public
sector in May 2024 the "ex" and "inc" measures are identical month by month):

    DZLS  PSNB ex, £m. Positive = borrowing. (J5II is the same series with the
          net-lending sign, so it is NOT used.)
    JW2O  Public sector current receipts ex PS banks (PSCR), £m.
    KX5Q  Total managed expenditure ex PS banks, £m. KX5Q - JW2O = DZLS exactly.
    NMFX  Central government interest payable, £m: the bulletin's "central
          government debt interest payable". Gross of the APF: it includes the
          coupons paid on gilts the APF holds and excludes the Bank Rate the APF
          pays on reserves.
    MDD8  BoE Asset Purchase Facility net interest receivable, £m (coupons
          received minus interest paid on its BoE loan; negative since late 2022).
    HF6W  PSND ex, £bn, end of month level.
    HF6X  PSND ex as % of GDP (GDP is a 12-month total centred on the month,
          partly OBR forecast), end of month.

spending.debt_interest follows the OBR definition in core.SERIES ("net of APF"):
NMFX - MDD8. For 2024-25 that gives 105.6bn against 105.7bn in OBR March 2026
table 6.16 ("Total CG debt interest (net of APF)"), so the derivation matches
OBR's measure; ONS does not publish it as one series, hence quality "approx".

Fiscal-year flows are sums of the 12 published months April-March (the
bulletin's own financial-year figures are the same sums, e.g. PSNB 2025-26
£134.3bn). Stocks (PSND) are the end-March level. Only complete years from
FIRST_FY are emitted; ONS revises the latest months every release.

The release (SOURCE.release, for pages that link a number to it): the ONS release
calendar entry for the newest month in the file, as JSON
(https://www.ons.gov.uk/releases/publicsectorfinancesukaugust2026/data), gives the
moment it was published (2026-09-22T06:00Z, 07:00 BST) and its bulletin; the next
month's entry gives the next release's time (2026-10-21T06:00Z). Both are checked
against the CSV (title, release date, "Next release" row). If the calendar does not
answer, the data still loads and the release keeps its date, without a time.
"""

from __future__ import annotations

import calendar
import csv
import io
import json
import logging
import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

import httpx

from etl.core import Observation, RawArtifact, Release, Source, download, fiscal_year, links

log = logging.getLogger(__name__)

SOURCE = Source(
    id="ons_psf",
    title="ONS Public sector finances, UK (PUSF time series dataset)",
    publisher="ONS",
    url="https://www.ons.gov.uk/economy/governmentpublicsectorandtaxes/publicsectorfinance/datasets/publicsectorfinances",
    licence="OGL v3",
    cadence_days=31,
    grace_days=10,
)

CSV_URL = (
    "https://www.ons.gov.uk/file?uri=/economy/governmentpublicsectorandtaxes/"
    "publicsectorfinance/datasets/publicsectorfinances/current/pusf.csv"
)

ONS = "https://www.ons.gov.uk"
# Release calendar entry and bulletin of the release whose newest month is <month><year>, e.g. "august2026".
CALENDAR = ONS + "/releases/publicsectorfinancesuk{slug}"
BULLETIN = ONS + "/economy/governmentpublicsectorandtaxes/publicsectorfinance/bulletins/publicsectorfinances/{slug}"
RELEASE_NAME = "release.json"
NEXT_RELEASE_NAME = "next_release.json"
UK = ZoneInfo("Europe/London")

FIRST_FY = 2019          # 2019-20
MONTHLY_FROM = "2019-04"  # monthly psf.* series start with the first fiscal year emitted

# CDID -> (expected ONS title, unit of the CSV values, kind of measure)
CDIDS = {
    "DZLS": ("Public sector net borrowing, excluding public sector banks (£ million)", "gbp_m", "flow"),
    "JW2O": ("PS: exc PS Banks: Total current receipts: £m CPNSA", "gbp_m", "flow"),
    "KX5Q": ("PS: exc PS Banks: Total managed expenditure: £m CPNSA", "gbp_m", "flow"),
    "NMFX": ("CG: Current expenditure: Net Interest payable: £m CPNSA", "gbp_m", "flow"),
    "MDD8": ("BoE: Asset Purchase Facility: Net interest receivable: £m CPNSA", "gbp_m", "flow"),
    "HF6W": ("PS: Net Debt (excluding public sector banks): £bn: CPNSA", "gbp_bn", "level"),
    "HF6X": ("PS: Net Debt (excluding public sector banks) as a % of GDP: NSA", "pct_gdp", "level"),
}

# Monthly series: series_id -> (CDID, unit)
MONTHLY = {
    "psf.psnb_ex": ("DZLS", "gbp_bn"),
    "psf.pscr_ex": ("JW2O", "gbp_bn"),
    "psf.tme_ex": ("KX5Q", "gbp_bn"),
    "psf.cg_debt_interest": ("NMFX", "gbp_bn"),
    "psf.apf_net_interest_receivable": ("MDD8", "gbp_bn"),
    "psf.psnd_ex": ("HF6W", "gbp_bn"),
    "psf.psnd_ex_pct_gdp": ("HF6X", "pct_gdp"),
}

# Fiscal-year flows: series_id -> CDID (sum of April-March)
FY_FLOWS = {
    "fiscal.psnb": "DZLS",
    "receipts.total": "JW2O",
    "spending.tme": "KX5Q",
    "spending.cg_interest_payable": "NMFX",
}
# Fiscal-year stocks: series_id -> (CDID, unit), end-March value
FY_STOCKS = {
    "fiscal.psnd": ("HF6W", "gbp_bn"),
    "fiscal.psnd_pct_gdp": ("HF6X", "pct_gdp"),
}

MONTHS = {m: i for i, m in enumerate(["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], 1)}

NOTES = {
    "fiscal.psnb": "Public sector net borrowing excluding public sector banks (PSNB ex)",
    "receipts.total": "Public sector current receipts excluding public sector banks",
    "spending.tme": "Total managed expenditure excluding public sector banks",
    "spending.cg_interest_payable": (
        "Central government interest payable as ONS headlines it; gross of the APF (includes coupons on gilts held "
        "by the APF, excludes the APF's interest on reserves), so NOT the OBR 'net of APF' measure"
    ),
}


# ------------------------------------------------------------------ fetch


def fetch(since: date | None = None) -> list[RawArtifact]:
    """
    Download the current PUSF CSV, then the release calendar entries of this release and the next
    (three requests; each cached 20 h). `since` is unused: ONS replaces the file monthly.
    """
    try:
        raw = download(SOURCE.id, CSV_URL, "pusf.csv")
    except httpx.HTTPStatusError:
        # The "current" path has been stable for years; if it moves, find it on the dataset page.
        page = download(SOURCE.id, SOURCE.url, "pusf_dataset_page.html")
        found = links(page.path.read_text(errors="replace"), SOURCE.url, r"pusf\.csv$")
        if not found:
            raise
        raw = download(SOURCE.id, found[0], "pusf.csv")
    rows = _read_rows(raw)
    raw.vintage = vintage_for(release_date(rows))
    raws = [raw]
    latest = latest_month(rows)
    for name, month in ((RELEASE_NAME, latest), (NEXT_RELEASE_NAME, _next_month(latest))):
        url = CALENDAR.format(slug=_slug(month)) + "/data"
        try:
            raws.append(download(SOURCE.id, url, name, vintage=raw.vintage))
        except httpx.HTTPError as e:
            log.warning("ONS release calendar %s: %s; the release is linked without its time", url, e)
    return raws


# ------------------------------------------------------------------ parse


def _read_rows(raw: RawArtifact) -> list[list[str]]:
    text = raw.path.read_bytes().decode("utf-8-sig", errors="replace")
    return list(csv.reader(io.StringIO(text)))


def _meta_row(rows: list[list[str]], label: str) -> list[str]:
    for r in rows[:20]:
        if r and r[0].strip().lower() == label.lower():
            return r
    raise ValueError(f"PUSF CSV: no {label!r} row")


def release_date(rows: list[list[str]]) -> date:
    cdids = _meta_row(rows, "CDID")
    released = _meta_row(rows, "Release Date")
    col = cdids.index("DZLS")
    return datetime.strptime(released[col].strip(), "%d-%m-%Y").date()


def vintage_for(released: date) -> str:
    return f"PSF-{released:%Y-%m}"


def latest_month(rows: list[list[str]]) -> str:
    """The newest month of borrowing (DZLS) in the file, "YYYY-MM": the month the release is named after."""
    months = read_series(rows)["DZLS"]
    if not months:
        raise ValueError("PUSF CSV: no monthly values for DZLS")
    return max(months)


def _next_month(period: str) -> str:
    y, m = int(period[:4]), int(period[5:7])
    return f"{y + m // 12}-{m % 12 + 1:02d}"


def _slug(period: str) -> str:
    """2026-08 -> august2026, as ONS names the release and its bulletin."""
    return f"{calendar.month_name[int(period[5:7])].lower()}{period[:4]}"


def release_title(period: str) -> str:
    return f"Public sector finances, UK: {calendar.month_name[int(period[5:7])]} {period[:4]}"


def _calendar_entry(raw: RawArtifact) -> dict | None:
    try:
        entry = json.loads(raw.path.read_text())
    except ValueError:
        log.warning("ONS release calendar %s is not JSON; the release is linked without its time", raw.url)
        return None
    return entry if isinstance(entry, dict) else None


def _calendar_moment(entry: dict, title: str) -> tuple[datetime, dict] | None:
    """The release time from a calendar entry, if the entry is the named, not cancelled release."""
    d = entry.get("description") or {}
    if d.get("title") != title or d.get("cancelled"):
        return None
    try:
        at = datetime.fromisoformat(str(d.get("release_date", "")).replace("Z", "+00:00"))
    except ValueError:
        return None
    return (at, d) if at.tzinfo else None


def read_release(rows: list[list[str]], entry: dict | None, next_entry: dict | None) -> Release:
    """
    The release this file came from. Title, bulletin and calendar addresses follow from its newest month; the
    calendar entries add the time and the bulletin ONS links, and are used only if they describe this release.
    """
    period = latest_month(rows)
    title = release_title(period)
    released = release_date(rows)
    try:
        next_text = _meta_row(rows, "Next release")[_meta_row(rows, "CDID").index("DZLS")]
        next_on = datetime.strptime(next_text.strip(), "%d %B %Y").date()
    except (ValueError, IndexError):
        next_on = None
    release = Release(title=title, url=BULLETIN.format(slug=_slug(period)), calendar_url=CALENDAR.format(slug=_slug(period)), next_on=next_on)

    found = _calendar_moment(entry, title) if entry else None
    if found and found[0].astimezone(UK).date() == released and found[1].get("published"):
        release.released_at = found[0]
        bulletins = [ONS + doc["uri"] for doc in (entry.get("related_documents") or [])
                     if doc.get("title") == title and "/bulletins/" in doc.get("uri", "")]
        if bulletins:
            release.url = bulletins[0]
    elif entry:
        log.warning("ONS release calendar does not describe %r released %s; the release is linked without its time", title, released)

    nxt = _calendar_moment(next_entry, release_title(_next_month(period))) if next_entry else None
    if nxt and next_on and nxt[0].astimezone(UK).date() == next_on:
        release.next_at = nxt[0]
    return release


def _norm(s: str) -> str:
    return " ".join(s.split()).lower()


def read_series(rows: list[list[str]]) -> dict[str, dict[str, float]]:
    """{CDID: {"YYYY-MM": value as published}} for the CDIDs this module uses, after checking their titles."""
    titles = _meta_row(rows, "Title")
    cdids = _meta_row(rows, "CDID")
    cols: dict[str, int] = {}
    for cdid, (title, _unit, _kind) in CDIDS.items():
        if cdid not in cdids:
            raise ValueError(f"PUSF CSV: CDID {cdid} missing")
        i = cdids.index(cdid)
        if _norm(titles[i]) != _norm(title):
            raise ValueError(f"PUSF CSV: CDID {cdid} is now titled {titles[i]!r}, expected {title!r}; check the definition")
        cols[cdid] = i
    out: dict[str, dict[str, float]] = {c: {} for c in cols}
    for r in rows:
        if not r:
            continue
        m = re.fullmatch(r"(\d{4}) ([A-Z]{3})", r[0].strip())
        if not m:
            continue
        period = f"{m.group(1)}-{MONTHS[m.group(2)]:02d}"
        for cdid, i in cols.items():
            v = r[i].strip() if i < len(r) else ""
            if v not in ("", "x", "[x]", ".."):
                out[cdid][period] = float(v)
    return out


def _to_unit(cdid: str, value: float) -> float:
    return value / 1000.0 if CDIDS[cdid][1] == "gbp_m" else value


def _fy_of(period: str) -> int:
    y, m = int(period[:4]), int(period[5:7])
    return y if m >= 4 else y - 1


def _fy_months(start: int) -> list[str]:
    return [f"{start}-{m:02d}" for m in range(4, 13)] + [f"{start + 1}-{m:02d}" for m in range(1, 4)]


def parse(raws: list[RawArtifact]) -> list[Observation]:
    raws = raws if isinstance(raws, list) else [raws]
    raw = raws[0]
    rows = _read_rows(raw)
    released = release_date(rows)
    vintage = raw.vintage or vintage_for(released)
    SOURCE.published_on = released
    entries = {r.path.name: _calendar_entry(r) for r in raws[1:] if r.path.name in (RELEASE_NAME, NEXT_RELEASE_NAME)}
    SOURCE.release = read_release(rows, entries.get(RELEASE_NAME), entries.get(NEXT_RELEASE_NAME))
    series = read_series(rows)

    def obs(series_id: str, period: str, value: float, unit: str, quality: str = "sourced", note: str | None = None) -> Observation:
        return Observation(series_id=series_id, period=period, value=value, unit=unit, kind="outturn",
                           source_id=SOURCE.id, vintage=vintage, quality=quality, method_note=note)

    out: list[Observation] = []

    # Monthly series as published (flows converted from £m to £bn).
    for sid, (cdid, unit) in MONTHLY.items():
        for period, v in sorted(series[cdid].items()):
            if period >= MONTHLY_FROM:
                out.append(obs(sid, period, _to_unit(cdid, v), unit))
    # Monthly debt interest net of APF (OBR definition), derived.
    for period in sorted(series["NMFX"]):
        if period >= MONTHLY_FROM and period in series["MDD8"]:
            v = (series["NMFX"][period] - series["MDD8"][period]) / 1000.0
            out.append(obs("psf.cg_debt_interest_net_apf", period, v, "gbp_bn", "approx",
                           "ONS NMFX (CG interest payable) minus MDD8 (APF net interest receivable): debt interest net of APF, OBR definition."))

    # Complete fiscal years only.
    starts = sorted({_fy_of(p) for p in series["DZLS"]})
    for start in starts:
        if start < FIRST_FY:
            continue
        months = _fy_months(start)
        if not all(m in series[c] for m in months for c in ("DZLS", "JW2O", "KX5Q", "NMFX", "MDD8")):
            continue
        fy = fiscal_year(start)
        span = f"April {start} to March {start + 1}"
        for sid, cdid in FY_FLOWS.items():
            total = sum(series[cdid][m] for m in months) / 1000.0
            out.append(obs(sid, fy, total, "gbp_bn", "sourced",
                           f"{NOTES[sid]}. Sum of the 12 monthly values of ONS CDID {cdid}, {span}, £m / 1000."))
        nmfx = sum(series["NMFX"][m] for m in months)
        apf = sum(series["MDD8"][m] for m in months)
        out.append(obs("spending.debt_interest", fy, (nmfx - apf) / 1000.0, "gbp_bn", "approx",
                       f"Central government debt interest net of the APF (OBR definition): ONS CG interest payable (NMFX, "
                       f"{nmfx / 1000:.1f}bn) minus APF net interest receivable (MDD8, {apf / 1000:.1f}bn), summed {span}."))
        for sid, (cdid, unit) in FY_STOCKS.items():
            end = f"{start + 1}-03"
            if end in series[cdid]:
                what = "PSND ex, £bn" if unit == "gbp_bn" else "PSND ex as % of GDP (ONS GDP centred on March)"
                out.append(obs(sid, fy, _to_unit(cdid, series[cdid][end]), unit, "sourced",
                               f"{what}: end-March {start + 1} value of ONS CDID {cdid}."))
    return out
