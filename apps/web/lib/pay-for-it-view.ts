import type { ControlledBy, CostedBy, LeversSeed, Provenance, Quality, Range, StatementSeed } from "@ledger/schema";
import {
  ALL,
  EVERY_LINE,
  PAY_SHARES,
  createModel,
  cutFrom,
  encodePlan,
  payFor,
  taxChange,
  type Model,
  type PayOptions,
  type PayPlan,
  type PayResult,
  type Pledge,
} from "@ledger/engine";
import { gbpBn, grouped, rangeText, signed } from "./format";
import type { Standing } from "./promises";

/**
 * Pay for it (/pay-for-it): what the page and its share images need, and the
 * words that describe a plan. Client-safe (no data reads): the server builds
 * PayData once (lib/pay-for-it.ts) and the page works out every plan in the
 * browser with the engine (packages/engine/src/payfor.ts).
 */

export const PAY_PATH = "/pay-for-it";
/** The pledge the page starts with: the £2 bus cap, the worked example in the README. */
export const FIRST_PLEDGE = "uk-bus-cap-2-2026";

/** A shared plan's own address: /pay-for-it/<pledge>/<plan>. */
export const planPath = (plan: PayPlan) => `${PAY_PATH}/${plan.pledge_id}/${encodePlan(plan)}`;

export interface PledgeView extends Pledge {
  headline: string;
  /** The promise, word for word. */
  quote: string;
  /** "Andy Burnham, Labour", "Reform UK" */
  who: string;
  /** The party or body it counts towards, short: "Labour", "Reform UK", "HM Government". */
  owner: string;
  standing: Standing | null;
  status: string;
  made_on: string;
  costed_by: CostedBy | null;
  /** The card's cost provenance: sourced when the cost has its own sources (the API's rule), an estimate otherwise. */
  cost_quality: Quality;
  cost_note: string | null;
  cost_sources: { title: string; url: string }[];
  /** As stated when it was announced; null: not stated. */
  funded_by: string | null;
  /** The policy area's name, for a spending pledge's line. */
  area: string;
  href: string;
}

export interface TaxOption {
  lever_id: string;
  /** "Income tax, basic rate" */
  label: string;
  /** How a change reads: "p" (pence in the pound) or "point" (percentage points). */
  unit: "p" | "point";
  /** The rest of the card's words after "1p" or "1 point": "on the basic rate of income tax". */
  on: string;
  /** The /tax card. */
  href: string;
  /** HMRC's first year, e.g. "2026-27". */
  period: string;
  controlled_by: ControlledBy;
  provenance: Provenance;
}

export interface CutOption {
  id: string;
  /** "Defence", or "Every area of spending" for the same share from each. */
  label: string;
  bn: number;
  provenance: Provenance;
}

export interface PayData {
  pledges: PledgeView[];
  taxes: TaxOption[];
  /** EVERY_LINE first, then each line a cut can come from, in the Statement's order. */
  cuts: CutOption[];
  statement: StatementSeed;
  levers: LeversSeed;
  /** HMRC's edition, as the /tax cards name it: "24 Jun 2025". */
  hmrcPublished: string;
  /** "2025-26" */
  year: string;
  householdsP: Provenance;
  rate: { label: string; controlled_by: ControlledBy; provenance: Provenance } | null;
  builtOn: string;
}

/** The engine's options for this data. */
export function payOptions(data: Pick<PayData, "pledges" | "taxes" | "statement" | "levers">, model?: Model): PayOptions {
  return { model: model ?? createModel(data.statement, data.levers), pledges: data.pledges, taxLevers: data.taxes.map((t) => t.lever_id) };
}

const PERCENT = 100;

/** Whether a tax can pay `share` of a pledge on HMRC's figures. */
export const taxFits = (opts: PayOptions, pledge: Pledge, leverId: string, share: number) =>
  share === 0 || taxChange(opts.model, leverId, (pledge.cost_bn[1] * share) / PERCENT).fits;

/** Whether a line (or every line) is big enough to give `share` of a pledge. */
export const cutFits = (opts: PayOptions, pledge: Pledge, lineId: string, share: number) =>
  share === 0 || cutFrom(opts.model, lineId, (pledge.cost_bn[1] * share) / PERCENT).fits;

/** The plan as the page holds it: the chosen tax and line stay chosen while their share is none. */
export interface PayState {
  pledgeId: string;
  taxLever: string;
  taxShare: number;
  cutLine: string;
  cutShare: number;
}

export const planOf = (s: PayState): PayPlan => ({
  pledge_id: s.pledgeId,
  tax: s.taxShare > 0 ? { lever_id: s.taxLever, share: s.taxShare } : null,
  cut: s.cutShare > 0 ? { line_id: s.cutLine, share: s.cutShare } : null,
});

export const stateOf = (plan: PayPlan, data: PayData): PayState => ({
  pledgeId: plan.pledge_id,
  taxLever: plan.tax?.lever_id ?? data.taxes[0]!.lever_id,
  taxShare: plan.tax?.share ?? 0,
  cutLine: plan.cut?.line_id ?? EVERY_LINE,
  cutShare: plan.cut?.share ?? 0,
});

/**
 * Keep a state costable after the pledge changes: a share the tax or the line
 * can no longer pay drops to the largest one it can, and the two together
 * never pay more than the whole cost.
 */
export function fitState(opts: PayOptions, s: PayState): PayState {
  const pledge = opts.pledges.find((p) => p.id === s.pledgeId)!;
  const largest = (fits: (share: number) => boolean, want: number) => [...PAY_SHARES].reverse().find((x) => x <= want && fits(x)) ?? 0;
  const taxShare = largest((x) => taxFits(opts, pledge, s.taxLever, x), s.taxShare);
  const cutShare = largest((x) => cutFits(opts, pledge, s.cutLine, x), Math.min(s.cutShare, ALL - taxShare));
  return { ...s, taxShare, cutShare };
}

export const resultOf = (opts: PayOptions, s: PayState): PayResult => payFor(opts, planOf(s));

// ---------------------------------------------------------------- words

/** "a quarter", "half", "three quarters", "all" */
export const shareWords: Record<number, string> = { 0: "none", 25: "a quarter", 50: "half", 75: "three quarters", 100: "all" };

/** "A quarter", "Half" */
export const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const twoFigures = new Intl.NumberFormat("en-GB", { maximumSignificantDigits: 2 });

/** A change in a tax rate to two significant figures, so a small one still shows: "0.058", "2.9", "13". */
export const unitsNumber = (units: number) => twoFigures.format(units);

/** "0.058p", "0.045 points", "1 point" */
export function unitsText(t: Pick<TaxOption, "unit">, units: number): string {
  const n = unitsNumber(units);
  return t.unit === "p" ? `${n}p` : `${n} ${n === "1" ? "point" : "points"}`;
}

/** The rate after the change, to as many decimals as the change shows: "20.058%". */
export function rateAfter(from: number, units: number): string {
  const decimals = (unitsNumber(units).split(".")[1] ?? "").length;
  return `${(from + units).toFixed(decimals)}%`;
}

/** "0.058p on the basic rate of income tax" */
export const taxPhrase = (t: TaxOption, units: number) => `${unitsText(t, units)} ${t.on}`;

/** "a 1.1% cut to running government", "a 0.04% cut to every area of spending" */
export function cutPhrase(c: CutOption, pct: number): string {
  return `a ${pctText(pct)} cut to ${c.id === EVERY_LINE ? "every area of spending" : c.label.toLowerCase()}`;
}

/** A share of a line, to two significant figures: "1.1%", "0.04%". */
export const pctText = (pct: number) => `${twoFigures.format(pct)}%`;

/** £bn with a sign, small amounts in £m: "+£0.4bn", "−£80m", "£0". */
export const signedGbp = (x: number) => (Math.abs(x) < 5e-4 ? "£0" : signed(x, gbpBn));

const MILLIONS_PER_BN = 1000;
/** Below this the £bn format switches to £m (lib/format.ts gbpBn). */
const MILLIONS_BELOW_BN = 0.1;

/**
 * "−£80m to +£80m", "+£0.36bn to +£0.44bn": both ends in one unit, so a range
 * under £1bn whose low end is under £0.1bn reads "+£40m to +£160m", not "+£40m to +£0.16bn".
 */
export function signedRange(r: Range): string {
  const [lo, hi] = [Math.abs(r[0]), Math.abs(r[2])];
  const inMillions = Math.max(lo, hi) < 1 && Math.min(lo, hi) < MILLIONS_BELOW_BN;
  const f = inMillions ? (x: number) => (Math.abs(x) < 5e-4 ? "£0" : signed(x, (a) => `£${grouped(Math.round(a * MILLIONS_PER_BN))}m`)) : signedGbp;
  return `${f(r[0])} to ${f(r[2])}`;
}

/** "£0.36bn to £0.44bn" */
export const costRange = (r: Range) => rangeText(r, gbpBn);

const NO_CHANGE_BN = 5e-4;

/** "Borrowing up £0.4bn a year", "Borrowing down …", "Borrowing unchanged, in the centre" */
export function borrowingHeadline(d: Range): string {
  if (Math.abs(d[1]) < NO_CHANGE_BN) return "Borrowing unchanged, in the centre";
  return d[1] > 0 ? `Borrowing up ${gbpBn(d[1])} a year` : `Borrowing down ${gbpBn(-d[1])} a year`;
}

/** The parts of a plan in words, in the till's order: tax, cut, then borrowing. */
function parts(data: PayData, r: PayResult): { share: number; words: string }[] {
  const out: { share: number; words: string }[] = [];
  if (r.tax) out.push({ share: r.tax.share, words: taxPhrase(data.taxes.find((t) => t.lever_id === r.tax!.lever_id)!, r.tax.units) });
  if (r.cut) out.push({ share: r.cut.share, words: cutPhrase(data.cuts.find((c) => c.id === r.cut!.line_id)!, r.cut.pct_of_line) });
  if (r.shares.borrow > 0) out.push({ share: r.shares.borrow, words: "borrowing" });
  return out;
}

/**
 * The plan in one line, for the share page's title and the share text:
 * "Cap bus fares at £2 (Labour), all borrowed"; "…, paid for by 0.058p on
 * the basic rate of income tax"; "…: half from 0.029p on the basic rate of
 * income tax and half borrowed".
 */
export function planTitle(data: PayData, r: PayResult): string {
  const pledge = data.pledges.find((p) => p.id === r.pledge.id)!;
  // Whose pledge, always: two parties can promise the same thing (a £15,000 personal allowance).
  const named = `${pledge.headline} (${pledge.owner})`;
  const ps = parts(data, r);
  if (ps.length === 1 && ps[0]!.words === "borrowing") return `${named}, all borrowed`;
  if (ps.length === 1) return `${named}, paid for by ${ps[0]!.words}`;
  const said = ps.map((p) => (p.words === "borrowing" ? `${shareWords[p.share]} borrowed` : `${shareWords[p.share]} from ${p.words}`));
  return `${named}: ${said.slice(0, -1).join(", ")} and ${said.at(-1)}`;
}

/** What the pledge costs, in one line: "£0.4bn a year (range £0.36bn to £0.44bn; Department for Transport)". */
export function costLine(p: PledgeView): string {
  return `${gbpBn(p.cost_bn[1])} a year (range ${costRange(p.cost_bn)}${p.costed_by ? `; ${p.costed_by.name}` : ""})`;
}

/** The share page's description and the share text. */
export function planDescription(data: PayData, r: PayResult): string {
  const pledge = data.pledges.find((p) => p.id === r.pledge.id)!;
  return `Costs ${costLine(pledge)}. ${borrowingHeadline(r.d_borrowing_bn)}, range ${signedRange(r.d_borrowing_bn)}. A plan made on LedgerGov.UK's Pay for it: pick a promise and pay for it with a tax, a spending cut or borrowing.`;
}

/** The share image's alt text: everything the picture shows, in words. */
export function planAlt(data: PayData, r: PayResult): string {
  const pledge = data.pledges.find((p) => p.id === r.pledge.id)!;
  return `${planTitle(data, r)}. It costs ${costLine(pledge)}. ${borrowingHeadline(r.d_borrowing_bn)}, range ${signedRange(r.d_borrowing_bn)}. Made with Pay for it on LedgerGov.UK.`;
}

