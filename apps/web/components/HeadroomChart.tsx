"use client";

import type { CSSProperties } from "react";
import { RULES, type HeadroomPoint, type HeadroomView } from "@/lib/headroom";
import { gbpBn } from "@/lib/format";
import { ChartTable } from "./ChartTable";

const pct = (x: number) => `${x}%`;
const share = (o: { value: number } | undefined) => (o ? `${o.value.toFixed(1)}% of GDP` : "Not given");
const chance = (o: { value: number } | undefined) => (o ? `${Math.round(o.value)}%` : "Not given");

/** One bar per forecast, from zero; below zero a rule would be missed. */
function Bar({ p, latest, domain }: { p: HeadroomPoint; latest: boolean; domain: [number, number] }) {
  const [lo, hi] = domain;
  const span = hi - lo || 1;
  const at = (x: number) => ((x - lo) / span) * 100;
  const zero = at(0);
  const v = p.margin.value;
  const style: CSSProperties = {
    left: pct(Math.min(zero, at(v))),
    width: pct(Math.abs(at(v) - zero)),
    background: v < 0 ? "var(--debt)" : latest ? "var(--rec)" : "color-mix(in srgb, var(--rec) 42%, var(--bg))",
  };
  return (
    <span className="relative block h-5" aria-hidden>
      <i className="absolute inset-y-0 block rounded-[2px]" style={style} />
      <i className="absolute -inset-y-0.5 block w-px bg-line-strong" style={{ left: pct(zero) }} />
    </span>
  );
}

/**
 * The OBR's headroom against each fiscal rule at every forecast that assessed it, on one scale,
 * with a forecast that made no assessment shown as such. Every figure comes from the view; a
 * table gives the same numbers with their sources.
 */
export function HeadroomChart({ view, caption }: { view: HeadroomView; caption: string }) {
  const since = view.since;
  return (
    <figure className="m-0 grid min-w-0 gap-6">
      <figcaption className="grid gap-2">
        <span className="text-label font-medium text-ink">{caption}</span>
        <span className="flex flex-wrap items-center gap-x-5 gap-y-1 text-caption text-muted">
          <span className="inline-flex items-center gap-2">
            <i className="block h-2.5 w-4 rounded-[2px] bg-rec" aria-hidden />
            Headroom in the OBR&apos;s central forecast, with that event&apos;s decisions; the latest in full colour
          </span>
        </span>
      </figcaption>

      {view.rules.map(({ rule, targetYear, points }) => (
        <div key={rule} role="group" aria-labelledby={`headroom-${rule}`} className="grid gap-2">
          <p id={`headroom-${rule}`} className="m-0 text-[15px] font-semibold">
            {RULES[rule].name} <span className="font-normal text-muted">in {targetYear}</span>
          </p>
          <ul className="m-0 grid list-none gap-2 p-0">
            {points.map((p) => {
              const latest = p.vintage === view.latest.vintage;
              return (
                <li key={p.vintage} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_4.5rem] items-center gap-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)_5rem]">
                  <span className={latest ? "font-medium text-ink" : "text-muted"}>{p.edition}</span>
                  <Bar p={p} latest={latest} domain={view.domain} />
                  <span className={`text-right tabular-nums ${latest ? "font-semibold" : ""}`}>
                    {gbpBn(p.margin.value)}
                  </span>
                </li>
              );
            })}
            {since && (
              <li className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-center gap-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
                <span className="text-muted">{since.edition}</span>
                <span className="text-caption text-muted">{since.status === "not_assessed" ? "Not assessed: no assessment in a spring forecast" : "Published; the assessment is being added"}</span>
              </li>
            )}
          </ul>
        </div>
      ))}

      <ChartTable id="headroom-table" chartId="budget_headroom" label={caption}>
        <table className="w-full border-collapse whitespace-nowrap text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line text-left text-[12.5px] text-muted">
              <th scope="col" className="py-2 pr-4 font-medium">
                Rule
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                OBR forecast
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Headroom
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Share of GDP
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Chance of meeting it
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Before that event&apos;s decisions
              </th>
              <th scope="col" className="py-2 font-medium">
                Source
              </th>
            </tr>
          </thead>
          <tbody>
            {view.rules.flatMap(({ rule, targetYear, points }) => [
              ...points.map((p) => (
                <tr key={`${rule}-${p.vintage}`} className="border-b border-line">
                  <th scope="row" className="py-2 pr-4 text-left font-normal">
                    {RULES[rule].name}, {targetYear}
                  </th>
                  <td className="py-2 pr-4">{p.edition}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{gbpBn(p.margin.value)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{share(p.pctGdp)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{chance(p.probability)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{p.preMeasures ? gbpBn(p.preMeasures.value) : "Not given"}</td>
                  <td className="py-2">
                    <a href={p.url}>{p.table}</a>
                  </td>
                </tr>
              )),
              ...(since
                ? [
                    <tr key={`${rule}-${since.vintage}`} className="border-b border-line text-muted">
                      <th scope="row" className="py-2 pr-4 text-left font-normal">
                        {RULES[rule].name}, {targetYear}
                      </th>
                      <td className="py-2 pr-4">{since.edition}</td>
                      <td className="py-2 pr-4 text-right" colSpan={4}>
                        {since.status === "not_assessed" ? "Not assessed" : "Being added"}
                      </td>
                      <td className="py-2">
                        <a href={since.url}>OBR forecast</a>
                      </td>
                    </tr>,
                  ]
                : []),
            ])}
          </tbody>
        </table>
      </ChartTable>
    </figure>
  );
}
