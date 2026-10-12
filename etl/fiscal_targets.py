"""
What /budget/how-it-works reads (data/build/fiscal_targets.json): the OBR's headroom against
each fiscal rule at every forecast that assessed them, from committed observations only, so the
offline rebuild in CI reproduces it byte for byte.

  obr_fiscal_targets   each assessing EFO's own fiscal targets table (etl/sources/obr_fiscal_targets.py)
  obr_efo              the newest EFO's figures for the measures the rules use, when that forecast
                       made no assessment (a spring forecast since February 2026)

Nothing is worked out here: every value is an observation as published, with its table and row.
The newest EFO is described as "not assessed" only when a person has confirmed it in
obr_fiscal_targets.NOT_ASSESSED; a newer EFO that is neither assessed nor confirmed is "pending"
and raises a coverage warning, so a table the module failed to find is never reported as no assessment.
"""

from __future__ import annotations

import calendar

from etl.build import Run, Store, edition_rank
from etl.core import Observation
from etl.sources import obr_fiscal_targets

SOURCE_ID = obr_fiscal_targets.SOURCE.id
EFO = "obr_efo"
RULES = ("current_budget", "psnfl", "welfare_cap")


def edition_label(vintage: str) -> str:
    """'EFO-2025-11' -> 'November 2025'."""
    y, m = vintage.removeprefix("EFO-").split("-")
    return f"{calendar.month_name[int(m)]} {y}"


def edition_url(vintage: str) -> str:
    """The OBR's page for an EFO edition, by its stable address."""
    y, m = vintage.removeprefix("EFO-").split("-")
    return f"https://obr.uk/efo/economic-and-fiscal-outlook-{calendar.month_name[int(m)].lower()}-{y}/"


def _obs(o: Observation) -> dict:
    return o.model_dump(exclude_none=True)


def _table_of(rows: list[Observation]) -> tuple[str, str]:
    """('Table 7.1', 'Performance against ...') from the method notes, which name the table read."""
    note = next((o.method_note for o in rows if o.method_note), "")
    name, _, rest = note.partition(" (")
    return name, rest.split("), row ", 1)[0]


def assemble_fiscal_targets(by_source: dict[str, list[Observation]], store: Store, run: Run, sources: list[dict]) -> dict:
    rows = by_source.get(SOURCE_ID, [])
    if not rows:
        run.add("coverage", "error", "fiscal targets", "no obr_fiscal_targets observations committed")
        return {}
    by_vintage: dict[str, list[Observation]] = {}
    for o in rows:
        by_vintage.setdefault(o.vintage, []).append(o)

    assessments = []
    for vintage in sorted(by_vintage, key=edition_rank):
        obs = sorted(by_vintage[vintage], key=lambda o: (RULES.index(o.series_id.split(".")[1]), o.series_id))
        missing = [r for r in ("current_budget", "psnfl") if not any(o.series_id == f"fiscal_targets.{r}.margin" for o in obs)]
        if missing:
            run.add("coverage", "error", f"fiscal targets {vintage}", f"no margin for {missing}")
            continue
        table, title = _table_of(obs)
        assessments.append({
            "vintage": vintage,
            "edition": edition_label(vintage),
            "url": edition_url(vintage),
            "table": table,
            "table_title": title,
            "observations": [_obs(o) for o in obs],
        })
    if not assessments:
        return {}
    newest = assessments[-1]

    # The newest EFO, if it is newer than the newest assessment.
    latest = None
    efo_vintages = sorted({o.vintage for o in by_source.get(EFO, [])}, key=edition_rank)
    if efo_vintages and edition_rank(efo_vintages[-1]) > edition_rank(newest["vintage"]):
        vintage = efo_vintages[-1]
        confirmed = vintage in obr_fiscal_targets.NOT_ASSESSED
        if not confirmed:
            run.add("coverage", "warning", "fiscal targets",
                    f"{vintage} is newer than the newest recorded assessment ({newest['vintage']}) and is not listed as making none; "
                    "check its fiscal targets table (etl/sources/obr_fiscal_targets.py)")
        target = next(o["period"] for o in newest["observations"] if o["series_id"] == "fiscal_targets.current_budget.margin")
        before = f"{int(target[:4]) - 1}-{target[2:4]}"
        picked = [
            store.idx.get((series, period, EFO))
            for series, period in (("fiscal.current_budget_deficit", target), ("fiscal.psnfl_pct_gdp", before), ("fiscal.psnfl_pct_gdp", target))
        ]
        picked = [o for o in picked if o is not None and o.vintage == vintage]
        if len(picked) < 3:
            run.add("coverage", "warning", "fiscal targets", f"{vintage}: no current budget or net financial liabilities figures for {target}")
        latest = {
            "vintage": vintage,
            "edition": edition_label(vintage),
            "url": edition_url(vintage),
            "status": "not_assessed" if confirmed else "pending",
            "observations": [_obs(o) for o in picked],
        }

    used = {SOURCE_ID} | ({EFO} if latest else set())
    return {
        "assessments": assessments,
        "latest_forecast": latest,
        "sources": [s for s in sources if s["id"] in used],
    }
