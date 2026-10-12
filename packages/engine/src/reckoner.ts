import type { Quality, Range } from "@ledger/schema";
import { STEP_TOLERANCE } from "@ledger/schema";
import { baseSettings, type Model } from "./model";
import { encodeScenario } from "./scenario";

/**
 * Ready-reckoner cards (/tax): what one change to a tax raises, as HMRC costs
 * it. The figures are the sandbox's own: the lever's year-one and last-year
 * ranges (HMRC's central figure with the editorial band). The observations
 * they were built from give the years, the edition and the quality, and must
 * agree with the lever, or the build stops: a card can never show a number
 * the sandbox does not use.
 */

/** One row of data/build/observations/<source>/<vintage>.csv, as the cards need it. */
export interface ReckonerObservation {
  series_id: string;
  period: string;
  value: number;
  source_id: string;
  vintage: string;
  quality: Quality;
  method_note?: string;
}

/** A lever on a card, and the observation series for the change the source costs. */
export interface ReckonerChangeSpec {
  lever_id: string;
  /**
   * The source's series for the change, e.g. "reckoner.vat_standard_rate_1pp".
   * For a stepped lever, "{at}" stands for each step: "reckoner.cgt_lower_rate_{at}pp".
   */
  series: string;
}

export interface ReckonerYear {
  /** Fiscal year, e.g. "2026-27". */
  period: string;
  /** Change in receipts, £bn: [low, central, high]. Positive raises money, negative loses it. */
  range: Range;
}

export interface ReckonerChange {
  lever_id: string;
  /** Units the change moves the lever: one for a per-unit lever, the source's own step for a stepped one. */
  by: number;
  /** The lever's value today, and after the change. */
  from: number;
  to: number;
  series_id: string;
  /** The first year the source costs: the change is made at its start. */
  first: ReckonerYear;
  /** The last year the source shows. */
  last: ReckonerYear;
  source_id: string;
  vintage: string;
  quality: Quality;
  /** Scenario code that opens the sandbox with this change made: `/?s=<code>`. */
  scenario: string;
}

/** A per-unit lever's card shows one unit of change: 1p, or one percentage point. */
export const ONE_UNIT = 1;

/** Slack when matching a lever's central figure to the observation it came from (both are the source's own £m / 1000). */
const MATCH_TOLERANCE_BN = 1e-9;

/** "reckoner.cgt_lower_rate_{at}pp" with at = 5 → "reckoner.cgt_lower_rate_5pp". */
export const seriesFor = (series: string, at: number) => series.replace("{at}", String(at));

/**
 * The changes a card shows for one lever: one unit for a per-unit lever, each
 * of the source's steps for a stepped one. Throws when the lever or its
 * observations are missing, when they disagree, or when the change would leave
 * the lever's range: better a failed build than a card that misquotes.
 */
export function reckonerChanges(model: Model, spec: ReckonerChangeSpec, observations: ReckonerObservation[], baseYear: string): ReckonerChange[] {
  const lever = model.leverById.get(spec.lever_id);
  if (!lever) throw new Error(`reckoner: no lever "${spec.lever_id}"`);
  const { steps, per_unit_bn } = lever.effect;
  const changes = steps
    ? steps.map((s) => ({ by: s.at, y1: s.y1, y5: s.y5, series_id: seriesFor(spec.series, s.at) }))
    : per_unit_bn
      ? [{ by: ONE_UNIT, y1: per_unit_bn.y1, y5: per_unit_bn.y5, series_id: spec.series }]
      : [];
  if (!changes.length) throw new Error(`reckoner: lever "${lever.id}" has no costing`);

  return changes.map(({ by, y1, y5, series_id }) => {
    const where = `reckoner: ${lever.id} +${by} (${series_id})`;
    if (!y5) throw new Error(`${where}: the lever has no last-year figure`);
    const rows = observations.filter((o) => o.series_id === series_id).sort((a, b) => a.period.localeCompare(b.period));
    const first = rows[0];
    const last = rows.at(-1);
    if (!first || !last || first === last) throw new Error(`${where}: needs observations for at least two years`);
    if (Math.abs(first.value - y1[1]) > MATCH_TOLERANCE_BN)
      throw new Error(`${where}: lever says ${y1[1]} in its first year, the observation for ${first.period} says ${first.value}`);
    if (Math.abs(last.value - y5[1]) > MATCH_TOLERANCE_BN)
      throw new Error(`${where}: lever says ${y5[1]} in its last year, the observation for ${last.period} says ${last.value}`);
    for (const r of rows) {
      if (r.vintage !== first.vintage) throw new Error(`${where}: observations from two editions (${first.vintage}, ${r.vintage})`);
      if (r.source_id !== lever.source_id) throw new Error(`${where}: observation from "${r.source_id}", lever from "${lever.source_id}"`);
    }
    const to = lever.base + by;
    if (to > lever.max + STEP_TOLERANCE) throw new Error(`${where}: ${to} is above the lever's maximum ${lever.max}`);
    return {
      lever_id: lever.id,
      by,
      from: lever.base,
      to,
      series_id,
      first: { period: first.period, range: y1 },
      last: { period: last.period, range: y5 },
      source_id: first.source_id,
      vintage: first.vintage,
      // The figure shown is the lever's (the observation with its editorial range), so its quality is the lever's.
      quality: lever.quality,
      scenario: encodeScenario(model, { ...baseSettings(model), [lever.id]: to }, baseYear),
    };
  });
}

/**
 * The editorial band around the source's central figure, as a share of it
 * (0.1 for ±10%); null when the range is not symmetric or the centre is zero.
 */
export function relativeBand([low, central, high]: Range): number | null {
  if (central === 0) return null;
  const up = (high - central) / Math.abs(central);
  const down = (central - low) / Math.abs(central);
  return Math.abs(up - down) < 1e-9 ? up : null;
}

/** Among one-unit changes, the one whose central figure is largest in the given year; ties go to the first. */
export function largestPerUnit<T extends Pick<ReckonerChange, "by" | "first" | "last">>(changes: T[], year: "first" | "last"): T | undefined {
  return changes.filter((c) => c.by === ONE_UNIT).reduce<T | undefined>((best, c) => (!best || c[year].range[1] > best[year].range[1] ? c : best), undefined);
}
