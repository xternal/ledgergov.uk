import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HouseholdMeasuresFile, type HouseholdSnapshot } from "@ledger/schema";
import { parse } from "yaml";
import { buildHouseholdSnapshot, readCalculatorBase, type HouseholdRecording } from "../src/model";

/**
 * The rehearsal on Autumn Budget 2025 (docs/MODEL.md T1, "Rehearsal"), run 12 October 2026 on PolicyEngine's API
 * (bundle 6.2.1, policyengine-uk 2.102.3, enhanced FRS 2024-25). Two recordings:
 * - autumn-budget-2025: the page's own inputs (the Budget's dates; the law's "without" values);
 * - autumn-budget-2025-parity: PolicyEngine's own inputs for its December 2025 analysis, to compare like for like.
 * PolicyEngine's published figures and the Treasury's chart are fixtures; each gap below is explained in MODEL.md.
 */
const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const json = <T>(path: string): T => JSON.parse(read(path)) as T;
const DIR = "packages/server/test/fixtures/t1/household/";
const parity = json<HouseholdRecording>(`${DIR}autumn-budget-2025-parity.json`);
const ours = json<HouseholdRecording>(`${DIR}autumn-budget-2025.json`);
const published = json<{
  combined: Record<string, { rel_change_pct: number[]; avg_change_gbp: number[] }>;
  budget_bn: Record<string, Record<string, number>>;
  two_child_limit_avg_change_gbp: Record<string, number[]>;
}>(`${DIR}policyengine-published-autumn-budget-2025.json`);
const snapshot = json<HouseholdSnapshot>("data/build/budget/household/autumn-budget-2025.json");

type Economy = { budget: { budgetary_impact: number }; detailed_budget: Record<string, { difference: number }>; decile: { average: Record<string, number> } };
const economy = (rec: HouseholdRecording, year: string) => rec.economy[year] as unknown as Economy;
const programme = (rec: HouseholdRecording, year: string, name: string) => (economy(rec, year).detailed_budget[name]?.difference ?? 0) / 1e9;
const pe = (reform: string, year: number) => published.budget_bn[reform]![String(year)]!;
const within = (a: number, b: number, share: number) => Math.abs(a - b) <= share * Math.abs(b);

describe("like for like with PolicyEngine's own analysis (parity recording)", () => {
  it("is a valid recording of the parity inputs, from one model", () => {
    const file = HouseholdMeasuresFile.parse(parse(read(`${DIR}autumn-budget-2025-parity.yaml`)));
    const { checks } = buildHouseholdSnapshot(file, "", `${DIR}autumn-budget-2025-parity.yaml`, parity, readCalculatorBase(fileURLToPath(root)));
    expect(checks.filter((c) => !c.ok)).toEqual([]);
  });

  it("raises what PolicyEngine published from the income tax measures in 2028-29, to within 1%", () => {
    // Thresholds frozen, dividends, savings and property income: £6.47bn published, £6.52bn here.
    const publishedIncomeTax = ["threshold_freeze_extension", "dividend_tax_increase_2pp", "savings_tax_increase_2pp", "property_tax_increase_2pp"].reduce(
      (a, r) => a + pe(r, 2028),
      0,
    );
    expect(publishedIncomeTax).toBeCloseTo(6.47, 2);
    expect(within(programme(parity, "2028-29", "income_tax"), publishedIncomeTax, 0.01)).toBe(true);
  });

  it("costs what PolicyEngine published for the two-child limit, to within 6%", () => {
    for (const [year, fy] of [
      [2026, "2026-27"],
      [2027, "2027-28"],
      [2028, "2028-29"],
    ] as const) {
      const cost = programme(parity, fy, "universal_credit") + programme(parity, fy, "pension_credit") + programme(parity, fy, "child_tax_credit");
      expect(within(cost, -pe("two_child_limit", year), 0.06), `${fy}: ${cost.toFixed(2)} against ${(-pe("two_child_limit", year)).toFixed(2)}`).toBe(true);
    }
  });

  it("finds a smaller fuel duty cost than PolicyEngine published, nearer the Treasury's: the model's fuel duty changed since", () => {
    // Treasury (Table 4.1 line 3): −£2.37bn in 2026-27, −£0.86bn in 2027-28. PolicyEngine then: −£3.52bn, −£1.39bn.
    expect(programme(parity, "2026-27", "fuel_duty")).toBeCloseTo(-2.04, 2);
    expect(programme(parity, "2027-28", "fuel_duty")).toBeCloseTo(-0.76, 2);
    expect(pe("fuel_duty_freeze", 2026)).toBeCloseTo(-3.52, 2);
  });

  it("puts the two-child limit's gains in deciles 4 to 6, not 1 and 2: the API's deciles no longer adjust for household size", () => {
    // PolicyEngine published (December 2025, deciles adjusted for size): decile 2 gains most.
    const pub = published.two_child_limit_avg_change_gbp["2026"]!;
    expect(pub.indexOf(Math.max(...pub)) + 1).toBe(2);
    // Here (policyengine.py 5.0, July 2026: deciles of household net income, person-weighted) the whole package,
    // led by the same £2.8bn of Universal Credit, gains most in decile 4.
    const avg = economy(parity, "2026-27").decile.average;
    const gains = Array.from({ length: 10 }, (_, i) => avg[String(i + 1)]!);
    expect(gains.indexOf(Math.max(...gains)) + 1).toBe(4);
    expect(published.combined["2026"]!.rel_change_pct[1]).toBeGreaterThan(2);
  });
});

describe("the page's own run (the Budget's dates, the law's 'without' values)", () => {
  it("counts the dividend rise from April 2026 and savings and property from April 2027, as the Budget dates them", () => {
    // PolicyEngine's analysis starts them a year later (its pre-Budget baseline), so 2026-27 and 2027-28 raise more here.
    expect(programme(ours, "2026-27", "income_tax")).toBeCloseTo(0.99, 2);
    expect(programme(parity, "2026-27", "income_tax")).toBeCloseTo(0, 2);
    expect(programme(ours, "2027-28", "income_tax") - programme(parity, "2027-28", "income_tax")).toBeGreaterThan(1.5);
  });

  it("adds what PolicyEngine's analysis left out: National Insurance thresholds, employers' threshold, the council tax surcharge", () => {
    expect(programme(ours, "2028-29", "national_insurance")).toBeGreaterThan(0.1);
    expect(programme(ours, "2028-29", "ni_employer")).toBeGreaterThan(0.3);
    expect(programme(parity, "2028-29", "national_insurance")).toBe(0);
  });

  it("leads with 2027-28: the bottom half gains a little, the top three tenths lose", () => {
    const head = snapshot.results.find((r) => r.year === "2027-28")!;
    expect(head.deciles.slice(0, 5).every((d) => d.rel_change_pct > 0)).toBe(true);
    expect(head.deciles.slice(7).every((d) => d.rel_change_pct < 0)).toBe(true);
    expect(head.budget.net_bn).toBeCloseTo(-1.0, 1);
  });

  it("agrees with the Treasury's chart on the shape at the top in 2028-29, and says why the rest differs", () => {
    // The Treasury's 2028-29 tax and welfare bars (Figure 1.A, read from the chart): the top tenth loses most.
    const t = snapshot.input.treasury!;
    const cash = t.pct.deciles.map((d) => d.tax + d.welfare);
    const y = snapshot.results.find((r) => r.year === "2028-29")!;
    expect(cash[9]).toBeLessThan(cash[8]!);
    expect(y.deciles[9]!.rel_change_pct).toBeLessThan(0);
    expect(y.deciles[0]!.rel_change_pct).toBeLessThan(cash[0]!);
    // The chart is checked against its own arithmetic: tax + welfare + services = overall, to the reading's precision.
    for (const d of [...t.pct.deciles, t.pct.all]) expect(d.tax + d.welfare + d.services).toBeCloseTo(d.overall, 1);
    for (const d of [...t.gbp!.deciles, t.gbp!.all]) expect(Math.abs(d.tax + d.welfare + d.services - d.overall)).toBeLessThanOrEqual(6);
    expect(t.differs).toMatch(/2028-29/);
  });
});
