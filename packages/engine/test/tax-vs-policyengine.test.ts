import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TaxSeed } from "@ledger/schema";
import { loadSeed } from "@ledger/schema/seed";
import { taxOn } from "../src";

/**
 * The "Your share" calculator (taxOn, client-side) against PolicyEngine UK at fixed salaries. PolicyEngine's answers
 * are a fixture (`pnpm pe:probe -- --tax`, 12 October 2026, policyengine-uk 2.102.3, current law, one adult in
 * England), so this runs offline. Its simulation year 2025 is 2025-26, 2026 is 2026-27.
 */
const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const pe = JSON.parse(read("packages/engine/test/fixtures/pe-tax-fixed-salaries.json")) as {
  model_version: string;
  salaries: number[];
  result: { people: Record<string, { income_tax: Record<string, number>; national_insurance: Record<string, number> }> };
};
const seedFile = (name: string) => TaxSeed.parse(JSON.parse(read(`data/seed/${name}`)));
const levers = loadSeed().levers.levers;
const base = (id: string) => levers.find((l) => l.id === id)!.base;

describe("the calculator agrees with PolicyEngine at fixed salaries", () => {
  for (const [file, year] of [
    ["uk_tax_2025-26.json", "2025"],
    ["uk_tax_2026-27.json", "2026"],
  ] as const) {
    it(`${file}: income tax to the pound, employee National Insurance to 1p`, () => {
      const seed = seedFile(file);
      expect(seed.meta.quality).toBe("sourced");
      // The rates the calculator starts from are the sandbox levers' bases (data/build/levers.json).
      const rates = { basicRatePct: base(seed.income_tax.basic_rate_lever), niMainRatePct: base(seed.employee_ni.main_rate_lever) };
      for (const salary of pe.salaries) {
        const ours = taxOn(seed, salary, rates);
        const theirs = pe.result.people[`salary_${salary}`]!;
        expect(ours.income_tax, `income tax on £${salary}`).toBeCloseTo(theirs.income_tax[year]!, 0);
        // PolicyEngine holds the NI thresholds weekly (£12,570 is 241.73 a week, £12,569.96 a year): a fraction of a penny.
        expect(Math.abs(ours.ni - theirs.national_insurance[year]!), `National Insurance on £${salary}`).toBeLessThan(0.01);
      }
    });
  }

  it("covers every band: below the allowance, basic, higher, the taper and the additional rate", () => {
    const seed = seedFile("uk_tax_2026-27.json");
    const it = seed.income_tax;
    const s = pe.salaries;
    expect(s.some((x) => x < it.personal_allowance_gbp)).toBe(true);
    expect(s.some((x) => x > it.allowance_taper_threshold_gbp && x < it.additional_threshold_gbp)).toBe(true);
    expect(s.some((x) => x > it.additional_threshold_gbp)).toBe(true);
    expect(pe.model_version).toBe("2.102.3");
  });
});

describe("the tax seeds", () => {
  it("are sourced from GOV.UK and HMRC with their URLs, and the post-Budget template waits for its sources", () => {
    for (const name of ["uk_tax_2025-26.json", "uk_tax_2026-27.json"]) {
      const s = seedFile(name);
      expect(s.meta.method_note).not.toMatch(/TODO/);
      for (const src of s.meta.sources!) expect(src.url).toMatch(/^https:\/\/www\.gov\.uk\//);
    }
    const template = seedFile("uk_tax_2027-28.budget-template.json");
    expect(template.meta.quality).toBe("training");
    expect(template.meta.method_note).toMatch(/TODO\(source\)/);
    // Until the Budget changes a figure, 2027-28 carries 2026-27's values (thresholds frozen to April 2031).
    const now = seedFile("uk_tax_2026-27.json");
    expect(template.income_tax).toEqual(now.income_tax);
    expect(template.employee_ni).toEqual(now.employee_ni);
  });

  it("match the committed GOV.UK and HMRC editions they cite", () => {
    const rows = (vintage: string) =>
      read(`data/build/observations/govuk_tax_rates/${vintage}.csv`)
        .trim()
        .split("\n")
        .slice(1)
        .map((l) => l.split(","));
    for (const [name, year] of [
      ["uk_tax_2025-26.json", "2025-26"],
      ["uk_tax_2026-27.json", "2026-27"],
    ] as const) {
      const s = seedFile(name);
      const obs = new Map<string, number>();
      for (const src of s.meta.sources!)
        for (const r of rows(src.vintage!)) {
          // series_id,period,geography,value,unit,kind,source_id,vintage,quality,method_note: counted from the end, as the geography holds commas
          const value = Number(r.at(-7));
          if (r[1] === year) obs.set(r[0]!, value);
        }
      expect(obs.get("tax.income_tax.personal_allowance")).toBe(s.income_tax.personal_allowance_gbp);
      expect(obs.get("tax.income_tax.basic_band")).toBe(s.income_tax.basic_band_gbp);
      expect(obs.get("tax.income_tax.additional_threshold")).toBe(s.income_tax.additional_threshold_gbp);
      expect(obs.get("tax.income_tax.allowance_taper_threshold")).toBe(s.income_tax.allowance_taper_threshold_gbp);
      expect(obs.get("tax.income_tax.higher_rate")).toBe(s.income_tax.higher_rate_pct);
      expect(obs.get("tax.income_tax.additional_rate")).toBe(s.income_tax.additional_rate_pct);
      expect(obs.get("tax.ni.primary_threshold")).toBe(s.employee_ni.primary_threshold_gbp);
      expect(obs.get("tax.ni.upper_earnings_limit")).toBe(s.employee_ni.upper_earnings_limit_gbp);
      expect(obs.get("tax.ni.upper_rate")).toBe(s.employee_ni.upper_rate_pct);
      expect(obs.get("tax.income_tax.basic_rate")).toBe(base(s.income_tax.basic_rate_lever));
      expect(obs.get("tax.ni.main_rate")).toBe(base(s.employee_ni.main_rate_lever));
    }
  });
});
