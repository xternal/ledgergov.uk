import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ARCHETYPES,
  HouseholdSnapshot,
  TaxSeed,
  PE_UNLIMITED,
  parameterNumber,
  type CalculatorRates,
  type HouseholdCalculator,
  type HouseholdCheck,
  type HouseholdExampleYear,
  type HouseholdMeasuresFile,
  type HouseholdYearResult,
} from "@ledger/schema";
import { textSha256 } from "@ledger/schema/household";
import { archetypeSituation, readNetIncomes } from "./households";
import { POLICYENGINE_API, type PolicyEngineClient, type PolicyEngineMetadata } from "./policyengine";
import { startYearOf, type Reform } from "./reform";
import { toT1Population } from "./transform";

/**
 * "The Budget for your household" (docs/BUDGET_DAY.md, "The Budget for your household"): the offline job that
 * runs a fiscal event's measures through PolicyEngine, once, on Budget night. Readers never trigger it, and
 * nothing about a reader is ever sent: the households are the six fixed examples.
 *
 * Two steps, so the result can be rebuilt and checked without the network:
 * 1. record (live): register the pre- and post-event policies, ask for every year's comparison and the example
 *    households under both, and keep every answer (economy answers trimmed) in a recording;
 * 2. build (offline): from the measures file and the recording, check everything and write the snapshot the
 *    page reads. CI rebuilds it from the committed recording and compares.
 */

/** Sent as User-Agent by the offline job and the probe, so PolicyEngine can see who is calling and why. */
export const BUDGET_JOB_USER_AGENT = "LedgerGov.UK Budget household job (+https://ledgergov.uk/budget; one run per fiscal event)";

/** The fields of an economy answer the site reads; the rest (constituency and local authority rows, wealth deciles) is dropped. */
const ECONOMY_FIELDS = [
  "model_version",
  "data_version",
  "budget",
  "detailed_budget",
  "decile",
  "intra_decile",
  "poverty",
  "inequality",
  "policyengine_bundle",
  "resolved_app_name",
] as const;

/** An economy answer cut to what the site reads (about 5 KB instead of 250 KB), for fixtures and recordings. */
export function trimEconomy(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  return Object.fromEntries(ECONOMY_FIELDS.filter((k) => k in r).map((k) => [k, r[k]]));
}

/**
 * PolicyEngine's period for one fiscal year's value: the whole calendar year the fiscal year starts in, and
 * open-ended for the last year. Never the real start date (6 April): the API's model (policyengine-uk 2.102.3,
 * bundle 6.2.1) reads every parameter on 1 January, so a value dated 6 April 2027 only reaches 2028-29 (live
 * test, 12 October 2026: docs/MODEL.md T1). A whole calendar year also holds if a later model reads on 30 April.
 */
export function yearPeriod(fiscalYear: string, last: boolean): string {
  const y = startYearOf(fiscalYear);
  return `${y}-01-01.${last ? 2100 : y}-12-31`;
}

/** The two complete policies: every parameter a modelled measure touches, set outright for every year, without and with the event. */
export function budgetPolicies(file: HouseholdMeasuresFile): { pre: Reform; post: Reform } {
  const pre: Reform = {};
  const post: Reform = {};
  const last = file.years.at(-1)!;
  for (const m of file.measures) {
    if (!m.modelled) continue;
    for (const p of m.parameters ?? []) {
      pre[p.path] = Object.fromEntries(file.years.map((y) => [yearPeriod(y, y === last), parameterNumber(p.pre[y]!)]));
      post[p.path] = Object.fromEntries(file.years.map((y) => [yearPeriod(y, y === last), parameterNumber(p.post[y]!)]));
    }
  }
  return { pre, post };
}

/** Measures whose values are the same before and after in every year: harmless, but usually a typing slip. */
export function unchangedMeasures(file: HouseholdMeasuresFile): string[] {
  return file.measures
    .filter((m) => m.modelled && (m.parameters ?? []).every((p) => file.years.every((y) => parameterNumber(p.pre[y]!) === parameterNumber(p.post[y]!))))
    .map((m) => m.id);
}

/** PolicyEngine's value of a parameter in force on a date: its latest dated value on or before it. */
export function valueInForce(meta: Pick<PolicyEngineMetadata, "parameters">, path: string, date: string): unknown {
  const values = meta.parameters[path]?.values ?? {};
  const latest = Object.keys(values)
    .filter((d) => d <= date)
    .sort()
    .at(-1);
  return latest === undefined ? undefined : values[latest];
}

/** A fiscal year's value in PolicyEngine's current law: the one in force on 6 April, the day the year starts. */
export const currentLawValue = (meta: Pick<PolicyEngineMetadata, "parameters">, path: string, fiscalYear: string) =>
  valueInForce(meta, path, `${startYearOf(fiscalYear)}-04-06`);

/** Every parameter path must exist in PolicyEngine's metadata, with the unit the file says. */
export function metadataIssues(file: HouseholdMeasuresFile, meta: Pick<PolicyEngineMetadata, "parameters">): string[] {
  const issues: string[] = [];
  for (const m of file.measures)
    for (const p of m.parameters ?? []) {
      const known = meta.parameters[p.path];
      if (!known) issues.push(`${m.id}: PolicyEngine has no parameter ${p.path}`);
      else if (known.unit !== null && known.unit !== p.unit) issues.push(`${m.id} ${p.path}: PolicyEngine's unit is "${known.unit}", the file says "${p.unit}"`);
    }
  return issues;
}

/**
 * Where the file's values differ from PolicyEngine's current law. For "pre" on Budget night: not an error
 * (PolicyEngine may be behind the law), but each one is a value an editor should be able to explain from its
 * pre_source. For a rehearsal of an event PolicyEngine already has, "post" should match its current law.
 */
export function differencesFromCurrentLaw(file: HouseholdMeasuresFile, meta: Pick<PolicyEngineMetadata, "parameters">, side: "pre" | "post" = "pre") {
  const out: { measure: string; path: string; year: string; value: number; current_law: unknown }[] = [];
  for (const m of file.measures)
    for (const p of m.parameters ?? [])
      for (const y of file.years) {
        const pe = currentLawValue(meta, p.path, y);
        const peNumber = pe === Infinity || pe === "Infinity" ? PE_UNLIMITED : pe;
        const value = parameterNumber(p[side][y]!);
        if (typeof peNumber !== "number" || Math.abs(peNumber - value) > 0.005 * Math.max(1, Math.abs(value)) * (p.unit === "/1" ? 1e-4 : 1))
          out.push({ measure: m.id, path: p.path, year: y, value, current_law: pe });
      }
  return out;
}

/** Everything the live step got back, enough to build the snapshot offline. */
export interface HouseholdRecording {
  event: string;
  recorded_at: string;
  api: string;
  versions: { bundle_before: string; bundle_after: string; household_model_version: string; years: number[] };
  policies: { pre: { id: number; data: Reform }; post: { id: number; data: Reform } };
  /** Trimmed economy answer per fiscal year, post over pre (empty when the run skipped them: `--households-only`). */
  economy: Record<string, Record<string, unknown>>;
  /** /uk/calculate results for the six example households, every year of the file, under each policy (null if skipped). */
  households: { pre: unknown; post: unknown } | null;
}

export interface RecordOptions {
  client: PolicyEngineClient;
  now?: () => Date;
  /** Wait between polls of a computing year. */
  pollMs?: number;
  /** Give up on a year after this long. */
  maxWaitMs?: number;
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
  /** The fallback when the population runs fail or wait (docs/BUDGET_DAY.md): ask for the example households only. */
  householdsOnly?: boolean;
}

/**
 * The live step. Requests, in order: the versions (2), both policies (2), each year's comparison until ready
 * (one start per year, then a poll every `pollMs`), the households under each policy (2), the versions again (1).
 */
export async function recordHouseholdRun(file: HouseholdMeasuresFile, opts: RecordOptions): Promise<HouseholdRecording> {
  const { client } = opts;
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? (() => undefined);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pollMs = opts.pollMs ?? 10_000;
  const maxWaitMs = opts.maxWaitMs ?? 20 * 60_000;

  const before = await client.versions();
  const meta = await client.metadata();
  const householdModel = meta.version;
  log(`PolicyEngine bundle ${before.bundle}, household engine policyengine-uk ${householdModel}`);
  const missing = file.years.filter((y) => !before.years.includes(startYearOf(y)));
  if (missing.length) throw new Error(`PolicyEngine offers ${before.years.join(", ")}; it cannot run ${missing.join(", ")}`);
  const unknown = metadataIssues(file, meta);
  if (unknown.length) throw new Error(`the measures do not fit the model PolicyEngine runs today:\n  ${unknown.join("\n  ")}`);

  const { pre, post } = budgetPolicies(file);
  const preId = await client.createPolicy(pre);
  const postId = await client.createPolicy(post);
  log(`policies: pre ${preId}, post ${postId}`);

  const economy: Record<string, Record<string, unknown>> = {};
  const started = now().getTime();
  let pending = opts.householdsOnly ? [] : [...file.years];
  while (pending.length) {
    const still: string[] = [];
    for (const y of pending) {
      const step = await client.economy(postId, startYearOf(y), preId);
      if (step.status === "ok") {
        economy[y] = trimEconomy(step.raw);
        log(`  ${y}: ready after ${Math.round((now().getTime() - started) / 1000)} s`);
      } else still.push(y);
    }
    pending = still;
    if (!pending.length) break;
    if (now().getTime() - started > maxWaitMs) throw new Error(`PolicyEngine still computing ${pending.join(", ")} after ${Math.round(maxWaitMs / 60_000)} minutes`);
    await sleep(pollMs);
  }

  const situation = archetypeSituation(file.years.map(startYearOf));
  const householdsPre = await client.calculateHousehold(situation, pre);
  const householdsPost = await client.calculateHousehold(situation, post);
  const after = await client.versions();
  return {
    event: file.event.id,
    recorded_at: now().toISOString(),
    api: POLICYENGINE_API,
    versions: { bundle_before: before.bundle, bundle_after: after.bundle, household_model_version: householdModel, years: before.years },
    policies: { pre: { id: preId, data: pre }, post: { id: postId, data: post } },
    economy,
    households: { pre: householdsPre, post: householdsPost },
  };
}

interface EconomyVersions {
  model_version?: string;
  data_version?: string;
  policyengine_bundle?: { model_version?: string; data_version?: string; policyengine_version?: string; dataset?: string | null } | null;
}

const pennies = (v: number) => Math.round(v * 100) / 100;

/** Same JSON, whatever the key order. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

export interface BuildResult {
  /** Null when a check failed: the job refuses to write a snapshot. */
  snapshot: HouseholdSnapshot | null;
  checks: HouseholdCheck[];
}

/**
 * The offline step: check the recording against the measures file and turn it into the snapshot. Refuses
 * (snapshot null) when the recording is of other values, when any year or household is missing, or when the
 * answers come from different model versions: before and after must be one model, or the change is partly an
 * upgrade.
 */
export function buildHouseholdSnapshot(
  file: HouseholdMeasuresFile,
  measuresText: string,
  measuresPath: string,
  rec: HouseholdRecording,
  calculatorBase: CalculatorBase,
): BuildResult {
  const checks: HouseholdCheck[] = [];
  const check = (id: string, ok: boolean, message: string) => checks.push({ id, ok, message });

  check("event", rec.event === file.event.id, rec.event === file.event.id ? `recorded for ${file.event.id}` : `recorded for ${rec.event}, not ${file.event.id}`);

  const expected = budgetPolicies(file);
  const samePolicies = canonical(expected.pre) === canonical(rec.policies.pre.data) && canonical(expected.post) === canonical(rec.policies.post.data);
  check(
    "policies",
    samePolicies,
    samePolicies
      ? `the recorded policies (pre ${rec.policies.pre.id}, post ${rec.policies.post.id}) are exactly what the measures file sets: ${Object.keys(expected.post).length} parameters, ${file.years.length} years`
      : "the recording was made from other values than the measures file now has: record again",
  );

  const hold = file.hold ?? [];
  const holdDeciles = hold.includes("deciles");
  const holdHouseholds = hold.includes("households");
  const missingYears = file.years.filter((y) => !rec.economy[y]);
  if (holdDeciles) check("years", true, "deciles held until two editors have reviewed them: none published");
  else check("years", missingYears.length === 0, missingYears.length ? `no answer for ${missingYears.join(", ")}` : `an answer for every year, ${file.years[0]} to ${file.years.at(-1)}`);

  // One model throughout: every year's economy answer, the bundle before and after, and the household engine.
  const versions = file.years
    .filter((y) => rec.economy[y] && !holdDeciles)
    .map((y) => {
      const e = rec.economy[y] as EconomyVersions;
      const b = e.policyengine_bundle ?? {};
      return { year: y, model: b.model_version ?? e.model_version, data: b.data_version ?? e.data_version, bundle: b.policyengine_version, dataset: b.dataset ?? null };
    });
  const models = new Set(versions.map((v) => v.model));
  const datas = new Set(versions.map((v) => v.data));
  const bundles = new Set([...versions.map((v) => v.bundle), rec.versions.bundle_before, rec.versions.bundle_after]);
  const model = versions[0]?.model ?? (holdDeciles ? rec.versions.household_model_version : undefined);
  const oneModel = models.size <= 1 && datas.size <= 1 && bundles.size === 1 && model === rec.versions.household_model_version && !!model && (holdDeciles || models.size === 1);
  check(
    "one_model",
    oneModel,
    oneModel
      ? holdDeciles
        ? `the households from policyengine-uk ${model}, bundle ${rec.versions.bundle_before} before and after`
        : `every answer from policyengine-uk ${model}, data ${versions[0]!.data}, bundle ${rec.versions.bundle_before}; the households from the same model`
      : `answers from more than one model: economy ${[...models].join("/")} (data ${[...datas].join("/")}), bundle ${[...bundles].join("/")}, households ${rec.versions.household_model_version}. PolicyEngine updated during the run: record again`,
  );

  const results = holdDeciles ? (check("economy", true, "deciles held: not read"), []) : readResults(file, rec, check);
  const households = holdHouseholds
    ? (check("households", true, "example households held until two editors have reviewed them: none published"), [])
    : readHouseholds(file, rec, check);

  if (checks.some((c) => !c.ok)) return { snapshot: null, checks };
  const b = versions[0] ?? { model: rec.versions.household_model_version, data: "not used (deciles held)", dataset: null };
  const snapshot = HouseholdSnapshot.parse({
    id: file.event.id,
    name: file.event.name,
    date: file.event.date,
    kind: file.kind,
    quality: "modelled",
    measures_file: measuresPath,
    measures_sha256: textSha256(measuresText),
    input: file,
    provider: { name: "policyengine_api", api: rec.api, bundle_version: rec.versions.bundle_before, model_version: b.model!, data_version: b.data!, dataset: b.dataset },
    policies: { pre: rec.policies.pre.id, post: rec.policies.post.id },
    computed_at: rec.recorded_at,
    results,
    households,
    calculator: calculatorFor(file, calculatorBase),
    checks,
  });
  return { snapshot, checks };
}

/** Where each rate of the salary check comes from in PolicyEngine, and how its value converts (£ a week to a year, a fraction to %). */
const CALCULATOR_PATHS: Record<string, [keyof CalculatorRates, (v: number) => number]> = {
  "gov.hmrc.income_tax.allowances.personal_allowance.amount": ["personal_allowance_gbp", (v) => v],
  "gov.hmrc.income_tax.allowances.personal_allowance.maximum_ANI": ["allowance_taper_threshold_gbp", (v) => v],
  "gov.hmrc.income_tax.allowances.personal_allowance.reduction_rate": ["allowance_taper_rate", (v) => v],
  "gov.hmrc.income_tax.rates.uk[1].threshold": ["basic_band_gbp", (v) => v],
  "gov.hmrc.income_tax.rates.uk[2].threshold": ["additional_threshold_gbp", (v) => v],
  "gov.hmrc.income_tax.rates.uk[0].rate": ["basic_rate_pct", (v) => Number((v * 100).toFixed(4))],
  "gov.hmrc.income_tax.rates.uk[1].rate": ["higher_rate_pct", (v) => Number((v * 100).toFixed(4))],
  "gov.hmrc.income_tax.rates.uk[2].rate": ["additional_rate_pct", (v) => Number((v * 100).toFixed(4))],
  "gov.hmrc.national_insurance.class_1.thresholds.primary_threshold": ["ni_primary_threshold_gbp", (v) => Math.round(v * 52)],
  "gov.hmrc.national_insurance.class_1.thresholds.upper_earnings_limit": ["ni_upper_earnings_limit_gbp", (v) => Math.round(v * 52)],
  "gov.hmrc.national_insurance.class_1.rates.employee.main": ["ni_main_rate_pct", (v) => Number((v * 100).toFixed(4))],
  "gov.hmrc.national_insurance.class_1.rates.employee.additional": ["ni_upper_rate_pct", (v) => Number((v * 100).toFixed(4))],
};

/** The salary check's starting point: the newest sourced tax seed, and where it is. */
export interface CalculatorBase {
  /** Repo-relative path of the seed, e.g. data/seed/uk_tax_2026-27.json. */
  base: string;
  rates: CalculatorRates;
}

/**
 * The newest sourced tax seed (data/seed/uk_tax_YYYY-YY.json; the post-Budget template is not one) as the salary
 * check's starting rates, with the basic rate and the employee NI main rate from the sandbox levers' bases
 * (data/build/levers.json), as the Your share calculator takes them.
 */
export function readCalculatorBase(root: string): CalculatorBase {
  const name = readdirSync(join(root, "data", "seed"))
    .filter((f) => /^uk_tax_\d{4}-\d{2}\.json$/.test(f))
    .sort()
    .at(-1);
  if (!name) throw new Error("no tax seed in data/seed");
  const seed = TaxSeed.parse(JSON.parse(readFileSync(join(root, "data", "seed", name), "utf8")));
  if (seed.meta.quality !== "sourced") throw new Error(`data/seed/${name} is not sourced`);
  const levers = (JSON.parse(readFileSync(join(root, "data", "build", "levers.json"), "utf8")) as { levers: { id: string; base: number }[] }).levers;
  const base = (id: string) => {
    const l = levers.find((x) => x.id === id);
    if (!l) throw new Error(`no lever ${id}`);
    return l.base;
  };
  const it = seed.income_tax;
  const ni = seed.employee_ni;
  return {
    base: `data/seed/${name}`,
    rates: {
      personal_allowance_gbp: it.personal_allowance_gbp,
      allowance_taper_threshold_gbp: it.allowance_taper_threshold_gbp,
      allowance_taper_rate: it.allowance_taper_rate,
      basic_band_gbp: it.basic_band_gbp,
      additional_threshold_gbp: it.additional_threshold_gbp,
      basic_rate_pct: base(it.basic_rate_lever),
      higher_rate_pct: it.higher_rate_pct,
      additional_rate_pct: it.additional_rate_pct,
      ni_primary_threshold_gbp: ni.primary_threshold_gbp,
      ni_upper_earnings_limit_gbp: ni.upper_earnings_limit_gbp,
      ni_main_rate_pct: base(ni.main_rate_lever),
      ni_upper_rate_pct: ni.upper_rate_pct,
    },
  };
}

/**
 * Income tax and employee NI for each year, without and with the event: the seed's values, overlaid with every
 * rate and threshold the measures file sets (so the salary check and the modelled measures can never disagree).
 */
export function calculatorFor(file: HouseholdMeasuresFile, base: CalculatorBase): HouseholdCalculator {
  const years = file.years.map((year) => {
    const pre = { ...base.rates };
    const post = { ...base.rates };
    for (const m of file.measures)
      for (const p of m.parameters ?? []) {
        const target = CALCULATOR_PATHS[p.path];
        if (!target) continue;
        const [field, convert] = target;
        pre[field] = convert(parameterNumber(p.pre[year]!));
        post[field] = convert(parameterNumber(p.post[year]!));
      }
    return { year, pre, post };
  });
  return { geography: "England, Wales and Northern Ireland", base: base.base, years };
}

type Check = (id: string, ok: boolean, message: string) => void;

/** Every year's population results, from the recorded economy answers. */
function readResults(file: HouseholdMeasuresFile, rec: HouseholdRecording, check: Check): HouseholdYearResult[] {
  try {
    const results = file.years
      .filter((y) => rec.economy[y])
      .map((y) => {
        const { population } = toT1Population(rec.economy[y], { policyId: rec.policies.post.id, startYear: startYearOf(y), fetchedAt: new Date(rec.recorded_at) });
        return {
          year: y,
          budget: { net_bn: population.budget.net_bn, tax_bn: population.budget.tax_bn, benefits_bn: population.budget.benefits_bn },
          deciles: population.deciles,
          winners: population.winners,
          poverty: population.poverty,
          inequality: population.inequality,
        };
      });
    check("economy", true, `${results.length} years read: deciles, gains and losses, poverty and inequality`);
    return results;
  } catch (e) {
    check("economy", false, `an economy answer could not be read (${e instanceof Error ? e.message : String(e)})`);
    return [];
  }
}

/** The six example households in every year, without and with the event. */
function readHouseholds(file: HouseholdMeasuresFile, rec: HouseholdRecording, check: Check): HouseholdExampleYear[] {
  try {
    if (!rec.households) throw new Error("the run did not ask for them");
    const hh = rec.households;
    const households = file.years.map((y) => {
      const start = startYearOf(y);
      const before = readNetIncomes(hh.pre, start);
      const after = readNetIncomes(hh.post, start);
      return {
        year: y,
        rows: ARCHETYPES.map(({ id, label }) => ({
          id,
          label,
          pre_net_gbp: pennies(before[id]),
          post_net_gbp: pennies(after[id]),
          change_gbp: pennies(after[id] - before[id]),
        })),
      };
    });
    check("households", true, "the six example households, every year, without and with the event");
    return households;
  } catch (e) {
    check("households", false, `the example households could not be read (${e instanceof Error ? e.message : String(e)})`);
    return [];
  }
}

/** PolicyEngine's app showing the same comparison: the post policy over the pre one. */
export function policyEngineCompareUrl(s: Pick<HouseholdSnapshot, "policies">, startYear: number): string {
  return `https://policyengine.org/uk/policy?reform=${s.policies.post}&baseline=${s.policies.pre}&focus=policyOutput.policyBreakdown&region=uk&timePeriod=${startYear}`;
}
