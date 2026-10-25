import type { Baseline, Metric, VersionParameters } from "./content";

/**
 * A card's target beside the forecast published before the promise (OpenPromises decision 36), in numbers and words,
 * for the card page, its Markdown and its share image alike, so the three always agree. The site never scores a
 * promise against the forecast; it shows both and says how far apart they are.
 */
export interface ForecastGap {
  metric: Metric;
  baseline: Baseline;
  /** The top of a scale that starts at 0 and holds both figures. */
  max: number;
  /** The target is a ceiling (below, at most), not a floor (at least). */
  ceiling: boolean;
  /** The forecast already met the target. */
  met: boolean;
  /** "5.25%" */
  short: (x: number) => string;
  /** "Target: at most 5.25%" */
  targetLabel: string;
  /** "Forecast: 3.75%" */
  forecastLabel: string;
  /** "At most 5.25% by 31 December 2023" */
  targetText: string;
  /** "3.75% by 31 December 2023, the OBR's forecast of 17 November 2022, before the promise" */
  forecastText: string;
  /** "The forecast at the time already met the target." or "The target is 1.6 percentage points below the forecast at the time." */
  words: string;
}

const DIRECTION: Record<Metric["direction"], string> = { at_least: "at least", at_most: "at most", below: "below" };
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function forecastGap(p: VersionParameters | undefined): ForecastGap | null {
  const metric = p?.metric;
  const baseline = p?.baseline;
  if (!metric || !baseline || metric.unit !== baseline.unit) return null;
  const pct = metric.unit.startsWith("%");
  const n = (x: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(x);
  // A percentage is written against its number ("5.25%"); any other unit after a space ("18 weeks").
  const short = (x: number) => `${n(x)}${pct ? metric.unit : ` ${metric.unit}`}`;
  const ceiling = metric.direction !== "at_least";
  const met = metric.direction === "below" ? baseline.value < metric.target : metric.direction === "at_most" ? baseline.value <= metric.target : baseline.value >= metric.target;
  const gap = Math.abs(baseline.value - metric.target);
  const dir = DIRECTION[metric.direction];
  return {
    metric,
    baseline,
    max: Math.ceil(Math.max(metric.target, baseline.value) * 1.25),
    ceiling,
    met,
    short,
    targetLabel: `Target: ${dir} ${short(metric.target)}`,
    forecastLabel: `Forecast: ${short(baseline.value)}`,
    targetText: `${dir[0]!.toUpperCase()}${dir.slice(1)} ${short(metric.target)} by ${day(metric.by)}`,
    forecastText: `${short(baseline.value)} by ${day(baseline.for)}, the ${baseline.by.name}'s forecast of ${day(baseline.published_on)}, before the promise`,
    words: met
      ? "The forecast at the time already met the target."
      : `The target is ${n(gap)} ${pct ? "percentage points" : metric.unit} ${ceiling ? "below" : "above"} the forecast at the time.`,
  };
}
