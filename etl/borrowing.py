"""
What /borrowing reads (data/build/borrowing.json): borrowing so far this financial year, month
by month, against the OBR's monthly path for the year. From committed observations only, so
the offline rebuild in CI reproduces it byte for byte.

  ons_psf               ONS public sector finances: borrowing each month (psf.psnb_ex), newest release
  obr_monthly_profiles  OBR monthly profiles: the same months as the OBR forecast them (psf.psnb_ex, forecast)
  obr_efo               the OBR's forecast for the whole year (fiscal.psnb), newest edition

The year is the financial year of the newest month ONS has published. Every figure comes from
one ONS release and one OBR profile edition, never a mix: ONS revises earlier months in each
release, and a later OBR file may cover fewer months. Totals so far are sums of published
monthly values, "sourced" with a method note, as for the fiscal years in ons_psf: the ONS
bulletin's year-to-date figures are the same sums (22 September 2026: £77.3bn for April to
August 2026, £2.2bn less than a year earlier and £8.1bn above the OBR forecast). The OBR
publishes its path as one line with no range, and the page says so instead of drawing one.
"""

from __future__ import annotations

import calendar
from zoneinfo import ZoneInfo

from etl.build import Run, edition_rank
from etl.core import Observation, fiscal_year

ONS = "ons_psf"
PROFILES = "obr_monthly_profiles"
EFO = "obr_efo"
MONTHLY = "psf.psnb_ex"
YEARLY = "fiscal.psnb"
UK = ZoneInfo("Europe/London")
# The OBR's profile and its EFO give the same year when they are the same edition.
YEAR_TOLERANCE_BN = 0.05


def _fy_months(start: int) -> list[str]:
    return [f"{start}-{m:02d}" for m in range(4, 13)] + [f"{start + 1}-{m:02d}" for m in range(1, 4)]


def _fy_start(period: str) -> int:
    y, m = int(period[:4]), int(period[5:7])
    return y if m >= 4 else y - 1


def _month(period: str) -> str:
    return calendar.month_name[int(period[5:7])]


def span(first: str, last: str) -> str:
    """("2026-04", "2026-08") -> "April to August 2026"; across a new year, "April 2026 to January 2027"."""
    if first == last:
        return f"{_month(first)} {first[:4]}"
    if first[:4] == last[:4]:
        return f"{_month(first)} to {_month(last)} {last[:4]}"
    return f"{_month(first)} {first[:4]} to {_month(last)} {last[:4]}"


def edition_label(vintage: str) -> str:
    """"EFO-2026-03" -> "March 2026"."""
    return f"{calendar.month_name[int(vintage[9:11])]} {vintage[4:8]}"


def _newest(vintages) -> str:
    return max(vintages, key=edition_rank)


def _prov(o: Observation, note: str) -> dict:
    return {"quality": o.quality, "source_id": o.source_id, "vintage": o.vintage, "method_note": note}


def _running(values: list[float]) -> list[float]:
    out, total = [], 0.0
    for v in values:
        total += v
        out.append(round(total, 3))
    return out


def _edition(obs: list[Observation], series: str, periods: list[str]) -> tuple[str, dict[str, Observation]] | None:
    """The newest edition that has every one of `periods` for `series`, with its observations by period."""
    by: dict[str, dict[str, Observation]] = {}
    for o in obs:
        if o.series_id == series and o.period in periods:
            by.setdefault(o.vintage, {})[o.period] = o
    complete = [v for v, rows in by.items() if all(p in rows for p in periods)]
    if not complete:
        return None
    v = _newest(complete)
    return v, by[v]


def release_for(run: Run, vintage: str, through: str) -> dict | None:
    """The ONS release the figures come from, as ons_psf recorded it, if it is this edition's (title, date and label agree)."""
    from etl.sources.ons_psf import release_title, vintage_for

    src = run.sources.get(ONS)
    release = src.release if src else None
    if release is None:
        run.add("coverage", "warning", "borrowing", "no ONS release recorded for ons_psf; /borrowing links the dataset without a release time")
        return None
    same = src.published_on is not None and vintage_for(src.published_on) == vintage and release.title == release_title(through)
    if same and release.released_at is not None:
        same = release.released_at.astimezone(UK).date() == src.published_on
    if not same:
        run.add("coverage", "warning", "borrowing", f"the recorded ONS release ({release.title}) is not the edition used ({vintage}); left out")
        return None
    return release.model_dump(mode="json")


def assemble_borrowing(by_source: dict[str, list[Observation]], run: Run, sources: list[dict]) -> dict:
    ons_all = [o for o in by_source.get(ONS, []) if o.series_id == MONTHLY]
    if not ons_all:
        run.add("coverage", "error", "borrowing", f"no monthly borrowing ({ONS} {MONTHLY}) in the committed observations")
        return {}
    vintage = _newest({o.vintage for o in ons_all})
    ons = {o.period: o for o in ons_all if o.vintage == vintage}
    through = max(ons)
    start = _fy_start(through)
    fy = fiscal_year(start)
    months = _fy_months(start)
    so_far = [m for m in months if m <= through]
    if missing := [m for m in so_far if m not in ons]:
        run.add("coverage", "error", "borrowing", f"{ONS} {vintage} lacks {', '.join(missing)}")
        return {}
    first, last = so_far[0], so_far[-1]
    latest = ons[last]

    outturn = [ons[m].value for m in so_far]
    out_note = (f"Public sector net borrowing excluding public sector banks (PSNB ex, ONS series DZLS) in each month, "
                f"as published in the ONS release of {vintage}.")
    sum_note = (f"Sum of the monthly values ONS published for {span(first, last)} (series DZLS). "
                "The ONS bulletin gives the same total for the financial year so far.")
    bundle: dict = {
        "fiscal_year": fy,
        "months": months,
        "through": through,
        "outturn": {"values": [round(v, 3) for v in outturn], "cumulative": _running(outturn), "provenance": _prov(latest, out_note)},
        "so_far": {"outturn": {"bn": round(sum(outturn), 3), **_prov(latest, sum_note)}},
    }

    # The same months a year earlier, from the same release (ONS revises past months, so not last year's own release).
    last_months = _fy_months(start - 1)
    if all(m in ons for m in last_months):
        prev = [ons[m].value for m in last_months]
        prev_so_far = prev[: len(so_far)]
        bundle["last_year"] = {
            "fiscal_year": fiscal_year(start - 1),
            "values": [round(v, 3) for v in prev],
            "cumulative": _running(prev),
            "provenance": _prov(ons[last_months[-1]], f"ONS borrowing in each month of {fiscal_year(start - 1)}, as revised in the release of {vintage} (series DZLS)."),
        }
        bundle["so_far"]["last_year"] = {
            "bn": round(sum(prev_so_far), 3),
            **_prov(ons[last_months[len(so_far) - 1]], f"Sum of the monthly values for {span(last_months[0], last_months[len(so_far) - 1])} "
                    f"in the ONS release of {vintage} (series DZLS). ONS revises past months, so this can differ from what it published a year ago."),
        }
    else:
        bundle["last_year"] = None
        run.add("coverage", "warning", "borrowing", f"{ONS} {vintage} lacks some months of {fiscal_year(start - 1)}; no comparison with last year")

    # The OBR's monthly path: the newest edition covering the whole year.
    found = _edition(by_source.get(PROFILES, []), MONTHLY, months)
    if found:
        pv, rows = found
        path = [rows[m].value for m in months]
        year_obs = next((o for o in by_source.get(PROFILES, []) if o.series_id == YEARLY and o.period == fy and o.vintage == pv), None)
        src = run.sources.get(PROFILES)
        newest_profile = _newest({o.vintage for o in by_source.get(PROFILES, [])})
        edition = edition_label(pv)
        path_note = f"The OBR's monthly profile for {fy}, consistent with its {edition} forecast. The OBR publishes one path with no range, and calls it broad-brush and illustrative."
        bundle["profile"] = {
            "edition": edition,
            "published_on": src.published_on.isoformat() if src and src.published_on and pv == newest_profile else None,
            "range": "point",
            "values": [round(v, 3) for v in path],
            "cumulative": _running(path),
            "year_bn": round(year_obs.value if year_obs else sum(path), 3),
            "provenance": _prov(rows[months[0]], path_note),
        }
        planned = sum(path[: len(so_far)])
        bundle["so_far"]["profile"] = {
            "bn": round(planned, 3),
            **_prov(rows[last], f"Sum of the OBR's monthly profile for {span(first, last)}, consistent with its {edition} forecast."),
        }
        bundle["so_far"]["difference"] = {
            "bn": round(sum(outturn) - planned, 3),
            "quality": "sourced",
            "source_id": ONS,
            "vintage": f"{vintage} + {pv}",
            "method_note": (f"ONS borrowing for {span(first, last)} minus the OBR's monthly profile for the same months "
                            f"({edition} forecast). The ONS bulletin makes the same comparison."),
        }
    else:
        bundle["profile"] = None
        run.add("coverage", "warning", "borrowing", f"no OBR monthly profile covering {fy}; /borrowing shows ONS figures only")

    # The OBR's newest forecast for the whole year, which may be newer than its monthly path.
    efo = [o for o in by_source.get(EFO, []) if o.series_id == YEARLY and o.period == fy]
    if efo:
        o = max(efo, key=lambda x: edition_rank(x.vintage))
        bundle["year_forecast"] = {
            "bn": round(o.value, 3),
            "edition": edition_label(o.vintage),
            **_prov(o, f"The OBR's forecast of borrowing for the whole of {fy}, from its {edition_label(o.vintage)} Economic and fiscal outlook."),
        }
        p = bundle.get("profile")
        if p and o.vintage == found[0] and abs(o.value - p["year_bn"]) > YEAR_TOLERANCE_BN:
            run.add("mapping", "warning", "borrowing", f"OBR profile year {p['year_bn']:.2f}bn differs from the {o.vintage} forecast {o.value:.2f}bn")
    else:
        bundle["year_forecast"] = None

    bundle["release"] = release_for(run, vintage, through)
    bundle["sources"] = [s for s in sources if s["id"] in (ONS, PROFILES, EFO)]
    return bundle
