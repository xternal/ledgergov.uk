import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ARCHETYPES, HouseholdMeasuresFile, PE_UNLIMITED, type HouseholdSnapshot } from "@ledger/schema";
import { readMeasuresFiles } from "@ledger/schema/household";
import { parse } from "yaml";
import {
  budgetPolicies,
  buildHouseholdSnapshot,
  currentLawValue,
  differencesFromCurrentLaw,
  metadataIssues,
  calculatorFor,
  policyEngineCompareUrl,
  readCalculatorBase,
  recordHouseholdRun,
  trimEconomy,
  unchangedMeasures,
  yearPeriod,
  type EconomyStep,
  type HouseholdRecording,
  type PolicyEngineClient,
  type PolicyEngineMetadata,
} from "../src/model";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const MEASURES = "content/budget/household/autumn-budget-2025.yaml";
const text = read(MEASURES);
const file = (): HouseholdMeasuresFile => HouseholdMeasuresFile.parse(parse(text));
const recording = (): HouseholdRecording => JSON.parse(read("packages/server/test/fixtures/t1/household/autumn-budget-2025.json"));
const committed: HouseholdSnapshot = JSON.parse(read("data/build/budget/household/autumn-budget-2025.json"));
const calcBase = readCalculatorBase(fileURLToPath(root), "2026-27");
const build = (f: HouseholdMeasuresFile, rec: HouseholdRecording) => buildHouseholdSnapshot(f, text, MEASURES, rec, calcBase);

// PolicyEngine's metadata, trimmed (test/fixtures/t1): every parameter name, values for the ones the site sends.
const fixture = JSON.parse(read("packages/server/test/fixtures/t1/pe-meta-parameters.json")) as {
  model_version: string;
  parameters: string[];
  values: Record<string, { unit: string | null; values: Record<string, unknown> }>;
};
const meta: Pick<PolicyEngineMetadata, "parameters"> = {
  parameters: { ...Object.fromEntries(fixture.parameters.map((p) => [p, { unit: null, values: {} }])), ...fixture.values },
};

describe("the two policies", () => {
  it("set each fiscal year's value from 1 January of its first calendar year, the last open-ended", () => {
    expect(yearPeriod("2026-27", false)).toBe("2026-01-01.2026-12-31");
    expect(yearPeriod("2030-31", true)).toBe("2030-01-01.2100-12-31");
  });

  it("set every parameter of every modelled measure outright, without and with the event, and nothing else", () => {
    const f = file();
    const { pre, post } = budgetPolicies(f);
    const paths = f.measures.filter((m) => m.modelled).flatMap((m) => m.parameters!.map((p) => p.path));
    expect(Object.keys(pre).sort()).toEqual([...paths].sort());
    expect(Object.keys(post).sort()).toEqual([...paths].sort());
    expect(pre["gov.hmrc.income_tax.rates.savings.basic"]).toEqual({
      "2026-01-01.2026-12-31": 0.2,
      "2027-01-01.2027-12-31": 0.2,
      "2028-01-01.2028-12-31": 0.2,
      "2029-01-01.2029-12-31": 0.2,
      "2030-01-01.2100-12-31": 0.2,
    });
    expect(post["gov.hmrc.income_tax.rates.savings.basic"]!["2027-01-01.2027-12-31"]).toBe(0.22);
    // No limit is a number PolicyEngine reads as none (JSON has no Infinity).
    expect(post["gov.dwp.universal_credit.elements.child.limit.child_count"]!["2026-01-01.2026-12-31"]).toBe(PE_UNLIMITED);
    expect(pre["gov.dwp.universal_credit.elements.child.limit.child_count"]!["2026-01-01.2026-12-31"]).toBe(2);
    expect(unchangedMeasures(f)).toEqual([]);
  });

  it("name only parameters PolicyEngine has, in its units", () => {
    const f = file();
    expect(metadataIssues(f, meta)).toEqual([]);
    const bad = structuredClone(f);
    bad.measures[0]!.parameters![0]!.path = "gov.dwp.universal_credit.elements.child.limit.children";
    bad.measures[1]!.parameters![0]!.unit = "/1";
    expect(metadataIssues(bad, meta)).toEqual([
      "two-child-limit: PolicyEngine has no parameter gov.dwp.universal_credit.elements.child.limit.children",
      'fuel-duty gov.hmrc.fuel_duty.petrol_and_diesel: PolicyEngine\'s unit is "currency-GBP", the file says "/1"',
    ]);
  });

  it("list where the file departs from PolicyEngine's current law, for the editors to explain", () => {
    expect(currentLawValue(meta, "gov.hmrc.income_tax.rates.savings.basic", "2027-28")).toBe(0.22);
    expect(currentLawValue(meta, "gov.hmrc.income_tax.rates.savings.basic", "2026-27")).toBe(0.2);
    // For a rehearsal of an event PolicyEngine already has, "with" matches its current law except where it is behind
    // the law (the council tax surcharge) or the law moved after the Budget: HMRC's amended fuel duty schedule of
    // May 2026, which PolicyEngine 2.132.6 follows, in 2026-27 and 2027-28.
    const post = differencesFromCurrentLaw(file(), meta, "post");
    expect(new Set(post.map((d) => d.measure))).toEqual(new Set(["fuel-duty", "council-tax-surcharge"]));
    expect(post.filter((d) => d.measure === "fuel-duty").map((d) => d.year)).toEqual(["2026-27", "2027-28"]);
  });
});

/** A fake PolicyEngine: answers from the recording, says "computing" the first time each year is asked. */
function fakeClient(rec: HouseholdRecording, opts: { bundleAfter?: string; years?: number[] } = {}) {
  const calls: string[] = [];
  const asked = new Set<string>();
  let versionCalls = 0;
  const client: PolicyEngineClient = {
    async createPolicy(data) {
      const pre = JSON.stringify(data) === JSON.stringify(rec.policies.pre.data);
      calls.push(`policy ${pre ? "pre" : "post"}`);
      return pre ? rec.policies.pre.id : rec.policies.post.id;
    },
    async economy(policyId, startYear, baselineId): Promise<EconomyStep> {
      const year = `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
      calls.push(`economy ${policyId} over ${baselineId} ${startYear}`);
      if (!asked.has(year)) {
        asked.add(year);
        return { status: "computing" };
      }
      return { status: "ok", raw: rec.economy[year] };
    },
    async budgetWindow() {
      throw new Error("not used");
    },
    async calculateHousehold(_household, policy) {
      const pre = JSON.stringify(policy) === JSON.stringify(rec.policies.pre.data);
      calls.push(`households ${pre ? "pre" : "post"}`);
      return pre ? rec.households!.pre : rec.households!.post;
    },
    async versions() {
      versionCalls += 1;
      calls.push("versions");
      return { bundle: versionCalls > 1 && opts.bundleAfter ? opts.bundleAfter : rec.versions.bundle_before, years: opts.years ?? rec.versions.years, current_law_id: 1 };
    },
    async metadata() {
      calls.push("metadata");
      return { version: rec.versions.household_model_version, parameters: meta.parameters };
    },
  };
  return { client, calls };
}

describe("the live step, against a fake PolicyEngine", () => {
  it("registers both policies, asks for every year post over pre until ready, then the households under each", async () => {
    const rec = recording();
    const { client, calls } = fakeClient(rec);
    let t = Date.parse(rec.recorded_at);
    const out = await recordHouseholdRun(file(), { client, now: () => new Date(t), sleep: async (ms) => void (t += ms) });
    const { pre, post } = rec.policies;
    expect(calls).toEqual([
      "versions",
      "metadata",
      "policy pre",
      "policy post",
      ...[2026, 2027, 2028, 2029, 2030].map((y) => `economy ${post.id} over ${pre.id} ${y}`),
      ...[2026, 2027, 2028, 2029, 2030].map((y) => `economy ${post.id} over ${pre.id} ${y}`),
      "households pre",
      "households post",
      "versions",
    ]);
    expect(out.economy).toEqual(rec.economy);
    expect(out.policies).toEqual(rec.policies);
  });

  it("stops before sending anything when PolicyEngine does not offer a year, or does not know a parameter", async () => {
    const rec = recording();
    await expect(recordHouseholdRun(file(), { client: fakeClient(rec, { years: [2024, 2025, 2026, 2027, 2028, 2029] }).client })).rejects.toThrow(
      /cannot run 2030-31/,
    );
    const f = file();
    f.measures[0]!.parameters![0]!.path = "gov.dwp.universal_credit.elements.child.limit.children";
    const { client, calls } = fakeClient(rec);
    await expect(recordHouseholdRun(f, { client })).rejects.toThrow(/PolicyEngine has no parameter/);
    expect(calls).toEqual(["versions", "metadata"]);
  });

  it("gives up on a year still computing after the limit", async () => {
    const rec = recording();
    const { client } = fakeClient(rec);
    client.economy = async () => ({ status: "computing" });
    let t = 0;
    await expect(recordHouseholdRun(file(), { client, now: () => new Date(t), sleep: async (ms) => void (t += ms), maxWaitMs: 60_000 })).rejects.toThrow(
      /still computing 2026-27, 2027-28, 2028-29, 2029-30, 2030-31 after 1 minutes/,
    );
  });
});

describe("the snapshot", () => {
  it("the committed snapshot is exactly what the recording gives", () => {
    const { snapshot, checks } = build(file(), recording());
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(snapshot).toEqual(committed);
  });

  it("carries one model, the households for every year, and links to the same comparison in PolicyEngine", () => {
    expect(committed.provider).toMatchObject({ model_version: "2.102.3", bundle_version: "6.2.1" });
    expect(committed.households.map((h) => h.year)).toEqual(committed.input.years);
    for (const h of committed.households) expect(h.rows.map((r) => r.id)).toEqual(ARCHETYPES.map((a) => a.id));
    expect(policyEngineCompareUrl(committed, 2027)).toBe(
      `https://policyengine.org/uk/policy?reform=${committed.policies!.post}&baseline=${committed.policies!.pre}&focus=policyOutput.policyBreakdown&region=uk&timePeriod=2027`,
    );
    expect(policyEngineCompareUrl({ policies: null }, 2027)).toBeNull();
  });

  it("refuses answers from two models: PolicyEngine updated during the run", () => {
    const rec = recording();
    (rec.economy["2029-30"]!.policyengine_bundle as { model_version: string }).model_version = "2.126.12";
    const { snapshot, checks } = build(file(), rec);
    expect(snapshot).toBeNull();
    expect(checks.find((c) => c.id === "one_model")).toMatchObject({ ok: false, message: expect.stringMatching(/2\.102\.3\/2\.126\.12.*record again/) });

    const rec2 = recording();
    rec2.versions.bundle_after = "6.3.1";
    expect(build(file(), rec2).snapshot).toBeNull();
    const rec3 = recording();
    rec3.versions.household_model_version = "2.126.12";
    expect(build(file(), rec3).snapshot).toBeNull();
  });

  it("refuses a recording made from other values, or missing a year", () => {
    const f = file();
    f.measures.find((m) => m.id === "dividend-tax")!.parameters![0]!.post["2026-27"] = 0.1175;
    const changed = build(f, recording());
    expect(changed.snapshot).toBeNull();
    expect(changed.checks.find((c) => c.id === "policies")!.ok).toBe(false);

    const rec = recording();
    delete rec.economy["2030-31"];
    const missing = build(file(), rec);
    expect(missing.snapshot).toBeNull();
    expect(missing.checks.find((c) => c.id === "years")!.message).toBe("no answer for 2030-31");
  });

  it("holds back the deciles until reviewed (the fallback): the page keeps the calculator, the households and the Treasury's chart", () => {
    const f = file();
    f.hold = ["deciles"];
    const rec = recording();
    rec.economy = {};
    const { snapshot, checks } = build(f, rec);
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(snapshot!.results).toEqual([]);
    expect(snapshot!.households.map((h) => h.year)).toEqual(f.years);
    expect(snapshot!.provider!.model_version).toBe("2.102.3");
    // Without the hold, a run without the population answers is refused.
    expect(build(file(), rec).snapshot).toBeNull();
  });

  it("asks for the example households only when told to, with no population runs", async () => {
    const rec = recording();
    const { client, calls } = fakeClient(rec);
    const out = await recordHouseholdRun(file(), { client, householdsOnly: true });
    expect(calls.some((c) => c.startsWith("economy"))).toBe(false);
    expect(out.economy).toEqual({});
    expect(out.households).toEqual(rec.households);
  });

  it("gives the salary check the measures' own rates and thresholds, and the sourced seed's for the rest", () => {
    expect(calcBase.base).toBe("data/seed/uk_tax_2026-27.json");
    const calc = calculatorFor(file(), calcBase);
    const y = (fy: string) => calc.years.find((x) => x.year === fy)!;
    // Without the Budget the allowance would have risen in April 2028; with it, frozen.
    expect([y("2028-29").pre.personal_allowance_gbp, y("2028-29").post.personal_allowance_gbp]).toEqual([12_830, 12_570]);
    expect([y("2028-29").pre.ni_primary_threshold_gbp, y("2028-29").post.ni_primary_threshold_gbp]).toEqual([12_830, 12_570]);
    expect([y("2028-29").pre.ni_upper_earnings_limit_gbp, y("2028-29").post.ni_upper_earnings_limit_gbp]).toEqual([51_330, 50_270]);
    // 2027-28: nothing for employees changed.
    expect(y("2027-28").pre).toEqual(y("2027-28").post);
    // Rates the file does not set come from the seed and the levers.
    expect([y("2028-29").post.basic_rate_pct, y("2028-29").post.ni_main_rate_pct, y("2028-29").post.higher_rate_pct]).toEqual([20, 8, 40]);
    expect(committed.calculator).toEqual(calc);
  });

  it("keeps recordings small: economy answers trimmed to what the page reads", () => {
    const rec = recording();
    for (const y of Object.keys(rec.economy)) expect(Object.keys(rec.economy[y]!)).not.toContain("constituency_impact");
    expect(trimEconomy({ budget: 1, constituency_impact: [], local_authority_impact: [] })).toEqual({ budget: 1 });
    expect(readMeasuresFiles().map((m) => m.path)).toContain(MEASURES);
  });
});
