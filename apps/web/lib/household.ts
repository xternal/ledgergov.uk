import {
  householdShows,
  parameterNumber,
  sourceRefUrl,
  t1Range,
  type HouseholdMeasure,
  type HouseholdParameter,
  type HouseholdSnapshot,
  type NotModelledReason,
  type ParameterValue,
  type WinnerShares,
} from "@ledger/schema";
import { T1_EDITORIAL_BAND } from "@ledger/schema";
import { BUDGET } from "@/lib/budget";
import { fixed, longDate, MINUS, signed } from "@/lib/format";

/**
 * "The Budget for your household" (/budget/household/<event>): words and formats for the page and its share card.
 * Every figure comes from data/build/budget/household/<event>.json (`pnpm household -- <event>`); nothing here
 * is a number of its own.
 */

export const householdPath = (s: Pick<HouseholdSnapshot, "id">) => `/budget/household/${s.id}`;

const BAND_PCT = Math.round(T1_EDITORIAL_BAND * 100);

/**
 * The snapshot's two years and their results: the year the page leads with, and the one beside it. A part held
 * back until reviewed (the fallback rule) is null.
 */
export function householdYears(s: HouseholdSnapshot) {
  const head = s.input.headline_year;
  const side = s.input.side_year;
  const result = (y: string) => s.results.find((r) => r.year === y) ?? null;
  const examples = (y: string) => s.households.find((h) => h.year === y) ?? null;
  return { head, side, headResult: result(head), sideResult: result(side), headHouseholds: examples(head), sideHouseholds: examples(side), shows: householdShows(s) };
}

const gaining = (w: WinnerShares) => w.gain_more_5 + w.gain_less_5;
const losing = (w: WinnerShares) => w.lose_more_5 + w.lose_less_5;

/** "0.25%", "−0.21%": two decimals, as the changes are small. */
export const pct2 = (x: number) => signed(x, (a) => `${fixed(a, 2)}%`, 0.005);
/** A 0–1 share as a whole per cent: "41%". */
export const pct0 = (x: number) => `${fixed(x * 100, 0)}%`;
/** "+£244", "−£388" a year. */
export const gbpYear = (x: number) => signed(x, (a) => `£${Math.round(a).toLocaleString("en-GB")}`, 0.5);
/** "£35,740" */
export const gbpWhole = (x: number) => `${x < 0 ? MINUS : ""}£${Math.round(Math.abs(x)).toLocaleString("en-GB")}`;
/** "£1.0bn" */
export const bn1 = (x: number) => `£${fixed(Math.abs(x), 1)}bn`;

/** The editorial ±10% around PolicyEngine's single estimate (invariant 2), as text: "0.23% to 0.28%". */
export const rangeOf = (x: number, f: (v: number) => string) => {
  const [lo, , hi] = t1Range(x);
  return `${f(lo)} to ${f(hi)}`;
};

/** The same for a size whose sign the words already give ("costs £1.0bn"): smallest first, "£0.9bn to £1.1bn". */
export const rangeOfSize = (x: number, f: (v: number) => string) => {
  const [lo, , hi] = t1Range(Math.abs(x));
  return `${f(lo)} to ${f(hi)}`;
};

/** The page's title, description and headline facts: the same words for search, share cards and the page. */
export function householdCopy(s: HouseholdSnapshot) {
  const y = householdYears(s);
  const rehearsal = s.kind === "rehearsal";
  const title = rehearsal ? `${s.name}: what it did to households` : `${s.name}: what it does to households`;
  const all = y.headResult?.winners.all ?? null;
  const better = all ? gaining(all) : null;
  const worse = all ? losing(all) : null;
  const modelled = s.input.measures.filter((m) => m.modelled).length;
  const description = rehearsal
    ? `Last year's Budget, worked out the way ${BUDGET.name} will be on the morning after: who gains and who loses from its ${modelled} tax and benefit measures we can model, by income tenth and for six example households, in ${y.head} and ${y.side}. An estimate with PolicyEngine's open model, not official, beside the Treasury's own chart.`
    : `Who gains and who loses from the ${s.name}'s ${modelled} tax and benefit measures we can model, by income tenth and for six example households, in ${y.head} and ${y.side}. An estimate with PolicyEngine's open model, not official, beside the Treasury's own chart.`;
  const net = y.headResult?.budget.net_bn ?? 0;
  return {
    title,
    description,
    better,
    worse,
    /** "raises £3.5bn" or "costs £1.0bn" for the public finances (positive raises money). */
    netText: Math.abs(net) < 0.05 ? "has no net effect" : `${net > 0 ? "raises" : "costs"} ${bn1(net)} a year`,
    ...y,
  };
}

/** The labels every view of the page carries. */
export function householdLabels(s: HouseholdSnapshot) {
  return {
    estimate: "Estimate",
    notOfficial: "Not official",
    model: `PolicyEngine UK ${s.provider.model_version}`,
    band: `Ranges are ±${BAND_PCT}% around PolicyEngine's single estimate.`,
  };
}

export const REASON_LABEL: Record<NotModelledReason, string> = {
  no_parameter: "Not in the model",
  new_tax: "A new tax",
  needs_code: "Needs modelling beyond the public model",
  not_household_income: "Not on household incomes",
};

/** A parameter's value in plain form: rates as %, money in £ (pence for fuel duty), "no limit". */
export function valueText(p: Pick<HouseholdParameter, "unit" | "label">, v: ParameterValue): string {
  if (v === "unlimited" || parameterNumber(v) >= 1e9) return "no limit";
  const n = parameterNumber(v);
  if (p.unit === "/1") return `${Number((n * 100).toFixed(4))}%`;
  if (p.unit.startsWith("currency")) {
    if (/a litre/.test(p.label)) return `${Number((n * 100).toFixed(2))}p`;
    return `£${n.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
  }
  return n.toLocaleString("en-GB");
}

/** The years in which a parameter changes, with its value without and with the event. */
export function changedYears(s: HouseholdSnapshot, p: HouseholdParameter) {
  return s.input.years
    .filter((y) => parameterNumber(p.pre[y]!) !== parameterNumber(p.post[y]!))
    .map((y) => ({ year: y, pre: valueText(p, p.pre[y]!), post: valueText(p, p.post[y]!) }));
}

/** A measure's source link (its page in the Budget document) and, if the Treasury's table has been read, its scorecard line. */
export function measureLinks(s: HouseholdSnapshot, m: HouseholdMeasure, scorecardIds: readonly string[]) {
  return {
    source: sourceRefUrl(s.input.sources, m.source),
    sourceTitle: s.input.sources.find((x) => x.id === m.source.source)?.title ?? m.source.source,
    scorecard: m.scorecard_line !== undefined && scorecardIds.includes(s.id) ? `/budget/scorecard/${s.id}#line-${m.scorecard_line}` : null,
  };
}

export const computedOn = (s: HouseholdSnapshot) => longDate(s.computed_at.slice(0, 10));

/** Questions on the page, repeated as FAQPage structured data: one list, so the markup matches what readers see. */
export function householdFaq(s: HouseholdSnapshot): { q: string; a: string }[] {
  const t = s.input.treasury;
  const y = householdYears(s);
  return [
    {
      q: "Is this the government's own figure?",
      a: `No. It is our estimate, made with PolicyEngine UK, an open-source model of the UK's taxes and benefits run by the charity PolicyEngine. The Treasury publishes its own analysis with every Budget${t ? "; its chart is on this page, beside ours" : ""}. Neither is advice about your own taxes.`,
    },
    {
      q: "Why does it differ from the Treasury's chart?",
      a: t
        ? `${t.differs} The Treasury also adjusts each household's income for its size before ranking; PolicyEngine's public model ranks households by their income as it is.`
        : "The Treasury's analysis usually covers a later year and every decision since an earlier Budget, and adds the value of public services; ours covers this Budget's tax and benefit measures we can model, in cash.",
    },
    {
      q: "What is an income tenth?",
      a: "Households are ranked by their income after tax and benefits and split into ten groups, each holding a tenth of the people. The first tenth has the lowest incomes. Income is not adjusted for household size, so a large family on a modest income can sit in a middle tenth.",
    },
    {
      q: "Why are some measures missing?",
      a: "The model can change only the rules it already has. A new tax, a tax it does not model (inheritance tax, corporation tax, business rates) or a change that needs more than new rates and thresholds is listed under “Not in the estimate”, with the reason.",
    },
    {
      q: `Why lead with ${y.head}?`,
      a: `Most measures in a Budget take effect the following April, so ${y.head} is the first full year of most of them. ${y.side} is shown beside it.`,
    },
    {
      q: "Is anything about me sent anywhere?",
      a: "No. The six example households are fixed and the same for everyone, and the estimate was worked out once, before this page was published. Nothing you do on this page is sent to PolicyEngine.",
    },
  ];
}
