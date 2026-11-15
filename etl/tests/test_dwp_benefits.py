"""Tests for etl/sources/dwp_benefits.py against the real DWP outturn and forecast tables."""

from __future__ import annotations

import json
import math

import pytest

from etl.core import RAW_DIR, RawArtifact
from etl.sources import dwp_benefits


@pytest.fixture(scope="module")
def obs(request):
    if request.config.getoption("--offline"):
        raws = []
        for meta_path in sorted((RAW_DIR / dwp_benefits.SOURCE.id).glob("*.xlsx.meta.json")):
            meta = json.loads(meta_path.read_text())
            path = meta_path.with_name(meta_path.name[: -len(".meta.json")])
            raws.append(RawArtifact(dwp_benefits.SOURCE.id, meta["url"], path, meta["sha256"], meta["fetched_at"], meta.get("content_type"), meta.get("vintage")))
        if not raws:
            pytest.skip("offline and no cached DWP file")
    else:
        raws = dwp_benefits.fetch()
    return dwp_benefits.parse(raws)


def test_state_pension_series(obs):
    sp = {o.period: o for o in obs if o.series_id == "spending.state_pension"}
    cl = {o.period: o for o in obs if o.series_id == "people.state_pension_caseload"}
    for p in ("2020-21", "2024-25", "2025-26", "2026-27"):
        assert p in sp and p in cl, p
    assert sp["2024-25"].kind == "outturn"
    assert sp["2026-27"].kind == "forecast"
    # Plausibility in £bn and millions of people (guards against unit or column shifts).
    assert 130 < sp["2025-26"].value < 165
    assert sp["2026-27"].value > sp["2025-26"].value
    assert 11 < cl["2025-26"].value < 15
    for o in obs:
        assert math.isfinite(o.value)
        assert o.geography == "GB" and o.quality == "sourced" and o.vintage.startswith("DWP-")


# ------------------------------------------------------------- edition choice (recorded GOV.UK pages, no network)

def _page(year: int) -> dict:
    from pathlib import Path

    return json.loads((Path(__file__).parent / "fixtures" / "dwp" / f"govuk_tables_{year}.json").read_text())


def test_autumn_edition_on_the_same_yearly_page_wins_and_is_dated_when_added():
    from datetime import date

    att, vintage, published = dwp_benefits.choose_edition(_page(2025))
    assert "autumn-budget-2025.xlsx" in att["url"]
    assert vintage == "DWP-AB-2025"  # the title ends "(XLS)"; it used to fall back to "DWP-2025"
    assert published == date(2025, 12, 18)  # the change note that added it, not the page's 22 Apr 2025


def test_spring_only_page_uses_first_published():
    from datetime import date

    att, vintage, published = dwp_benefits.choose_edition(_page(2026))
    assert "spring-forecast-2026.xlsx" in att["url"]
    assert vintage == "DWP-SF-2026"
    assert published == date(2026, 4, 14)


def test_spring_edition_title_with_xls_suffix():
    assert dwp_benefits._vintage("Outturn and forecast tables: Spring Statement 2025 (XLS)", "2025") == "DWP-SS-2025"
