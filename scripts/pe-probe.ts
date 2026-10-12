/**
 * pnpm pe:probe: the live test of PolicyEngine's public API behind "The Budget for your household"
 * (docs/MODEL.md T1, "Budget-night checks"). Run it by hand, rarely: about four economy runs and a dozen
 * household calculations. It answers, for the model the API serves today:
 *
 * 1. Which fiscal year moves when a rate changes in April 2027, dated "2027-01-01" or "2027-04-06"
 *    (and "2027-05-01", which shows the date inside the year that PolicyEngine reads a parameter on).
 * 2. Whether a threshold set explicitly for several years, year by year, holds each year's own value.
 * 3. Whether /uk/economy/{post}/over/{pre} works with two custom policies, and what /budget-window returns.
 * 4. Which versions it runs: the bundle (/v2/tax-benefit-models) and the household engine (/uk/metadata).
 *
 * Every answer is saved under packages/server/test/fixtures/t1/probe/<date>/ (economy answers trimmed to the
 * fields the site reads), so test/t1-probe.test.ts checks the findings without the network. Nothing about a
 * reader is sent: the household is a fixed single adult earning £45,000 in England.
 *
 *   pnpm pe:probe                 # all of it
 *   pnpm pe:probe -- --households # household calculations only (no economy runs)
 *   pnpm pe:probe -- --tax        # only the calculator cross-check: income tax and employee National Insurance at
 *                                 # fixed salaries, saved to packages/engine/test/fixtures/pe-tax-fixed-salaries.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUDGET_JOB_USER_AGENT, policyEngineClient, trimEconomy, type Reform, type Situation } from "../packages/server/src/model";

const root = join(import.meta.dirname, "..");
const today = new Date().toISOString().slice(0, 10);
const out = join(root, "packages/server/test/fixtures/t1/probe", today);
const save = (name: string, data: unknown) => {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, name), `${JSON.stringify(data, null, 1)}\n`);
  console.log(`  saved ${name}`);
};
const client = policyEngineClient({ userAgent: BUDGET_JOB_USER_AGENT, timeouts: { economy: 60_000, calculate: 60_000 } });
const householdsOnly = process.argv.includes("--households");

const YEARS = [2026, 2027, 2028, 2029, 2030];
const at = <T>(v: T) => Object.fromEntries(YEARS.map((y) => [String(y), v]));

/** One adult of working age earning £45,000 in the East Midlands, every year 2026 to 2030, with income tax and net income asked for. */
const SINGLE_45K: Situation = {
  people: { you: { age: at(40), employment_income: at(45_000), income_tax: at(null), national_insurance: at(null) } },
  benunits: { benunit: { members: ["you"] } },
  households: { household: { members: ["you"], region: at("EAST_MIDLANDS"), household_net_income: at(null) } },
};

const BASIC = "gov.hmrc.income_tax.rates.uk[0].rate";
const PA = "gov.hmrc.income_tax.allowances.personal_allowance.amount";
const HIGHER = "gov.hmrc.income_tax.rates.uk[1].threshold";

/** Each year's own value, then open-ended from the last year: the style the Budget job sends. */
const yearByYear = (values: Record<number, number>): Record<string, number> => {
  const years = Object.keys(values).map(Number).sort();
  return Object.fromEntries(years.map((y, i) => [i === years.length - 1 ? `${y}-01-01.2100-12-31` : `${y}-01-01.${y}-12-31`, values[y]!]));
};

const HOUSEHOLD_CASES: { id: string; what: string; policy: Reform }[] = [
  { id: "current-law", what: "current law", policy: {} },
  { id: "basic21-2027-01-01", what: "basic rate 21% from 2027-01-01", policy: { [BASIC]: { "2027-01-01.2100-12-31": 0.21 } } },
  { id: "basic21-2027-04-06", what: "basic rate 21% from 2027-04-06", policy: { [BASIC]: { "2027-04-06.2100-12-31": 0.21 } } },
  { id: "basic21-2027-05-01", what: "basic rate 21% from 2027-05-01", policy: { [BASIC]: { "2027-05-01.2100-12-31": 0.21 } } },
  {
    id: "pa-year-by-year",
    what: "personal allowance £13,000 in 2027 only and £14,000 from 2029, £12,570 otherwise, set year by year",
    policy: { [PA]: yearByYear({ 2026: 12_570, 2027: 13_000, 2028: 12_570, 2029: 14_000 }) },
  },
];

async function households() {
  console.log("Household calculations (/uk/calculate), single adult on £45,000, 2026 to 2030:");
  const rows: Record<string, unknown> = {};
  for (const c of HOUSEHOLD_CASES) {
    const result = await client.calculateHousehold(SINGLE_45K, c.policy);
    save(`household-${c.id}.json`, { what: c.what, request: { household: SINGLE_45K, policy: c.policy }, result });
    const r = result as { people: { you: { income_tax: Record<string, number> } } };
    rows[c.id] = r.people.you.income_tax;
    console.log(`  ${c.what.padEnd(100)} income tax ${YEARS.map((y) => Math.round(r.people.you.income_tax[String(y)]!)).join(", ")}`);
  }
  return rows;
}

/** Ask for one year's comparison until it is ready (every 10 s, up to 15 minutes). */
async function economy(post: number, pre: number, year: number) {
  const started = Date.now();
  for (;;) {
    const step = await client.economy(post, year, pre);
    if (step.status === "ok") return { raw: step.raw, seconds: Math.round((Date.now() - started) / 1000) };
    if (Date.now() - started > 15 * 60_000) throw new Error(`economy ${post} over ${pre} for ${year}: still computing after 15 minutes`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

const bn = (raw: unknown) => ((raw as { budget: { budgetary_impact: number } }).budget.budgetary_impact / 1e9).toFixed(2);

async function economies() {
  console.log("Economy runs (/uk/economy/{post}/over/{pre}):");
  // 1. A basic-rate rise in April 2027 in both date styles, over current law, for 2027 (= 2027-28).
  const styleB = await client.createPolicy({ [BASIC]: { "2027-04-06.2100-12-31": 0.21 } });
  const styleA = await client.createPolicy({ [BASIC]: { "2027-01-01.2100-12-31": 0.21 } });
  for (const [id, policy] of [
    ["basic21-2027-04-06", styleB],
    ["basic21-2027-01-01", styleA],
  ] as const) {
    const { raw, seconds } = await economy(policy, 1, 2027);
    save(`economy-${id}-2027.json`, { policy_id: policy, baseline_id: 1, time_period: 2027, seconds, result: trimEconomy(raw) });
    console.log(`  ${id} over current law, 2027: £${bn(raw)}bn a year (${seconds} s)`);
  }

  // 2. Two custom policies: thresholds frozen (post) over thresholds uprated by CPI from April 2028 (pre),
  //    both set year by year, as the Budget job sends them. Values: PolicyEngine's own pre-Budget path for
  //    Autumn Budget 2025 (uk-autumn-budget-dashboard, pre_autumn_budget_baseline).
  const pre = await client.createPolicy({
    [PA]: yearByYear({ 2026: 12_570, 2027: 12_570, 2028: 12_827, 2029: 13_095, 2030: 13_371 }),
    [HIGHER]: yearByYear({ 2026: 37_700, 2027: 37_700, 2028: 38_470, 2029: 39_274, 2030: 40_105 }),
  });
  const post = await client.createPolicy({
    [PA]: yearByYear({ 2026: 12_570, 2027: 12_570, 2028: 12_570, 2029: 12_570, 2030: 12_570 }),
    [HIGHER]: yearByYear({ 2026: 37_700, 2027: 37_700, 2028: 37_700, 2029: 37_700, 2030: 37_700 }),
  });
  const { raw, seconds } = await economy(post, pre, 2028);
  save(`economy-freeze-over-uprated-2028.json`, { policy_id: post, baseline_id: pre, time_period: 2028, seconds, result: trimEconomy(raw) });
  console.log(`  thresholds frozen (${post}) over uprated (${pre}), 2028: £${bn(raw)}bn a year (${seconds} s)`);

  // 3. The same pair through /budget-window, 2027 and 2028: what it returns, and whether it reuses the cached year.
  const started = Date.now();
  let window: unknown;
  for (;;) {
    const step = await client.budgetWindow(post, pre, 2027, 2);
    window = step.raw;
    if (step.status === "ok" || Date.now() - started > 15 * 60_000) break;
    await new Promise((r) => setTimeout(r, 10_000));
  }
  save(`budget-window-freeze-over-uprated-2027-2.json`, { policy_id: post, baseline_id: pre, start_year: 2027, window_size: 2, seconds: Math.round((Date.now() - started) / 1000), response: window });
  console.log(`  /budget-window, 2027 and 2028: ${JSON.stringify(window).slice(0, 300)}…`);
  return { styleA, styleB, pre, post };
}

/** Fixed salaries for the calculator cross-check (packages/engine/test/tax-vs-policyengine.test.ts): around every threshold and band. */
const TAX_SALARIES = [12_000, 15_000, 30_000, 50_000, 55_000, 60_000, 110_000, 130_000, 150_000];
const TAX_YEARS = [2025, 2026, 2027];

async function taxCrossCheck() {
  const at2 = <T>(v: T) => Object.fromEntries(TAX_YEARS.map((y) => [String(y), v]));
  const situation: Situation = { people: {}, benunits: {}, households: {} };
  for (const s of TAX_SALARIES) {
    const id = `salary_${s}`;
    situation.people[id] = { age: at2(40), employment_income: at2(s), income_tax: at2(null), national_insurance: at2(null) };
    situation.benunits[id] = { members: [id] };
    situation.households[id] = { members: [id], region: at2("EAST_MIDLANDS") };
  }
  const result = await client.calculateHousehold(situation, {});
  const version = (await client.metadata()).version;
  const file = join(root, "packages/engine/test/fixtures/pe-tax-fixed-salaries.json");
  mkdirSync(join(root, "packages/engine/test/fixtures"), { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify({ source: "POST https://api.policyengine.org/uk/calculate, current law, one adult per household in England", model_version: version, retrieved_on: today, salaries: TAX_SALARIES, years: TAX_YEARS, result }, null, 1)}\n`,
  );
  console.log(`saved ${file} (policyengine-uk ${version})`);
}

async function main() {
  if (process.argv.includes("--tax")) return taxCrossCheck();
  const versionsBefore = await client.versions();
  const householdVersion = (await client.metadata()).version;
  console.log(`PolicyEngine bundle ${versionsBefore.bundle}, household engine policyengine-uk ${householdVersion}, years ${versionsBefore.years.join(", ")}`);
  await households();
  const ids = householdsOnly ? null : await economies();
  const versionsAfter = await client.versions();
  save("versions.json", {
    checked_on: today,
    bundle_before: versionsBefore.bundle,
    bundle_after: versionsAfter.bundle,
    household_model_version: householdVersion,
    years: versionsBefore.years,
    current_law_id: versionsBefore.current_law_id,
    policies: ids,
  });
  console.log(`Done. Bundle before ${versionsBefore.bundle}, after ${versionsAfter.bundle}. Fixtures in ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
