/**
 * pnpm household: "The Budget for your household" (docs/BUDGET_DAY.md). Run by an editor on Budget night, never
 * by readers. It reads content/budget/household/<event>.yaml, sends the two complete policies (without and with
 * the event) to PolicyEngine's public API, and writes data/build/budget/household/<event>.json for the page.
 *
 *   pnpm household -- <event>            check, record and build: the whole run (about 5 economy runs, 4 minutes)
 *   pnpm household -- check <event>      offline: the file, its paths against PolicyEngine's metadata (the
 *                                        committed copy), the two policies, and every "without" value that
 *                                        differs from PolicyEngine's current law
 *   pnpm household -- record <event>     live: ask PolicyEngine and keep every answer in
 *                                        packages/server/test/fixtures/t1/household/<event>.json
 *                                        (--households-only: the example households, no population runs)
 *   pnpm household -- build <event>      offline: check the recording and write the snapshot; refuses if any check fails
 *   pnpm household -- build <event> --no-model
 *                                        offline, no recording: when PolicyEngine cannot be reached at all, a snapshot
 *                                        with no model answers (the measures, the Treasury's chart, the salary check);
 *                                        the normal run replaces it once PolicyEngine answers
 *   pnpm household -- templates          live (one /uk/metadata call): rewrite content/budget/household/_templates.yaml
 *                                        and the metadata fixture from PolicyEngine's current law
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify } from "yaml";
import { HOUSEHOLD_DIR, MEASURES_DIR, parseMeasuresFile, readMeasuresFiles } from "@ledger/schema/household";
import type { HouseholdCheck, HouseholdMeasuresFile, HouseholdSnapshot } from "@ledger/schema";
import {
  BUDGET_2025_SOURCE,
  BUDGET_JOB_USER_AGENT,
  FUEL_DUTY_SOURCE,
  MEASURE_TEMPLATES,
  budgetPolicies,
  buildHouseholdSnapshot,
  buildNoModelSnapshot,
  currentLawValue,
  differencesFromCurrentLaw,
  metadataIssues,
  policyEngineClient,
  readCalculatorBase,
  recordHouseholdRun,
  unchangedMeasures,
  type HouseholdRecording,
  type PolicyEngineMetadata,
} from "../packages/server/src/model";

const root = join(import.meta.dirname, "..");
const RECORDINGS = "packages/server/test/fixtures/t1/household";
const META_FIXTURE = "packages/server/test/fixtures/t1/pe-meta-parameters.json";
const TEMPLATE_YEARS = ["2026-27", "2027-28", "2028-29", "2029-30", "2030-31"];

const fail = (message: string): never => {
  console.error(`\n${message}`);
  process.exit(1);
};

/** --file <path>: a measures file outside content/ (the parity rehearsal kept with the test fixtures). */
const fileArg = (() => {
  const i = process.argv.indexOf("--file");
  return i >= 0 ? process.argv[i + 1] : undefined;
})();

function loadEvent(id: string): { file: HouseholdMeasuresFile; text: string; path: string } {
  const raw = fileArg
    ? { path: fileArg, text: readFileSync(join(root, fileArg), "utf8") }
    : readMeasuresFiles(root).find((f) => f.path.endsWith(`${id}.yaml`));
  if (!raw) fail(`no ${MEASURES_DIR}/${id}.yaml`);
  const { data, issues } = parseMeasuresFile(raw!);
  if (!data || issues.length) fail(`${raw!.path} has problems:\n  ${issues.join("\n  ")}`);
  return { file: data!, text: raw!.text, path: raw!.path };
}

/** The committed, trimmed copy of /uk/metadata (enough to check paths and units offline). */
function metaFixture(): Pick<PolicyEngineMetadata, "parameters"> & { model_version: string } {
  const f = JSON.parse(readFileSync(join(root, META_FIXTURE), "utf8")) as {
    model_version: string;
    parameters: string[];
    values: Record<string, { unit?: string; values: Record<string, unknown> }>;
  };
  const parameters: PolicyEngineMetadata["parameters"] = Object.fromEntries(f.parameters.map((p) => [p, { unit: null, values: {} }]));
  for (const [p, v] of Object.entries(f.values)) parameters[p] = { unit: v.unit ?? null, values: v.values };
  return { model_version: f.model_version, parameters };
}

function check(id: string) {
  const { file } = loadEvent(id);
  const meta = metaFixture();
  console.log(`${file.event.name} (${file.kind}): ${file.measures.length} measures, ${file.measures.filter((m) => m.modelled).length} modelled; years ${file.years.join(", ")}`);
  const issues = metadataIssues(file, meta);
  if (issues.length) fail(`against PolicyEngine ${meta.model_version}'s metadata (${META_FIXTURE}):\n  ${issues.join("\n  ")}`);
  console.log(`paths and units: all known to PolicyEngine ${meta.model_version}`);
  const same = unchangedMeasures(file);
  if (same.length) console.log(`warning: the same before and after in every year (a typing slip?): ${same.join(", ")}`);
  for (const side of ["pre", "post"] as const) {
    const diffs = differencesFromCurrentLaw(file, meta, side);
    if (!diffs.length) {
      console.log(`"${side}" values: all as PolicyEngine ${meta.model_version}'s current law`);
      continue;
    }
    console.log(
      side === "pre"
        ? `"without" (pre) values that differ from PolicyEngine ${meta.model_version}'s current law: each needs its pre_source`
        : `"with" (post) values that differ from PolicyEngine ${meta.model_version}'s current law: expected on Budget night; for a rehearsal of an event PolicyEngine already has, each is worth a look`,
    );
    for (const d of diffs) console.log(`  ${d.measure.padEnd(30)} ${d.path.padEnd(66)} ${d.year}  file ${d.value}  PolicyEngine ${String(d.current_law)}`);
  }
  const { pre, post } = budgetPolicies(file);
  console.log(`\nPolicy without the event (pre):\n${JSON.stringify(pre, null, 1)}\n\nPolicy with it (post):\n${JSON.stringify(post, null, 1)}`);
  return file;
}

async function record(id: string) {
  const { file } = loadEvent(id);
  const client = policyEngineClient({ userAgent: BUDGET_JOB_USER_AGENT, timeouts: { economy: 60_000, calculate: 120_000 } });
  const householdsOnly = process.argv.includes("--households-only");
  console.log(`Asking PolicyEngine for ${file.event.name}, ${file.years.join(", ")}${householdsOnly ? ", example households only" : ""}…`);
  const rec = await recordHouseholdRun(file, { client, log: (l) => console.log(l), householdsOnly });
  const out = join(root, RECORDINGS, `${id}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(rec, null, 1)}\n`);
  console.log(`recorded: ${out}`);
}

function build(id: string) {
  const { file, text, path } = loadEvent(id);
  const recPath = join(root, RECORDINGS, `${id}.json`);
  if (!existsSync(recPath)) fail(`no recording at ${recPath}: run \`pnpm household -- record ${id}\` first`);
  const rec = JSON.parse(readFileSync(recPath, "utf8")) as HouseholdRecording;
  const { snapshot, checks } = buildHouseholdSnapshot(file, text, path, rec, readCalculatorBase(root, file.years[0]!));
  write(id, snapshot, checks);
  const head = snapshot!.results.find((r) => r.year === file.headline_year);
  if (head) {
    console.log(`${file.headline_year}: net effect on the public finances £${head.budget.net_bn.toFixed(2)}bn a year (static)`);
    console.log(`deciles (%): ${head.deciles.map((d) => d.rel_change_pct.toFixed(2)).join(", ")}`);
  } else console.log("deciles held: the page shows the calculator, the example households and the Treasury's chart");
}

/** Print the checks; write the snapshot only if every one passed. */
function write(id: string, snapshot: HouseholdSnapshot | null, checks: HouseholdCheck[]) {
  for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"}  ${c.id}: ${c.message}`);
  if (!snapshot) fail("Not written: a check failed (see above). Nothing is published from a run that fails a check.");
  const out = join(root, HOUSEHOLD_DIR, `${id}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(snapshot, null, 1)}\n`);
  console.log(`\nwritten: ${out}`);
}

/**
 * The fallback when PolicyEngine cannot be reached at all: a snapshot from the measures file alone, with no model
 * answers. Ignores any recording; `pnpm household -- <event>` replaces it whole once PolicyEngine answers.
 */
function buildNoModel(id: string) {
  const { file, text, path } = loadEvent(id);
  const { snapshot, checks } = buildNoModelSnapshot(file, text, path, readCalculatorBase(root, file.years[0]!), new Date());
  write(id, snapshot, checks);
  console.log("no model answers: the page shows the measures, the Treasury's chart and the salary check; the rest follows once PolicyEngine answers");
  if (existsSync(join(root, RECORDINGS, `${id}.json`)))
    console.log(
      `note: a recording exists (${RECORDINGS}/${id}.json). If it has the example households, the deciles fallback shows more: add \`hold: [deciles]\` and run \`pnpm household -- build ${id}\` instead.`,
    );
}

/** Rewrite the templates and the metadata fixture from PolicyEngine's live metadata (one call), or from a saved copy (`--from <file>`). */
async function templates(from: string | undefined) {
  const client = policyEngineClient({ userAgent: BUDGET_JOB_USER_AGENT });
  const meta: PolicyEngineMetadata = from ? metadataFromFile(from) : await client.metadata();
  const today = new Date().toISOString().slice(0, 10);
  // Pence for amounts, and no floating-point dust on rates: PolicyEngine's forecasts carry 15 digits.
  const value = (v: unknown, unit: string | null) =>
    v === Infinity || v === "Infinity" ? "unlimited" : typeof v === "number" ? Number(v.toFixed(unit?.startsWith("currency") ? 2 : 6)) : v;
  const blocks = MEASURE_TEMPLATES.map((t) => {
    if (t.not_modelled)
      return { id: t.id, name: t.name, source: { source: "budget-2026", where: "TODO: page of the Budget document" }, effective: "2027-04-06", modelled: false, not_modelled: t.not_modelled, ...(t.note ? { note: t.note } : {}) };
    const parameters = t.parameters!.map((p) => {
      const known = meta.parameters[p.path];
      if (!known) throw new Error(`PolicyEngine ${meta.version} has no parameter ${p.path}`);
      const pre = { ...Object.fromEntries(TEMPLATE_YEARS.map((y) => [y, value(currentLawValue(meta, p.path, y), known.unit)])), ...p.pre?.values };
      for (const [y, v] of Object.entries(pre)) if (typeof v !== "number" && v !== "unlimited") throw new Error(`${p.path} ${y}: PolicyEngine has no value (${String(v)})`);
      return {
        path: p.path,
        unit: known.unit ?? "",
        label: p.label,
        pre,
        post: { ...pre },
        ...(p.pre ? { pre_source: { source: p.pre.source, ...(p.pre.page ? { page: p.pre.page } : {}), ...(p.pre.where ? { where: p.pre.where } : {}), note: p.pre.note } } : {}),
        ...(p.note ? { note: p.note } : {}),
      };
    });
    return { id: t.id, name: t.name, source: { source: "budget-2026", where: "TODO: page of the Budget document" }, effective: "2027-04-06", modelled: true, parameters, ...(t.note ? { note: t.note } : {}) };
  });
  const header = [
    "# Ready-made measures for \"The Budget for your household\" (docs/BUDGET_DAY.md). Generated by `pnpm household -- templates`",
    `# from PolicyEngine UK ${meta.version}'s metadata on ${today}; do not edit by hand, change packages/server/src/model/budget-templates.ts.`,
    "#",
    "# On the night: copy a block into content/budget/household/<event>.yaml under `measures:`, then",
    "#   - point `source` at the Budget document's page (or HMRC's note) and set `effective` to the day it starts;",
    "#   - change `post` for the years the Budget changes, in PolicyEngine's unit (a rate of 22% is 0.22);",
    "#   - check `pre`: the value in force on 6 April of each year in PolicyEngine's current law, or the law where",
    "#     PolicyEngine is behind it (then `pre_source` says so). Later years are PolicyEngine's forecasts: replace",
    "#     them with the statutory uprating once it is announced.",
    "#   - delete the parameters the Budget does not touch.",
    "# Not-modelled blocks are listed on the page with their reason.",
  ].join("\n");
  const doc = { model: { name: "policyengine-uk", version: meta.version, read_on: today }, years: TEMPLATE_YEARS, sources: [BUDGET_2025_SOURCE, FUEL_DUTY_SOURCE], templates: blocks };
  const out = join(root, MEASURES_DIR, "_templates.yaml");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${header}\n${stringify(doc, { lineWidth: 0 })}`);
  console.log(`written: ${out} (${blocks.length} templates)`);

  // The metadata fixture: every parameter name, and the values of every parameter the site sends.
  const fixture = JSON.parse(readFileSync(join(root, META_FIXTURE), "utf8")) as { values: Record<string, unknown> };
  const keep = new Set([
    ...Object.keys(fixture.values),
    ...MEASURE_TEMPLATES.flatMap((t) => (t.parameters ?? []).map((p) => p.path)),
    ...readMeasuresFiles(root).flatMap((f) => (parseMeasuresFile(f).data?.measures ?? []).flatMap((m) => (m.parameters ?? []).map((p) => p.path))),
  ]);
  const values = Object.fromEntries(
    [...keep]
      .filter((p) => meta.parameters[p])
      .sort()
      .map((p) => [p, { unit: meta.parameters[p]!.unit, values: meta.parameters[p]!.values }]),
  );
  writeFileSync(
    join(root, META_FIXTURE),
    `${JSON.stringify(
      {
        source: "GET https://api.policyengine.org/uk/metadata (trimmed: every parameter name, and the values of the parameters the site sends)",
        model_version: meta.version,
        retrieved_on: today,
        current_law_id: 1,
        values,
        parameters: Object.keys(meta.parameters).sort(),
      },
      null,
      1,
    )}\n`,
  );
  console.log(`written: ${META_FIXTURE} (${Object.keys(values).length} parameters with values)`);
}

/** A saved /uk/metadata answer, read the way the client reads the live one. */
function metadataFromFile(path: string): PolicyEngineMetadata {
  const res = (JSON.parse(readFileSync(path, "utf8")) as { result: { version: string; parameters: Record<string, { type?: string; unit?: string; values?: Record<string, unknown> }> } }).result;
  const parameters: PolicyEngineMetadata["parameters"] = {};
  for (const [p, v] of Object.entries(res.parameters)) if (v.type === "parameter") parameters[p] = { unit: v.unit ?? null, values: v.values ?? {} };
  return { version: res.version, parameters };
}

async function main() {
  const noModel = process.argv.includes("--no-model");
  const args = process.argv
    .slice(2)
    .filter((a, i, all) => a !== "--" && a !== "--households-only" && a !== "--no-model" && a !== "--file" && all[i - 1] !== "--file");
  const [cmd, id] = args;
  if (!cmd) fail("usage: pnpm household -- <event> | check <event> | record <event> | build <event> [--no-model] | templates [--from <metadata.json>]");
  if (cmd === "templates") return templates(args.includes("--from") ? args[args.indexOf("--from") + 1] : undefined);
  if (["check", "record", "build"].includes(cmd!) && !id) fail(`usage: pnpm household -- ${cmd} <event>`);
  if (noModel && cmd === "record") fail(`--no-model asks PolicyEngine nothing: use \`pnpm household -- build ${id} --no-model\``);
  if (cmd === "check") return void check(id!);
  if (cmd === "record") return record(id!);
  if (cmd === "build") return noModel ? buildNoModel(id!) : build(id!);
  check(cmd!);
  if (noModel) return buildNoModel(cmd!);
  await record(cmd!);
  build(cmd!);
}

main().catch((e) => fail(e instanceof Error ? (e.stack ?? e.message) : String(e)));
