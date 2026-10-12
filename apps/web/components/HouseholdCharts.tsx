import type { ReactNode } from "react";
import { scaleBand, scaleLinear } from "d3-scale";
import { fixed, MINUS } from "@/lib/format";

/**
 * Charts for "The Budget for your household": change by income tenth, one or two series side by side
 * (the headline year and the one beside it, or the Treasury's two bars), drawn on the server. Every chart has
 * its table (CLAUDE.md, accessibility), folded under it. No figures of its own: everything comes in as props.
 */

export interface DecileSeries {
  label: string;
  /** Deciles 1 to 10, % change. */
  values: number[];
  /** Low and high around each value (the editorial band), drawn as whiskers. */
  ranges?: [number, number][];
}

const GEO = { height: 270, margin: { left: 48, right: 8, top: 24, bottom: 30 }, ticks: 4, padding: 0.3, room: 0.2, cap: 4, gap: 4 } as const;
/** viewBox widths: the main chart, and the smaller one beside it (same height, so text reads the same size). */
const WIDTH = { main: 640, compact: 340 } as const;

const tickText = (t: number, dp: number) => `${t < 0 ? MINUS : ""}${fixed(Math.abs(t), dp)}%`;
const fill = (v: number) => (v < 0 ? "var(--debt)" : "var(--good)");

/** One scale for charts shown side by side, so bar heights compare across them. */
export function decileDomain(...series: DecileSeries[]): [number, number] {
  const all = series.flatMap((s) => [...s.values, ...(s.ranges?.flat() ?? [])]);
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all);
  if (lo === 0 && hi === 0) return [-1, 1];
  const room = (hi - lo) * GEO.room;
  return [lo < 0 ? lo - room : lo, hi > 0 ? hi + room : hi];
}

/**
 * Percentage change by income tenth: bars, whiskers for the range, and (on the main chart) each bar's value.
 * `compact`: the smaller chart beside the main one, without value labels (its table has them).
 */
export function DecileBars({
  bars,
  label,
  valueText,
  domain,
  compact = false,
}: {
  bars: DecileSeries;
  label: string;
  valueText: (v: number) => string;
  domain?: [number, number];
  compact?: boolean;
}) {
  const W = compact ? WIDTH.compact : WIDTH.main;
  const { height: H, margin: m } = GEO;
  const y = scaleLinear()
    .domain(domain ?? decileDomain(bars))
    .range([H - m.bottom, m.top])
    .nice(GEO.ticks);
  const deciles = Array.from({ length: 10 }, (_, i) => i + 1);
  const x = scaleBand<number>().domain(deciles).range([m.left, W - m.right]).padding(GEO.padding);
  const ticks = y.ticks(GEO.ticks);
  const step = Math.abs((ticks[1] ?? 1) - (ticks[0] ?? 0));
  const dp = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  const y0 = y(0);
  const bw = x.bandwidth();
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="fan block h-auto w-full" role="img" aria-label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={m.left} x2={W - m.right} y1={y(t)} y2={y(t)} style={{ stroke: t === 0 ? "var(--faint)" : "var(--line)" }} />
          <text x={m.left - 8} y={y(t) + 4} textAnchor="end">
            {tickText(t, dp)}
          </text>
        </g>
      ))}
      {deciles.map((d, di) => {
        const v = bars.values[di]!;
        const bx = x(d) ?? 0;
        const cx = bx + bw / 2;
        const yv = y(v);
        const r = bars.ranges?.[di];
        const ends = [v, ...(r ?? [])];
        return (
          <g key={d}>
            <rect x={bx} width={bw} y={Math.min(y0, yv)} height={Math.max(Math.abs(yv - y0), 0.5)} rx={1.5} style={{ fill: fill(v) }} />
            {r && (
              <g style={{ stroke: "var(--ink)", strokeOpacity: 0.5, strokeWidth: 1.1 }}>
                <line x1={cx} x2={cx} y1={y(r[0])} y2={y(r[1])} />
                <line x1={cx - GEO.cap} x2={cx + GEO.cap} y1={y(r[0])} y2={y(r[0])} />
                <line x1={cx - GEO.cap} x2={cx + GEO.cap} y1={y(r[1])} y2={y(r[1])} />
              </g>
            )}
            {!compact && (
              <text
                x={cx}
                y={v < 0 ? y(Math.min(...ends)) + GEO.gap : y(Math.max(...ends)) - GEO.gap}
                dominantBaseline={v < 0 ? "hanging" : "auto"}
                textAnchor="middle"
                style={{ fill: "var(--ink)", fontWeight: 500 }}
              >
                <tspan className="max-sm:hidden">{valueText(v)}</tspan>
                <tspan className="sm:hidden">{valueText(v).replace("%", "")}</tspan>
              </text>
            )}
            <text x={cx} y={H - 8} textAnchor="middle">
              {d}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** The year (or measure) the page leads with, large and labelled, and the one beside it, smaller, on the same scale. */
export function DecilePair({ main, beside, label, valueText }: { main: DecileSeries; beside: DecileSeries; label: string; valueText: (v: number) => string }) {
  const domain = decileDomain(main, beside);
  return (
    <figure className="m-0 grid gap-2" aria-label={label}>
      <div className="grid items-end gap-x-8 gap-y-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid gap-1">
          <p className="m-0 text-label font-semibold text-ink">{main.label}</p>
          <DecileBars bars={main} label={`${main.label}. ${label}`} valueText={valueText} domain={domain} />
        </div>
        <div className="grid gap-1">
          <p className="m-0 text-label font-medium text-muted">{beside.label}</p>
          <DecileBars bars={beside} label={`${beside.label}. ${label}`} valueText={valueText} domain={domain} compact />
        </div>
      </div>
      <figcaption className="text-caption text-muted">Income tenth: 1 is the lowest incomes, 10 the highest. Both charts share one scale.</figcaption>
    </figure>
  );
}

/** "Show as table" under a chart, without script: a native disclosure, keyboard-operable, scrolling sideways on phones. */
export function TableView({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="cursor-pointer text-label font-medium text-accent">
        <span className="group-open:hidden">Show as table</span>
        <span className="hidden group-open:inline">Hide table</span>
      </summary>
      <div role="region" aria-label={label} tabIndex={0} className="mt-3 overflow-x-auto">
        {children}
      </div>
    </details>
  );
}
