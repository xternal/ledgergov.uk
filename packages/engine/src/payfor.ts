import type { CardView, ControlledBy, Range, StatementLine } from "@ledger/schema";
import { STEP_TOLERANCE } from "@ledger/schema";
import { DEBT_INTEREST_LINE, type Model } from "./model";
import { ZERO, scale } from "./range";

/**
 * Pay for it (/pay-for-it): one costed pledge, and how to pay for it. A
 * pledge's yearly cost is paid by up to three routes, each taking a share of
 * its central cost: a rise in one tax (HMRC's figure for one unit, the same
 * lever the sandbox and the /tax cards use, scaled to the share), a cut to
 * one Statement spending line or to every line by the same share, and
 * borrowing, which pays whatever is left.
 *
 * Ranges (invariant 2). The pledge's cost and the tax's yield are uncertain
 * separately, so the change in borrowing adds the ends that are furthest
 * apart: its low end is the cheapest pledge less the best yield, its high end
 * the dearest pledge less the worst yield. A cut is a decision on an outturn
 * line, so it is exact. The Statement balances in every plan (invariant 4):
 * borrowing is spending less income, before and after.
 */

/** The shares of a pledge's central cost a route can pay, in percent. Borrowing pays whatever the others leave. */
export const PAY_SHARES = [0, 25, 50, 75, 100] as const;
export const ALL = 100;

/** Spending lines a cut cannot come from: debt interest follows interest rates and the debt, and accounting adjustments are not a service. */
export const NOT_CUTTABLE: readonly string[] = [DEBT_INTEREST_LINE, "accounting_adj"];

/** A cut spread over every line a cut can come from, each by the same share of itself. */
export const EVERY_LINE = "all";

/** Who decides a spending line, and how much to borrow: the government, with Parliament's vote. Tax levers say so themselves. */
export const SPENDING_CONTROLLED_BY: ControlledBy = "government";
export const BORROWING_CONTROLLED_BY: ControlledBy = "government";

/** A pledge as Pay for it needs it: its yearly cost to the public purse and the Statement line it lands on. */
export interface Pledge {
  id: string;
  /** £bn a year, [low, central, high]; positive: it costs money. */
  cost_bn: Range;
  /** A spending pledge adds to its policy area's line; a tax pledge lowers income as a whole (cards name no tax line). */
  lands_on: { side: "spending"; line: string } | { side: "receipt" };
}

export interface PayPlan {
  pledge_id: string;
  tax: { lever_id: string; share: number } | null;
  cut: { line_id: string; share: number } | null;
}

/** What a plan may use: the model, the pledges on offer and the tax levers on offer (the /tax cards' per-unit levers). */
export interface PayOptions {
  model: Model;
  pledges: Pledge[];
  taxLevers: string[];
}

export interface TaxPart {
  lever_id: string;
  share: number;
  /** The part of the central cost the tax pays, £bn. */
  amount_bn: number;
  /** The change in the lever that raises it: pence on an income tax or National Insurance rate, points on VAT or corporation tax. */
  units: number;
  from: number;
  to: number;
  /** HMRC's first-year figure for one unit, with the band: the lever's per_unit_bn.y1. */
  per_unit_bn: Range;
  /** What the change raises in the first year: per_unit_bn × units. Its central figure is amount_bn. */
  raises_bn: Range;
  /** The receipt line it lands on. */
  line: string;
}

export interface CutPart {
  line_id: string;
  share: number;
  /** £bn taken from the line, or from every line together. */
  amount_bn: number;
  /** The line's spending in the Statement's year (for every line, their total), £bn. */
  line_bn: number;
  /** The cut as a share of the line, percent. */
  pct_of_line: number;
  /** How the cut falls on each line: one line, or every cuttable line by the same share. */
  by_line: { line: string; d_bn: number }[];
}

export interface Totals {
  receipts_bn: number;
  spending_bn: number;
  /** Spending less income: the Statement's identity, so receipts + borrowing = spending exactly. */
  borrowing_bn: number;
}

export interface PayResult {
  plan: PayPlan;
  pledge: Pledge;
  shares: { tax: number; cut: number; borrow: number };
  tax: TaxPart | null;
  cut: CutPart | null;
  /** The part of the central cost left to borrow, £bn. */
  borrowed_bn: number;
  /** The change in borrowing a year, £bn: the pledge's cost less what the tax and the cut pay, at the widest ends. */
  d_borrowing_bn: Range;
  before: Totals;
  /** Central figures. */
  after: Totals;
  /** Every Statement line that moves (central, £bn). A tax pledge lowers income as a whole: `line: null`. */
  moves: { side: "receipt" | "spending"; line: string | null; d_bn: number }[];
}

const PERCENT = 100;
/** Floating-point slack when checking that a change fits a lever's range or a line. */
const FIT_TOLERANCE = 1e-9;

/** A promise card as a pledge: only a card whose current version has a yearly cost to the public purse. */
export function pledgeOf(card: Pick<CardView, "id" | "file" | "current">, model: Model): Pledge | null {
  const r = card.current.parameters?.how_much_bn_per_year;
  if (!r || !(r[1] > 0) || !(r[0] >= 0)) return null;
  const area = card.file.policy_area;
  return { id: card.id, cost_bn: r, lands_on: model.sideOf.get(area) === "spending" ? { side: "spending", line: area } : { side: "receipt" } };
}

/** The spending lines a cut can come from, in the Statement's order. */
export const cuttableLines = (model: Model): StatementLine[] => model.statement.spending.filter((l) => !NOT_CUTTABLE.includes(l.id));

/** A per-unit tax lever that raises money when it goes up (HMRC's figure is positive): the only kind the tax route offers. */
export function isRaisingLever(model: Model, leverId: string): boolean {
  const l = model.leverById.get(leverId);
  const per = l?.effect.per_unit_bn?.y1;
  return !!l && l.group === "taxes" && !l.effect.steps && !!per && per[0] > 0 && model.sideOf.get(l.effect.target) === "receipt";
}

/** The change in a tax lever that raises `amountBn` in its first year (central), and whether it stays inside the lever's range. */
export function taxChange(model: Model, leverId: string, amountBn: number): Omit<TaxPart, "share"> & { fits: boolean } {
  if (!isRaisingLever(model, leverId)) throw new Error(`pay for it: "${leverId}" is not a tax lever that raises money`);
  const lever = model.leverById.get(leverId)!;
  const per = lever.effect.per_unit_bn!.y1;
  const units = amountBn / per[1];
  const to = lever.base + units;
  return {
    lever_id: leverId,
    amount_bn: amountBn,
    units,
    from: lever.base,
    to,
    per_unit_bn: per,
    raises_bn: amountBn === 0 ? ZERO : scale(per, units),
    line: lever.effect.target,
    // HMRC's figures hold for small changes: never beyond the range the sandbox allows the lever.
    fits: to <= lever.max + STEP_TOLERANCE,
  };
}

/** A cut of `amountBn` from one line or from every line, and whether the line (or all of them) is big enough. */
export function cutFrom(model: Model, lineId: string, amountBn: number): Omit<CutPart, "share"> & { fits: boolean } {
  const lines = cuttableLines(model);
  const chosen = lineId === EVERY_LINE ? lines : lines.filter((l) => l.id === lineId);
  if (!chosen.length) throw new Error(`pay for it: no spending line "${lineId}" a cut can come from`);
  const lineBn = chosen.reduce((a, l) => a + l.bn, 0);
  return {
    line_id: lineId,
    amount_bn: amountBn,
    line_bn: lineBn,
    pct_of_line: (amountBn / lineBn) * PERCENT,
    by_line: chosen.map((l) => ({ line: l.id, d_bn: -amountBn * (l.bn / lineBn) })),
    fits: amountBn <= lineBn + FIT_TOLERANCE,
  };
}

const isShare = (n: unknown): n is number => typeof n === "number" && (PAY_SHARES as readonly number[]).includes(n);

/** Why a plan cannot be worked out; empty when it can. */
export function planIssues(opts: PayOptions, plan: PayPlan): string[] {
  const issues: string[] = [];
  const pledge = opts.pledges.find((p) => p.id === plan.pledge_id);
  if (!pledge) return [`no pledge "${plan.pledge_id}"`];
  const central = pledge.cost_bn[1];
  const { tax, cut } = plan;
  if (tax) {
    if (!isShare(tax.share) || tax.share === 0) issues.push(`tax share ${tax.share} is not one of ${PAY_SHARES.slice(1).join(", ")}`);
    else if (!opts.taxLevers.includes(tax.lever_id) || !isRaisingLever(opts.model, tax.lever_id)) issues.push(`"${tax.lever_id}" is not a tax on offer`);
    else if (!taxChange(opts.model, tax.lever_id, (central * tax.share) / PERCENT).fits) issues.push(`"${tax.lever_id}" cannot raise that much on HMRC's figures`);
  }
  if (cut) {
    if (!isShare(cut.share) || cut.share === 0) issues.push(`cut share ${cut.share} is not one of ${PAY_SHARES.slice(1).join(", ")}`);
    else if (cut.line_id !== EVERY_LINE && !cuttableLines(opts.model).some((l) => l.id === cut.line_id)) issues.push(`"${cut.line_id}" is not a line a cut can come from`);
    else if (!cutFrom(opts.model, cut.line_id, (central * cut.share) / PERCENT).fits) issues.push(`"${cut.line_id}" is smaller than the cut`);
  }
  if ((tax?.share ?? 0) + (cut?.share ?? 0) > ALL) issues.push("the tax and the cut pay more than the whole cost");
  return issues;
}

const totalsOf = (receipts: number, spending: number): Totals => ({ receipts_bn: receipts, spending_bn: spending, borrowing_bn: spending - receipts });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Work out a plan. Throws when planIssues finds anything: a page must never show a plan it cannot cost. */
export function payFor(opts: PayOptions, plan: PayPlan): PayResult {
  const issues = planIssues(opts, plan);
  if (issues.length) throw new Error(`pay for it: ${issues.join("; ")}`);
  const { model } = opts;
  const pledge = opts.pledges.find((p) => p.id === plan.pledge_id)!;
  const cost = pledge.cost_bn;
  const central = cost[1];
  const taxShare = plan.tax?.share ?? 0;
  const cutShare = plan.cut?.share ?? 0;

  const tax = plan.tax ? (({ fits: _fits, ...t }) => ({ ...t, share: taxShare }))(taxChange(model, plan.tax.lever_id, (central * taxShare) / PERCENT)) : null;
  const cut = plan.cut ? (({ fits: _fits, ...c }) => ({ ...c, share: cutShare }))(cutFrom(model, plan.cut.line_id, (central * cutShare) / PERCENT)) : null;
  const raises = tax?.raises_bn ?? ZERO;
  const cutBn = cut?.amount_bn ?? 0;

  const moves: PayResult["moves"] = [];
  moves.push(pledge.lands_on.side === "spending" ? { side: "spending", line: pledge.lands_on.line, d_bn: central } : { side: "receipt", line: null, d_bn: -central });
  if (tax) moves.push({ side: "receipt", line: tax.line, d_bn: raises[1] });
  if (cut) for (const m of cut.by_line) moves.push({ side: "spending", line: m.line, d_bn: m.d_bn });

  const receipts = sum(model.statement.receipts.map((l) => l.bn));
  const spending = sum(model.statement.spending.map((l) => l.bn));
  const dReceipts = sum(moves.filter((m) => m.side === "receipt").map((m) => m.d_bn));
  const dSpending = sum(moves.filter((m) => m.side === "spending").map((m) => m.d_bn));

  return {
    plan,
    pledge,
    shares: { tax: taxShare, cut: cutShare, borrow: ALL - taxShare - cutShare },
    tax,
    cut,
    borrowed_bn: (central * (ALL - taxShare - cutShare)) / PERCENT,
    d_borrowing_bn: [cost[0] - raises[2] - cutBn, central - raises[1] - cutBn, cost[2] - raises[0] - cutBn],
    before: totalsOf(receipts, spending),
    after: totalsOf(receipts + dReceipts, spending + dSpending),
    moves,
  };
}

// ---------------------------------------------------------------- links

/**
 * A plan as one path segment, readable and with nothing personal in it: the
 * lever or line ids and the share each pays. "borrow" when nothing else pays;
 * otherwise "tax-<lever>-<share>", "cut-<line>-<share>", or both joined by a
 * dot, tax first, so the same plan always gets the same link.
 */
export const ALL_BORROWED = "borrow";
const PART = /^(tax|cut)-([a-z0-9_]+)-(\d{1,3})$/;

export function encodePlan(plan: PayPlan): string {
  const parts = [plan.tax && `tax-${plan.tax.lever_id}-${plan.tax.share}`, plan.cut && `cut-${plan.cut.line_id}-${plan.cut.share}`].filter(Boolean);
  return parts.length ? parts.join(".") : ALL_BORROWED;
}

/** Read a pledge id and a plan segment back. Null for anything that is not a plan this data can cost. */
export function decodePlan(opts: PayOptions, pledgeId: string, segment: string): PayPlan | null {
  if (!opts.pledges.some((p) => p.id === pledgeId) || segment.length > 120) return null;
  const plan: PayPlan = { pledge_id: pledgeId, tax: null, cut: null };
  if (segment !== ALL_BORROWED) {
    const parts = segment.split(".");
    if (parts.length > 2) return null;
    for (const part of parts) {
      const m = PART.exec(part);
      if (!m) return null;
      const [, route, id, share] = m;
      if (route === "tax" && !plan.tax && !plan.cut) plan.tax = { lever_id: id!, share: Number(share) };
      else if (route === "cut" && !plan.cut) plan.cut = { line_id: id!, share: Number(share) };
      else return null;
    }
  }
  // Only the one spelling of each plan: no "tax-x-050", no cut before tax.
  if (encodePlan(plan) !== segment) return null;
  return planIssues(opts, plan).length ? null : plan;
}
