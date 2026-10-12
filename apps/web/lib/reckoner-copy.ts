import type { ReckonerChangeSpec } from "@ledger/engine";

/**
 * The ready-reckoner cards (/tax): one card per tax change people quote
 * before a Budget, each with HMRC's own figure. This file holds the words
 * only; every number (rates, figures, years, the edition) comes from the
 * levers and HMRC's observations (lib/reckoner.ts). Wording is neutral: what
 * a change raises, never whether it should be made.
 */

/** Today's rate of a lever, and its rate after the card's change: "20%", "21%". */
export type RateText = (leverId: string, when: "now" | "after") => string;

export interface ReckonerCardSpec {
  /** The card's address: /tax/<slug>. */
  slug: string;
  /** The change, in the words people use, lower case: "1p on the basic rate of income tax". */
  change: string;
  /** Short name for lists and share images. */
  short: string;
  /** What the tax is, in plain words, with today's rate. */
  about: (rate: RateText) => string;
  /** The levers on the card, first the one its headline figure uses, with HMRC's series for each. */
  levers: (ReckonerChangeSpec & { label: string })[];
  /** HMRC's own caveat for this tax, in a line. */
  caveat: string;
  /** HMRC costs a change either way ("Change ... by 1p"), so a cut moves receipts by about as much. False where HMRC costs a rise only. */
  eitherWay: boolean;
  /** How people name one unit of this change: "1p", "1-point". */
  unit: string;
  /** HMRC's figures cannot be scaled: only its own steps are shown. */
  stepped?: true;
}

const INCOME_TAX_CAVEAT =
  "Scotland sets its own income tax rates, so they are not included. HMRC allows for people changing how much income they report, and says the size of that response is uncertain.";

export const RECKONER_CARDS: ReckonerCardSpec[] = [
  {
    slug: "income-tax-basic-rate",
    change: "1p on the basic rate of income tax",
    short: "Income tax, basic rate",
    about: (rate) =>
      `The basic rate is the income tax most taxpayers pay on income above their tax-free personal allowance. It is ${rate("income_tax_basic", "now")} now; this is what raising it to ${rate("income_tax_basic", "after")} would raise.`,
    levers: [{ lever_id: "income_tax_basic", series: "reckoner.income_tax_basic_rate_1p", label: "Basic rate" }],
    caveat: INCOME_TAX_CAVEAT,
    eitherWay: true,
    unit: "1p",
  },
  {
    slug: "income-tax-higher-rate",
    change: "1p on the higher rate of income tax",
    short: "Income tax, higher rate",
    about: (rate) =>
      `The higher rate is the income tax paid on income above the basic-rate band. It is ${rate("income_tax_higher", "now")} now; this is what raising it to ${rate("income_tax_higher", "after")} would raise.`,
    levers: [{ lever_id: "income_tax_higher", series: "reckoner.income_tax_higher_rate_1p", label: "Higher rate" }],
    caveat: INCOME_TAX_CAVEAT,
    eitherWay: true,
    unit: "1p",
  },
  {
    slug: "employee-national-insurance",
    change: "1p on employees' National Insurance",
    short: "National Insurance, employees",
    about: (rate) =>
      `Employees pay National Insurance on their earnings at a main rate, ${rate("nics_main", "now")} now, and a lower rate on earnings above an upper limit. This is what raising the main rate to ${rate("nics_main", "after")} would raise. Employers' National Insurance is separate.`,
    levers: [{ lever_id: "nics_main", series: "reckoner.nics_employee_main_rate_1pp", label: "Employees' main rate" }],
    caveat: "Employees' main rate only. HMRC allows for people changing how much they earn or report, and says the size of that response is uncertain.",
    eitherWay: true,
    unit: "1p",
  },
  {
    slug: "vat",
    change: "1 point on VAT",
    short: "VAT, standard rate",
    about: (rate) =>
      `VAT's standard rate applies to most goods and services. It is ${rate("vat_standard", "now")} now; this is what raising it to ${rate("vat_standard", "after")} would raise. The reduced and zero rates, on things such as home energy and food, stay as they are.`,
    levers: [{ lever_id: "vat_standard", series: "reckoner.vat_standard_rate_1pp", label: "Standard rate" }],
    caveat: "HMRC leaves out wider effects on the economy, such as on prices. The sandbox shows an estimate of the one-off effect on prices separately, as a range.",
    eitherWay: true,
    unit: "1-point",
  },
  {
    slug: "corporation-tax",
    change: "1 point on corporation tax",
    short: "Corporation tax",
    about: (rate) =>
      `Corporation tax is paid on company profits. The main rate is ${rate("corp_tax", "now")} now; this is what raising it to ${rate("corp_tax", "after")} would raise.`,
    levers: [{ lever_id: "corp_tax", series: "reckoner.corp_tax_main_rate_1pp", label: "Main rate" }],
    caveat: "HMRC raises the main rate and the small profits rate together, and leaves out North Sea oil and gas, the Energy Profits Levy and the bank surcharge.",
    eitherWay: false,
    unit: "1-point",
  },
  {
    slug: "capital-gains-tax",
    change: "a rise in capital gains tax",
    short: "Capital gains tax",
    about: (rate) =>
      `Capital gains tax is paid on the profit from selling assets such as shares or a second home. The higher rate, paid by higher-rate taxpayers, is ${rate("cgt_higher", "now")} now, and the lower rate ${rate("cgt_lower", "now")}. HMRC costs only a few sizes of rise in each, shown below.`,
    levers: [
      { lever_id: "cgt_higher", series: "reckoner.cgt_higher_rate_{at}pp", label: "Higher rate" },
      { lever_id: "cgt_lower", series: "reckoner.cgt_lower_rate_{at}pp", label: "Lower rate" },
    ],
    caveat:
      "HMRC says these figures cannot be scaled: a bigger rise can raise less, or lose money, because people sell fewer assets. The effect also swings between years, as sales and the tax returns that report them fall in different years.",
    eitherWay: false,
    unit: "1-point",
    stepped: true,
  },
];

export const RECKONER_PATH = "/tax";
export const reckonerPath = (slug: string) => `${RECKONER_PATH}/${slug}`;

/** The index page (/tax). */
export const RECKONER_TITLE = "What a change to each tax raises";
export const RECKONER_KICKER = "What a tax change raises";

export const RECKONER_COPY = {
  lead: "HMRC publishes what a small change to each tax would raise in a year. These are the changes most talked about before a Budget, one card each to quote and link to: HMRC's figure, the year it is for, the range we show, HMRC's caveat and a link that makes the change in the sandbox.",
  eitherWay: (unit: string) => `HMRC's figure is for a change either way, so a ${unit} cut would lose about as much.`,
  riseOnly: "HMRC costs a rise only.",
  sandbox: "Make this change in the sandbox",
  sandboxNote: "The sandbox shows what it does to borrowing, per household, prices and debt, each as a range.",
  quoteTitle: "Quote this",
  allCards: "What each tax change raises",
} as const;

/** The index's description for search and shares; the edition date is filled in from the data. */
export const reckonerDescription = (published: string) =>
  `What 1p on income tax or employees' National Insurance, 1 point on VAT or corporation tax, and a rise in capital gains tax would raise a year: HMRC's latest figures (published ${published}), one card each with the year, the range and HMRC's caveat, to quote and link to.`;

/** Which one-point change raises the most: a fact from the figures, stated without judgement. */
export function largestLine(first: { change: string } | undefined, last: { change: string } | undefined, firstYear: string, lastYear: string): string | null {
  if (!first || !last) return null;
  return first === last
    ? `Of these one-point changes, ${first.change} raises the most, in ${firstYear} and in ${lastYear}.`
    : `Of these one-point changes, ${first.change} raises the most in ${firstYear}, and ${last.change} in ${lastYear}.`;
}

/** Questions on /tax, repeated as FAQPage structured data. Built from the edition and the band, so no figure is typed here. */
export function reckonerFaq(edition: { title: string; date: string; firstYear: string; band: string }) {
  return [
    {
      q: "Where do these figures come from?",
      a: `From HMRC's ${edition.title}, the edition published ${edition.date}, the latest. HMRC works out what a small change to each tax would raise, for a change made at the start of ${edition.firstYear}, using the official forecast of the time. The sandbox on this site uses the same figures.`,
    },
    {
      q: "Why is each figure shown with a range?",
      a: `HMRC publishes one figure for each year. Anything forecast on this site is shown as a range, so we put ${edition.band} either side of HMRC's figure, our usual band where a source gives no range of its own. Quote HMRC's figure as HMRC's.`,
    },
    {
      q: "Can I double the figure for a 2p rise?",
      a: "For most tax rates, yes, as a rough guide: HMRC says a 2p change raises or costs around twice as much as 1p. Not for capital gains tax, where HMRC says its figures cannot be scaled, so each card shows only the rises HMRC costs.",
    },
    {
      q: "Do the figures allow for how people respond?",
      a: "Mostly, yes. HMRC includes taxpayers' own responses where it models them, such as reporting less income or selling fewer assets. It leaves out wider effects on the economy, such as on prices, jobs or growth, which the Office for Budget Responsibility judges when a change is announced.",
    },
    {
      q: "Is this what the Budget will raise?",
      a: "No. These are HMRC's illustrations of a single change, made on their own. A real Budget measure is costed by the Treasury and checked by the Office for Budget Responsibility, and can differ, because it starts at another date, comes with other changes, or the forecast has moved.",
    },
  ];
}
