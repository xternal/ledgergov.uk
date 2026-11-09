import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toT1Population } from "../src/model";

/**
 * What the live test of PolicyEngine's public API found on 12 October 2026 (bundle 6.2.1, policyengine-uk
 * 2.102.3; `pnpm pe:probe`, docs/MODEL.md T1 "Budget-night checks"). Every answer is a recorded fixture, so these
 * tests pin the behaviour the Budget job relies on; run the probe again when PolicyEngine moves to a new
 * bundle, and add its folder here.
 */
const DIR = "./fixtures/t1/probe/2026-10-12/";
const fixture = <T = Record<string, unknown>>(name: string): T => JSON.parse(readFileSync(new URL(DIR + name, import.meta.url), "utf8")) as T;

type HouseholdProbe = { result: { people: { you: { income_tax: Record<string, number> } } } };
const incomeTax = (name: string) => fixture<HouseholdProbe>(`household-${name}.json`).result.people.you.income_tax;
type EconomyProbe = { policy_id: number; baseline_id: number; time_period: number; result: Record<string, unknown> };
const economy = (name: string) => fixture<EconomyProbe>(`economy-${name}.json`);
const bn = (e: EconomyProbe) => (e.result as { budget: { budgetary_impact: number } }).budget.budgetary_impact / 1e9;

describe("PolicyEngine's API, 12 October 2026: which fiscal year a dated change reaches", () => {
  const base = incomeTax("current-law");

  it("households: a change dated 1 January 2027 reaches 2027-28; one dated 6 April or 1 May 2027 only 2028-29", () => {
    const styleA = incomeTax("basic21-2027-01-01");
    const styleB = incomeTax("basic21-2027-04-06");
    const may = incomeTax("basic21-2027-05-01");
    // £45,000: (45,000 − 12,570) × 1 point = £324.30 more income tax.
    expect(styleA["2026"]).toBe(base["2026"]);
    expect(styleA["2027"]! - base["2027"]!).toBeCloseTo(324.3, 1);
    expect(styleB["2027"]).toBe(base["2027"]);
    expect(styleB["2028"]! - base["2028"]!).toBeCloseTo(324.3, 1);
    expect(may).toEqual(styleB);
  });

  it("the population: the same, so a change must be dated 1 January of the fiscal year's first calendar year", () => {
    const b = economy("basic21-2027-04-06-2027");
    const a = economy("basic21-2027-01-01-2027");
    expect([b.time_period, a.time_period]).toEqual([2027, 2027]);
    expect(bn(b)).toBe(0);
    expect(bn(a)).toBeCloseTo(6.91, 2);
  });

  it("a value set year by year holds each year's own value, and the open-ended last one carries on", () => {
    const pa = incomeTax("pa-year-by-year");
    // Allowance £13,000 in 2027 only, £12,570 in 2026 and 2028, £14,000 from 2029. From 2029 PolicyEngine's
    // current law also trims pay by 0.16% (the salary sacrifice cap's spread cost), so taxable pay is £44,928.
    expect([pa["2026"], pa["2027"], pa["2028"]]).toEqual([6486, 6400, 6486]);
    expect(pa["2029"]).toBeCloseTo((44_928 - 14_000) * 0.2, 1);
    expect(pa["2030"]).toBe(pa["2029"]);
  });
});

describe("PolicyEngine's API, 12 October 2026: comparing two policies of our own", () => {
  it("/uk/economy/{post}/over/{pre} takes two custom policies: thresholds frozen over uprated, 2028-29", () => {
    const e = economy("freeze-over-uprated-2028");
    expect(e.baseline_id).not.toBe(1);
    expect(bn(e)).toBeCloseTo(3.67, 2);
    const { population } = toT1Population(e.result, { policyId: e.policy_id, startYear: 2028, fetchedAt: new Date("2026-10-12T20:20:00Z") });
    // Every decile pays: a frozen allowance costs everyone with taxable income.
    for (const d of population.deciles) expect(d.rel_change_pct).toBeLessThan(0);
  });

  it("/budget-window answers budget totals by year only, no deciles, so the job asks year by year", () => {
    const w = fixture<{ response: { status: string; result: { kind: string; annualImpacts: { year: string; budgetaryImpact: number }[] } } }>(
      "budget-window-freeze-over-uprated-2027-2.json",
    );
    expect(w.response.status).toBe("ok");
    expect(w.response.result.kind).toBe("budgetWindow");
    expect(Object.keys(w.response.result.annualImpacts[0]!).sort()).toEqual(
      ["benefitSpendingImpact", "budgetaryImpact", "federalTaxRevenueImpact", "spm_provenance", "stateTaxRevenueImpact", "taxRevenueImpact", "year"].sort(),
    );
    // Its 2028 is the annual run's figure exactly: the two share PolicyEngine's cache.
    expect(w.response.result.annualImpacts[1]!.budgetaryImpact / 1e9).toBeCloseTo(bn(economy("freeze-over-uprated-2028")), 9);
  });

  it("one model throughout: bundle 6.2.1 before and after, policyengine-uk 2.102.3 for households and the population", () => {
    const v = fixture<{ bundle_before: string; bundle_after: string; household_model_version: string; years: number[] }>("versions.json");
    expect([v.bundle_before, v.bundle_after, v.household_model_version]).toEqual(["6.2.1", "6.2.1", "2.102.3"]);
    expect(v.years).toEqual([2024, 2025, 2026, 2027, 2028, 2029, 2030]);
    for (const name of ["basic21-2027-04-06-2027", "basic21-2027-01-01-2027", "freeze-over-uprated-2028"]) {
      const b = economy(name).result.policyengine_bundle as { model_version: string; policyengine_version: string };
      expect([b.model_version, b.policyengine_version]).toEqual(["2.102.3", "6.2.1"]);
    }
  });
});

/** The same probe on 27 October 2026 (bundle 6.10.0, policyengine-uk 2.132.6, data Microcosm UK 2024-25): docs/MODEL.md T1, "Live test again". */
const DIR_1027 = "./fixtures/t1/probe/2026-10-27/";
const fixture1027 = <T = Record<string, unknown>>(name: string): T => JSON.parse(readFileSync(new URL(DIR_1027 + name, import.meta.url), "utf8")) as T;
const incomeTax1027 = (name: string) => fixture1027<HouseholdProbe>(`household-${name}.json`).result.people.you.income_tax;
const economy1027 = (name: string) => fixture1027<EconomyProbe>(`economy-${name}.json`);

describe("PolicyEngine's API, 27 October 2026: a change dated 6 April now reaches that fiscal year", () => {
  const base = incomeTax1027("current-law");

  it("households: dated 1 January or 6 April 2027, it reaches 2027-28; dated 1 May, only 2028-29", () => {
    const styleA = incomeTax1027("basic21-2027-01-01");
    const styleB = incomeTax1027("basic21-2027-04-06");
    const may = incomeTax1027("basic21-2027-05-01");
    expect(styleA["2026"]).toBe(base["2026"]);
    expect(styleA["2027"]! - base["2027"]!).toBeCloseTo(324.3, 1);
    expect(styleB).toEqual(styleA);
    expect(may["2027"]).toBe(base["2027"]);
    expect(may["2028"]! - base["2028"]!).toBeCloseTo(324.3, 1);
  });

  it("the population: the same, so the job's whole-calendar-year periods still land in the right fiscal year", () => {
    const b = economy1027("basic21-2027-04-06-2027");
    const a = economy1027("basic21-2027-01-01-2027");
    expect(bn(a)).toBeCloseTo(6.98, 2);
    expect(bn(b)).toBeCloseTo(bn(a), 6);
  });

  it("a value set year by year still holds each year's own value", () => {
    const pa = incomeTax1027("pa-year-by-year");
    expect([pa["2026"], pa["2027"], pa["2028"]]).toEqual([6486, 6400, 6486]);
    expect(pa["2030"]).toBe(pa["2029"]);
  });

  it("two custom policies: thresholds frozen over uprated, 2028-29, with decile.relative now a fraction", () => {
    const e = economy1027("freeze-over-uprated-2028");
    expect(e.baseline_id).not.toBe(1);
    expect(bn(e)).toBeCloseTo(3.69, 2);
    const rel = (e.result as { decile: { average: Record<string, number>; relative: Record<string, number> } }).decile;
    expect(Math.abs(rel.relative["5"]!)).toBeLessThan(0.01);
    const { population } = toT1Population(e.result, { policyId: e.policy_id, startYear: 2028, fetchedAt: new Date("2026-10-27T10:00:00Z") });
    for (const d of population.deciles) {
      expect(d.rel_change_pct).toBeLessThan(0);
      expect(d.rel_change_pct).toBeGreaterThan(-1);
    }
  });

  it("/budget-window still answers totals only, from the yearly cache", () => {
    const w = fixture1027<{ response: { status: string; result: { kind: string; annualImpacts: { budgetaryImpact: number }[] } } }>(
      "budget-window-freeze-over-uprated-2027-2.json",
    );
    expect(w.response.status).toBe("ok");
    expect(w.response.result.kind).toBe("budgetWindow");
    expect(w.response.result.annualImpacts[1]!.budgetaryImpact / 1e9).toBeCloseTo(bn(economy1027("freeze-over-uprated-2028")), 9);
  });

  it("one model throughout: bundle 6.10.0, policyengine-uk 2.132.6, Microcosm UK 2024-25", () => {
    const v = fixture1027<{ bundle_before: string; bundle_after: string; household_model_version: string; years: number[] }>("versions.json");
    expect([v.bundle_before, v.bundle_after, v.household_model_version]).toEqual(["6.10.0", "6.10.0", "2.132.6"]);
    expect(v.years).toEqual([2024, 2025, 2026, 2027, 2028, 2029, 2030]);
    for (const name of ["basic21-2027-04-06-2027", "basic21-2027-01-01-2027", "freeze-over-uprated-2028"]) {
      const r = economy1027(name).result as { data_version: string; policyengine_bundle: { model_version: string; policyengine_version: string } };
      expect([r.policyengine_bundle.model_version, r.policyengine_bundle.policyengine_version]).toEqual(["2.132.6", "6.10.0"]);
      expect(r.data_version).toMatch(/^microcosm-uk-2024-25/);
    }
  });
});
