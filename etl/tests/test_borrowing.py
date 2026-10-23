"""
/borrowing (etl/borrowing.py): borrowing so far this year against the OBR's monthly path, from committed
observations. No network: the committed editions are the release of 21 October 2026 (PSF-2026-10) and
the OBR's March 2026 profiles (EFO-2026-03).
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone

import pytest

from etl import build
from etl.borrowing import assemble_borrowing, edition_label, span
from etl.build import BUILD_DIR, Run
from etl.core import Observation, Release
from etl.sources import obr_efo, obr_monthly_profiles, ons_psf

SOURCES = (ons_psf, obr_monthly_profiles, obr_efo)


def committed_run() -> tuple[dict[str, list[Observation]], Run, list[dict]]:
    """What the offline build has: every committed edition, and each source as the last online build recorded it."""
    from etl.assemble import source_entries

    run = Run(build_id="test", started_at="2026-10-12T00:00:00+00:00", trigger="test")
    recorded = build.manifest_sources()
    for mod in SOURCES:
        run.sources[mod.SOURCE.id] = build.recorded_source(mod.SOURCE, recorded)
    by_source = {mod.SOURCE.id: build.read_committed(mod.SOURCE.id) for mod in SOURCES}
    return by_source, run, source_entries(run)


@pytest.fixture(scope="module")
def bundle() -> dict:
    by_source, run, sources = committed_run()
    out = assemble_borrowing(by_source, run, sources)
    assert not [c for c in run.checks if c.level != "info"], run.checks
    return out


def test_committed_file_is_up_to_date(bundle):
    # CI's offline rebuild writes the same bundle; this catches a change to etl/borrowing.py merged without one.
    assert json.loads((BUILD_DIR / "borrowing.json").read_text()) == json.loads(json.dumps(bundle))


def test_so_far_matches_the_ons_bulletin(bundle):
    # ONS, 21 October 2026: "£97.8 billion. This was £4.4 billion (4.3%) less than in the same period last year
    # but £6.0 billion above the Office for Budget Responsibility (OBR) forecast".
    s = bundle["so_far"]
    assert (bundle["fiscal_year"], bundle["through"]) == ("2026-27", "2026-09")
    assert round(s["outturn"]["bn"], 1) == 97.8
    assert round(s["last_year"]["bn"] - s["outturn"]["bn"], 1) == 4.4
    assert round(s["difference"]["bn"], 1) == 6.0
    assert s["difference"]["bn"] == pytest.approx(s["outturn"]["bn"] - s["profile"]["bn"], abs=1e-3)
    assert round(s["profile"]["bn"], 1) == 91.8


def test_paths(bundle):
    assert len(bundle["months"]) == 12 and bundle["months"][0] == "2026-04" and bundle["months"][-1] == "2027-03"
    out, prof, last = bundle["outturn"], bundle["profile"], bundle["last_year"]
    assert len(out["values"]) == len(out["cumulative"]) == 6
    assert len(prof["values"]) == len(prof["cumulative"]) == len(last["values"]) == 12
    assert out["cumulative"][-1] == bundle["so_far"]["outturn"]["bn"]
    assert prof["cumulative"][5] == bundle["so_far"]["profile"]["bn"]
    assert prof["cumulative"][-1] == pytest.approx(prof["year_bn"], abs=1e-3) == pytest.approx(bundle["year_forecast"]["bn"], abs=1e-3)
    assert (prof["edition"], prof["published_on"], prof["range"]) == ("March 2026", "2026-04-23", "point")
    assert last["fiscal_year"] == "2025-26" and last["cumulative"][-1] == pytest.approx(134.211, abs=1e-3)  # ONS, 21 October 2026: "£134.2 billion in the financial year ending March 2026"


def test_provenance(bundle):
    every = [bundle["outturn"]["provenance"], bundle["profile"]["provenance"], bundle["last_year"]["provenance"], bundle["year_forecast"],
             *bundle["so_far"].values()]
    for p in every:
        assert p["quality"] == "sourced" and p["source_id"] and p["vintage"] and p["method_note"]
    assert bundle["so_far"]["outturn"]["vintage"] == "PSF-2026-10"
    assert bundle["so_far"]["profile"]["vintage"] == "EFO-2026-03"
    assert {s["id"] for s in bundle["sources"]} == {"ons_psf", "obr_monthly_profiles", "obr_efo"}


def test_release_is_the_one_used(bundle):
    r = bundle["release"]
    assert r["title"] == "Public sector finances, UK: September 2026"
    assert r["released_at"] == "2026-10-21T06:00:00Z" and (r["next_on"], r["next_at"]) == ("2026-11-20", "2026-11-20T07:00:00Z")


# ------------------------------------------------------------------ cases the committed data does not cover


def _o(source: str, series: str, period: str, value: float, vintage: str, kind: str = "outturn") -> Observation:
    return Observation(series_id=series, period=period, value=value, unit="gbp_bn", kind=kind, source_id=source, vintage=vintage, quality="sourced")


def _months(start: int) -> list[str]:
    return [f"{start}-{m:02d}" for m in range(4, 13)] + [f"{start + 1}-{m:02d}" for m in range(1, 4)]


def _run(release: Release | None = None, published: date | None = date(2027, 1, 22)) -> Run:
    run = Run(build_id="test", started_at="", trigger="test")
    run.sources["ons_psf"] = ons_psf.SOURCE.model_copy(update={"published_on": published, "release": release})
    return run


def _ons(through: str, vintage: str = "PSF-2027-01") -> list[Observation]:
    return [_o("ons_psf", "psf.psnb_ex", p, 10.0, vintage) for p in _months(2025) + _months(2026) if p <= through]


def test_a_year_running_into_january():
    run = _run()
    out = assemble_borrowing({"ons_psf": _ons("2026-12")}, run, [])
    assert out["through"] == "2026-12" and len(out["outturn"]["values"]) == 9
    assert "April to December 2026" in out["so_far"]["outturn"]["method_note"]
    assert out["profile"] is None and "difference" not in out["so_far"]
    assert ("coverage", "warning") in {(c.check_id, c.level) for c in run.checks}
    assert span("2026-04", "2027-01") == "April 2026 to January 2027" and span("2026-04", "2026-04") == "April 2026"


def test_newest_complete_profile_and_newer_forecast():
    march = [_o("obr_monthly_profiles", "psf.psnb_ex", p, 9.0, "EFO-2026-03", "forecast") for p in _months(2026)]
    # A later file that covers only part of the year is not used: a path must be one edition from April to March.
    partial = [_o("obr_monthly_profiles", "psf.psnb_ex", p, 8.0, "EFO-2026-11", "forecast") for p in _months(2026)[7:]]
    efo = [_o("obr_efo", "fiscal.psnb", "2026-27", 108.0, "EFO-2026-03", "forecast"), _o("obr_efo", "fiscal.psnb", "2026-27", 120.0, "EFO-2026-11", "forecast")]
    run = _run()
    out = assemble_borrowing({"ons_psf": _ons("2026-08"), "obr_monthly_profiles": march + partial, "obr_efo": efo}, run, [])
    assert out["profile"]["edition"] == "March 2026" and out["profile"]["values"] == [9.0] * 12
    assert out["profile"]["year_bn"] == 108.0  # no year row in this edition: the months' sum
    assert (out["year_forecast"]["bn"], out["year_forecast"]["edition"]) == (120.0, "November 2026")
    assert out["so_far"]["difference"]["bn"] == pytest.approx(5 * (10.0 - 9.0))


def test_a_release_from_another_edition_is_left_out():
    other = Release(title="Public sector finances, UK: July 2026", url="https://example.org/b", calendar_url="https://example.org/c",
                    released_at=datetime(2026, 8, 21, 6, tzinfo=timezone.utc))
    run = _run(other, published=date(2026, 8, 21))
    out = assemble_borrowing({"ons_psf": _ons("2026-08", "PSF-2026-09")}, run, [])
    assert out["release"] is None
    assert any("not the edition used" in c.message for c in run.checks)


def test_no_monthly_borrowing_is_an_error():
    run = _run()
    assert assemble_borrowing({}, run, []) == {}
    assert [(c.check_id, c.level) for c in run.checks] == [("coverage", "error")]


def test_edition_label():
    assert edition_label("EFO-2026-03") == "March 2026"
