/**
 * pnpm validate: schemas (cards, data, forecasts, Budget scorecards, fiscal targets, leaks), cross-file references, the balance check, a lint
 * that keeps data out of components, and the exact-match check on intake
 * drafts. Exits non-zero on any error; warnings (cards not yet publishable)
 * are printed but do not fail. A draft still in content/drafts/ is an error,
 * so an intake PR cannot be merged until editors have turned every draft into
 * a card or deleted it; the intake job itself passes --allow-drafts.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { parseSeed } from "@ledger/schema/seed";
import { loadPeople } from "@ledger/schema/people";
import { loadBorrowing } from "@ledger/schema/borrowing";
import { parseForecasts, readBacktestTable, readForecastFiles } from "@ledger/schema/forecasts";
import { parseScorecards, readScorecardFiles } from "@ledger/schema/budget";
import { predictIssues } from "@ledger/schema/predict";
import { parseHouseholdSnapshots, parseMeasuresFile, readHouseholdSnapshotFiles, readMeasuresFiles, taxSeedIssues } from "@ledger/schema/household";
import { loadFiscalTargets } from "@ledger/schema/fiscal-targets";
import { parseLeaks } from "@ledger/schema/leaks";
import { BALANCE_TOLERANCE_BN, appendOnlyIssues, comparableCard, contractAppendOnlyIssues, forecastAppendOnlyIssues } from "@ledger/schema";
import { baseSettings, compute, createModel } from "@ledger/engine";
import { checkDrafts } from "../packages/server/src/harvest/drafts";

const root = join(import.meta.dirname, "..");
const errors: string[] = [];
const warnings: string[] = [];

// 1. Schemas and cross-file checks
const { seed, issues } = parseSeed();
for (const i of issues) (i.level === "error" ? errors : warnings).push(`${i.where}: ${i.message}`);
// /people (M6): population and long-term spending projections.
try {
  loadPeople();
} catch (e) {
  errors.push((e as Error).message);
}
// /borrowing: borrowing so far this year against the OBR's monthly path.
try {
  loadBorrowing();
} catch (e) {
  errors.push((e as Error).message);
}

// Forecasts and the backtest table (M7): every record parses and every score names a recorded forecast.
errors.push(...parseForecasts(readForecastFiles(root), readBacktestTable(root)).issues);
// Budget scorecards (P7): every table parses, has one total, and its lines add up to it within rounding.
const scorecards = parseScorecards(readScorecardFiles(root));
errors.push(...scorecards.issues);
if (scorecards.data.length) console.log(`budget scorecards: ${scorecards.data.map((s) => `${s.id} (${s.measures.length} lines)`).join(", ")}`);
// The Budget for your household: every measures file parses, and every snapshot parses, passed its checks, and was
// computed from its measures file as it is now (an edit to the measures without a new run is an error).
const householdMeasures = readMeasuresFiles(root);
errors.push(...householdMeasures.flatMap((m) => parseMeasuresFile(m).issues));
const households = parseHouseholdSnapshots(readHouseholdSnapshotFiles(root), householdMeasures);
errors.push(...households.issues);
// A post-Budget tax seed (the Your share calculator's) says what the Budget's measures file says: one place for the rates.
errors.push(...taxSeedIssues(root));
if (households.data.length)
  console.log(
    `household snapshots: ${households.data
      .map((h) => `${h.id} (${h.kind}, ${h.provider ? `PolicyEngine UK ${h.provider.model_version}, ${h.results.length} years` : "no model answers yet: measures, Treasury's chart and salary check only"})`)
      .join(", ")}`,
  );

// Predict the Budget (Day 9): every question set in content/predict parses, with unique ids and its answers among its options.
errors.push(...predictIssues(root));

// /budget/how-it-works: the OBR's headroom against the fiscal rules (data/build/fiscal_targets.json).
try {
  loadFiscalTargets();
} catch (e) {
  errors.push((e as Error).message);
}

// /budget/leaks: every pre-Budget leak entry (content/leaks/*.yaml); a report without an archived copy is a warning.
const leaks = parseLeaks(root);
for (const i of leaks.issues) (i.level === "error" ? errors : warnings).push(`${i.where}: ${i.message}`);
if (leaks.leaks.length) console.log(`leaks: ${leaks.leaks.length} entr${leaks.leaks.length === 1 ? "y" : "ies"} checked`);

// 2. Balance: receipts + borrowing == spending, at base and for every preset and card scenario
if (seed) {
  const model = createModel(seed.statement, seed.levers);
  const base = baseSettings(model);
  const scenarios = [
    { name: "base", settings: base },
    ...seed.presets.map((p) => ({ name: `preset ${p.id}`, settings: { ...base, ...p.settings } })),
  ];
  for (const s of scenarios) {
    const r = compute(model, s.settings);
    const rec = Object.values(r.receipts).reduce((a, b) => a + b, 0);
    const sp = Object.values(r.spending).reduce((a, b) => a + b, 0);
    const gap = rec + r.totals.borrowing_bn - sp;
    if (Math.abs(gap) > BALANCE_TOLERANCE_BN) errors.push(`balance (${s.name}): off by ${gap.toFixed(3)}bn`);
  }
}

// 3. No data in components (invariant 1): money, units and years must come from the seed
const DATA_LITERAL = [
  // "per £1" is a unit, not a figure
  { re: /£\s?(?!1(?![\d,.]))\d/, why: "a £ amount" },
  { re: /\b\d[\d,.]*\s?(bn|tn)\b/, why: "a £bn/£tn figure" },
  { re: /\b\d+(\.\d+)?pp\b/, why: "a percentage-point figure" },
  { re: /\b20[1-3]\d\b/, why: "a year" },
];
function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(tsx|ts)$/.test(name)) yield p;
  }
}
for (const file of files(join(root, "apps/web/components"))) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
    if (/^\s*\*/.test(line)) return; // JSDoc
    for (const { re, why } of DATA_LITERAL) {
      if (re.test(code)) errors.push(`${relative(root, file)}:${i + 1}: ${why} in a component; move it to data/seed`);
    }
  });
}

// 3b. Every shared page has its own share image. A page that sets its own Open Graph fields loses the
// image it would inherit (Next.js replaces the whole openGraph object), so it needs an opengraph-image beside it.
for (const file of files(join(root, "apps/web/app"))) {
  if (!file.endsWith("page.tsx") || !/\bopenGraph\s*:/.test(readFileSync(file, "utf8"))) continue;
  const dir = dirname(file);
  if (!readdirSync(dir).some((n) => /^opengraph-image\.(tsx|ts|png|jpg)$/.test(n)))
    errors.push(`${relative(root, file)}: sets openGraph but has no opengraph-image beside it, so shares show no picture`);
}

// 4. Promise history is append-only (invariant 5): compare every card with the base branch.
const baseArg = process.argv.indexOf("--base");
const baseRef = baseArg >= 0 ? process.argv[baseArg + 1] : null;
if (baseRef) {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  let baseFiles: string[] = [];
  try {
    baseFiles = git("ls-tree", "--name-only", `${baseRef}:content/promises`).split("\n").filter((f) => f.endsWith(".yaml"));
  } catch {
    warnings.push(`append-only: ${baseRef} has no content/promises yet; nothing to compare`);
  }
  for (const name of baseFiles) {
    const path = join(root, "content", "promises", name);
    let now: unknown;
    try {
      // Both sides in the one form both formats share (v1.ts), so converting a card to format v1 rewrites no history.
      now = comparableCard(parseYaml(readFileSync(path, "utf8")));
    } catch {
      errors.push(`content/promises/${name}: removed or unreadable; published cards cannot be deleted`);
      continue;
    }
    const was = comparableCard(parseYaml(git("show", `${baseRef}:content/promises/${name}`)));
    for (const issue of appendOnlyIssues(was, now)) errors.push(`content/promises/${name}: ${issue}`);
  }
  console.log(`append-only check against ${baseRef}: ${baseFiles.length} published card(s)`);

  // Contract snapshots (M6b) only grow too, and a published contract file is never deleted.
  let baseContracts: string[] = [];
  try {
    baseContracts = git("ls-tree", "--name-only", `${baseRef}:data/build/contracts`).split("\n").filter((f) => f.endsWith(".json"));
  } catch {
    // No contracts on the base branch yet.
  }
  for (const name of baseContracts) {
    const path = join(root, "data", "build", "contracts", name);
    let now: unknown;
    try {
      now = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      errors.push(`data/build/contracts/${name}: removed or unreadable; a published contract's history is kept`);
      continue;
    }
    const was = JSON.parse(git("show", `${baseRef}:data/build/contracts/${name}`));
    for (const issue of contractAppendOnlyIssues(was, now)) errors.push(`data/build/contracts/${name}: ${issue}`);
  }
  if (baseContracts.length) console.log(`append-only check against ${baseRef}: ${baseContracts.length} published contract(s)`);

  // Forecast records (M7) are append-only too: a published record is never changed or removed, nor is its file.
  let baseForecasts: string[] = [];
  try {
    baseForecasts = git("ls-tree", "-r", "--name-only", baseRef, "--", "data/build/forecasts").split("\n").filter((f) => f.endsWith(".json"));
  } catch {
    // No forecasts on the base branch yet.
  }
  for (const rel of baseForecasts) {
    let now: unknown;
    try {
      now = JSON.parse(readFileSync(join(root, rel), "utf8"));
    } catch {
      errors.push(`${rel}: removed or unreadable; recorded forecasts are kept`);
      continue;
    }
    const was = JSON.parse(git("show", `${baseRef}:${rel}`));
    for (const issue of forecastAppendOnlyIssues(was, now)) errors.push(`${rel}: ${issue}`);
  }
  if (baseForecasts.length) console.log(`append-only check against ${baseRef}: ${baseForecasts.length} published forecast file(s)`);
}

// 5. Intake drafts (M4): every quote must be exactly its span of the stored source text.
// Zero invented quotes is checked here, offline, for every draft in content/drafts/.
const drafts = checkDrafts(root);
errors.push(...drafts.errors);
// Unresolved drafts block a merge; the morning intake job, which opens the PR, allows them.
(process.argv.includes("--allow-drafts") ? warnings : errors).push(...drafts.warnings);
if (drafts.drafts) console.log(`intake drafts: ${drafts.drafts} checked against their stored sources`);

for (const w of warnings) console.log(`warn   ${w}`);
for (const e of errors) console.log(`error  ${e}`);
console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
