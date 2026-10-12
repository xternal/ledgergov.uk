import type { TaxSeed } from "@ledger/schema";
import { compute } from "./compute";
import { taxOn, taxRates, type TaxRates } from "./household";
import { baseSettings, type Model } from "./model";

/**
 * "Your tax receipt": income tax and employee National Insurance on a salary, split the way the Statement's spending is
 * split, plus the borrowing on top. It runs in the reader's browser; the salary is never sent, stored or counted
 * (CLAUDE.md invariant 7). The same function draws the site's fixed example receipts on the server.
 */

const PENCE_PER_POUND = 100;

/**
 * Everything a receipt needs, small enough to hand to the browser: the tax year's rates and the Statement's spending lines
 * and totals at today's settings (the same model the home page's Statement and "Your share" use).
 */
export interface ReceiptBasis {
  tax: TaxSeed;
  rates: TaxRates;
  /** The Statement's spending lines, £bn, in the Statement's order. */
  spending: { id: string; bn: number }[];
  receipts_bn: number;
  spending_bn: number;
  borrowing_bn: number;
}

export function receiptBasis(model: Model, tax: TaxSeed): ReceiptBasis {
  const settings = baseSettings(model);
  const r = compute(model, settings);
  return {
    tax,
    rates: taxRates(model, tax, null),
    spending: model.statement.spending.map((l) => ({ id: l.id, bn: r.spending[l.id]! })),
    receipts_bn: r.totals.receipts_bn,
    spending_bn: r.totals.spending_bn,
    borrowing_bn: r.totals.borrowing_bn,
  };
}

export interface TaxReceipt {
  income_tax_pence: number;
  ni_pence: number;
  /** Income tax plus National Insurance, a year. */
  tax_pence: number;
  /** The tax split in proportion to each spending line, in the Statement's order. The pence add up to tax_pence exactly. */
  lines: { id: string; pence: number }[];
  /** Borrowing on top: how much more the state spent on your behalf than your tax paid, at the Statement's borrowing per £1 of income. */
  borrowed_pence: number;
  /** Tax plus borrowing on top: what the state spent on your behalf. */
  spent_pence: number;
  /** Borrowing per £1 spent (0.098 is 9.8p), as the home page shows it. borrowed_pence / spent_pence equals it, give or take a penny. */
  borrowed_share: number;
}

const toPence = (gbp: number) => Math.round(gbp * PENCE_PER_POUND);

/**
 * Split a whole number of pence in proportion to weights so the parts add up exactly: each part gets its share rounded
 * down, then the pence left over go to the largest remainders (the earlier line wins a tie).
 */
export function splitPence(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * Math.max(0, w)) / sum);
  const parts = exact.map(Math.floor);
  const left = total - parts.reduce((a, b) => a + b, 0);
  exact
    .map((x, i) => ({ i, rem: x - parts[i]! }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i)
    .slice(0, left)
    .forEach(({ i }) => (parts[i]! += 1));
  return parts;
}

/** The receipt for a salary (£ a year). Negative, missing or non-finite salaries count as nothing. */
export function taxReceipt(basis: ReceiptBasis, salary: number): TaxReceipt {
  const pay = Number.isFinite(salary) ? Math.max(0, salary) : 0;
  const paid = taxOn(basis.tax, pay, basis.rates);
  const income_tax_pence = toPence(paid.income_tax);
  const ni_pence = toPence(paid.ni);
  const tax_pence = income_tax_pence + ni_pence;
  const parts = splitPence(tax_pence, basis.spending.map((l) => l.bn));
  const borrowing = Math.max(0, basis.borrowing_bn);
  const borrowed_pence = Math.round((tax_pence * borrowing) / basis.receipts_bn);
  return {
    income_tax_pence,
    ni_pence,
    tax_pence,
    lines: basis.spending.map((l, i) => ({ id: l.id, pence: parts[i]! })),
    borrowed_pence,
    spent_pence: tax_pence + borrowed_pence,
    borrowed_share: borrowing / basis.spending_bn,
  };
}

/**
 * The site's own example receipts: round salaries, each a pre-rendered page with its own share card, so a shared link
 * shows a receipt without carrying anyone's salary. Only these pages exist; any other address is a 404.
 */
export const RECEIPT_EXAMPLES = [
  { slug: "25k", salary: 25_000 },
  { slug: "35k", salary: 35_000 },
  { slug: "50k", salary: 50_000 },
  { slug: "100k", salary: 100_000 },
] as const;

export type ReceiptExample = (typeof RECEIPT_EXAMPLES)[number];

export const findReceiptExample = (slug: string): ReceiptExample | null => RECEIPT_EXAMPLES.find((e) => e.slug === slug) ?? null;
