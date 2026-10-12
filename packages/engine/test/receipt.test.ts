import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadSeed } from "@ledger/schema/seed";
import { TaxSeed } from "@ledger/schema";
import {
  RECEIPT_EXAMPLES,
  baseSettings,
  compute,
  createModel,
  findReceiptExample,
  receiptBasis,
  splitPence,
  taxOn,
  taxReceipt,
  yourShare,
  type ReceiptBasis,
} from "../src";

const seed = loadSeed();
const model = createModel(seed.statement, seed.levers);
const basis = receiptBasis(model, seed.tax);
const PENCE = 100;

/** Salaries around every threshold, and the site's examples. */
const SALARIES = [0, 1, 12_569, 12_570, 12_571, 18_000, 25_000, 35_000, 38_000, 50_270, 50_271, 75_000, 99_999, 100_000, 110_000, 125_140, 125_141, 200_000, 1_000_000, 123_456.78];

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("splitPence", () => {
  it("adds up to the total exactly and stays within a penny of each exact share", () => {
    const weights = [407.27, 257.542, 125.721, 93.959, 65.418, 55.72, 35.033, 41.627, 15.053, 108.632, 159.623];
    for (const total of [0, 1, 7, 99, 628_040, 1_234_567]) {
      const parts = splitPence(total, weights);
      expect(sum(parts)).toBe(total);
      parts.forEach((p, i) => {
        expect(Number.isInteger(p)).toBe(true);
        expect(Math.abs(p - (total * weights[i]!) / sum(weights))).toBeLessThan(1);
      });
    }
  });

  it("gives a tie to the earlier line, and nothing to a zero weight", () => {
    expect(splitPence(1, [1, 1])).toEqual([1, 0]);
    expect(splitPence(10, [0, 1])).toEqual([0, 10]);
    expect(splitPence(10, [0, 0])).toEqual([0, 0]);
  });
});

describe("Your tax receipt", () => {
  it("splits the tax paid into the Statement's spending lines, adding up to the penny", () => {
    for (const salary of SALARIES) {
      const r = taxReceipt(basis, salary);
      expect(r.tax_pence).toBe(r.income_tax_pence + r.ni_pence);
      expect(sum(r.lines.map((l) => l.pence))).toBe(r.tax_pence);
      expect(r.spent_pence).toBe(r.tax_pence + r.borrowed_pence);
      expect(r.lines.map((l) => l.id)).toEqual(seed.statement.spending.map((l) => l.id));
      for (const l of r.lines) expect(l.pence).toBeGreaterThanOrEqual(0);
    }
  });

  it("is the same calculation as Your share on the home page at today's settings", () => {
    const settings = baseSettings(model);
    const result = compute(model, settings);
    for (const salary of SALARIES) {
      const r = taxReceipt(basis, salary);
      const share = yourShare(model, seed.tax, result, settings, salary);
      expect(Math.abs(r.income_tax_pence - share.scenario.income_tax * PENCE)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(r.ni_pence - share.scenario.ni * PENCE)).toBeLessThanOrEqual(0.5);
      for (const line of share.by_line) {
        const ours = r.lines.find((l) => l.id === line.id)!;
        expect(Math.abs(ours.pence - line.gbp * PENCE)).toBeLessThan(2);
      }
      expect(Math.abs(r.borrowed_pence - share.borrowed_on_top_gbp * PENCE)).toBeLessThan(2);
    }
  });

  it("puts borrowing on top at the Statement's share: the home page's pence of every £1 spent", () => {
    const statement = seed.statement;
    const spending = sum(statement.spending.map((l) => l.bn));
    const share = statement.borrowing_bn / spending;
    for (const salary of SALARIES.filter((s) => s > 20_000)) {
      const r = taxReceipt(basis, salary);
      expect(r.borrowed_share).toBeCloseTo(share, 6);
      // Of everything spent on your behalf, the borrowed part is the Statement's share, give or take the rounding to pence.
      expect(Math.abs(r.borrowed_pence / r.spent_pence - share)).toBeLessThan(1 / r.spent_pence);
      expect(((r.borrowed_pence / r.spent_pence) * PENCE).toFixed(1)).toBe((share * PENCE).toFixed(1));
    }
  });

  it("charges nothing on no salary or nonsense, and nothing below the personal allowance", () => {
    for (const salary of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, seed.tax.income_tax.personal_allowance_gbp]) {
      const r = taxReceipt(basis, salary);
      expect(r.tax_pence).toBe(0);
      expect(r.borrowed_pence).toBe(0);
      expect(r.lines.every((l) => l.pence === 0)).toBe(true);
    }
  });

  it("works out a basic-rate salary from the published rates by hand", () => {
    const { income_tax: it, employee_ni: ni } = seed.tax;
    for (const salary of [25_000, 35_000]) {
      const r = taxReceipt(basis, salary);
      expect(r.income_tax_pence).toBe(Math.round((salary - it.personal_allowance_gbp) * basis.rates.basicRatePct));
      expect(r.ni_pence).toBe(Math.round((salary - ni.primary_threshold_gbp) * basis.rates.niMainRatePct));
    }
  });

  it("uses the real 2026-27 rates: £35,000 pays £4,486.00 income tax and £1,794.40 National Insurance", () => {
    // The hand-sourced 2026-27 seed (GOV.UK and HMRC, checked against the ETL's editions), with the 20% basic rate and 8% main rate.
    const tax2026 = TaxSeed.parse(JSON.parse(readFileSync(new URL("../../../data/seed/uk_tax_2026-27.json", import.meta.url), "utf8")));
    expect(tax2026.meta.tax_year).toBe("2026-27");
    const paid = taxOn(tax2026, 35_000, { basicRatePct: 20, niMainRatePct: 8 });
    expect(paid.income_tax).toBeCloseTo(4486, 6);
    expect(paid.ni).toBeCloseTo(1794.4, 6);
    // The bundle the site builds from carries the same 2026-27 figures while 2026-27 is the latest tax year.
    if (seed.tax.meta.tax_year === "2026-27") {
      const r = taxReceipt(basis, 35_000);
      expect([r.income_tax_pence, r.ni_pence, r.tax_pence]).toEqual([448_600, 179_440, 628_040]);
    }
  });

  it("names every tax figure's page and edition", () => {
    const sources = seed.tax.meta.sources ?? [];
    expect(sources.length).toBeGreaterThanOrEqual(2);
    for (const s of sources) {
      expect(s.url).toMatch(/^https:\/\/www\.gov\.uk\//);
      expect(s.vintage).toBeTruthy();
    }
  });
});

describe("example receipts", () => {
  it("are a few round salaries with unique addresses", () => {
    expect(new Set(RECEIPT_EXAMPLES.map((e) => e.slug)).size).toBe(RECEIPT_EXAMPLES.length);
    for (const e of RECEIPT_EXAMPLES) {
      expect(e.salary % 5_000).toBe(0);
      expect(findReceiptExample(e.slug)).toBe(e);
    }
    expect(findReceiptExample("36k")).toBeNull();
    expect(findReceiptExample("35000")).toBeNull();
  });

  it("match the calculator the reader runs: the same numbers from the basis the browser receives", () => {
    // The page hands the browser the basis as JSON; the example pages are drawn on the server from the same basis.
    const inBrowser = JSON.parse(JSON.stringify(basis)) as ReceiptBasis;
    for (const e of RECEIPT_EXAMPLES) {
      expect(taxReceipt(inBrowser, e.salary)).toEqual(taxReceipt(basis, e.salary));
    }
  });
});
