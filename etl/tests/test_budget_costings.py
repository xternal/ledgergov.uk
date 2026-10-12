"""
The Budget scorecard parser (etl/budget_costings.py), offline, on the recorded tables in
fixtures/budget_costings/<event>/: the words of the table's pages as poppler's `pdftotext -tsv` gave
them (table.tsv), the document's hash and pages (source.json), and the Treasury's own structured copy of
the same table (copy.xlsx or copy.html).

The figures asserted here were typed from the PDFs, not from the parser's output.
"""

import json
import re
from dataclasses import replace

import pytest

from etl import budget_costings as m

RECORDED = sorted(p.name for p in m.RECORDED_DIR.iterdir() if (p / "table.tsv").exists())


@pytest.fixture(scope="module")
def tables():
    return {e: m.parse(m.load_recorded(e)[0]) for e in RECORDED}


def line(table, n):
    return next(x for x in table.measures if x.line == str(n))


def test_every_recorded_event_is_registered_and_dated():
    assert set(RECORDED) <= set(m.EVENTS)
    assert {"autumn-budget-2024", "spring-statement-2025", "autumn-budget-2025"} <= set(RECORDED)
    for e in RECORDED:
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", m.EVENTS[e].date)


@pytest.mark.parametrize("event", RECORDED)
def test_reads_the_treasurys_total_exactly_and_every_check_passes(event, tables):
    t = tables[event]
    assert tuple(t.total.values) == m.EVENTS[event].printed_total
    data, checks = m.build_event(m.EVENTS[event])
    failed = [f"{c.id}: {c.message}" for c in checks if not c.ok]
    assert not failed
    assert {c.id for c in checks} >= {"lines", "figures", "total", "copy"} | {f"reconcile.{y}" for y in t.years}


@pytest.mark.parametrize("event", RECORDED)
def test_committed_build_is_what_the_recorded_table_gives(event):
    """data/build/budget/<event>.json is reproducible offline from the recorded words (CI runs this)."""
    data, _ = m.build_event(m.EVENTS[event])
    committed = json.loads(m.out_path(event).read_text())
    assert committed == data, f"run python -m etl.budget_costings to rebuild {m.out_path(event).name}"


def test_autumn_budget_2024(tables):
    t = tables["autumn-budget-2024"]
    assert (t.number, t.years[0], t.years[-1], t.has_head) == ("5.1", "2024-25", "2029-30", True)
    assert t.pages == list(range(120, 128))
    assert len(t.measures) == 70 and [x.line for x in t.measures] == [str(i) for i in range(1, 71)]
    # Signs are the Exchequer's: spending costs money (negative), a tax rise raises it (positive).
    one = line(t, 1)
    assert one.values == [-26450, -44360, -48285, -51770, -55065, -55160] and one.head == "spend" and one.page == 120
    assert one.group == "Fixing the Foundations and Rebuilding Britain"
    nics = line(t, 26)
    assert nics.values == [0, 23770, 23690, 24170, 24930, 25710] and nics.head == "tax" and nics.page == 123
    assert nics.name.startswith("Employer National Insurance contributions: Increase rate by 1.2ppts to 15%")
    assert nics.group == "Repairing the Public Finances – Raising Revenue Fairly"
    # A footnote marker that runs into the text in the spreadsheet ("20253") is kept apart from the name.
    vat = line(t, 22)
    assert vat.name.endswith("from 1 January 2025") and vat.footnotes == ["3"]
    # "*" is negligible: kept as printed, counted as zero.
    pisces = line(t, 67)
    assert pisces.values == [0, 0, 0, 0, -5, -5] and pisces.negligible == [True, True, True, True, False, False]
    assert line(t, 70).page == 127 and line(t, 70).head == "spend"
    kinds = {x.kind: x.values for x in t.totals}
    assert kinds["total_spending"] == [-25865, -63550, -70115, -75645, -78500, -74160]
    assert kinds["total_tax"] == [1160, 24005, 34785, 39065, 39725, 41170]
    assert kinds["memo"] == [0, -4745, -4730, -4830, -4940, -5110]
    sub = [x for x in t.totals if x.kind == "subtotal"]
    assert [(x.lines, x.values[-1]) for x in sub] == [((8, 19), 6485), ((8, 25), 9745)]
    # The printed lines add up to within rounding of the printed total, not to it exactly: the Treasury rounds
    # each line to £5m and adds before rounding.
    assert m.summed(t.measures, 6) == [-24700, -39540, -35325, -36575, -38790, -33000]
    assert len(t.groups) == 9 and t.footnotes["*"] == "Costing is negligible"


def test_spring_statement_2025(tables):
    t = tables["spring-statement-2025"]
    assert (t.number, t.years[0], t.years[-1], t.has_head) == ("3.1", "2024-25", "2029-30", False)
    assert t.pages == [36, 37, 38, 39]  # the last total sits alone at the top of page 39
    assert len(t.measures) == 33
    # "o/w" lines are part of the line above and are not added again.
    ow = [x.line for x in t.measures if x.of_which]
    assert ow == ["2", "5"] and line(t, 2).name.startswith("o/w: Net capital spending change")
    pip = line(t, 10)
    assert pip.values == [0, 0, 210, 1755, 3365, 4515] and pip.page == 37 and pip.group == "Reforming welfare to get Britain working"
    assert line(t, 27).values == [-1215, -915, 420, 420, 170, 55]
    kinds = {x.kind: x.values for x in t.totals}
    assert kinds["total_tax"] == [50, 985, 1410, 1595, 1885, 2230]
    assert kinds["total_spending"] == [-865, -2035, -2300, -2180, 760, 4030]
    assert kinds["memo"] == [-425, -1000, -70, 3005, 6755, 10870]
    assert m.summed(t.measures, 6) == [-810, -1050, -885, -580, 2640, 6245]
    assert t.footnotes["1"].startswith("Costings reflect the OBR’s latest economic and fiscal determinants")


def test_autumn_budget_2025(tables):
    """The dry run for Budget day: read without changing the parser, from a table it had not seen (Table 4.1, 88 lines)."""
    t = tables["autumn-budget-2025"]
    assert (t.number, t.years[0], t.years[-1], t.has_head) == ("4.1", "2025-26", "2030-31", True)
    assert t.pages == list(range(93, 102)) and len(t.measures) == 88
    one = line(t, 1)
    assert one.values == [0, -2580, -2100, -2195, 0, 0] and one.head == "spend" and one.page == 93
    assert one.group == "Getting inflation down and tackling the cost of living"
    fuel = line(t, 3)
    assert fuel.name.startswith("Fuel Duty: Cancel uprating for 2026-27") and fuel.values == [-45, -2370, -855, -855, -850, -840] and fuel.head == "tax"
    assert line(t, 88).values == [-55, -150, -95, -100, -100, -105] and line(t, 88).page == 101
    # The printed table marks line 78 Spend; the Treasury's spreadsheet says Tax. The page follows the PDF.
    assert line(t, 78).head == "spend" and line(t, 78).values == [0, 0, 5, 5, 5, 0]
    kinds = {x.kind: x.values for x in t.totals}
    assert kinds["total_spending"] == [-4200, -7410, -10330, -7305, -2615, -2535]
    assert kinds["total_tax"] == [70, -1905, 2890, 10730, 23150, 26645]
    assert m.summed(t.measures, 6) == [-4115, -9310, -7460, 3410, 20505, 24125]
    assert len(t.groups) == 8 and set(t.footnotes) == {"1", "2", "3", "4", "5"}


def test_a_difference_from_the_copy_is_accepted_only_for_wording_or_head(tables):
    t = tables["autumn-budget-2025"]
    copy = m.read_copy(m.load_recorded("autumn-budget-2025")[2])
    checks, diffs = m.cross_check(t, copy)
    assert not checks[0].ok and "line 56: name differs" in checks[0].message and "line 78: head differs" in checks[0].message
    checks, diffs = m.cross_check(t, copy, dict(m.EVENTS["autumn-budget-2025"].accepted))
    assert checks[0].ok and [(d.line, d.field) for d in diffs] == [("56", "name"), ("78", "head")]
    # A figure that differs can never be accepted.
    bad = [replace(r, values=[r.values[0] + 5, *r.values[1:]]) if r.line == "56" else r for r in copy]
    checks, _ = m.cross_check(t, bad, dict(m.EVENTS["autumn-budget-2025"].accepted))
    assert not checks[0].ok and "line 56: PDF" in checks[0].message


# ------------------------------------------------------------------ the checks catch mistakes


def test_a_missing_figure_stops_the_parse():
    words = m.load_recorded("spring-statement-2025")[0]
    i = next(i for i, w in enumerate(words) if w.text == "+4,515m")  # line 10, 2029-30
    with pytest.raises(m.ParseError, match="line 10: figures .* do not fill the 6 year columns"):
        m.parse(words[:i] + words[i + 1 :])


def test_a_misread_figure_fails_the_copy_and_total_checks(tables):
    t = tables["autumn-budget-2024"]
    bad = replace(t, measures=[replace(x, values=[x.values[0] + 500, *x.values[1:]]) if x.line == "1" else x for x in t.measures])
    copy = m.read_copy(m.load_recorded("autumn-budget-2024")[2])
    checks = {c.id: c for c in m.check(bad, m.EVENTS["autumn-budget-2024"]) + m.cross_check(bad, copy)[0]}
    assert not checks["copy"].ok and "line 1: PDF" in checks["copy"].message
    assert not checks["reconcile.2024-25"].ok and checks["reconcile.2025-26"].ok


def test_a_wrong_typed_total_or_a_lost_line_fails(tables):
    t = tables["spring-statement-2025"]
    event = replace(m.EVENTS["spring-statement-2025"], printed_total=(-810, -1050, -890, -585, 2645, 6265))
    assert not {c.id: c for c in m.check(t, event)}["total"].ok
    lost = replace(t, measures=[x for x in t.measures if x.line != "17"])
    assert not {c.id: c for c in m.check(lost, m.EVENTS["spring-statement-2025"])}["lines"].ok


def test_figures_and_text():
    assert m.figure_value("+1,765m") == (1765, False)
    assert m.figure_value("-26,450m") == (-26450, False)
    assert m.figure_value("−5m") == (-5, False)
    assert m.figure_value("+0m") == (0, False)
    assert m.figure_value("*") == (0, True)
    assert m.figure_value("1765") == (1765, False)
    assert m.figure_value("2025-26") is None and m.figure_value("1.2ppts") is None
    assert m._join(["Increase growth-", "enhancing investment"]) == "Increase growth-enhancing investment"
    assert m._join(["o/w: \x07Net capital", "spending"]) == "o/w: Net capital spending"
