import type { LeakCost, LeakFile, LeakStatus } from "@ledger/schema";
import { gbpBn } from "./format";

/**
 * /budget/leaks: every measure briefed to the press before the Budget (content/leaks/*.yaml).
 * A report is not a decision: the status keeps what was trailed visibly apart from what the
 * Budget documents contain.
 */

export const LEAKS_PATH = "/budget/leaks";

/** The day editors start filling the tracker (docs/EDITORS.md, "How to add a leak"). */
export const LEAK_TRACKER_OPENS = "2026-10-19";

export const LEAK_STATUS_ORDER: LeakStatus[] = ["trailed", "confirmed", "announced", "not_in_budget"];

export const LEAK_STATUS: Record<LeakStatus, { label: string; help: string }> = {
  trailed: { label: "Trailed", help: "Reported in the press. The government has not confirmed it." },
  confirmed: { label: "Confirmed before the Budget", help: "A minister or the Treasury said it on the record. Not yet in the Budget documents." },
  announced: { label: "In the Budget", help: "In the Budget documents published on Budget day." },
  not_in_budget: { label: "Not in the Budget", help: "The Budget documents do not include it." },
};

const COST_BY: Record<LeakCost["by"]["kind"], string> = {
  official: "Official estimate",
  independent: "Independent estimate",
  press: "Figure given in the report",
};

/** "Raises £8bn a year in 2029-30", "Costs £1.5bn to £2bn in total, 2026-27 to 2029-30". */
export function leakCostText(c: LeakCost): string {
  const [lo, mid, hi] = c.range;
  const when = c.basis === "per_year" ? `a year in ${c.period}` : `in total, ${c.period}`;
  if (lo < 0 && hi > 0) return `Between raising ${gbpBn(-lo)} and costing ${gbpBn(hi)} ${when}`;
  const raises = mid < 0;
  const [a, b] = raises ? [-hi, -lo] : [lo, hi];
  const amount = a === b ? gbpBn(raises ? -mid : mid) : `${gbpBn(a)} to ${gbpBn(b)}`;
  return `${raises ? "Raises" : "Costs"} ${amount} ${when}`;
}

export const leakCostBy = (c: LeakCost) => `${COST_BY[c.by.kind]}: ${c.by.name}`;

export function leakCounts(leaks: LeakFile[]): Record<LeakStatus, number> {
  const out = { trailed: 0, confirmed: 0, announced: 0, not_in_budget: 0 } as Record<LeakStatus, number>;
  for (const l of leaks) out[l.status] += 1;
  return out;
}
