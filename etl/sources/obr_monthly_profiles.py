"""
OBR monthly profiles: the OBR's forecast for the current financial year, split into months.

After each Economic and fiscal outlook (EFO) the OBR publishes "monthly profiles consistent
with" that forecast, "to provide a reference point against which to monitor incoming data"
(the workbook's notes), on its monthly public finances page:

    https://obr.uk/monthly-public-finances-briefing/
    "March 2026 Economic and fiscal outlook monthly profiles" (xlsx, 23 April 2026), a
    /download/<month>-<yyyy>-economic-and-fiscal-outlook-monthly-profiles/ link that redirects
    to the file under /docs/.

The ONS bulletin compares each month's borrowing with this path ("£8.1 billion above the OBR
forecast" in the financial year to August 2026). The OBR calls the profiles "relatively
broad-brush and illustrative": one path, no range.

Sheet "Monthly Profiles" (found by name; rows by label, months by their header, never by cell):

    title row   "<Month YYYY> EFO forecast: Receipts and spending profiles for YYYY-YY"
                -> vintage "EFO-YYYY-MM" (the forecast the path belongs to) and the year
    header row  the twelve months "Apr" .. "Mar"; the "<Mon>YY EFO Forecast" column holds the year
    "Public sector net borrowing"
                -> psf.psnb_ex for each month (kind forecast, £bn), the measure ONS publishes as DZLS
                -> fiscal.psnb for the year (kind forecast, £bn)

The months must add up to the year, and do to the £m; the year is the EFO's own figure
(obr_efo fiscal.psnb 2026-27, EFO-2026-03: £115.46bn). The notes sheet of the April 2026 file
calls it "consistent with the November 2026 EFO", an OBR slip: its title, file name and link
all say March 2026, and it was published in April 2026. The published date is read from the
notes sheet's first cell ("…Monthly profiles\\n23 Apr 2026").

OBR refuses GitHub's servers (403); both requests then go through the Internet Archive
(etl/wayback.py), as for obr_databank and obr_efo.
"""

from __future__ import annotations

import calendar
import re
import warnings
from datetime import date, datetime
from pathlib import Path

import openpyxl

from etl.core import Observation, RawArtifact, Source, download, links

PAGE_URL = "https://obr.uk/monthly-public-finances-briefing/"
PAGE_NAME = "monthly_public_finances.html"
XLSX_NAME = "monthly_profiles.xlsx"

SOURCE = Source(
    id="obr_monthly_profiles",
    title="OBR Economic and fiscal outlook monthly profiles",
    publisher="Office for Budget Responsibility",
    url=PAGE_URL,
    licence="OGL v3",
    # Published a month or two after each EFO (spring, and autumn with the Budget): the gap from the
    # April file to the one after an autumn Budget is about eight months.
    cadence_days=275,
    grace_days=30,
)

SHEET = "monthly profiles"
ROW = "public sector net borrowing"
SERIES_MONTH = "psf.psnb_ex"
SERIES_YEAR = "fiscal.psnb"
# The months must add up to the year to this many £bn.
SUM_TOLERANCE_BN = 0.01

_MONTHS = {m.lower(): i for i, m in enumerate(calendar.month_name) if m}
_ABBR = {m.lower(): i for i, m in enumerate(calendar.month_abbr) if m}
FY_ORDER = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]
_LINK = re.compile(r"/download/([a-z]+)-(\d{4})-economic-and-fiscal-outlook-monthly-profiles/?", re.I)
_TITLE = re.compile(r"^([A-Za-z]+) (\d{4}) EFO forecast: .*profiles for (\d{4})-(\d{2})\b", re.I)
_YEAR_HEADER = re.compile(r"^[a-z]{3}\d{2} efo forecast$")  # "Mar26 EFO Forecast"
_PUBLISHED = re.compile(r"(\d{1,2}) ([A-Za-z]{3,9}) (\d{4})\s*$")


# --------------------------------------------------------------------------- fetch


def find_profiles_link(html: str) -> tuple[str, str, str]:
    """(download URL, vintage, title) of the newest monthly profiles on the OBR page, e.g. ("…/march-2026-…/", "EFO-2026-03", …)."""
    found = []
    for href in links(html, PAGE_URL, _LINK.pattern):
        m = _LINK.search(href)
        if m and m.group(1).lower() in _MONTHS:
            year, month = int(m.group(2)), _MONTHS[m.group(1).lower()]
            found.append(((year, month), href.split("?")[0]))
    if not found:
        raise ValueError(f"no '<Month YYYY> Economic and fiscal outlook monthly profiles' link on {PAGE_URL}")
    (year, month), url = max(found)
    return url, f"EFO-{year}-{month:02d}", f"OBR {calendar.month_name[month]} {year} Economic and fiscal outlook monthly profiles"


def fetch(since: date | None = None) -> list[RawArtifact]:
    """
    Find the newest monthly profiles on the OBR page and download the workbook (both cached 20 h). `since` is
    unused: each file replaces the last. OBR refuses GitHub's servers; both requests then go through the Internet Archive.
    """
    page = download(SOURCE.id, PAGE_URL, PAGE_NAME, archive=True)
    url, vintage, title = find_profiles_link(page.path.read_text(errors="replace"))
    raw = download(SOURCE.id, url, XLSX_NAME, vintage=vintage, archive=True)
    raw.vintage = vintage
    SOURCE.url, SOURCE.title = url, title
    return [raw]


# --------------------------------------------------------------------------- parse


def _label(v) -> str:
    return " ".join(str(v).split()).lower() if v is not None else ""


def _workbook(path: Path) -> dict[str, list[tuple]]:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # openpyxl: "Cannot parse header or footer"
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        try:
            return {ws.title.strip().lower(): [tuple(r) for r in ws.iter_rows(values_only=True)] for ws in wb.worksheets}
        finally:
            wb.close()


def published_on(book: dict[str, list[tuple]]) -> date | None:
    """The date on the notes sheet's title cell ("March Economic and fiscal outlook\\nMonthly profiles\\n23 Apr 2026")."""
    for row in book.get("notes", [])[:5]:
        for v in row:
            if isinstance(v, str) and "monthly profiles" in v.lower() and (m := _PUBLISHED.search(v.strip())):
                month = _ABBR.get(m.group(2)[:3].lower())
                if month:
                    return date(int(m.group(3)), month, int(m.group(1)))
    return None


def read_profile(book: dict[str, list[tuple]]) -> tuple[str, str, dict[str, float], float]:
    """(vintage, fiscal year, {"YYYY-MM": £bn}, the year in £bn) of borrowing, from the "Monthly Profiles" sheet."""
    rows = next((r for name, r in book.items() if name.startswith(SHEET)), None)
    if rows is None:
        raise ValueError(f"monthly profiles: no sheet {SHEET!r}; sheets are {list(book)}")
    titles = [m for row in rows[:5] for v in row if isinstance(v, str) and (m := _TITLE.match(v.strip()))]
    if len(titles) != 1:
        raise ValueError("monthly profiles: no title '<Month YYYY> EFO forecast: Receipts and spending profiles for YYYY-YY'")
    t = titles[0]
    if t.group(1).lower() not in _MONTHS or (int(t.group(3)) + 1) % 100 != int(t.group(4)):
        raise ValueError(f"monthly profiles: cannot read the title {t.group(0)!r}")
    vintage = f"EFO-{int(t.group(2))}-{_MONTHS[t.group(1).lower()]:02d}"
    start = int(t.group(3))
    fy = f"{start}-{t.group(4)}"

    # Header row: the twelve months in financial-year order; the year's column is headed "<Mon>YY EFO Forecast".
    month_cols: dict[int, int] = {}
    year_col = None
    for row in rows[:10]:
        cells = {c: _ABBR.get(_label(v)[:3]) for c, v in enumerate(row) if _label(v)[:3] in _ABBR and len(_label(v)) <= 4}
        if [cells[c] for c in sorted(cells)] == FY_ORDER:
            month_cols = cells
        for c, v in enumerate(row):
            if _YEAR_HEADER.match(_label(v)):
                year_col = c
    if not month_cols or year_col is None:
        raise ValueError("monthly profiles: no header row with the months April to March and the EFO forecast column")

    matches = [row for row in rows if any(_label(v) == ROW for v in row[:3])]
    if len(matches) != 1:
        raise ValueError(f"monthly profiles: expected one row {ROW!r}, found {len(matches)}")
    row = matches[0]
    values: dict[str, float] = {}
    for c, month in month_cols.items():
        v = row[c] if c < len(row) else None
        if not isinstance(v, (int, float)) or isinstance(v, bool):
            raise ValueError(f"monthly profiles: no number for {calendar.month_abbr[month]} in {ROW!r}")
        values[f"{start if month >= 4 else start + 1}-{month:02d}"] = float(v)
    year = row[year_col]
    if not isinstance(year, (int, float)):
        raise ValueError(f"monthly profiles: no number for the year in {ROW!r}")
    gap = sum(values.values()) - float(year)
    if abs(gap) > SUM_TOLERANCE_BN:
        raise ValueError(f"monthly profiles: the months of {ROW!r} add up to {gap:+.3f}bn more than the year")
    return vintage, fy, values, float(year)


def parse(raws: list[RawArtifact]) -> list[Observation]:
    raw = raws[0] if isinstance(raws, list) else raws
    book = _workbook(raw.path)
    vintage, fy, months, year = read_profile(book)
    if raw.vintage and raw.vintage != vintage:
        raise ValueError(f"monthly profiles: the link says {raw.vintage}, the workbook's title says {vintage}")
    SOURCE.published_on = published_on(book) or SOURCE.published_on
    edition = datetime.strptime(vintage[4:], "%Y-%m").strftime("%B %Y")
    month_note = f"OBR monthly profile consistent with its {edition} forecast for {fy}; the OBR calls the profiles broad-brush and illustrative."
    year_note = f"The {fy} total of the OBR's monthly profiles: its {edition} forecast for the year."

    def obs(series_id: str, period: str, value: float, note: str) -> Observation:
        return Observation(series_id=series_id, period=period, value=value, unit="gbp_bn", kind="forecast",
                           source_id=SOURCE.id, vintage=vintage, quality="sourced", method_note=note)

    return [obs(SERIES_MONTH, p, v, month_note) for p, v in sorted(months.items())] + [obs(SERIES_YEAR, fy, year, year_note)]
