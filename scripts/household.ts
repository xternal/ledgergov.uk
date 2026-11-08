/**
 * pnpm household: "The Budget for your household" (docs/BUDGET_DAY.md). Run by an editor on Budget night, never
 * by readers. It reads content/budget/household/<event>.yaml, runs the six example households under the two complete
 * policies (without and with the event) on PolicyEngine's Python package, and writes
 * data/build/budget/household/<event>.json for the page. Until 6 November 2026 it used PolicyEngine's public API,
 * which PolicyEngine asked us to stop using; population results are now PolicyEngine's own (docs/MODEL.md).
 *
 *   pnpm household -- <event>            check, record and build: the whole run (about a minute)
 *   pnpm household -- check <event>      offline: the file, its paths against PolicyEngine's metadata (the
 *                                        committed copy), the two policies, and every "without" value that
 *                                        differs from PolicyEngine's current law
 *   pnpm household -- record <event>     the six example households on PolicyEngine's Python package, run here
 *                                        (scripts/pe/households.py, pinned in scripts/pe/requirements.txt; the
 *                                        file must hold deciles), kept in packages/server/test/fixtures/t1/household/<event>.json
 *   pnpm household -- build <event>      offline: check the recording and write the snapshot; refuses if any check fails
 *   pnpm household -- build <event> --no-model
 *                                        offline, no recording: when PolicyEngine cannot be reached at all, a snapshot
 *                                        with no model answers (the measures, the Treasury's chart, the salary check);
 *                                        the normal run replaces it once PolicyEngine answers
 *   pnpm household -- dashboard <event> <url>
 *                                        live: PolicyEngine's own population results from the CSVs behind its Budget
 *                                        dashboard (<url>, e.g. https://www.policyengine.org/uk/autumn-budget-2026), the
 *                                        approved run of all its measures, into data/build/budget/policyengine/<event>.json
 *   pnpm household -- templates          live (one /uk/metadata call): rewrite content/budget/household/_templates.yaml
 *                                        and the metadata fixture from PolicyEngine's current law
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify } from "yaml";
import { HOUSEHOLD_DIR, MEASURES_DIR, PE_DASHBOARD_DIR, parseMeasuresFile, readMeasuresFiles, textSha256 } from "@ledger/schema/household";
import { PolicyEngineDashboard, type HouseholdCheck, type HouseholdMeasuresFile, type HouseholdSnapshot } from "@ledger/schema";
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
  PE_PYTHON_PIN,
  recordLocalHouseholds,
  unchangedMeasures,
  type HouseholdRecording,
  type LocalHouseholdAnswer,
  type LocalHouseholdRequest,
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

/**
 * The Python the household script runs on: PE_PYTHON, else .venv-pe/bin/python at the repository root. Set it up once:
 *   python3.12 -m venv .venv-pe && .venv-pe/bin/pip install -r scripts/pe/requirements.txt
 */
function pePython(): string {
  const py = process.env.PE_PYTHON ?? join(root, ".venv-pe", "bin", "python");
  if (!existsSync(py))
    fail(`no Python for PolicyEngine at ${py}: run \`python3.12 -m venv .venv-pe && .venv-pe/bin/pip install -r scripts/pe/requirements.txt\` (or set PE_PYTHON)`);
  return py;
}

/** Runs scripts/pe/households.py: the request on stdin, the answer on stdout. */
function runLocalHouseholds(req: LocalHouseholdRequest): Promise<LocalHouseholdAnswer> {
  const py = pePython();
  return new Promise((resolve, reject) => {
    const child = spawn(py, ["-I", join(root, "scripts", "pe", "households.py")], { stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`scripts/pe/households.py exited with ${code}`));
      try {
        resolve(JSON.parse(out) as LocalHouseholdAnswer);
      } catch (e) {
        reject(e);
      }
    });
    child.stdin.end(JSON.stringify(req));
  });
}

async function record(id: string) {
  // PolicyEngine asked us (6 November 2026) to stop using api.policyengine.org's economy endpoints and /uk/calculate.
  // The example households now run on its Python package here; population results are its own (docs/MODEL.md).
  const { file } = loadEvent(id);
  if (process.argv.includes("--households-only")) console.log("--households-only is the only mode now: the flag changes nothing");
  console.log(`Running the example households for ${file.event.name}, ${file.years.join(", ")}, on policyengine ${PE_PYTHON_PIN} here…`);
  const rec = await recordLocalHouseholds(file, runLocalHouseholds);
  console.log(`policyengine ${rec.versions.bundle_before}, policyengine-uk ${rec.versions.household_model_version}`);
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

/** One CSV with a header row, quoted fields allowed (PolicyEngine's reform names hold commas). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(field), (field = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += ch;
  }
  if (field || row.length) row.push(field), rows.push(row);
  const [head, ...body] = rows.filter((r) => r.some((c) => c !== ""));
  return body.map((r) => Object.fromEntries(head!.map((h, i) => [h, r[i] ?? ""])));
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": BUDGET_JOB_USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) fail(`${url}: HTTP ${res.status}`);
  return res.text();
}

interface DashboardEntry {
  name: string;
  status: string;
  artifact: string;
  artifact_sha256: string;
  measures: string[];
  years: number[];
  approval: { at: string };
}

/**
 * PolicyEngine's own population results, from the CSVs behind its Budget dashboard: the approved run of all its
 * measures together, every year our measures file covers. PolicyEngine asked us to credit and link the dashboard.
 */
async function dashboard(id: string, pageUrl: string | undefined) {
  if (!pageUrl || !/^https:\/\/(www\.)?policyengine\.org\//.test(pageUrl)) fail("usage: pnpm household -- dashboard <event> https://www.policyengine.org/uk/<dashboard>");
  const { file } = loadEvent(id);
  const page = pageUrl!.replace(/\/$/, "");
  const base = `${page}/data`;
  const manifest = JSON.parse(await fetchText(`${base}/manifest.json`)) as {
    release: string;
    revision: number;
    updated_at: string;
    measures: Record<string, { name: string; status: string }>;
    combined: Record<string, DashboardEntry>;
    execution: { identity: { wrapper: { version: string }; model: { version: string }; data: { dataset: string } } };
  };
  const all = Object.keys(manifest.measures).sort().join();
  const runs = Object.entries(manifest.combined).filter(([, e]) => e.status === "approved" && [...e.measures].sort().join() === all);
  if (runs.length !== 1) fail(`expected one approved run of all ${Object.keys(manifest.measures).length} measures, found ${runs.length}`);
  const [runId, run] = runs[0]!;
  const title = (/<title>([^<]+)<\/title>/.exec(await fetchText(page))?.[1] ?? "").replace(/\s*[|·–-]\s*PolicyEngine\s*$/, "").trim();

  const files: { name: string; url: string; sha256: string }[] = [];
  const csv = async (name: string) => {
    const url = `${base}/${run.artifact}/${name}`;
    const text = await fetchText(url);
    files.push({ name, url, sha256: textSha256(text) });
    return parseCsv(text);
  };
  const budget = await csv("budgetary_impact.csv");
  const relative = await csv("distributional_impact.csv");
  const cash = await csv("winners_losers.csv");

  // A blank cell is a figure PolicyEngine withholds to protect survey respondents' confidentiality (its methodology,
  // "Income deciles"): kept as null and named in `gaps`. A year with no public-finance figure is left out. Anything else unreadable fails.
  const gaps: string[] = [];
  const num = (v: string | undefined, what: string): number | null => {
    if (v === "") return (gaps.push(what), null);
    const n = Number(v);
    if (v === undefined || !Number.isFinite(n)) fail(`${what}: not a number (${v})`);
    return n;
  };
  const ordinal = (d: number) => `${d}${d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th"}`;
  const allYears = file.years.map((fy) => {
    const y = fy.slice(0, 4);
    if (!run.years.includes(Number(y))) fail(`PolicyEngine's run has no ${fy}`);
    const deciles = Array.from({ length: 10 }, (_, i) => {
      const d = i + 1;
      return {
        decile: d,
        rel_change_pct: num(relative.find((r) => r.year === y && r.decile === ordinal(d))?.value, `${fy} decile ${d} %`),
        avg_change_gbp: num(cash.find((r) => r.year === y && r.decile === String(d))?.avg_change, `${fy} decile ${d} £`),
      };
    });
    return {
      year: fy,
      net_bn: num(budget.find((r) => r.year === y)?.value, `${fy} budget`),
      all_avg_change_gbp: num(cash.find((r) => r.year === y && r.decile === "all")?.avg_change, `${fy} all £`),
      deciles,
    };
  });
  const years = allYears.flatMap((y) => (y.net_bn === null ? [] : [{ ...y, net_bn: y.net_bn }]));
  for (const g of gaps) console.log(`withheld in PolicyEngine's CSV: ${g} is blank${g.endsWith("budget") ? "; that year is left out" : ""}`);

  const out = PolicyEngineDashboard.parse({
    event: id,
    title: title || "PolicyEngine's Budget dashboard",
    url: page,
    release: manifest.release,
    revision: manifest.revision,
    updated_at: manifest.updated_at,
    retrieved_at: new Date().toISOString(),
    run: { id: runId, name: run.name, artifact: run.artifact, artifact_sha256: run.artifact_sha256, approved_at: run.approval.at },
    model: {
      policyengine: manifest.execution.identity.wrapper.version,
      policyengine_uk: manifest.execution.identity.model.version,
      dataset: manifest.execution.identity.data.dataset,
    },
    measures: Object.entries(manifest.measures).map(([mid, m]) => ({ id: mid, name: m.name })),
    files,
    years,
    gaps,
  });
  const path = join(root, PE_DASHBOARD_DIR, `${id}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`${out.title}, revision ${out.revision} (${out.updated_at}): ${out.measures.length} measures, policyengine-uk ${out.model.policyengine_uk}`);
  const p = (v: number | null) => (v === null ? "withheld" : `${v.toFixed(2)}%`);
  for (const y of out.years) console.log(`  ${y.year}: £${y.net_bn.toFixed(2)}bn; tenth 1 ${p(y.deciles[0]!.rel_change_pct)}, tenth 10 ${p(y.deciles[9]!.rel_change_pct)}`);
  console.log(`written: ${path}`);
}

async function main() {
  const noModel = process.argv.includes("--no-model");
  const args = process.argv
    .slice(2)
    .filter((a, i, all) => a !== "--" && a !== "--households-only" && a !== "--no-model" && a !== "--file" && all[i - 1] !== "--file");
  const [cmd, id] = args;
  if (!cmd) fail("usage: pnpm household -- <event> | check <event> | record <event> | build <event> [--no-model] | dashboard <event> <url> | templates [--from <metadata.json>]");
  if (cmd === "dashboard") return dashboard(id!, args[2]);
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
