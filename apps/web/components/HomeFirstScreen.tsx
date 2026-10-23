"use client";

import type { Status } from "@ledger/schema";
import { STATUS_LABEL } from "@/lib/copy";
import { gbpBn } from "@/lib/format";
import { useScenario } from "@/lib/scenario";
import { KpiStrip } from "./KpiStrip";

/** One promise to watch, as the home page's tiles show it (built on the server by lib/home.ts). */
export interface Tile {
  kind: "delivered" | "notMet" | "dueNext" | "forecast";
  headline: string;
  href: string;
  /** "Keir Starmer, 25 September 2026", "John Healey, due 28 October 2026" */
  line: string;
  /** For "forecast": where the target and the forecast sit on one scale, 0–100. */
  scale?: { target: number; forecast: number; ceiling: boolean; text: string };
}

export interface LogLine {
  date: string;
  /** "New", "Checked", "Corrected", or the step a card moved to ("Delivered"). */
  label: string;
  tone: "new" | "good" | "bad" | "moved" | "neutral";
  text: string;
  href: string;
}

/** The population page's two headline series (ONS principal projection, OBR baseline), for the Population card. */
export interface PopulationCard {
  /** People over pension age for every 100 of working age: now and at the end of the projection, with the variants' range then. */
  oadr: { firstYear: number; first: string; lastYear: number; last: string; low: string; high: string; firstPct: number; lastPct: number; lowPct: number; highPct: number };
  /** Age-related spending, % of GDP, in the OBR baseline. */
  spending: { firstYear: string; first: string; lastYear: string; last: string };
}

export interface HomeData {
  population?: PopulationCard;
  total: number;
  people: number;
  counts: { status: Status; count: number }[];
  tiles: Tile[];
  log: LogLine[];
}

const BAR: Record<Status, string> = {
  promised: "bg-line-strong",
  unscoreable: "bg-line",
  in_plan: "bg-rec",
  legislated: "bg-rec/70",
  funded: "bg-warn/70",
  delivering: "bg-warn",
  delivered: "bg-good",
  failed: "bg-bad",
  quietly_dropped: "bg-bad/70",
};
const TILE: Record<Tile["kind"], { label: string; tone: string }> = {
  delivered: { label: "Latest delivered", tone: "bg-good/8 text-good" },
  notMet: { label: "Latest not met", tone: "bg-bad/8 text-bad" },
  dueNext: { label: "Due next", tone: "bg-warn/8 text-warn" },
  forecast: { label: "Forecast at the time", tone: "bg-rec/8 text-rec" },
};
const TONE: Record<LogLine["tone"], string> = {
  new: "bg-rec/8 text-rec",
  good: "bg-good/8 text-good",
  bad: "bg-bad/8 text-bad",
  moved: "bg-warn/8 text-warn",
  neutral: "bg-sunk text-muted",
};
/** The sandbox lever on the first screen: one familiar tax, three settings. */
const LEVER = "income_tax_basic";

const card = "rounded-panel bg-surface p-4 shadow-[inset_0_0_0_1px_var(--line)] sm:p-5";

/**
 * The first screen (the redrawn home page): the year's figures, the promises at a glance, one sandbox lever, four
 * promises to watch, the way to your MP, and the logbook. Every number comes from the statement or the cards, and every
 * card links on, so a reader sees the scale of the ledger and that each part is one step away.
 */
export function HomeFirstScreen({ data }: { data: HomeData }) {
  const { seed, settings, setLever, result, baseResult, code } = useScenario();
  const { meta } = seed.statement;
  const lever = seed.levers.levers.find((l) => l.id === LEVER);
  const base = lever?.base ?? 20;
  const value = (settings[LEVER] as number | undefined) ?? base;
  const changed = Math.abs(result.totals.borrowing_bn - baseResult.totals.borrowing_bn) > 0.05;

  return (
    <div className="grid gap-3 pb-12 pt-5 sm:pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="m-0 text-[clamp(22px,2.6vw,30px)] font-semibold leading-tight tracking-[-0.025em]">
          {gbpBn(baseResult.totals.spending_bn)} of public money, and {data.total} promises to pay from it
        </h1>
        <p className="m-0 text-caption text-muted">
          {meta.fiscal_year}, {meta.vintage_label}
        </p>
      </div>

      <KpiStrip />

      <div className="grid gap-3 md:grid-cols-2">
        <section aria-labelledby="home-promises" className={`${card} grid content-start gap-3`}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="home-promises" className="m-0 text-body font-semibold">
              {data.total} promises tracked
            </h2>
            <span className="text-caption text-muted">from {data.people} people, parties and governments</span>
          </div>
          <div aria-hidden className="flex h-3.5 gap-0.5 overflow-hidden rounded-full">
            {data.counts.map((c) => (
              <span key={c.status} className={BAR[c.status]} style={{ flex: `${c.count} 1 0` }} />
            ))}
          </div>
          <ul className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-1 p-0 text-sm sm:grid-cols-3">
            {data.counts.map((c) => (
              <li key={c.status}>
                <span className={`font-semibold ${c.status === "delivered" ? "text-good" : c.status === "failed" ? "text-bad" : ""}`}>{c.count}</span>{" "}
                <span className="text-muted">{STATUS_LABEL[c.status].toLowerCase()}</span>
              </li>
            ))}
          </ul>
          <a href="/promises" className="text-label font-semibold">
            All promises, by person, party or area →
          </a>
        </section>

        <section aria-labelledby="home-sandbox" className="grid content-start gap-3 rounded-panel bg-ink p-4 text-bg sm:p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="home-sandbox" className="m-0 text-body font-semibold">
              Try the budget yourself
            </h2>
            <span className="text-caption opacity-70">every lever has its source</span>
          </div>
          {lever && (
            <div role="group" aria-label={lever.label} className="grid gap-2">
              <span className="text-label opacity-80">{lever.label}</span>
              <div className="flex gap-1.5">
                {[base - 1, base, base + 1].map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={value === v}
                    onClick={() => setLever(LEVER, v)}
                    className={`min-h-11 flex-1 cursor-pointer rounded-control text-sm font-semibold ${
                      value === v ? "bg-bg text-ink" : "bg-transparent text-bg shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--bg)_30%,transparent)]"
                    }`}
                  >
                    {v}%
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="m-0 text-sm" aria-live="polite">
            Borrowing{" "}
            {changed ? (
              <>
                <span className="line-through opacity-60">{gbpBn(baseResult.totals.borrowing_bn)}</span> → <b>{gbpBn(result.totals.borrowing_bn)}</b> in year one
              </>
            ) : (
              <b>{gbpBn(baseResult.totals.borrowing_bn)}</b>
            )}
            <span className="block opacity-70">Official costing per point, no knock-on effects</span>
          </p>
          <a href={`/money${code ? `?s=${encodeURIComponent(code)}` : ""}#scenario`} className="text-label font-semibold text-bg underline decoration-bg/50 underline-offset-2 hover:decoration-bg">
            Open the full sandbox →
          </a>
        </section>
      </div>

      <section aria-label="Promises to watch" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.tiles.map((t) => (
          <a key={t.kind} href={t.href} className={`${card} grid content-start gap-2 text-ink no-underline hover:shadow-[inset_0_0_0_1px_var(--line-strong)]`}>
            <span className={`justify-self-start rounded-full px-2 py-0.5 text-caption font-semibold ${TILE[t.kind].tone}`}>{TILE[t.kind].label}</span>
            <span className="text-sm font-semibold leading-snug">{t.headline}</span>
            {t.scale && (
              <span aria-hidden className="relative block h-5">
                <span className="absolute inset-x-0 top-[7px] h-1.5 rounded-full bg-sunk" />
                <span
                  className="absolute top-[7px] h-1.5 rounded-full bg-good/30"
                  style={t.scale.ceiling ? { left: 0, width: `${t.scale.target}%` } : { left: `${t.scale.target}%`, right: 0 }}
                />
                <span className="absolute top-0.5 h-4 w-[3px] -translate-x-1/2 rounded-full bg-good" style={{ left: `${t.scale.target}%` }} />
                <span className="absolute top-[3px] size-3.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: `${t.scale.forecast}%` }} />
              </span>
            )}
            <span className="text-caption text-muted">{t.scale ? t.scale.text : t.line}</span>
          </a>
        ))}
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.population && <Population p={data.population} />}
        <a href="/mp" className={`${card} grid content-start gap-2 text-ink no-underline hover:shadow-[inset_0_0_0_1px_var(--line-strong)]`}>
          <span className="text-body font-semibold">Your MP and your share</span>
          <span className="text-sm text-muted">Type your postcode to see your MP&apos;s promises and your household&apos;s share of the money.</span>
          <span className="text-label font-semibold text-rec">Find yours →</span>
        </a>
        <section aria-labelledby="home-log" className={`${card} grid content-start gap-2 sm:col-span-2`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="home-log" className="m-0 text-body font-semibold">
              Logbook <span className="text-caption font-normal text-muted">added, moved, corrected or checked, newest first</span>
            </h2>
            <a href="/feeds" className="text-label font-semibold">
              Every change, and its feeds →
            </a>
          </div>
          <ol className="m-0 grid list-none p-0">
            {data.log.map((l, i) => (
              <li key={`${l.date}-${i}`} className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-x-3 border-t border-line py-2 text-sm sm:grid-cols-[72px_96px_minmax(0,1fr)]">
                <span className="text-caption text-muted">{l.date}</span>
                <span className={`hidden justify-self-start rounded-full px-2 py-0.5 text-caption font-semibold sm:inline ${TONE[l.tone]}`}>{l.label}</span>
                <a href={l.href} className="text-ink no-underline hover:underline">
                  <span className="sr-only">{l.label}: </span>
                  <span className={`mr-1.5 text-caption font-semibold sm:hidden ${TONE[l.tone].split(" ")[1]}`}>{l.label}</span>
                  {l.text}
                </a>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

/**
 * The population card: how many people over pension age there are for every 100 of working age now and at the end of
 * the ONS principal projection (with the range of its published variants), and what age-related spending does in the
 * OBR baseline. Two bars on one 0–60 scale; the words carry the numbers for screen readers.
 */
function Population({ p }: { p: PopulationCard }) {
  const { oadr: o, spending: s } = p;
  return (
    <a href="/people" className={`${card} grid content-start gap-2 text-ink no-underline hover:shadow-[inset_0_0_0_1px_var(--line-strong)]`}>
      <span className="justify-self-start rounded-full bg-sunk px-2 py-0.5 text-caption font-semibold text-muted">Population</span>
      <span className="text-sm font-semibold leading-snug">
        {o.first} people over pension age for every 100 of working age in {o.firstYear}; {o.last} by {o.lastYear}
      </span>
      <span aria-hidden className="grid gap-1 text-caption text-muted">
        <span className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-2">
          {o.firstYear}
          <span className="relative h-2.5 rounded-full bg-sunk">
            <span className="absolute inset-y-0 left-0 rounded-full bg-ink/60" style={{ width: `${o.firstPct}%` }} />
          </span>
        </span>
        <span className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-2">
          {o.lastYear}
          <span className="relative h-2.5 rounded-full bg-sunk">
            <span className="absolute inset-y-0 rounded-full bg-warn/25" style={{ left: `${o.lowPct}%`, width: `${o.highPct - o.lowPct}%` }} />
            <span className="absolute inset-y-0 left-0 rounded-full bg-warn" style={{ width: `${o.lastPct}%` }} />
          </span>
        </span>
      </span>
      <span className="text-caption text-muted">
        ONS principal projection; variants {o.low} to {o.high}. Age-related spending {s.first} of GDP in {s.firstYear}, {s.last} in {s.lastYear} (OBR).
      </span>
      <span className="text-label font-semibold text-rec">Population and long-term spending →</span>
    </a>
  );
}
