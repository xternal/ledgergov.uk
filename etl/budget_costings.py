"""
The Budget scorecard (P7): python -m etl.budget_costings

Every Budget and Spring Statement document has a table of policy decisions
("Table 5.1: Autumn Budget 2024 policy decisions (£ million)", Table 3.1 at a
Spring Statement): each new measure, numbered, with its cost or yield for every
year of the forecast, grouped under the Treasury's own headings, with totals at
the foot. This module reads that table from the document as printed (the PDF
whose pages the site links to) into data/build/budget/<event>.json, which the
scorecard page /budget/scorecard/<event> shows.

Signs are the Treasury's: Exchequer impact, so a positive figure raises money
(a tax rise or a saving) and a negative figure costs money (a tax cut or new
spending). Figures are £ million as printed. "*" is the Treasury's mark for a
negligible costing (under £2.5m either way): it is kept as printed and counts
as zero in a sum.

How it reads the table:

    record <event>   download the PDF (and the structured copy, if any),
                     extract every word with its position (poppler's
                     `pdftotext -tsv`), find the table's pages, keep those
                     words in etl/tests/fixtures/budget_costings/<event>/,
                     then build that event as below
    (no command)     build every recorded event offline: parse, check, write
                     data/build/budget/<event>.json
    --check          parse and check every recorded event and compare with
                     the committed files, writing nothing

`record` needs `pdftotext` (poppler: `brew install poppler`) and the network;
everything else runs offline from the recorded words, so tests and CI need
neither.

The parse works on positions, not on text order: the year headings fix the
figure columns, a number at the table's left edge starts a measure, the
vertical gap between rows (wider between table rows than within one) groups
a measure's wrapped name, text alone between measures is a heading, and a row
with figures but no line number is one of the Treasury's totals or memo lines.
Superscript footnote markers are told apart by their size and kept apart from
the names.

Checks (an error stops the build; nothing is published from a table that
fails one):

    lines        line numbers run 1, 2, 3... with none missing or repeated
    figures      every measure has one figure for every year, and a head (tax
                 or spend) when the table has that column
    total        the table's own total is found, and equals the total a person
                 typed from the PDF into EVENTS (printed_total)
    reconcile    the measures add up to that total within rounding: the
                 Treasury rounds each line to the nearest £5m and adds before
                 rounding, so the sum of the printed lines can differ from the
                 printed total by up to £2.5m for each line that is not zero.
                 The same for each subtotal over a range of lines
    copy         when the Treasury also publishes the table as a spreadsheet or
                 as GOV.UK HTML, every line, figure and total must match it
                 exactly: two separate readings of the same table that agree.
                 The Treasury's two versions sometimes word a line differently
                 or mark it tax in one and spend in the other (Budget 2025,
                 lines 56 and 78); a person checks the PDF and lists the line
                 in the event's `accepted`, with why. A figure that differs is
                 never accepted.

The Budget-day steps are in docs/BUDGET_DAY.md, "The scorecard".
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import logging
import re
import shutil
import statistics
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

from etl.core import BUILD_DIR, ROOT, download, normalise_fiscal_year, write_json

log = logging.getLogger(__name__)

SOURCE_ID = "hmt_policy_decisions"
OUT_DIR = BUILD_DIR / "budget"
RECORDED_DIR = ROOT / "etl" / "tests" / "fixtures" / "budget_costings"
RAW_SOURCE_ID = "budget_costings"
GOVUK_API = "https://www.gov.uk/api/content"


@dataclass(frozen=True)
class Event:
    """A fiscal event with a policy decisions table. Add one entry per event (docs/BUDGET_DAY.md, "The scorecard")."""

    id: str
    name: str
    date: str
    #: The GOV.UK page that lists the event's documents.
    page_url: str
    #: The document as printed: the PDF the table is read from and every line links to (#page=N).
    document_url: str
    document_title: str
    #: The table's own total for each year, as printed, typed from the PDF by a person: the parser must read the same.
    printed_total: tuple[int, ...]
    #: The same table published another way (the Treasury's spreadsheet, or the GOV.UK HTML page): checked line by line.
    copy_url: str | None = None
    #: Differences between the PDF and the copy that a person has looked at in the PDF and accepted, with why:
    #: {"56:name": "...", "78:head": "..."}. Only a line's wording ("name") or its tax/spend mark ("head") can be
    #: accepted; a figure that differs always stops the build. The page shows the PDF's version and lists these.
    accepted: tuple[tuple[str, str], ...] = ()


EVENTS: dict[str, Event] = {
    e.id: e
    for e in [
        Event(
            id="autumn-budget-2024",
            name="Autumn Budget 2024",
            date="2024-10-30",
            page_url="https://www.gov.uk/government/publications/autumn-budget-2024",
            document_url="https://assets.publishing.service.gov.uk/media/672b9695fbd69e1861921c63/Autumn_Budget_2024_Accessible.pdf",
            document_title="Autumn Budget 2024 (HC 295)",
            printed_total=(-24705, -39550, -35330, -36585, -38775, -32990),
            copy_url="https://assets.publishing.service.gov.uk/media/67222f364da1c0d41942a9b2/Table_5.1_-_Autumn_Budget_2024_Policy_Decisions.xlsx",
        ),
        Event(
            id="spring-statement-2025",
            name="Spring Statement 2025",
            date="2025-03-26",
            page_url="https://www.gov.uk/government/publications/spring-statement-2025-document",
            document_url="https://assets.publishing.service.gov.uk/media/67e3ec2df356a2dc0e39b488/E03274109_HMT_Spring_Statement_Mar_25_Web_Accessible_.pdf",
            document_title="Spring Statement 2025 (CP 1298)",
            printed_total=(-810, -1050, -890, -585, 2645, 6260),
            copy_url="https://www.gov.uk/government/publications/spring-statement-2025-document/spring-statement-2025-html",
        ),
        Event(
            id="autumn-budget-2025",
            name="Autumn Budget 2025",
            date="2025-11-26",
            page_url="https://www.gov.uk/government/publications/budget-2025-document",
            document_url="https://assets.publishing.service.gov.uk/media/6929b353345e31ab14ecf735/E03444720_Budget_2025_Web_Accessible.pdf",
            document_title="Budget 2025 (HC 1492)",
            printed_total=(-4125, -9315, -7445, 3425, 20535, 24110),
            copy_url="https://assets.publishing.service.gov.uk/media/69269df29fd433badebc31b3/Table_4.1_-_Budget_2025_Policy_Decisions.xlsx",
            accepted=(
                ("56:name", "The spreadsheet words this line differently from the printed table; the figures are the same."),
                ("78:head", "The printed table marks this line Spend and the spreadsheet Tax; the figures are the same."),
            ),
        ),
        Event(
            id="autumn-budget-2026",
            name="Autumn Budget 2026",
            date="2026-10-28",
            page_url="https://www.gov.uk/government/publications/budget-2026-document",
            document_url="https://assets.publishing.service.gov.uk/media/6ae1ec57bdb574cf1c9b3f12/E03668986_HMT_Budget_2026_ELAY__2_.pdf",
            document_title="Budget 2026 (HC 726)",
            printed_total=(-7595, -2475, 730, 5190, 6135, 7350),
            copy_url="https://assets.publishing.service.gov.uk/media/6ae187a2779378370fd80a9a/Table_6.1_and_6.2_Budget_2026_Policy_Decisions.xlsx",
            accepted=tuple(
                (f"{line}:name", "The spreadsheet has an internal column (\"Fiscal Head check (hide)\") next to the name, read as part of it; the printed wording and the figures are the same.")
                for line in (2, 3, 9, 16, 18, 23, 33, 34, 41, 43, 57, 73, 76, 77, 81, 83)
            )
            + (("67:name", "The spreadsheet writes \"aged 5-15\" where the printed table has \"aged 5 to 15\", and adds its internal \"Fiscal Head check\" column; the figures are the same."),),
        ),
    ]
}

# ------------------------------------------------------------------ words


@dataclass(frozen=True)
class Word:
    page: int
    left: float
    top: float
    width: float
    height: float
    text: str

    @property
    def right(self) -> float:
        return self.left + self.width

    @property
    def centre(self) -> float:
        return self.left + self.width / 2


TSV_FIELDS = ["level", "page_num", "par_num", "block_num", "line_num", "word_num", "left", "top", "width", "height", "conf", "text"]


def read_tsv(text: str) -> list[Word]:
    """Words from `pdftotext -tsv` output (level 5 rows; the page, flow and line rows are skipped)."""
    out: list[Word] = []
    for row in csv.DictReader(io.StringIO(text), delimiter="\t", quoting=csv.QUOTE_NONE):
        if row.get("level") != "5" or not row.get("text"):
            continue
        out.append(Word(int(row["page_num"]), float(row["left"]), float(row["top"]), float(row["width"]), float(row["height"]), row["text"]))
    return out


def extract_tsv(pdf: Path) -> str:
    """Every word of a PDF with its position, from poppler's pdftotext. Only `record` needs it."""
    exe = shutil.which("pdftotext")
    if not exe:
        raise RuntimeError("pdftotext not found: install poppler (macOS: brew install poppler; Debian/Ubuntu: apt install poppler-utils)")
    return subprocess.run([exe, "-tsv", str(pdf), "-"], check=True, capture_output=True, text=True).stdout


def pdftotext_version() -> str:
    exe = shutil.which("pdftotext")
    if not exe:
        return "unknown"
    r = subprocess.run([exe, "-v"], capture_output=True, text=True)
    m = re.search(r"pdftotext version (\S+)", r.stdout + r.stderr)
    return m.group(1) if m else "unknown"


# ------------------------------------------------------------------ parse

class ParseError(ValueError):
    """The table could not be read as expected. The message says where (page) and what."""


YEAR = re.compile(r"^\d{4}\s*[-–/]\s*\d{2}$")
TITLE = re.compile(r"^Table\s+(\d+(?:\.\d+)?)\s*:?\s+(.*\bpolicy decisions\b.*)$", re.I)
LINE_NO = re.compile(r"^\d{1,3}[a-z]?$")
FIGURE = re.compile(r"^([+\-−–]?)£?(\d{1,3}(?:,\d{3})+|\d+)m?$")
NEGLIGIBLE = "*"
NIL = {"-", "–", "—", "−", "nil"}
HEADS = {"tax": "tax", "spend": "spend", "spending": "spend"}
OF_WHICH = re.compile(r"^(o/w|of which)\b[:\s]*", re.I)
LINES_RANGE = re.compile(r"\(lines?\s*(\d+)\s*[-–—]\s*(\d+)\)", re.I)


def figure_value(text: str) -> tuple[int, bool] | None:
    """(£m, negligible) for a printed figure: "+1,765m" -> (1765, False), "-770m" -> (-770, False), "*" -> (0, True)."""
    t = text.strip()
    if t == NEGLIGIBLE:
        return 0, True
    if t in NIL:
        return 0, False
    m = FIGURE.match(t)
    if not m:
        return None
    value = int(m.group(2).replace(",", ""))
    return (-value if m.group(1) in "-−–" and m.group(1) else value), False


@dataclass
class Row:
    page: int
    top: float
    words: list[Word]
    supers: list[Word] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)


@dataclass
class Columns:
    years: list[str]
    centres: list[float]
    head_centre: float | None
    #: Height of the year headings' words: the table's text size.
    height: float

    @property
    def spacing(self) -> float:
        return (self.centres[-1] - self.centres[0]) / max(len(self.centres) - 1, 1)

    @property
    def figures_from(self) -> float:
        """Left edge of the figures area: half a column before the first year."""
        return self.centres[0] - 0.6 * self.spacing

    def year_of(self, w: Word) -> int | None:
        if w.centre < self.figures_from or w.centre > self.centres[-1] + 0.6 * self.spacing:
            return None
        return min(range(len(self.centres)), key=lambda i: abs(self.centres[i] - w.centre))


@dataclass
class Measure:
    line: str
    name: str
    group: str | None
    head: str | None
    page: int
    values: list[int]
    negligible: list[bool]
    of_which: bool = False
    footnotes: list[str] = field(default_factory=list)


@dataclass
class TotalRow:
    label: str
    kind: str  # total | total_tax | total_spending | subtotal | memo | other
    page: int
    values: list[int]
    negligible: list[bool]
    after_line: str | None
    lines: tuple[int, int] | None = None
    footnotes: list[str] = field(default_factory=list)


@dataclass
class Table:
    number: str
    title: str
    years: list[str]
    pages: list[int]
    has_head: bool
    groups: list[str]
    measures: list[Measure]
    totals: list[TotalRow]
    footnotes: dict[str, str]

    @property
    def total(self) -> TotalRow:
        found = [t for t in self.totals if t.kind == "total"]
        if len(found) != 1:
            raise ParseError(f"expected one total of all policy decisions, found {len(found)}")
        return found[0]


def visual_rows(words: list[Word], body: float) -> list[Row]:
    """Words of one page grouped into lines of text by their top edge; superscripts kept aside on the line they sit on."""
    normal = sorted((w for w in words if w.height >= 0.75 * body), key=lambda w: (w.top, w.left))
    small = [w for w in words if w.height < 0.75 * body]
    rows: list[Row] = []
    for w in normal:
        if rows and abs(rows[-1].top - w.top) < 0.25 * body:
            rows[-1].words.append(w)
        else:
            rows.append(Row(w.page, w.top, [w]))
    for r in rows:
        r.words.sort(key=lambda w: w.left)
    for s in small:
        # A footnote marker is raised: its top sits at or just above the top of the line it belongs to.
        near = [r for r in rows if r.top - 0.6 * body <= s.top <= r.top + 0.35 * body]
        if near:
            min(near, key=lambda r: abs(r.top - s.top)).supers.append(s)
    return rows


def _header(row: Row) -> Columns | None:
    years = [w for w in row.words if YEAR.match(w.text)]
    if len(years) < 2:
        return None
    labels = [normalise_fiscal_year(w.text) for w in years]
    if any(lb is None for lb in labels):
        return None
    head = [w for w in row.words if w.text.lower().startswith("head") and w.right <= years[0].left]
    return Columns([lb for lb in labels if lb], [w.centre for w in years], head[0].centre if head else None, statistics.median(w.height for w in years))


def _footnote_refs(row_supers: list[Word]) -> list[str]:
    refs: list[str] = []
    for s in sorted(row_supers, key=lambda w: w.left):
        refs += [x for x in re.split(r"[,\s]+", s.text) if x]
    return refs


def _join(parts: list[str]) -> str:
    """Text of wrapped lines: a line ending in a hyphen joins the next without a space ("growth-" + "enhancing")."""
    out = ""
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if out.endswith("-") and len(out) > 1 and out[-2].isalnum():
            out += p
        else:
            out = f"{out} {p}" if out else p
    # Control characters (the PDF's tabs, a stray BEL after "o/w:") and no-break spaces become ordinary spaces.
    return " ".join(re.sub(r"[\x00-\x1f\x7f\xa0]", " ", out).split())


@dataclass
class _Block:
    page: int
    rows: list[Row]
    cols: Columns
    left_edge: float


def _find_title(page_rows: dict[int, list[Row]]) -> tuple[int, int, re.Match, Columns] | None:
    """The first "Table N: ... policy decisions" title with year headings within the next three lines."""
    for p in sorted(page_rows):
        rows = page_rows[p]
        for i, r in enumerate(rows):
            m = TITLE.match(r.text)
            cols = next((c for c in (_header(x) for x in rows[i + 1 : i + 4]) if c), None) if m else None
            if m and cols:
                return p, i, m, cols
    return None


def parse(words: list[Word]) -> Table:
    """The policy decisions table in a document's words (all pages, or the recorded table pages)."""
    if not words:
        raise ParseError("no words")
    by_page: dict[int, list[Word]] = {}
    for w in words:
        by_page.setdefault(w.page, []).append(w)
    pages = sorted(by_page)

    # 1. The title, and the year headings straight after it. A first look with the document's typical text size
    # finds them; the table's own text size (its year headings') then sets every threshold, so the whole
    # document and the recorded table pages read the same way.
    rough = statistics.median(w.height for w in words)
    found = _find_title({p: visual_rows(by_page[p], rough) for p in pages})
    if not found:
        raise ParseError('no "Table N: ... policy decisions" title followed by year headings')
    body = found[3].height
    page_rows = {p: visual_rows(by_page[p], body) for p in pages[pages.index(found[0]) :]}
    found = _find_title(page_rows)
    if not found:
        raise ParseError("the title was lost on a second look at the table's text size")
    first_page, title_index, m, cols = found
    number, title = m.group(1), _join([m.group(2)])

    # 2. Table rows, page by page: from the year headings to the foot of the page. A page continues the table
    # when it opens with the same year headings.
    regions: list[tuple[int, list[Row], Columns]] = []
    for p in pages[pages.index(first_page) :]:
        rows = page_rows[p]
        begin = title_index + 1 if p == first_page else 0
        header_at = next((i for i in range(begin, min(begin + 4, len(rows))) if _header(rows[i])), None)
        here = _header(rows[header_at]) if header_at is not None else None
        if here is None or here.years != cols.years or header_at is None:
            break
        if rows[header_at + 1 :]:
            regions.append((p, rows[header_at + 1 :], here))  # columns can shift a little between left and right pages
    # Line spacing within a table row: lines of a wrapped name sit about one text height apart. Rows of the table
    # are further apart, paragraphs after it set in larger type, and figures sit half a line between two lines of
    # a name. The commonest gap near the text height, over the whole table, is the line spacing.
    near = [round((b.top - a.top) * 4) / 4 for _, rs, _ in regions for a, b in zip(rs, rs[1:]) if 0.8 * body <= b.top - a.top <= 1.15 * body]
    line = statistics.mode(near) if near else body
    block_gap, foot_gap = 1.25 * line, 2.6 * line
    blocks: list[_Block] = []
    for p, region, here in regions:
        gaps = [b.top - a.top for a, b in zip(region, region[1:])]
        # The page's foot (its number and running title) sits after a gap far wider than any in the table.
        cut = next((i + 1 for i, g in enumerate(gaps) if g > foot_gap), len(region))
        region, gaps = region[:cut], gaps[: cut - 1]
        left_edge = min(r.words[0].left for r in region)
        current: list[Row] = []
        for i, r in enumerate(region):
            numbered = LINE_NO.match(r.words[0].text) and r.words[0].left < left_edge + 4 and len(r.words) > 1
            if current and (gaps[i - 1] > block_gap or numbered):
                blocks.append(_Block(p, current, here, left_edge))
                current = []
            current.append(r)
        if current:
            blocks.append(_Block(p, current, here, left_edge))

    # 3. Each block is a heading, a measure, or a total.
    measures: list[Measure] = []
    totals: list[TotalRow] = []
    groups: list[str] = []
    group: str | None = None
    has_head = cols.head_centre is not None
    seen_total = False
    used_pages: set[int] = set()
    last_row: Row | None = None
    for b in blocks:
        bcols, left_edge = b.cols, b.left_edge
        text_parts: list[str] = []
        figure_rows: list[list[tuple[int, Word]]] = []
        heads: list[str] = []
        line_no: str | None = None
        supers: list[Word] = []
        for ri, r in enumerate(b.rows):
            supers += r.supers
            words = list(r.words)
            if ri == 0 and LINE_NO.match(words[0].text) and words[0].left < left_edge + 4 and len(words) > 1:
                line_no = words.pop(0).text
            figs: list[tuple[int, Word]] = []
            texts: list[str] = []
            for w in words:
                yi = bcols.year_of(w)
                if yi is not None and figure_value(w.text) is not None:
                    figs.append((yi, w))
                elif has_head and bcols.head_centre is not None and abs(w.centre - bcols.head_centre) < 18 and w.text.lower() in HEADS:
                    heads.append(HEADS[w.text.lower()])
                else:
                    texts.append(w.text)
            if figs:
                figure_rows.append(figs)
            if texts:
                text_parts.append(" ".join(texts))
        label = _join(text_parts)
        where = f"page {b.page}, {('line ' + line_no) if line_no else repr(label[:60])}"
        if seen_total and not (len(figure_rows) == 1 and re.match(r"(total|memo)\b", label, re.I)):
            break  # the first block after the totals that is not another total: the footnotes
        if not figure_rows:
            if line_no:
                raise ParseError(f"{where}: a numbered line with no figures")
            group = label
            groups.append(label)
            continue
        if len(figure_rows) != 1:
            raise ParseError(f"{where}: {len(figure_rows)} rows of figures in one table row")
        cells = sorted(figure_rows[0], key=lambda x: x[0])
        if [yi for yi, _ in cells] != list(range(len(bcols.years))):
            raise ParseError(f"{where}: figures {[w.text for _, w in cells]} do not fill the {len(bcols.years)} year columns once each")
        parsed = [figure_value(w.text) for _, w in cells]
        values = [v for v, _ in parsed]  # type: ignore[misc]
        negligible = [n for _, n in parsed]  # type: ignore[misc]
        refs = _footnote_refs(supers)
        used_pages.add(b.page)
        last_row = b.rows[-1]
        if line_no:
            if seen_total:
                raise ParseError(f"{where}: a numbered line after the total")
            if has_head and len(set(heads)) != 1:
                raise ParseError(f"{where}: expected one head (Tax or Spend), found {heads}")
            name = label
            of_which = bool(OF_WHICH.match(name))
            measures.append(Measure(line_no, name, group, heads[0] if has_head else None, b.page, values, negligible, of_which, refs))
            continue
        low = label.lower()
        rng = LINES_RANGE.search(label)
        if low.startswith("memo"):
            kind = "memo"
        elif rng:
            kind = "subtotal"
        elif low.startswith("total") and re.search(r"\bspend", low):
            kind = "total_spending"
        elif low.startswith("total") and re.search(r"\btax", low):
            kind = "total_tax"
        elif low.startswith("total"):
            kind = "total"  # "Total policy decisions", "Total impact of policy decisions": there must be exactly one
        else:
            raise ParseError(f"{where}: a row of figures with no line number that is not a total or memo line")
        if kind == "total":
            if seen_total:
                raise ParseError(f"{where}: a second total of all policy decisions")
            seen_total = True
        lines = (int(rng.group(1)), int(rng.group(2))) if rng else None
        totals.append(TotalRow(label, kind, b.page, values, negligible, measures[-1].line if measures else None, lines, refs))
    if not seen_total or last_row is None:
        raise ParseError("the table ended without a total of all policy decisions")

    footnotes = _footnotes(page_rows[last_row.page], last_row.top, body)
    return Table(number, title, cols.years, sorted(used_pages), has_head, groups, measures, totals, footnotes)


def _footnotes(rows: list[Row], after_top: float, body: float) -> dict[str, str]:
    """
    The table's footnotes under its last row: {"1": "Costings reflect the OBR's latest...", "*": "Costing is negligible"}.
    A note starts with a small marker at the left; it runs on until the next marker or a paragraph's wider gap.
    Shown as the Treasury's notes on the page; never fails the parse.
    """
    notes: dict[str, list[str]] = {}
    key: str | None = None
    prev = after_top
    for r in rows:
        if r.top <= after_top:
            continue
        if r.top - prev > (2.0 if key is None else 1.4) * body:
            break
        marks = [s for s in r.supers if s.left <= r.words[0].left + 1]
        if marks:
            key = marks[0].text.strip()
            notes[key] = [r.text]
        elif key is not None:
            notes[key].append(r.text)
        else:
            break
        prev = r.top
    return {k: _join(v) for k, v in notes.items()}


# ------------------------------------------------------------------ checks


@dataclass
class Check:
    id: str
    ok: bool
    message: str


def rounding_unit(table: Table) -> int:
    """£5m when every printed figure is a multiple of 5 (the Treasury's usual rounding), else £1m."""
    vals = [v for m in table.measures for v in m.values] + [v for t in table.totals for v in t.values]
    return 5 if all(v % 5 == 0 for v in vals) else 1


def summed(measures: list[Measure], years: int) -> list[int]:
    return [sum(m.values[i] for m in measures if not m.of_which) for i in range(years)]


def rounding_bound(measures: list[Measure], i: int, unit: int) -> float:
    """The most that rounding can move a sum of printed lines away from the printed total in one year."""
    lines = [m for m in measures if not m.of_which and (m.values[i] != 0 or m.negligible[i])]
    return unit / 2 * (len(lines) + 1)


def check(table: Table, event: Event) -> list[Check]:
    out: list[Check] = []
    n = len(table.years)
    lines = [m.line for m in table.measures]
    expected = [str(i) for i in range(1, len(lines) + 1)]
    out.append(Check("lines", bool(lines) and lines == expected, f"{len(lines)} lines numbered 1 to {len(lines)}" if lines == expected else f"line numbers {lines} are not 1 to {len(lines)}"))
    out.append(Check("figures", all(len(m.values) == n for m in table.measures), f"every line has a figure for each of {n} years"))
    total = table.total
    out.append(
        Check(
            "total",
            tuple(total.values) == tuple(event.printed_total),
            f"the table's total {total.values} {'equals' if tuple(total.values) == tuple(event.printed_total) else 'differs from'} the total typed from the PDF {list(event.printed_total)}",
        )
    )
    unit = rounding_unit(table)
    sums = summed(table.measures, n)
    for i, year in enumerate(table.years):
        diff = total.values[i] - sums[i]
        bound = rounding_bound(table.measures, i, unit)
        out.append(Check(f"reconcile.{year}", abs(diff) <= bound, f"{year}: lines sum to {sums[i]}, the Treasury's total is {total.values[i]}, difference {diff} (rounding allows up to {bound:g})"))
    for t in table.totals:
        if t.kind != "subtotal" or not t.lines:
            continue
        a, b = t.lines
        inside = [m for m in table.measures if m.line.isdigit() and a <= int(m.line) <= b]
        s = summed(inside, n)
        for i, year in enumerate(table.years):
            diff = t.values[i] - s[i]
            bound = rounding_bound(inside, i, unit)
            out.append(Check(f"subtotal.{a}-{b}.{year}", abs(diff) <= bound, f"lines {a} to {b}, {year}: sum {s[i]}, printed {t.values[i]}, difference {diff} (rounding allows up to {bound:g})"))
    return out


# ------------------------------------------------------------------ the copy: spreadsheet or GOV.UK HTML


@dataclass
class CopyRow:
    line: str | None
    label: str
    head: str | None
    values: list[int]
    negligible: list[bool]


def _grid_rows(grid: list[list[str]]) -> list[CopyRow]:
    """Rows with a figure under every year heading, read by column position from the row that holds the headings."""
    grid = [[" ".join(str(c).replace("\xa0", " ").split()) for c in row] for row in grid]
    h = next((i for i, row in enumerate(grid) if sum(bool(YEAR.match(c)) for c in row) >= 2), None)
    if h is None:
        return []
    year_cols = [j for j, c in enumerate(grid[h]) if YEAR.match(c)]
    head_col = next((j for j, c in enumerate(grid[h]) if c.lower().startswith("head")), None)
    out: list[CopyRow] = []
    for row in grid[h + 1 :]:
        if len(row) <= year_cols[-1]:
            continue
        figs = [figure_value(row[j]) for j in year_cols]
        if any(f is None or not row[j] for f, j in zip(figs, year_cols)):
            continue
        head = HEADS.get(row[head_col].lower()) if head_col is not None and row[head_col] else None
        texts = [c for j, c in enumerate(row[: year_cols[0]]) if c and j != head_col]
        line = texts.pop(0) if texts and LINE_NO.match(texts[0]) else None
        out.append(CopyRow(line, " ".join(texts), head, [f[0] for f in figs], [f[1] for f in figs]))  # type: ignore[index]
    return out


def read_copy(path: Path) -> list[CopyRow]:
    """The table as the Treasury also published it: its spreadsheet (.xlsx) or its GOV.UK HTML (the table's fragment)."""
    if path.suffix == ".xlsx":
        import openpyxl

        wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
        grid = [["" if v is None else str(int(v)) if isinstance(v, float) and v.is_integer() else str(v) for v in r] for r in wb.worksheets[0].iter_rows(values_only=True)]
        return _grid_rows(grid)
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(path.read_text(), "html.parser")
    for sup in soup.find_all("sup"):
        sup.decompose()
    rows: list[CopyRow] = []
    for t in soup.find_all("table"):
        rows += _grid_rows([[td.get_text(" ") for td in tr.find_all(["td", "th"])] for tr in t.find_all("tr")])
    return rows


def _norm_name(s: str) -> str:
    s = re.sub(r"\(\d+(?:,\d+)*\)", "", s)  # GOV.UK HTML writes footnote markers as "(2)"
    return re.sub(r"[^a-z0-9]+", "", s.lower().replace("’", "'"))


@dataclass
class Difference:
    """A line where the PDF and the copy disagree in wording or in the tax/spend mark, accepted after a person checked the PDF."""

    line: str
    field: str  # name | head
    pdf: str
    copy: str
    reason: str


def cross_check(table: Table, copy: list[CopyRow], accepted: dict[str, str] | None = None) -> tuple[list[Check], list[Difference]]:
    """
    Every numbered line and every total in the PDF equal the structured copy's, figure for figure. A line's
    wording or head may differ only where `accepted` (Event.accepted) says a person checked it; figures never.
    """
    accepted = accepted or {}
    numbered = {r.line: r for r in copy if r.line}
    problems: list[str] = []
    differences: list[Difference] = []
    used: set[str] = set()

    def differ(m: Measure, fld: str, pdf: str, other: str) -> None:
        key = f"{m.line}:{fld}"
        if key in accepted:
            used.add(key)
            differences.append(Difference(m.line, fld, pdf, other, accepted[key]))
        else:
            problems.append(f"line {m.line}: {fld} differs: PDF {pdf!r} vs copy {other!r} (check the PDF; accept it in EVENTS if the PDF is right)")

    for m in table.measures:
        r = numbered.get(m.line)
        if r is None:
            problems.append(f"line {m.line} is not in the copy")
            continue
        if r.values != m.values or r.negligible != m.negligible:
            problems.append(f"line {m.line}: PDF {m.values} vs copy {r.values}")
        if m.head and r.head and m.head != r.head:
            differ(m, "head", m.head, r.head)
        a, b = _norm_name(m.name), _norm_name(r.label)
        # Footnote markers run into the text in the spreadsheet ("20253"), so names are compared closely, not exactly.
        if a != b and SequenceMatcher(None, a, b).ratio() < 0.97:
            differ(m, "name", m.name, r.label)
    extra = sorted(set(numbered) - {m.line for m in table.measures}, key=lambda x: (len(x), x))
    if extra:
        problems.append(f"lines {extra} are in the copy but not read from the PDF")
    unnumbered = [r for r in copy if not r.line]
    for t in table.totals:
        if not any(r.values == t.values for r in unnumbered):
            problems.append(f"{t.kind} {t.label!r} {t.values} is not in the copy")
    stale = sorted(set(accepted) - used)
    if stale:
        problems.append(f"accepted differences {stale} are no longer differences: remove them from EVENTS")
    if problems:
        return [Check("copy", False, "; ".join(problems))], differences
    note = f"; {len(differences)} difference(s) in wording or tax/spend mark checked in the PDF and accepted ({', '.join(f'line {d.line} {d.field}' for d in differences)})" if differences else ""
    return [Check("copy", True, f"{len(table.measures)} lines and {len(table.totals)} totals match the copy figure for figure{note}")], differences


# ------------------------------------------------------------------ record and build


def recorded_dir(event_id: str) -> Path:
    return RECORDED_DIR / event_id


def _copy_file(d: Path) -> Path | None:
    for name in ("copy.xlsx", "copy.html"):
        if (d / name).exists():
            return d / name
    return None


def load_recorded(event_id: str) -> tuple[list[Word], dict, Path | None]:
    d = recorded_dir(event_id)
    words = read_tsv((d / "table.tsv").read_text())
    meta = json.loads((d / "source.json").read_text())
    return words, meta, _copy_file(d)


def build_event(event: Event) -> tuple[dict, list[Check]]:
    """Parse the recorded table and run every check: the event's JSON (as written to data/build/budget) and the checks."""
    words, meta, copy_path = load_recorded(event.id)
    table = parse(words)
    checks = check(table, event)
    differences: list[Difference] = []
    if copy_path is not None:
        found, differences = cross_check(table, read_copy(copy_path), dict(event.accepted))
        checks += found
    return event_json(event, table, meta, checks, differences), checks


def event_json(event: Event, table: Table, meta: dict, checks: list[Check], differences: list[Difference] | None = None) -> dict:
    n = len(table.years)
    sums = summed(table.measures, n)
    unit = rounding_unit(table)

    def neg(flags: list[bool]) -> list[str]:
        return [table.years[i] for i, f in enumerate(flags) if f]

    def measure(m: Measure) -> dict:
        d: dict = {"line": int(m.line) if m.line.isdigit() else m.line, "name": m.name, "group": m.group}
        if m.head:
            d["head"] = m.head
        d["page"] = m.page
        d["values"] = m.values
        if any(m.negligible):
            d["negligible"] = neg(m.negligible)
        if m.of_which:
            d["of_which"] = True
        if m.footnotes:
            d["footnotes"] = m.footnotes
        return d

    def total(t: TotalRow) -> dict:
        d: dict = {"label": t.label, "kind": t.kind, "page": t.page, "values": t.values}
        if any(t.negligible):
            d["negligible"] = neg(t.negligible)
        if t.after_line is not None:
            d["after_line"] = int(t.after_line) if t.after_line.isdigit() else t.after_line
        if t.lines:
            d["lines"] = list(t.lines)
        if t.footnotes:
            d["footnotes"] = t.footnotes
        return d

    return {
        "id": event.id,
        "name": event.name,
        "date": event.date,
        "source": {
            "id": SOURCE_ID,
            "title": event.document_title,
            "publisher": "HM Treasury",
            "url": event.page_url,
            "document_url": event.document_url,
            "document_sha256": meta["sha256"],
            "published_on": event.date,
            "licence": "OGL v3",
            **({"copy_url": event.copy_url} if event.copy_url else {}),
        },
        "vintage": event.id,
        "quality": "sourced",
        "unit": "gbp_m",
        "table": {"number": table.number, "title": table.title, "pages": table.pages, "has_head": table.has_head},
        "years": table.years,
        "headline_year": table.years[-1],
        "rounding_m": unit,
        "groups": table.groups,
        "measures": [measure(m) for m in table.measures],
        "totals": [total(t) for t in table.totals],
        "sum_of_lines": sums,
        "footnotes": table.footnotes,
        "checks": [{"id": c.id, "ok": c.ok, "message": c.message} for c in checks],
        **(
            {"copy_differences": [{"line": int(d.line) if d.line.isdigit() else d.line, "field": d.field, "pdf": d.pdf, "copy": d.copy, "reason": d.reason} for d in differences]}
            if differences
            else {}
        ),
        "recorded": {k: meta[k] for k in ("fetched_at", "extractor") if k in meta},
    }


def record(event: Event) -> Path:
    """Download the document (and its copy), find the table's pages, and keep those words as the recorded source."""
    raw = download(RAW_SOURCE_ID, event.document_url, f"{event.id}.pdf")
    tsv = extract_tsv(raw.path)
    words = read_tsv(tsv)
    table = parse(words)
    keep = set(table.pages)
    # Keep the header line and every word on the table's pages, so a reviewer can redo the extraction and diff.
    lines = tsv.splitlines()
    kept = [lines[0]] + [ln for ln in lines[1:] if ln.split("\t", 2)[0] == "5" and int(ln.split("\t", 2)[1]) in keep]
    d = recorded_dir(event.id)
    d.mkdir(parents=True, exist_ok=True)
    (d / "table.tsv").write_text("\n".join(kept) + "\n")
    meta = {
        "event": event.id,
        "document_url": event.document_url,
        "sha256": raw.sha256,
        "fetched_at": raw.fetched_at,
        "pages": sorted(keep),
        "extractor": f"pdftotext {pdftotext_version()} -tsv (poppler), level-5 rows of the table's pages",
    }
    for old in ("copy.xlsx", "copy.html"):
        (d / old).unlink(missing_ok=True)
    if event.copy_url:
        if event.copy_url.endswith(".xlsx"):
            c = download(RAW_SOURCE_ID, event.copy_url, f"{event.id}.xlsx")
            shutil.copyfile(c.path, d / "copy.xlsx")
        else:
            c = download(RAW_SOURCE_ID, govuk_api_url(event.copy_url), f"{event.id}.html.json")
            body = json.loads(c.path.read_text())["details"]["body"]
            (d / "copy.html").write_text(table_fragment(body) + "\n")
        meta["copy_url"] = event.copy_url
        meta["copy_sha256"] = c.sha256
    write_json(d / "source.json", meta)
    return d


def govuk_api_url(url: str) -> str:
    """GOV.UK page -> its content API URL, which returns the HTML body as JSON."""
    return re.sub(r"^https://www\.gov\.uk/", f"{GOVUK_API}/", url)


def table_fragment(body: str) -> str:
    """The policy decisions table out of a whole GOV.UK HTML document: its heading and the tables up to the next heading."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(body, "html.parser")
    heads = [h for h in soup.find_all(["h2", "h3", "h4", "h5"]) if TITLE.match(" ".join(h.get_text(" ").split()))]
    if not heads:
        raise ParseError("no policy decisions table heading in the HTML copy")
    parts = [str(heads[0])]
    for sib in heads[0].find_next_siblings():
        if sib.name in ("h2", "h3", "h4", "h5"):
            break
        if sib.name == "table":
            parts.append(str(sib))
    return "\n".join(parts)


def out_path(event_id: str) -> Path:
    return OUT_DIR / f"{event_id}.json"


def recorded_events() -> list[Event]:
    """Events with a recorded table, in date order. A recorded event missing from EVENTS is an error."""
    if not RECORDED_DIR.exists():
        return []
    ids = sorted(p.name for p in RECORDED_DIR.iterdir() if (p / "table.tsv").exists())
    missing = [i for i in ids if i not in EVENTS]
    if missing:
        raise SystemExit(f"recorded but not in EVENTS: {missing}")
    return sorted((EVENTS[i] for i in ids), key=lambda e: e.date)


def run(events: list[Event], *, write: bool) -> int:
    failed = 0
    for event in events:
        try:
            data, checks = build_event(event)
        except ParseError as e:
            log.error("%s: cannot read the table: %s", event.id, e)
            failed += 1
            continue
        bad = [c for c in checks if not c.ok]
        for c in checks:
            (log.error if not c.ok else log.info)("%s %-24s %s %s", event.id, c.id, "ok  " if c.ok else "FAIL", c.message)
        if bad:
            failed += 1
            continue
        path = out_path(event.id)
        if write:
            write_json(path, data)
            total = next(t for t in data["totals"] if t["kind"] == "total")
            log.info("%s: %d lines, total %s (£m, %s) -> %s", event.id, len(data["measures"]), total["values"], ", ".join(data["years"]), path.relative_to(ROOT))
        else:
            committed = json.loads(path.read_text()) if path.exists() else None
            if committed != data:
                log.error("%s: %s is not what the recorded table gives; run python -m etl.budget_costings", event.id, path.relative_to(ROOT))
                failed += 1
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="cmd")
    rec = sub.add_parser("record", help="download an event's document, keep its table's words, then build it")
    rec.add_argument("event", choices=sorted(EVENTS))
    p.add_argument("--check", action="store_true", help="compare with the committed files; write nothing")
    p.add_argument("--only", help="comma-separated event ids")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    for noisy in ("httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    if args.cmd == "record":
        d = record(EVENTS[args.event])
        log.info("%s: recorded the table's words in %s", args.event, d.relative_to(ROOT))
        return run([EVENTS[args.event]], write=True)
    events = recorded_events()
    if args.only:
        wanted = {x.strip() for x in args.only.split(",")}
        events = [e for e in events if e.id in wanted]
    return run(events, write=not args.check)


if __name__ == "__main__":
    sys.exit(main())
