import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ARCHETYPES, HouseholdMeasuresFile, HouseholdSnapshot, PolicyEngineDashboard } from "@ledger/schema";
import { loadPolicyEngineDashboards } from "@ledger/schema/household";
import { parse } from "yaml";
import {
  PE_PYTHON_PIN,
  PE_PYTHON_URL,
  archetypeCases,
  archetypeSituation,
  budgetPolicies,
  buildHouseholdSnapshot,
  readCalculatorBase,
  recordLocalHouseholds,
  type HouseholdRecording,
  type LocalHouseholdRequest,
} from "../src/model";

/**
 * Since 6 November 2026 the Budget job runs the example households on PolicyEngine's Python package (pinned), and the
 * page shows PolicyEngine's own population results from its Budget dashboard (docs/MODEL.md). No call to its API.
 */
const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const MEASURES = "content/budget/household/autumn-budget-2026.yaml";
const text = read(MEASURES);
const file = (): HouseholdMeasuresFile => HouseholdMeasuresFile.parse(parse(text));
const recording = (): HouseholdRecording => JSON.parse(read("packages/server/test/fixtures/t1/household/autumn-budget-2026.json"));
const calcBase = readCalculatorBase(fileURLToPath(root), "2026-27");

describe("example households on the Python package", () => {
  it("gives the package the same people, earnings, spending and region as the API situation", () => {
    const years = [2026, 2027];
    const cases = archetypeCases(years);
    const situation = archetypeSituation(years);
    expect(cases).toHaveLength(ARCHETYPES.length * years.length);
    for (const c of cases) {
      const h = situation.households[c.id]!;
      expect(c.household.region).toBe((h.region as Record<string, unknown>)[String(c.year)]);
      expect(c.household.petrol_spending).toBe((h.petrol_spending as Record<string, unknown>)[String(c.year)]);
      expect(c.people).toHaveLength((h.members as string[]).length);
      c.people.forEach((p, i) => {
        const api = situation.people[`${c.id}_${i + 1}`]!;
        for (const [k, v] of Object.entries(p)) expect((api[k] as unknown as Record<string, unknown>)[String(c.year)]).toBe(v);
      });
    }
  });

  it("records the run without any PolicyEngine id, and refuses a package other than the pinned one", async () => {
    const f = file();
    let asked: LocalHouseholdRequest | null = null;
    const answer = (version: string) => async (req: LocalHouseholdRequest) => {
      asked = req;
      const net = (bump: number) => ({
        households: Object.fromEntries(ARCHETYPES.map(({ id }) => [id, { household_net_income: Object.fromEntries(req.cases.filter((c) => c.id === id).map((c) => [String(c.year), 20_000 + bump])) }])),
      });
      return { versions: { policyengine: version, policyengine_uk: "2.151.0", policyengine_core: "3.33.3" }, pre: net(0), post: net(10) };
    };
    const rec = await recordLocalHouseholds(f, answer(PE_PYTHON_PIN), () => new Date("2026-11-06T20:00:00Z"));
    expect(asked!.policies).toEqual(budgetPolicies(f));
    expect(rec).toMatchObject({ engine: "python", api: PE_PYTHON_URL, economy: {}, policies: { pre: { id: null }, post: { id: null } } });
    const { snapshot } = buildHouseholdSnapshot(f, text, MEASURES, rec, calcBase);
    expect(snapshot!.households[0]!.rows.every((r) => r.change_gbp === 10)).toBe(true);
    await expect(recordLocalHouseholds(f, answer("6.16.0"))).rejects.toThrow(/pinned to 6\.15\.0/);
  });

  it("refuses a measures file that does not hold deciles: the package computes households only", async () => {
    const f = { ...file(), hold: [] };
    await expect(recordLocalHouseholds(f, async () => ({ versions: { policyengine: PE_PYTHON_PIN, policyengine_uk: "x", policyengine_core: "x" }, pre: {}, post: {} }))).rejects.toThrow(
      /hold deciles/,
    );
  });

  it("rebuilds the committed Autumn Budget 2026 snapshot from the committed recording", () => {
    const { snapshot, checks } = buildHouseholdSnapshot(file(), text, MEASURES, recording(), calcBase);
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    const committed = JSON.parse(read("data/build/budget/household/autumn-budget-2026.json"));
    expect(snapshot).toEqual(HouseholdSnapshot.parse(committed));
    expect(snapshot!.provider).toMatchObject({ name: "policyengine_python", bundle_version: PE_PYTHON_PIN, model_version: "2.151.0" });
    expect(snapshot!.policies).toBeNull();
  });

  it("a Python snapshot must hold the population results", () => {
    const committed = JSON.parse(read("data/build/budget/household/autumn-budget-2026.json"));
    const bad = { ...committed, input: { ...committed.input, hold: [] } };
    expect(HouseholdSnapshot.safeParse(bad).success).toBe(false);
  });
});

describe("PolicyEngine's dashboard figures", () => {
  it("parses, credits the dashboard, and lists every blank cell PolicyEngine left", () => {
    const [d] = loadPolicyEngineDashboards(fileURLToPath(root));
    expect(PolicyEngineDashboard.parse(d)).toBeTruthy();
    expect(d!.url).toBe("https://www.policyengine.org/uk/autumn-budget-2026");
    expect(d!.years.map((y) => y.year)).toContain(file().headline_year);
    expect(d!.years.map((y) => y.year)).toContain(file().side_year);
    for (const f of d!.files) expect(f.url.startsWith(`${d!.url}/data/`)).toBe(true);
    // Every year of the measures file is shown with its public-finance figure; a cell PolicyEngine withholds for
    // confidentiality is null, named in `gaps`, and every null is named there.
    expect(d!.years.map((y) => y.year)).toEqual(file().years);
    const nulls = d!.years.flatMap((y) => [
      ...(y.all_avg_change_gbp === null ? [`${y.year} all £`] : []),
      ...y.deciles.flatMap((x) => [...(x.rel_change_pct === null ? [`${y.year} decile ${x.decile} %`] : []), ...(x.avg_change_gbp === null ? [`${y.year} decile ${x.decile} £`] : [])]),
    ]);
    expect(nulls.sort()).toEqual([...d!.gaps].sort());
    // The years the page leads with are complete.
    for (const year of [file().headline_year, file().side_year]) expect(d!.gaps.some((g) => g.startsWith(year))).toBe(false);
  });
});
