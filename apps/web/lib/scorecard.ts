import { effectOf, scorecardSummary, type BudgetScorecard, type ScorecardMeasure, type ScorecardTotal } from "@ledger/schema";
import { grouped, MINUS } from "@/lib/format";

/**
 * The Budget scorecard (/budget/scorecard/<event>): words and number formats for the Treasury's table of
 * policy decisions. Every figure comes from data/build/budget/<event>.json; nothing here is a number of its own.
 */

const M_PER_BN = 1000;
const oneDp = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** A figure in £m as the Treasury prints it, with a typographic sign: "+£23,770m", "−£770m", "£0m". */
export const gbpMExact = (m: number) => `${m > 0 ? "+" : m < 0 ? MINUS : ""}£${grouped(Math.abs(m))}m`;

/** The same, shorter for reading: "£23.8bn" from £1bn up, "£770m" below; no sign (the words say which way). */
export const gbpMShort = (m: number) => {
  const a = Math.abs(m);
  return a >= M_PER_BN ? `£${oneDp.format(a / M_PER_BN)}bn` : `£${grouped(a)}m`;
};

/** A table cell: the Treasury's "*" for a negligible costing, else the figure. */
export const cellText = (row: Pick<ScorecardMeasure | ScorecardTotal, "values" | "negligible">, years: string[], i: number) =>
  row.negligible?.includes(years[i]!) ? "*" : gbpMExact(row.values[i]!);

export const EFFECT_WORD = { raises: "raises", costs: "costs", nil: "no effect" } as const;

/** "raises £23.8bn", "costs £770m", "no effect" (or "negligible" for the Treasury's "*"). */
export function effectText(m: Pick<ScorecardMeasure, "values" | "negligible">, years: string[], i: number): string {
  if (m.negligible?.includes(years[i]!)) return "negligible";
  const v = m.values[i]!;
  const e = effectOf(v);
  return e === "nil" ? EFFECT_WORD.nil : `${EFFECT_WORD[e]} ${gbpMShort(v)}`;
}

export const scorecardPath = (s: Pick<BudgetScorecard, "id">) => `/budget/scorecard/${s.id}`;

/** The page's title, description and lead: the same words for search, share cards and the page. */
export function scorecardCopy(s: BudgetScorecard) {
  const sum = scorecardSummary(s);
  const net = effectOf(sum.total);
  const title = `${s.name}: every measure, and what it raises or costs`;
  const netText = net === "nil" ? "no net effect" : `${net === "raises" ? "raise" : "cost"} a net ${gbpMShort(sum.total)}`;
  const description =
    `All ${sum.lines} lines of the Treasury's table of ${s.name} policy decisions (Table ${s.table.number}): ` +
    `together they ${netText} in ${sum.year}. ${sum.raises.count} measures raise money and ${sum.costs.count} cost money that year; ` +
    `every line has its figure for each year from ${s.years[0]} to ${s.years.at(-1)} and a link to its page in the Budget document.`;
  return { title, description, summary: sum, netText };
}

/** The largest lines in the headline year, one way: what raises most, or what costs most. */
export function largest(s: BudgetScorecard, effect: "raises" | "costs", n: number): ScorecardMeasure[] {
  const i = s.years.indexOf(s.headline_year);
  const sign = effect === "raises" ? 1 : -1;
  return s.measures
    .filter((m) => !m.of_which && sign * m.values[i]! > 0)
    .sort((a, b) => sign * (b.values[i]! - a.values[i]!) || String(a.line).localeCompare(String(b.line), "en", { numeric: true }))
    .slice(0, n);
}

/** The table's rows in its own order, under its own headings: headings, lines, and the subtotals and memo lines printed among them. */
export function groupedRows(s: BudgetScorecard): { group: string | null; measures: ScorecardMeasure[]; notes: ScorecardTotal[] }[] {
  const out: { group: string | null; measures: ScorecardMeasure[]; notes: ScorecardTotal[] }[] = [];
  for (const m of s.measures) {
    const last = out.at(-1);
    if (!last || last.group !== m.group) out.push({ group: m.group, measures: [m], notes: [] });
    else last.measures.push(m);
  }
  const lastLine = s.measures.at(-1)?.line;
  for (const t of s.totals) {
    if (t.kind !== "subtotal" && t.kind !== "memo") continue;
    if (t.after_line === undefined || t.after_line === lastLine) continue; // printed with the totals at the foot
    const g = out.find((x) => x.measures.some((m) => m.line === t.after_line));
    g?.notes.push(t);
  }
  return out;
}

/** The totals printed at the table's foot, in the table's order. */
export const footTotals = (s: BudgetScorecard) =>
  s.totals.filter((t) => t.kind === "total" || t.kind === "total_tax" || t.kind === "total_spending" || ((t.kind === "memo" || t.kind === "subtotal") && t.after_line === s.measures.at(-1)?.line));

export const TOTAL_KIND_LABEL: Record<ScorecardTotal["kind"], string> = {
  total: "All the measures",
  total_tax: "Tax",
  total_spending: "Spending",
  subtotal: "Subtotal",
  memo: "Memo",
};

export const HEAD_LABEL = { tax: "Tax", spend: "Spending" } as const;
