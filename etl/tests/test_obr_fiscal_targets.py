"""
OBR fiscal targets (the headroom): parse small stored copies of each assessing EFO's fiscal targets
table, check the editions agree with each other, and exercise edition choice and assembly (no network).

The fixtures keep the Contents sheet and the tables of the real chapter workbooks (October 2024 also
keeps Table 7.4, the old rules it assessed, which must not be read; March 2026 keeps a table from its
last chapter, which has no assessment).
"""

from pathlib import Path

import pytest

from etl.build import Run, Store
from etl.core import Observation, RawArtifact
from etl.fiscal_targets import assemble_fiscal_targets, edition_label, edition_url
from etl.sources import obr_fiscal_targets as ft

FIX = Path(__file__).parent / "fixtures" / "obr_fiscal_targets"
EDITIONS = ["2024_10", "2025_03", "2025_11"]


def raw(name: str, vintage: str | None = None) -> RawArtifact:
    return RawArtifact(ft.SOURCE.id, "https://obr.uk/download/x/", FIX / f"efo_{name}_fiscal_targets.xlsx", "0" * 64, "2026-10-12T00:00:00+00:00", vintage=vintage)


@pytest.fixture(scope="module")
def obs():
    return ft.parse([raw(n) for n in EDITIONS])


def value(obs, series, vintage):
    hits = [o for o in obs if o.series_id == series and o.vintage == vintage]
    assert len(hits) == 1, (series, vintage, hits)
    return hits[0].value


def test_headroom_against_each_rule_as_published(obs):
    # Table 7.1 of each EFO, £ billion margin in 2029-30.
    assert value(obs, "fiscal_targets.current_budget.margin", "EFO-2024-10") == pytest.approx(9.929, abs=1e-3)
    assert value(obs, "fiscal_targets.current_budget.margin", "EFO-2025-03") == pytest.approx(9.932, abs=1e-3)
    assert value(obs, "fiscal_targets.current_budget.margin", "EFO-2025-11") == pytest.approx(21.699, abs=1e-3)
    assert value(obs, "fiscal_targets.psnfl.margin", "EFO-2024-10") == pytest.approx(15.747, abs=1e-3)
    assert value(obs, "fiscal_targets.psnfl.margin", "EFO-2025-03") == pytest.approx(15.104, abs=1e-3)
    assert value(obs, "fiscal_targets.psnfl.margin", "EFO-2025-11") == pytest.approx(24.351, abs=1e-3)
    assert value(obs, "fiscal_targets.welfare_cap.margin", "EFO-2025-11") == pytest.approx(1.921, abs=1e-3)
    assert value(obs, "fiscal_targets.welfare_cap.spending", "EFO-2025-11") == pytest.approx(202.296, abs=1e-3)


def test_share_of_gdp_probability_and_before_the_measures(obs):
    assert value(obs, "fiscal_targets.current_budget.margin_pct_gdp", "EFO-2025-11") == pytest.approx(0.619, abs=1e-3)
    assert value(obs, "fiscal_targets.psnfl.margin_pct_gdp", "EFO-2025-11") == pytest.approx(0.683, abs=1e-3)  # the fall, as a margin
    assert value(obs, "fiscal_targets.current_budget.probability", "EFO-2025-11") == 59
    assert value(obs, "fiscal_targets.psnfl.probability", "EFO-2025-11") == 52
    # March 2025: the rule would have been missed before that Spring Statement's decisions.
    assert value(obs, "fiscal_targets.current_budget.margin_pre_measures", "EFO-2025-03") == pytest.approx(-4.062, abs=1e-3)
    assert value(obs, "fiscal_targets.current_budget.margin_pre_measures", "EFO-2025-11") == pytest.approx(4.185, abs=1e-3)
    assert not any(o.series_id == "fiscal_targets.welfare_cap.probability" for o in obs)


def test_provenance_and_shape(obs):
    assert {o.period for o in obs} == {"2029-30"}
    assert {o.kind for o in obs} == {"forecast"}
    assert {o.quality for o in obs} == {"sourced"}
    assert {o.vintage for o in obs} == {"EFO-2024-10", "EFO-2025-03", "EFO-2025-11"}
    note = next(o.method_note for o in obs if o.series_id == "fiscal_targets.current_budget.margin" and o.vintage == "EFO-2025-11")
    assert note == "Table 7.1 (Performance against the Government's fiscal targets), row 'November 2025 forecast'."
    oct24 = next(o.method_note for o in obs if o.vintage == "EFO-2024-10")
    assert "proposed fiscal targets" in oct24  # the rules as proposed then; Table 7.4 (the old rules) is not read
    assert len(obs) == 30  # 10 per edition


def test_each_edition_matches_what_the_next_one_restates():
    """A later table repeats the earlier forecast; the copies must agree with the earlier edition's own table."""
    tables = {n: ft.read_table(FIX / f"efo_{n}_fiscal_targets.xlsx") for n in EDITIONS}
    for earlier, later in zip(EDITIONS, EDITIONS[1:]):
        label = edition_label(f"EFO-{earlier.replace('_', '-')}")
        own = {(r.rule, r.label): r.values for r in tables[earlier].rows if r.edition == label}
        restated = {(r.rule, r.label): r.values for r in tables[later].rows if r.edition == label}
        assert restated, f"{later} restates nothing from {label}"
        for key, vals in restated.items():
            for col, v in vals.items():
                assert own[key][col] == pytest.approx(v, abs=0.01), (later, key, col)


def test_a_forecast_without_an_assessment_has_no_table():
    assert not ft.has_table(FIX / "efo_2026_03_fiscal_targets.xlsx")
    assert all(ft.has_table(FIX / f"efo_{n}_fiscal_targets.xlsx") for n in EDITIONS)
    with pytest.raises(ValueError, match="no 'Performance against"):
        ft.parse([raw("2026_03")])


def test_vintage_must_match_the_file():
    with pytest.raises(ValueError, match="file is EFO-2025-11"):
        ft.parse([raw("2025_11", vintage="EFO-2025-03")])


def test_last_chapter_workbook():
    page = "https://obr.uk/efo/economic-and-fiscal-outlook-november-2025/"
    html = "".join(
        f'<a href="https://obr.uk/download/november-2025-economic-and-fiscal-outlook-charts-and-tables-chapter-{n}/?tmstv=1">x</a>' for n in (2, 7, 3)
    )
    assert ft.last_chapter_workbook(page, html) == "https://obr.uk/download/november-2025-economic-and-fiscal-outlook-charts-and-tables-chapter-7/"
    with pytest.raises(LookupError):
        ft.last_chapter_workbook(page, "<p>no links</p>")


# ------------------------------------------------------------------ which editions fetch() asks for


@pytest.fixture
def world(monkeypatch, tmp_path):
    """A fake obr.uk: each edition page links a chapter 7 workbook, served from the fixtures."""
    asked: list[str] = []
    published = {"2024_10": "2024-10-30", "2025_03": "2025-03-26", "2025_11": "2025-11-26", "2026_11": "2026-11-26", "2027_03": "2027-03-03"}

    def download(source_id, url, filename=None, *, vintage=None, archive=False, **_):
        asked.append(filename)
        name = filename.removeprefix("efo_")[:7]
        if filename.endswith("_landing.html"):
            label = ft.edition(url).label
            page = tmp_path / filename
            page.write_text(
                f'<meta property="og:title" content="Economic and fiscal outlook – {label} - Office for Budget Responsibility">'
                f'<script>{{"datePublished":"{published[name]}T12:00:00+00:00"}}</script>'
                '<a href="https://obr.uk/download/x-charts-and-tables-chapter-7/">Chapter 7</a>'
            )
            return RawArtifact(source_id, url, page, "0" * 64, "t")
        # A future Budget's workbook: November 2025's table under the new edition's name.
        book = FIX / f"efo_{'2025_11' if name == '2026_11' else name}_fiscal_targets.xlsx"
        return RawArtifact(source_id, url, book, "0" * 64, "t", vintage=vintage)

    state = {"listed": "https://obr.uk/efo/economic-and-fiscal-outlook-march-2026/", "have": set()}
    monkeypatch.setattr(ft, "download", download)
    monkeypatch.setattr(ft, "newest_listed", lambda: ft.edition(state["listed"]))
    monkeypatch.setattr(ft, "committed_vintages", lambda: state["have"])
    monkeypatch.setattr(ft, "SOURCE", ft.SOURCE.model_copy())
    return asked, state


def test_first_run_fetches_every_assessment(world):
    asked, state = world
    raws = ft.fetch()
    assert sorted(r.path.name for r in raws) == [f"efo_{n}_fiscal_targets.xlsx" for n in EDITIONS]
    # March 2026 is known to make no assessment: its workbook is never opened.
    assert not any(a.startswith("efo_2026_03") for a in asked)
    assert ft.SOURCE.url == "https://obr.uk/efo/economic-and-fiscal-outlook-november-2025/"
    assert str(ft.SOURCE.published_on) == "2025-11-26"


def test_later_runs_fetch_only_the_newest(world):
    asked, state = world
    state["have"] = {"EFO-2024-10", "EFO-2025-03", "EFO-2025-11"}
    raws = ft.fetch()
    assert [r.path.name for r in raws] == ["efo_2025_11_fiscal_targets.xlsx"]


def test_a_new_budget_assessment_is_picked_up(world):
    asked, state = world
    state["have"] = {"EFO-2024-10", "EFO-2025-03", "EFO-2025-11"}
    state["listed"] = "https://obr.uk/efo/economic-and-fiscal-outlook-november-2026/"
    raws = ft.fetch()
    assert raws[-1].vintage == "EFO-2026-11"
    assert ft.SOURCE.url == "https://obr.uk/efo/economic-and-fiscal-outlook-november-2026/"
    assert ft.SOURCE.title == "OBR Economic and fiscal outlook – November 2026: performance against the fiscal targets"


def test_a_new_forecast_without_a_table_is_not_recorded(world, monkeypatch):
    asked, state = world
    state["have"] = {"EFO-2024-10", "EFO-2025-03", "EFO-2025-11"}
    state["listed"] = "https://obr.uk/efo/economic-and-fiscal-outlook-march-2027/"
    monkeypatch.setattr(ft, "has_table", lambda path: False)
    raws = ft.fetch()
    assert [r.vintage for r in raws] == ["EFO-2025-11"]
    assert "efo_2027_03_fiscal_targets.xlsx" in asked  # it was checked, then left out


# ------------------------------------------------------------------ assembly


def _efo(series, period, value, vintage="EFO-2026-03"):
    return Observation(series_id=series, period=period, value=value, unit="gbp_bn" if "deficit" in series else "pct_gdp",
                       kind="forecast", source_id="obr_efo", vintage=vintage, quality="sourced")


def assemble(obs, efo, run=None):
    run = run or Run("b", "s", "test")
    by_source = {"obr_fiscal_targets": obs, "obr_efo": efo}
    sources = [{"id": "obr_fiscal_targets", "title": "t", "publisher": "OBR", "url": "https://obr.uk/"},
               {"id": "obr_efo", "title": "e", "publisher": "OBR", "url": "https://obr.uk/"},
               {"id": "ons_psf", "title": "o", "publisher": "ONS", "url": "https://ons.gov.uk/"}]
    return assemble_fiscal_targets(by_source, Store(by_source), run, sources), run


def test_assembly_lists_assessments_oldest_first(obs):
    out, run = assemble(obs, [])
    assert [a["vintage"] for a in out["assessments"]] == ["EFO-2024-10", "EFO-2025-03", "EFO-2025-11"]
    nov = out["assessments"][-1]
    assert (nov["edition"], nov["table"], nov["url"]) == ("November 2025", "Table 7.1", edition_url("EFO-2025-11"))
    assert nov["table_title"] == "Performance against the Government's fiscal targets"
    assert out["latest_forecast"] is None
    assert [s["id"] for s in out["sources"]] == ["obr_fiscal_targets"]
    assert not [c for c in run.checks if c.level != "info"]


def test_a_newer_forecast_confirmed_as_not_assessed(obs):
    efo = [_efo("fiscal.current_budget_deficit", "2029-30", -23.56), _efo("fiscal.psnfl_pct_gdp", "2028-29", 82.93), _efo("fiscal.psnfl_pct_gdp", "2029-30", 82.17),
           _efo("fiscal.psnfl_pct_gdp", "2029-30", 80.0, vintage="EFO-2025-11")]
    out, run = assemble(obs, efo)
    latest = out["latest_forecast"]
    assert (latest["vintage"], latest["status"]) == ("EFO-2026-03", "not_assessed")
    assert [(o["series_id"], o["period"]) for o in latest["observations"]] == [
        ("fiscal.current_budget_deficit", "2029-30"), ("fiscal.psnfl_pct_gdp", "2028-29"), ("fiscal.psnfl_pct_gdp", "2029-30")]
    assert {o["vintage"] for o in latest["observations"]} == {"EFO-2026-03"}
    assert sorted(s["id"] for s in out["sources"]) == ["obr_efo", "obr_fiscal_targets"]
    assert not [c for c in run.checks if c.level != "info"]


def test_a_newer_forecast_not_confirmed_is_pending_with_a_warning(obs):
    efo = [_efo("fiscal.current_budget_deficit", "2029-30", -20.0, vintage="EFO-2026-11")]
    out, run = assemble(obs, efo)
    assert out["latest_forecast"]["status"] == "pending"
    assert any(c.level == "warning" and "EFO-2026-11" in c.message for c in run.checks)
