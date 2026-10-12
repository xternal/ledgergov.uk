import { scaleLinear, scalePoint } from "d3-scale";
import { line } from "d3-shape";
import type { BorrowingBundle } from "@ledger/schema";
import { BORROWING_CHART as C } from "@/lib/chart-config";
import { BORROWING_COPY as T, monthLong, monthShort } from "@/lib/borrowing-copy";
import { gbpBn, signedBn } from "@/lib/format";
import { ChartTable } from "./ChartTable";

interface Series {
  key: "out" | "path" | "last";
  label: string;
  cumulative: number[];
}

/** How each line is drawn: borrowing in orange, the OBR's path dashed (as on the debt chart), last year thin and faint. */
const STROKE: Record<Series["key"], { stroke: string; width: number; dash?: string }> = {
  out: { stroke: "var(--debt)", width: 2.4 },
  path: { stroke: "var(--muted)", width: 1.6, dash: "6 4" },
  last: { stroke: "var(--faint)", width: 1.4 },
};

/** A ring of page colour behind a label, so it stays readable where it crosses a line. */
const HALO = { paintOrder: "stroke", stroke: "var(--bg)", strokeWidth: 4, strokeLinejoin: "round" } as const;

function Swatch({ k }: { k: Series["key"] }) {
  const s = STROKE[k];
  return (
    <svg aria-hidden width="26" height="10" className="shrink-0">
      <line x1="1" x2="25" y1="5" y2="5" style={{ stroke: s.stroke, strokeWidth: s.width + 0.4, strokeDasharray: s.dash }} />
    </svg>
  );
}

/**
 * Borrowing so far this year as running totals, April to March: ONS months so far, the OBR's
 * forecast path for the whole year, and last year. Drawn on the server; the table below has
 * every number, and each month's column shows its numbers on hover.
 */
export function BorrowingChart({ b }: { b: BorrowingBundle }) {
  const { width: W, height: H, margin: m } = C;
  const series: Series[] = [
    ...(b.last_year ? [{ key: "last" as const, label: T.lastYear(b.last_year.fiscal_year), cumulative: b.last_year.cumulative }] : []),
    ...(b.profile ? [{ key: "path" as const, label: T.path(b.profile.edition), cumulative: b.profile.cumulative }] : []),
    { key: "out" as const, label: T.thisYear(b.fiscal_year), cumulative: b.outturn.cumulative },
  ];
  const all = series.flatMap((s) => s.cumulative);
  const y = scaleLinear()
    .domain([Math.min(0, ...all), Math.max(...all)])
    .range([H - m.bottom, m.top])
    .nice();
  const x = scalePoint<string>().domain(b.months).range([m.left, W - m.right]);
  const px = (i: number) => x(b.months[i]!) ?? 0;
  const path = (values: number[]) =>
    line<number>()
      .x((_, i) => px(i))
      .y((v) => y(v))(values) ?? "";

  const n = b.outturn.cumulative.length;
  const lastOut = b.outturn.cumulative[n - 1]!;
  const step = (px(1) - px(0)) / 2;

  // End labels at March for the full-year lines, pushed apart if they would touch.
  const ends = series
    .filter((s) => s.cumulative.length === b.months.length)
    .map((s) => ({ key: s.key, value: s.cumulative.at(-1)!, y: y(s.cumulative.at(-1)!) }))
    .sort((a, c) => a.y - c.y);
  for (let i = 1; i < ends.length; i++) if (ends[i]!.y - ends[i - 1]!.y < C.labelGap) ends[i]!.y = ends[i - 1]!.y + C.labelGap;

  const summary = [
    `Borrowing in ${b.fiscal_year} reached ${gbpBn(lastOut)} by ${monthLong(b.through)}`,
    b.profile ? `against ${gbpBn(b.profile.cumulative[n - 1]!)} on the OBR's forecast path` : null,
    b.last_year ? `and ${gbpBn(b.last_year.cumulative[n - 1]!)} by the same month of ${b.last_year.fiscal_year}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <figure className="m-0 grid gap-3">
      <figcaption className="grid gap-2">
        <span className="text-label text-muted">{T.chartTitle}, running total</span>
        <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1.5 p-0 text-label text-ink">
          {[...series].reverse().map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <Swatch k={s.key} />
              {s.label}
            </li>
          ))}
        </ul>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full [&_text]:fill-muted [&_text]:text-[12px] max-sm:[&_text]:text-[20px]"
        role="img"
        aria-label={`${summary}.`}
      >
        {y.ticks(C.yTicks).map((t) => (
          <g key={t}>
            <line x1={m.left} x2={W - m.right} y1={y(t)} y2={y(t)} style={{ stroke: t === 0 ? "var(--line-strong)" : "var(--line)" }} />
            <text x={m.left - 10} y={y(t) + 4} textAnchor="end">
              {gbpBn(t)}
            </text>
          </g>
        ))}
        {b.months.map((mo, i) => (
          <text key={mo} x={px(i)} y={H - 8} textAnchor="middle">
            {monthShort(mo)}
          </text>
        ))}
        {series.map((s) => {
          const st = STROKE[s.key];
          return (
            <path
              key={s.key}
              d={path(s.cumulative)}
              style={{ fill: "none", stroke: st.stroke, strokeWidth: st.width, strokeDasharray: st.dash, strokeLinejoin: "round", strokeLinecap: "round" }}
            />
          );
        })}
        {b.outturn.cumulative.map((v, i) => (
          <circle
            key={b.months[i]}
            cx={px(i)}
            cy={y(v)}
            r={i === n - 1 ? C.lastDotRadius : C.dotRadius}
            style={{ fill: "var(--debt)", stroke: "var(--bg)", strokeWidth: 1.5 }}
          />
        ))}
        <text x={px(n - 1)} y={y(lastOut) - 12} textAnchor="middle" style={{ ...HALO, fill: "var(--debt-ink)", fontWeight: 600 }}>
          {gbpBn(lastOut)}
        </text>
        {ends.map((e) => (
          <text key={e.key} x={W - m.right + 10} y={e.y + 4} style={HALO}>
            {gbpBn(e.value)}
          </text>
        ))}
        {/* One column per month: hover shows that month's running totals. */}
        {b.months.map((mo, i) => (
          <rect key={mo} x={px(i) - step} y={m.top} width={step * 2} height={H - m.top - m.bottom} style={{ fill: "transparent" }}>
            <title>
              {[
                monthLong(mo),
                ...series.filter((s) => i < s.cumulative.length).map((s) => `${s.label}: ${gbpBn(s.cumulative[i]!)} so far`),
              ].join("\n")}
            </title>
          </rect>
        ))}
      </svg>
      <ChartTable id="borrowing-table" chartId="borrowing_so_far" label={T.tableLabel}>
        <BorrowingTable b={b} />
      </ChartTable>
    </figure>
  );
}

/** Every number in the chart, month by month. */
function BorrowingTable({ b }: { b: BorrowingBundle }) {
  const th = "py-2 pr-4 text-right font-medium";
  const td = "py-2 pr-4 text-right tabular-nums";
  return (
    <table className="w-full border-collapse whitespace-nowrap text-sm">
      <caption className="sr-only">{T.tableLabel}</caption>
      <thead>
        <tr className="border-b border-line text-left text-[12.5px] text-muted">
          <th scope="col" className="py-2 pr-4 font-medium">
            {T.month}
          </th>
          <th scope="col" className={th}>
            {T.inMonth}
          </th>
          <th scope="col" className={th}>
            {T.soFar}
          </th>
          {b.profile && (
            <>
              <th scope="col" className={th}>
                {T.pathMonth}
              </th>
              <th scope="col" className={th}>
                {T.pathSoFar}
              </th>
              <th scope="col" className={th}>
                {T.difference}
              </th>
            </>
          )}
          {b.last_year && (
            <th scope="col" className={th}>
              {T.lastYearSoFar}
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {b.months.map((mo, i) => {
          const out = b.outturn.values[i];
          const soFar = b.outturn.cumulative[i];
          return (
            <tr key={mo} className="border-b border-line">
              <th scope="row" className="py-2 pr-4 text-left font-normal">
                {monthLong(mo)}
              </th>
              <td className={td}>{out === undefined ? <span className="text-muted">{T.notYet}</span> : gbpBn(out)}</td>
              <td className={td}>{soFar === undefined ? "" : gbpBn(soFar)}</td>
              {b.profile && (
                <>
                  <td className={td}>{gbpBn(b.profile.values[i]!)}</td>
                  <td className={td}>{gbpBn(b.profile.cumulative[i]!)}</td>
                  <td className={td}>{soFar === undefined ? "" : signedBn(soFar - b.profile.cumulative[i]!)}</td>
                </>
              )}
              {b.last_year && <td className={`${td} text-muted`}>{gbpBn(b.last_year.cumulative[i]!)}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
