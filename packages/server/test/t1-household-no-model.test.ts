import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  CALCULATOR_PARAMETERS,
  HouseholdMeasuresFile,
  HouseholdSnapshot,
  calculatorIssues,
  householdShows,
  householdView,
  type CalculatorRates,
} from "@ledger/schema";
import { calculatorBaseName, parseHouseholdSnapshots, readMeasuresFiles, taxSeedNames } from "@ledger/schema/household";
import { EXAMPLE_SALARIES, buildHouseholdSnapshot, buildNoModelSnapshot, readCalculatorBase, type HouseholdRecording } from "../src/model";

/**
 * The "no model" fallback (docs/BUDGET_DAY.md, "The fallback rule"): when PolicyEngine cannot be reached at all on
 * Budget night, `pnpm household -- build <event> --no-model` writes a snapshot with no model answers, and the normal
 * run replaces it once PolicyEngine answers. Tested on the Autumn Budget 2025 rehearsal: its measures file, its
 * recording and its committed snapshot.
 */
const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const MEASURES = "content/budget/household/autumn-budget-2025.yaml";
const SNAPSHOT = "data/build/budget/household/autumn-budget-2025.json";
const text = read(MEASURES);
const file = (): HouseholdMeasuresFile => HouseholdMeasuresFile.parse(parse(text));
const recording = (): HouseholdRecording => JSON.parse(read("packages/server/test/fixtures/t1/household/autumn-budget-2025.json"));
const committed = (): HouseholdSnapshot => JSON.parse(read(SNAPSHOT));
const calcBase = readCalculatorBase(fileURLToPath(root), "2026-27");
const NIGHT = new Date("2026-10-29T05:10:00Z");
const noModel = (f = file()) => buildNoModelSnapshot(f, text, MEASURES, calcBase, NIGHT);
const full = (f = file(), rec = recording()) => buildHouseholdSnapshot(f, text, MEASURES, rec, calcBase);
const issuesOf = (s: unknown) => (HouseholdSnapshot.safeParse(s).error?.issues ?? []).map((i) => i.message).join("\n");

describe("a snapshot with no model answers", () => {
  it("is valid, built from the measures file alone, and says plainly that no model answered", () => {
    const { snapshot, checks } = noModel();
    expect(checks.map((c) => [c.id, c.ok])).toEqual([
      ["model", true],
      ["calculator", true],
    ]);
    const s = snapshot!;
    expect(s).toMatchObject({ model: "none", quality: "sourced", provider: null, policies: null, results: [], households: [], computed_at: NIGHT.toISOString() });
    // Everything that needs no model is there, exactly as the full run gives it.
    const f = full().snapshot!;
    expect(s.input).toEqual(f.input);
    expect(s.input.treasury).toBeDefined();
    expect(s.calculator).toEqual(f.calculator);
    expect(s.measures_sha256).toBe(f.measures_sha256);
    // pnpm validate and the page's build accept it against its measures file.
    expect(parseHouseholdSnapshots([{ path: SNAPSHOT, data: JSON.parse(JSON.stringify(s)) }], readMeasuresFiles()).issues).toEqual([]);
  });

  it("needs no Treasury chart: the share image then shows the salary check", () => {
    const f = file();
    delete f.treasury;
    const { snapshot, checks } = noModel(f);
    expect(checks.find((c) => c.id === "model")!.message).toMatch(/no Treasury chart/);
    expect(householdView(snapshot!).share).toBe("salary_check");
  });
});

describe("half-made snapshots are refused", () => {
  it("no model, but results, households, a model version or the wrong quality", () => {
    const f = committed();
    const s = noModel().snapshot!;
    expect(issuesOf({ ...s, results: f.results })).toMatch(/half-made: it says no model answered but carries 5 years of results/);
    expect(issuesOf({ ...s, households: f.households })).toMatch(/half-made/);
    expect(issuesOf({ ...s, provider: f.provider })).toMatch(/names no model version or policies/);
    expect(issuesOf({ ...s, policies: f.policies })).toMatch(/names no model version or policies/);
    expect(issuesOf({ ...s, quality: "modelled" })).toMatch(/quality is "sourced"/);
    expect(issuesOf({ ...s, checks: s.checks.filter((c) => c.id !== "model") })).toMatch(/check model is missing/);
  });

  it("PolicyEngine's answers without their model version, policies, checks, years or households", () => {
    const f = committed();
    expect(issuesOf(f)).toBe("");
    expect(issuesOf({ ...f, provider: null })).toMatch(/half-made: PolicyEngine's answers without the model version/);
    expect(issuesOf({ ...f, policies: null })).toMatch(/half-made/);
    expect(issuesOf({ ...f, model: "none" })).toMatch(/half-made/);
    expect(issuesOf({ ...f, quality: "sourced" })).toMatch(/quality is "modelled"/);
    expect(issuesOf({ ...f, households: [] })).toMatch(/no example households for 2027-28/);
    expect(issuesOf({ ...f, results: f.results.slice(0, 2) })).toMatch(/results for 2026-27, 2027-28, expected/);
    expect(issuesOf({ ...f, checks: f.checks.filter((c) => c.id !== "one_model") })).toMatch(/check one_model is missing: every answer must be shown to come from one model/);
  });

  it("answers from two models, as before: the job refuses to write anything", () => {
    const rec = recording();
    rec.versions.bundle_after = "6.3.1";
    expect(full(file(), rec).snapshot).toBeNull();
  });
});

describe("the salary check's rates are the measures file's", () => {
  it("for every rate and threshold both have, in every year, with and without the event, in both kinds of snapshot", () => {
    expect(calculatorIssues(file(), committed().calculator)).toEqual([]);
    expect(calculatorIssues(file(), noModel().snapshot!.calculator)).toEqual([]);
    // The rehearsal sets four of them: personal allowance, higher-rate threshold and the two NI thresholds.
    const set = file().measures.flatMap((m) => (m.parameters ?? []).map((p) => p.path)).filter((p) => p in CALCULATOR_PARAMETERS);
    expect(set).toHaveLength(4);
  });

  it("refuses a snapshot whose salary check shows a rate the measures file does not give", () => {
    const s = noModel().snapshot!;
    const tampered = structuredClone(s);
    tampered.calculator.years.find((y) => y.year === "2028-29")!.post.personal_allowance_gbp = 13_000;
    expect(issuesOf(tampered)).toMatch(
      /the salary check's personal_allowance_gbp in 2028-29 \(with the event\) is 13000; the measures file \(personal-tax-thresholds gov\.hmrc\.income_tax\.allowances\.personal_allowance\.amount\) gives 12570/,
    );
    // The job checks the same before writing: a measures file with a typed rate flows into the salary check, never beside it.
    const f = file();
    const pa = f.measures.flatMap((m) => m.parameters ?? []).find((p) => p.path.endsWith("personal_allowance.amount"))!;
    pa.post["2027-28"] = 13_500;
    const rebuilt = noModel(f).snapshot!;
    expect(rebuilt.calculator.years.find((y) => y.year === "2027-28")!.post.personal_allowance_gbp).toBe(13_500);
  });

  it("maps each salary-check rate from exactly one PolicyEngine parameter the templates use", () => {
    const fields = Object.values(CALCULATOR_PARAMETERS).map((t) => t.field);
    const all: (keyof CalculatorRates)[] = [
      "personal_allowance_gbp",
      "allowance_taper_threshold_gbp",
      "allowance_taper_rate",
      "basic_band_gbp",
      "additional_threshold_gbp",
      "basic_rate_pct",
      "higher_rate_pct",
      "additional_rate_pct",
      "ni_primary_threshold_gbp",
      "ni_upper_earnings_limit_gbp",
      "ni_main_rate_pct",
      "ni_upper_rate_pct",
    ];
    expect([...fields].sort()).toEqual([...all].sort());
    const known = new Set((JSON.parse(read("packages/server/test/fixtures/t1/pe-meta-parameters.json")) as { parameters: string[] }).parameters);
    for (const path of Object.keys(CALCULATOR_PARAMETERS)) expect(known.has(path), path).toBe(true);
    // NI thresholds are £ a week in PolicyEngine: £12,570 a year is 241.73.
    expect(CALCULATOR_PARAMETERS["gov.hmrc.national_insurance.class_1.thresholds.primary_threshold"]!.convert(241.73)).toBe(12_570);
    expect(CALCULATOR_PARAMETERS["gov.hmrc.income_tax.rates.uk[0].rate"]!.convert(0.21)).toBe(21);
  });

  it("starts from the tax seed for the event's first year, never a post-Budget seed for a later one", () => {
    expect(calcBase.base).toBe("data/seed/uk_tax_2026-27.json");
    expect(calculatorBaseName(["uk_tax_2025-26.json", "uk_tax_2026-27.json", "uk_tax_2027-28.json"], "2026-27")).toBe("uk_tax_2026-27.json");
    expect(calculatorBaseName(["uk_tax_2025-26.json"], "2026-27")).toBe("uk_tax_2025-26.json");
    expect(calculatorBaseName(["uk_tax_2027-28.json"], "2026-27")).toBeNull();
    // The template is not a seed.
    expect(taxSeedNames(fileURLToPath(root))).not.toContain("uk_tax_2027-28.budget-template.json");
  });

  it("gives the share image's example salaries from the fixed single adults", () => {
    expect(EXAMPLE_SALARIES.map((e) => e.id)).toEqual(["single_25k", "single_45k", "single_120k"]);
    expect(EXAMPLE_SALARIES.map((e) => e.salary_gbp)).toEqual([25_000, 45_000, 120_000]);
  });
});

describe("back to full once PolicyEngine answers", () => {
  it("the normal run replaces the no-model snapshot whole, from the same measures file: nothing of it lingers", () => {
    const before = noModel().snapshot!;
    const after = full().snapshot!;
    // The committed snapshot is exactly what the recording gives, whatever was there before.
    expect(after).toEqual(committed());
    expect(after).toMatchObject({ model: "policyengine", quality: "modelled" });
    expect(after.provider).not.toBeNull();
    expect(after.checks.map((c) => c.id)).not.toContain("model");
    expect(after.computed_at).not.toBe(before.computed_at);
    expect(after.measures_sha256).toBe(before.measures_sha256);
    expect(householdView(after)).toEqual({ state: "full", population: "shown", households: "shown", share: "deciles" });
  });
});

describe("the page's data in each state", () => {
  it("full: every part, and the share image shows the deciles", () => {
    const s = committed();
    expect(householdView(s)).toEqual({ state: "full", population: "shown", households: "shown", share: "deciles" });
    expect(householdShows(s)).toEqual({ deciles: true, households: true });
    expect(s.results.map((r) => r.year)).toEqual(s.input.years);
    expect(s.households.map((h) => h.year)).toEqual(s.input.years);
  });

  it("deciles held (hold: [deciles]): the households, the salary check and the Treasury's chart; the share image shows the households", () => {
    const f = file();
    f.hold = ["deciles"];
    const s = full(f).snapshot!;
    expect(householdView(s)).toEqual({ state: "held", population: "awaits_review", households: "shown", share: "households" });
    expect(householdShows(s)).toEqual({ deciles: false, households: true });
    expect(s.results).toEqual([]);
    expect(s.households.map((h) => h.year)).toEqual(f.years);
    expect(s.provider!.model_version).toBe("2.102.3");
    // Both held: the Treasury's chart on the share image.
    f.hold = ["deciles", "households"];
    expect(householdView(full(f).snapshot!).share).toBe("treasury");
  });

  it("no model: the measures, the salary check and the Treasury's chart; the rest awaits PolicyEngine; the share image shows the Treasury's chart", () => {
    const s = noModel().snapshot!;
    expect(householdView(s)).toEqual({ state: "no_model", population: "awaits_model", households: "awaits_model", share: "treasury" });
    expect(householdShows(s)).toEqual({ deciles: false, households: false });
    expect(s.input.measures.every((m) => m.source)).toBe(true);
    expect(s.input.measures.filter((m) => !m.modelled).every((m) => m.not_modelled!.note.length > 0)).toBe(true);
    // A hold in the file changes nothing while no model has answered.
    const f = file();
    f.hold = ["deciles"];
    expect(householdView(noModel(f).snapshot!).state).toBe("no_model");
  });
});
