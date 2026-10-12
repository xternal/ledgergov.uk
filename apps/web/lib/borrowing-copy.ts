import type { BorrowingBundle } from "@ledger/schema";
import { gbpBn } from "./format";

/**
 * Words for /borrowing. Plain British English, numbers first; every figure in a
 * sentence is read from borrowing.json, never typed here.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Below this (£bn) the year so far counts as on the forecast: it would print as £0.0bn. */
const ON_FORECAST_BN = 0.05;

const monthOf = (period: string) => MONTHS[Number(period.slice(5, 7)) - 1]!;
/** "2026-08" → "August 2026" */
export const monthLong = (period: string) => `${monthOf(period)} ${period.slice(0, 4)}`;
/** "2026-08" → "Aug" */
export const monthShort = (period: string) => monthOf(period).slice(0, 3);

/** ("2026-04", "2026-08") → "April to August 2026"; across a new year, "April 2026 to January 2027". */
export function spanText(first: string, last: string): string {
  if (first === last) return monthLong(first);
  if (first.slice(0, 4) === last.slice(0, 4)) return `${monthOf(first)} to ${monthLong(last)}`;
  return `${monthLong(first)} to ${monthLong(last)}`;
}

/** The same months a year earlier: "2026-08" → "2025-08". */
const yearEarlier = (period: string) => `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;

const ukParts = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-GB", { ...o, timeZone: "Europe/London" });

/** "Tuesday 22 September 2026" from a date or a moment, in UK time. */
export function ukDay(iso: string): string {
  const at = iso.length === 10 ? `${iso}T12:00:00Z` : iso;
  return `${ukParts(at, { weekday: "long" })} ${ukParts(at, { day: "numeric" })} ${ukParts(at, { month: "long" })} ${ukParts(at, { year: "numeric" })}`;
}

/** "07:00 BST" (UK time with its zone) */
export function ukTime(iso: string): string {
  const time = ukParts(iso, { hour: "2-digit", minute: "2-digit", hour12: false });
  const zone = new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/London", timeZoneName: "short" }).split(" ").at(-1);
  return `${time} ${zone}`;
}

export interface BorrowingView {
  /** "April to August 2026" */
  span: string;
  /** "April to August 2025" */
  lastYearSpan: string;
  /** "August 2026" */
  through: string;
  /** Months published so far. */
  count: number;
  out: number;
  /** Difference from the OBR's path so far, when there is a path. */
  diff: number | null;
  /** "above", "below" or "in line with" the forecast; null without a path. */
  versus: "above" | "below" | "in line with" | null;
  lastYear: number | null;
  /** The OBR forecast for the whole year is newer than its monthly path (after a Budget, before the OBR splits it into months). */
  newerForecast: boolean;
}

export function borrowingView(b: BorrowingBundle): BorrowingView {
  const first = b.months[0]!;
  const diff = b.so_far.difference?.bn ?? null;
  return {
    span: spanText(first, b.through),
    lastYearSpan: spanText(yearEarlier(first), yearEarlier(b.through)),
    through: monthLong(b.through),
    count: b.outturn.values.length,
    out: b.so_far.outturn.bn,
    diff,
    versus: diff === null ? null : diff >= ON_FORECAST_BN ? "above" : diff <= -ON_FORECAST_BN ? "below" : "in line with",
    lastYear: b.so_far.last_year?.bn ?? null,
    newerForecast: !!(b.profile && b.year_forecast && b.year_forecast.edition !== b.profile.edition),
  };
}

const moreOrLess = (x: number) => (x > 0 ? "more" : "less");

/** The page's <title> (before "| LedgerGov.UK"): the answer first. */
export function borrowingTitle(b: BorrowingBundle): string {
  const v = borrowingView(b);
  if (v.diff === null || v.versus === null) return `Borrowing so far this year: ${gbpBn(v.out)}`;
  return v.versus === "in line with" ? "Borrowing so far this year: on forecast" : `Borrowing so far this year: ${gbpBn(Math.abs(v.diff))} ${v.versus} forecast`;
}

/** The share title: what a reader of a post sees. */
export function borrowingShareTitle(b: BorrowingBundle): string {
  const v = borrowingView(b);
  const head = `UK borrowing, ${v.span}`;
  if (v.diff === null || v.versus === null) return `${head}: ${gbpBn(v.out)}`;
  return v.versus === "in line with" ? `${head}: in line with the OBR's forecast` : `${head}: ${gbpBn(Math.abs(v.diff))} ${v.versus} the OBR's forecast`;
}

/** One sentence of facts: the meta description, the share description and the llms.txt line. */
export function borrowingSentence(b: BorrowingBundle): string {
  const v = borrowingView(b);
  const parts = [`The government borrowed ${gbpBn(v.out)} from ${v.span}`];
  if (v.diff !== null && b.profile) {
    parts.push(
      v.versus === "in line with"
        ? `in line with the Office for Budget Responsibility's forecast for those months`
        : `${gbpBn(Math.abs(v.diff))} ${moreOrLess(v.diff)} than the Office for Budget Responsibility's forecast for those months`,
    );
  }
  if (v.lastYear !== null) parts.push(`${gbpBn(Math.abs(v.out - v.lastYear))} ${moreOrLess(v.out - v.lastYear)} than in the same months a year earlier`);
  return `${parts.length > 2 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts.join(", ")}.`;
}

export const borrowingDescription = (b: BorrowingBundle) =>
  `${borrowingSentence(b)} Official ONS figures against the OBR's forecast path, month by month.`;

export const BORROWING_COPY = {
  h1: "Borrowing so far this year",
  back: "The Statement",
  chartTitle: "Borrowing so far this year, month by month",
  thisYear: (fy: string) => `${fy}, ONS`,
  path: (edition: string) => `OBR forecast path (${edition})`,
  lastYear: (fy: string) => `${fy}, ONS`,
  showTable: "Show as table",
  tableLabel: "Borrowing by month: ONS figures, the OBR's forecast path and last year",
  month: "Month",
  inMonth: "Borrowed in the month",
  pathMonth: "OBR path, month",
  soFar: "So far this year",
  pathSoFar: "OBR path, so far",
  difference: "Difference",
  lastYearSoFar: "Last year, so far",
  notYet: "not yet published",
  sourcesTitle: "Sources and editions",
} as const;

export function borrowingFaq(b: BorrowingBundle, today: string): { q: string; a: string }[] {
  const v = borrowingView(b);
  const r = b.release;
  const next = r?.next_on
    ? r.next_on > today
      ? `ONS publishes the next figures, to ${monthLong(nextMonth(b.through))}, on ${ukDay(r.next_on)}${r.next_at ? ` at ${ukTime(r.next_at)}` : ""}.`
      : `ONS's next figures were due on ${ukDay(r.next_on)}. This page changes once we have read them, usually the next morning.`
    : "ONS publishes these figures once a month, usually around the 20th.";
  return [
    {
      q: "What counts as borrowing here?",
      a: "The gap between what the whole public sector spends and what it brings in from taxes and other income, month by month. Its official name is public sector net borrowing, excluding public sector banks.",
    },
    {
      q: "Why compare with the OBR?",
      a: `The Office for Budget Responsibility makes the official forecasts the government's Budgets are built on. It splits its forecast for the year into months, so anyone can see early whether the year is running ahead of or behind it. ${
        v.diff !== null && v.versus ? `So far, from ${v.span}, borrowing is ${v.versus === "in line with" ? "in line with" : `${gbpBn(Math.abs(v.diff))} ${v.versus}`} that path.` : ""
      }`.trim(),
    },
    {
      q: "Why does borrowing fall in January?",
      a: "Most self-assessment income tax is due by 31 January, so receipts jump and the government often takes in more than it spends that month. The OBR's path and last year's figures both show the dip.",
    },
    {
      q: "Will these numbers change?",
      a: "Yes. ONS revises recent months in every release as fuller figures come in, so the total so far can move. This page always shows the newest release, and last year's months as that release revised them.",
    },
    { q: "When are the next figures?", a: `${next} The OBR publishes a new path after each forecast.` },
  ];
}

/** "2026-08" → "2026-09" */
export const nextMonth = (period: string) => {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
