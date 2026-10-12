import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { repoRoot } from "./content-files";
import { HouseholdMeasuresFile, HouseholdSnapshot, calculatorRatesInFile, householdByDateDesc, type CalculatorRates } from "./household";
import { TaxSeed } from "./tax";

/**
 * "The Budget for your household", read from disk (Node only: server components at build time, scripts, tests).
 * content/budget/household/<event>.yaml: the measures (files starting "_", such as _templates.yaml, are not events).
 * data/build/budget/household/<event>.json: the snapshots the page is built from.
 */
export const MEASURES_DIR = join("content", "budget", "household");
export const HOUSEHOLD_DIR = join("data", "build", "budget", "household");

export interface RawMeasuresFile {
  /** Repo-relative, e.g. "content/budget/household/autumn-budget-2025.yaml". */
  path: string;
  text: string;
}

export function readMeasuresFiles(root = repoRoot()): RawMeasuresFile[] {
  const dir = join(root, MEASURES_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") && !f.startsWith("_"))
    .sort()
    .map((f) => ({ path: join(MEASURES_DIR, f), text: readFileSync(join(dir, f), "utf8") }));
}

export const textSha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** Parse one measures file; issues name the file and the field. */
export function parseMeasuresFile(raw: RawMeasuresFile): { data: HouseholdMeasuresFile | null; issues: string[] } {
  let yaml: unknown;
  try {
    yaml = parse(raw.text);
  } catch (e) {
    return { data: null, issues: [`${raw.path}: not valid YAML (${e instanceof Error ? e.message.split("\n")[0] : String(e)})`] };
  }
  const r = HouseholdMeasuresFile.safeParse(yaml);
  if (!r.success) return { data: null, issues: r.error.issues.map((i) => `${raw.path}:${i.path.join(".")}: ${i.message}`) };
  const issues: string[] = [];
  const name = raw.path.split(/[\\/]/).at(-1);
  if (name !== `${r.data.event.id}.yaml`) issues.push(`${raw.path}: file name should be ${r.data.event.id}.yaml`);
  if (/TODO/.test(raw.text)) issues.push(`${raw.path}: a TODO is left in the file`);
  return { data: r.data, issues };
}

export interface RawSnapshotFile {
  path: string;
  data: unknown;
}

export function readHouseholdSnapshotFiles(root = repoRoot()): RawSnapshotFile[] {
  const dir = join(root, HOUSEHOLD_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ path: join(HOUSEHOLD_DIR, f), data: JSON.parse(readFileSync(join(dir, f), "utf8")) }));
}

/**
 * Parse every snapshot (newest event first) and check it against its measures file: a snapshot is published
 * only while the file it was computed from is unchanged, so an edit to the measures without a new run fails.
 */
export function parseHouseholdSnapshots(raw: RawSnapshotFile[], measures: RawMeasuresFile[]): { data: HouseholdSnapshot[]; issues: string[] } {
  const issues: string[] = [];
  const data: HouseholdSnapshot[] = [];
  for (const f of raw) {
    const r = HouseholdSnapshot.safeParse(f.data);
    if (!r.success) {
      issues.push(...r.error.issues.map((i) => `${f.path}:${i.path.join(".")}: ${i.message}`));
      continue;
    }
    const s = r.data;
    const name = f.path.split(/[\\/]/).at(-1);
    if (name !== `${s.id}.json`) issues.push(`${f.path}: file name should be ${s.id}.json`);
    const m = measures.find((x) => x.path.split(/[\\/]/).join("/") === s.measures_file.split(/[\\/]/).join("/"));
    if (!m) issues.push(`${f.path}: its measures file ${s.measures_file} is missing`);
    else if (textSha256(m.text) !== s.measures_sha256)
      issues.push(`${f.path}: ${s.measures_file} changed after this snapshot was computed; run \`pnpm household -- ${s.id}\` again`);
    data.push(s);
  }
  return { data: data.sort(householdByDateDesc), issues };
}

// ---------------------------------------------------------------------------------------------------------------
// The salary check's tax seeds. The Budget's own rates are typed once, in the measures file; a tax seed only gives
// the rates the file does not set.
// ---------------------------------------------------------------------------------------------------------------

export const SEED_DIR = join("data", "seed");
const TAX_SEED_NAME = /^uk_tax_(\d{4}-\d{2})\.json$/;

/** The hand-sourced tax seeds, oldest first: data/seed/uk_tax_YYYY-YY.json (the post-Budget template is not one). */
export function taxSeedNames(root = repoRoot()): string[] {
  const dir = join(root, SEED_DIR);
  return existsSync(dir) ? readdirSync(dir).filter((f) => TAX_SEED_NAME.test(f)).sort() : [];
}

export const taxSeedYear = (name: string) => TAX_SEED_NAME.exec(name)?.[1] ?? null;

/**
 * The seed the salary check starts from for an event whose years start in `firstYear`: the newest one for a tax
 * year no later than that. Never a seed for a later year: on Budget night a post-Budget seed
 * (uk_tax_2027-28.json, from the template) holds the Budget's own rates, and they must not leak into "without".
 */
export function calculatorBaseName(names: readonly string[], firstYear: string): string | null {
  return names.filter((n) => (taxSeedYear(n) ?? "9999") <= firstYear).sort().at(-1) ?? null;
}

/** The seed's own figures, as the salary check names them (the basic rate and employees' main NI rate are sandbox levers, not figures in the seed). */
function seedFigures(seed: TaxSeed): Partial<Record<keyof CalculatorRates, number>> {
  const it = seed.income_tax;
  const ni = seed.employee_ni;
  return {
    personal_allowance_gbp: it.personal_allowance_gbp,
    allowance_taper_threshold_gbp: it.allowance_taper_threshold_gbp,
    allowance_taper_rate: it.allowance_taper_rate,
    basic_band_gbp: it.basic_band_gbp,
    additional_threshold_gbp: it.additional_threshold_gbp,
    higher_rate_pct: it.higher_rate_pct,
    additional_rate_pct: it.additional_rate_pct,
    ni_primary_threshold_gbp: ni.primary_threshold_gbp,
    ni_upper_earnings_limit_gbp: ni.upper_earnings_limit_gbp,
    ni_upper_rate_pct: ni.upper_rate_pct,
  };
}

/**
 * A post-Budget tax seed must say what the Budget's measures file says. For each sourced seed for a year that a
 * Budget (kind "budget", dated before that year starts on 6 April) covers, and that is not the seed the Budget's
 * salary check starts from: every rate both have is equal, and the seed changes nothing the measures file leaves
 * alone. So the Budget's rates are typed in one place, the measures file, and the Your share calculator can never
 * disagree with the household page.
 */
export function taxSeedIssues(root = repoRoot()): string[] {
  const issues: string[] = [];
  const names = taxSeedNames(root);
  const read = (name: string) => TaxSeed.safeParse(JSON.parse(readFileSync(join(root, SEED_DIR, name), "utf8")));
  const budgets = readMeasuresFiles(root)
    .map((m) => ({ path: m.path, data: parseMeasuresFile(m).data }))
    .filter((m): m is { path: string; data: HouseholdMeasuresFile } => m.data?.kind === "budget");
  for (const name of names) {
    const year = taxSeedYear(name)!;
    const seed = read(name);
    if (!seed.success || seed.data.meta.quality !== "sourced") continue;
    const budget = budgets
      .filter((b) => b.data.years.includes(year) && b.data.event.date < `${year.slice(0, 4)}-04-06`)
      .sort((a, b) => b.data.event.date.localeCompare(a.data.event.date))[0];
    if (!budget) continue;
    const baseName = calculatorBaseName(names, budget.data.years[0]!);
    if (!baseName || baseName === name) continue;
    const base = read(baseName);
    if (!base.success) continue;
    const got = seedFigures(seed.data);
    const expected = seedFigures(base.data);
    const setBy = new Map<keyof CalculatorRates, string>();
    for (const r of calculatorRatesInFile(budget.data))
      if (r.side === "post" && r.year === year && r.field in expected) {
        expected[r.field] = r.value;
        setBy.set(r.field, `${r.measure} ${r.path}`);
      }
    for (const field of Object.keys(expected) as (keyof CalculatorRates)[]) {
      if (got[field] === expected[field]) continue;
      const where = `${SEED_DIR}/${name}: ${field} is ${got[field]}`;
      issues.push(
        setBy.has(field)
          ? `${where}, but ${budget.path} (${setBy.get(field)}) gives ${expected[field]} for ${year}: the measures file is the one place for the Budget's rates`
          : `${where}, but ${budget.path} does not change it (${SEED_DIR}/${baseName} has ${expected[field]}): type the Budget's rates in the measures file first, the one place for them`,
      );
    }
  }
  return issues;
}

/** Every measures file parses; every snapshot parses and matches its file. Throws on any issue, so the build fails rather than publish a stale page. */
export function loadHouseholdSnapshots(root = repoRoot()): HouseholdSnapshot[] {
  const measures = readMeasuresFiles(root);
  const issues = measures.flatMap((m) => parseMeasuresFile(m).issues);
  const snapshots = parseHouseholdSnapshots(readHouseholdSnapshotFiles(root), measures);
  issues.push(...snapshots.issues);
  if (issues.length) throw new Error(`Budget household data failed validation:\n${issues.map((i) => `  ${i}`).join("\n")}`);
  return snapshots.data;
}
