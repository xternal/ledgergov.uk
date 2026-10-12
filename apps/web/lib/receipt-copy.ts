import type { Quality } from "@ledger/schema";
import type { ReceiptBasis, TaxReceipt } from "@ledger/engine";
import { fixed, gbp, gbpBn, grouped, poundsPence } from "./format";

/**
 * "Your tax receipt" (/receipt): the words and the shapes both the server (the page, the example pages, the share cards)
 * and the reader's browser (the calculator, the image) use. Nothing here takes or keeps a reader's salary.
 */

export const RECEIPT_PATH = "/receipt";
export const receiptExamplePath = (slug: string) => `${RECEIPT_PATH}/${slug}`;

export const RECEIPT_TITLE = "Your tax receipt";
export const RECEIPT_LINE = "Your tax has a receipt. Nobody ever sent it to you.";

/** A page a figure comes from, with the edition the site holds. */
export interface ReceiptSource {
  title: string;
  url: string;
  /** The edition, e.g. "PESA-2026" or "income-tax-rates@2026-10-01". */
  edition: string | null;
}

/** One spending line of the Statement, as the receipt shows it. */
export interface ReceiptLineInfo {
  id: string;
  label: string;
  desc: string | null;
  /** The Statement's figure for the line, £bn. */
  bn: number;
  quality: Quality;
  note: string | null;
  source: ReceiptSource | null;
  /** Its part of the Statement on the home page. */
  href: string;
}

/** Everything the receipt needs besides the salary. Built on the server from the build (lib/receipt.ts); plain JSON. */
export interface ReceiptContext {
  basis: ReceiptBasis;
  /** The Statement's spending lines in the order the Statement shows them: largest first, catch-all lines last. */
  lines: ReceiptLineInfo[];
  taxYear: string;
  geography: string;
  taxQuality: Quality;
  /** Income tax page first, then the National Insurance page. */
  taxSources: ReceiptSource[];
  /** The Statement's year and edition, e.g. "2025-26" and "ONS outturn, September 2026 release". */
  statementYear: string;
  statementLabel: string;
  borrowing: { quality: Quality; note: string | null; source: ReceiptSource | null; href: string };
  /** "ledgergov.uk/receipt", printed at the foot of the image. */
  printedUrl: string;
}

export interface ReceiptRow {
  info: ReceiptLineInfo;
  pence: number;
}

/** The receipt's spending lines in the Statement's order. */
export const receiptRows = (ctx: ReceiptContext, r: TaxReceipt): ReceiptRow[] =>
  ctx.lines.map((info) => ({ info, pence: r.lines.find((l) => l.id === info.id)?.pence ?? 0 }));

const PERCENT = 100;
/** "9.8p" */
export const pence1 = (share: number) => `${fixed(share * PERCENT, 1)}p`;
/** "18.9%" */
export const pct1 = (share: number) => `${fixed(share * PERCENT, 1)}%`;

const spendingOf = (ctx: ReceiptContext) => ctx.basis.spending_bn;
/** Borrowing per £1 of income: what "on top" adds to each £1 of tax. */
export const onTopPerPound = (ctx: ReceiptContext) => Math.max(0, ctx.basis.borrowing_bn) / ctx.basis.receipts_bn;
export const borrowedPerPoundSpent = (ctx: ReceiptContext) => Math.max(0, ctx.basis.borrowing_bn) / spendingOf(ctx);

/** The rates in words, from the build's tax figures (never typed in). */
export function ratesText(ctx: ReceiptContext) {
  const { tax, rates } = ctx.basis;
  const it = tax.income_tax;
  const ni = tax.employee_ni;
  const pa = rates.personalAllowanceGbp ?? it.personal_allowance_gbp;
  const higher = rates.higherRatePct ?? it.higher_rate_pct;
  const additional = rates.additionalRatePct ?? it.additional_rate_pct;
  return {
    incomeTax: `Personal allowance ${gbp(pa)}; ${rates.basicRatePct}% on the next ${gbp(it.basic_band_gbp)}, ${higher}% up to ${gbp(it.additional_threshold_gbp)}, ${additional}% above. The allowance shrinks by £1 for every £2 earned over ${gbp(it.allowance_taper_threshold_gbp)}.`,
    ni: `Employee National Insurance: ${rates.niMainRatePct}% on pay between ${gbp(ni.primary_threshold_gbp)} and ${gbp(ni.upper_earnings_limit_gbp)} a year, ${ni.upper_rate_pct}% above.`,
  };
}

/** What a spending line's share of the receipt rests on, for its tip and the table. */
export const lineShareText = (ctx: ReceiptContext, info: ReceiptLineInfo) =>
  `${info.label} was ${gbpBn(info.bn)} of the ${gbpBn(spendingOf(ctx))} the state spent in ${ctx.statementYear}, ${pct1(info.bn / spendingOf(ctx))}, so ${pct1(info.bn / spendingOf(ctx))} of your tax goes on this line.`;

export const borrowedText = (ctx: ReceiptContext) =>
  `In ${ctx.statementYear} the state borrowed ${gbpBn(ctx.basis.borrowing_bn)}, ${pence1(borrowedPerPoundSpent(ctx))} of every £1 it spent. For every £1 it raised in tax and other income, it spent ${pence1(onTopPerPound(ctx))} more. So on top of each £1 of your tax, it borrowed ${pence1(onTopPerPound(ctx))}.`;

/** The plain statement of what the receipt is, on the page, the image and the share cards. */
export const illustrationText = "An average split, not where your own pounds went: taxes go into one pot.";

/** "On £35,000 a year you pay £6,280.40 ..." for an example page's description. */
export function exampleSentence(ctx: ReceiptContext, salary: number, r: TaxReceipt): string {
  const rows = receiptRows(ctx, r)
    .filter((x) => x.pence > 0)
    .slice(0, 3)
    .map((x) => `${gbp(x.pence / PERCENT)} on ${x.info.label.toLowerCase()}`);
  return `On £${grouped(salary)} a year you pay ${poundsPence(r.tax_pence)} in income tax and National Insurance in ${ctx.taxYear}: ${rows.join(", ")} and more, plus ${poundsPence(r.borrowed_pence)} borrowed on top.`;
}

export const receiptDescription = (ctx: ReceiptContext) =>
  `Enter a salary and see your ${ctx.taxYear} income tax and National Insurance split by what the state spends it on, plus the borrowing on top. Worked out on your device; your salary is never sent.`;

export const exampleTitle = (salary: number, taxYear: string) => `Tax receipt on £${grouped(salary)} a year, ${taxYear}`;

export const RECEIPT_IMAGE_ALT = (ctx: ReceiptContext) =>
  `A till receipt for income tax and National Insurance in ${ctx.taxYear}, split into what the state spends it on, with the borrowing on top, from LedgerGov.UK`;

/** How it is worked out, step by step, from the build's own figures. */
export function receiptMethod(ctx: ReceiptContext): { title: string; text: string }[] {
  const rates = ratesText(ctx);
  const example = ctx.lines[0]!;
  const share = pct1(example.bn / ctx.basis.spending_bn);
  return [
    {
      title: "1. Your tax",
      text: `Income tax and employee National Insurance on a salary for ${ctx.taxYear}, at the rates for ${ctx.geography}. ${rates.incomeTax} ${rates.ni}`,
    },
    {
      title: "2. Split the way the state spends",
      text: `Your tax is divided between the Statement's spending lines in proportion to what each cost in ${ctx.statementYear}, the latest full year (${ctx.statementLabel}). It is the same split as the Statement on the home page: ${example.label.toLowerCase()} was ${share} of all spending, so ${share} of your tax lands on that line.`,
    },
    {
      title: "3. Borrowing on top",
      text: `${borrowedText(ctx)} That is what the state spent on your behalf beyond what your tax paid.`,
    },
    {
      title: "4. To the penny",
      text: "Each line is rounded to the penny so that the lines add up exactly to the tax you pay.",
    },
  ];
}

export function receiptFaq(ctx: ReceiptContext): { q: string; a: string }[] {
  return [
    {
      q: "Is this where my own tax goes?",
      a: `No. Taxes go into one pot and nobody's pounds are earmarked. The receipt shows your tax split the way all public spending was split in ${ctx.statementYear}: an average, as an illustration.`,
    },
    {
      q: "Do you see my salary?",
      a: "No. The receipt is worked out in your browser. Your salary is never sent to us, never put in a link and never stored or counted. The image is drawn on your device too, and it shows your tax, not your salary. We count how often the page is opened, one number a day for the page, nothing about you.",
    },
    {
      q: "Why are the rates for one year and the spending for another?",
      a: `The rates are this tax year's, ${ctx.taxYear}. The split uses ${ctx.statementYear}, the latest year with full spending figures, the same year the Statement on the home page shows. The shares move little from one year to the next.`,
    },
    {
      q: "What does borrowed on top mean?",
      a: `${borrowedText(ctx)} It is not a bill: it is the part of spending that tax did not cover, which the state borrowed and pays interest on.`,
    },
    {
      q: "What are debt interest and accounting adjustments?",
      a: "Debt interest is what the state pays on what it has borrowed before. Accounting adjustments are the parts of total spending that are not spending on a service, such as public corporations and items councils pay for themselves; the Statement shows them so the total matches the official one.",
    },
    {
      q: "I live in Scotland. Does this apply to me?",
      a: `Scotland sets its own income tax bands and rates, so your income tax will differ from this receipt. National Insurance is the same across the UK. The receipt uses the rates for ${ctx.geography}.`,
    },
    {
      q: "What is left out?",
      a: "Only income tax and the National Insurance taken from your pay are on the receipt. VAT, council tax, fuel duty and the other taxes you pay are not, nor is the National Insurance your employer pays on your wages, student loan repayments or pension contributions. The self-employed pay National Insurance differently.",
    },
  ];
}
