/**
 * Promise intake (M4), run daily by .github/workflows/harvest.yml.
 *
 *   pnpm harvest -- day [--date YYYY-MM-DD] [--dry-run]
 *       Fetch a day's Commons statements, PMQs, written ministerial statements,
 *       GOV.UK press releases, policy papers and consultation outcomes
 *       (default: yesterday, UK time); Claude proposes candidate promises; only
 *       quotes found verbatim in the source are kept, and process steps and
 *       grants are dropped; one draft per source and speaker in
 *       content/drafts/<date>/, the source texts in
 *       content/drafts/<date>/sources/, and the PR description in
 *       content/drafts/<date>/PR.md (git-ignored).
 *
 *   pnpm harvest -- upload --url <u> --title <t> --date <d> --venue <v>
 *                          [--file <path> | --youtube <url>]
 *                          [--speaker "Name"] [--role "…"] [--party "…"] [--dry-run]
 *       The same for one transcript (a text file, or a YouTube video's captions).
 *
 *   pnpm harvest -- stale [--today YYYY-MM-DD] [--days 7]
 *       Name every intake branch (origin/intake/<date>, from the last
 *       `git fetch`) more than seven days old that still holds drafts while
 *       origin/main has no desk run file for its day, so the weekly desk
 *       decides them (docs/desk/ROUTINE.md, step 1). Only prints; in GitHub
 *       Actions each line is a warning on the run.
 *
 *   --dry-run writes nothing and prints the report.
 *
 * Needs ANTHROPIC_API_KEY for extraction; without it, it fetches, says so and
 * exits 0. INTAKE_MODEL overrides the model. Nothing here publishes anything:
 * drafts go to editors in a pull request (docs/OPERATIONS.md §10).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { ActorFile, Venue, legacyActor } from "@ledger/schema";
import { readYamlDir } from "../packages/schema/src/content-files";
import {
  DRAFTS_DIR,
  extractFromSources,
  fetchDay,
  intakeDate,
  knownQuotes,
  prBody,
  quoteCount,
  sourceFromUpload,
  STALE_INTAKE_DAYS,
  staleIntakeBranches,
  staleLine,
  writeDrafts,
  type ExtractClient,
  type HarvestReport,
  type SourceDoc,
} from "../packages/server/src/harvest/index";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2).filter((a) => a !== "--");
const dryRun = args.includes("--dry-run");
const command = args[0];

function usage(message?: string): never {
  if (message) console.error(message);
  console.error(
    [
      "Usage:",
      "  pnpm harvest -- day [--date YYYY-MM-DD] [--dry-run]",
      "  pnpm harvest -- upload --url <u> --title <t> --date <YYYY-MM-DD> --venue <venue>",
      "                         [--file <path> | --youtube <url>] [--speaker \"Name\"] [--role \"…\"] [--party \"…\"] [--dry-run]",
      "  pnpm harvest -- stale [--today YYYY-MM-DD] [--days 7]",
      `  venues: ${Venue.options.join(", ")}`,
    ].join("\n"),
  );
  process.exit(2);
}

function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith("--")) usage(`${name} needs a value`);
  return v;
}

function isoDate(v: string, name: string): string {
  const d = new Date(`${v}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) usage(`${name} must be a date, YYYY-MM-DD`);
  return v;
}

/** Today's date in the UK (Europe/London), whatever the machine's time zone. */
const ukToday = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/** Yesterday's date in the UK (Europe/London), whatever the machine's time zone. */
function ukYesterday(now = new Date()): string {
  const today = ukToday(now);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** A Claude client from ANTHROPIC_API_KEY, or null. The SDK is a dependency of packages/server. */
function claudeClient(): ExtractClient | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const sdk = createRequire(join(root, "packages", "server", "package.json"))("@anthropic-ai/sdk") as {
    default?: new (o: { apiKey: string }) => unknown;
    Anthropic?: new (o: { apiKey: string }) => unknown;
  };
  const Anthropic = sdk.default ?? sdk.Anthropic;
  if (!Anthropic) throw new Error("@anthropic-ai/sdk: no client class found");
  return new Anthropic({ apiKey }) as ExtractClient;
}

function actors(): ActorFile[] {
  return readYamlDir(join(root, "content", "actors")).flatMap((f) => {
    const r = ActorFile.safeParse(legacyActor(f.data));
    return r.success ? [r.data] : [];
  });
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

async function run(date: string, fetched: { docs: SourceDoc[]; errors: HarvestReport["errors"] }): Promise<void> {
  const { docs } = fetched;
  const client = claudeClient();
  if (!client) {
    for (const e of fetched.errors) console.error(`error  ${e.sourceId}: ${e.message}`);
    console.log(`ANTHROPIC_API_KEY not set: fetched ${docs.length} sources, extraction skipped`);
    return;
  }
  const extracted = await extractFromSources(docs, {
    client,
    model: process.env.INTAKE_MODEL || undefined,
    actors: actors(),
    known: knownQuotes(root),
  });
  const report: HarvestReport = {
    date,
    sources: docs.map((d) => ({ id: d.id, kind: d.kind, title: d.title, url: d.url, candidates: extracted.candidates.filter((c) => c.sourceId === d.id).length })),
    candidates: extracted.candidates,
    dropped: extracted.dropped,
    errors: [...fetched.errors, ...extracted.errors],
  };
  const summary = () =>
    `Intake ${date}: ${plural(docs.length, "source")}, ${plural(quoteCount(report.candidates), "candidate promise")} in ${plural(report.candidates.length, "draft")}, ${report.dropped.length} dropped, ${plural(report.errors.length, "error")}`;

  if (dryRun) {
    console.log(JSON.stringify(report, null, 2));
    console.log(`${summary()} (dry run: nothing written)`);
    failIfNothingWorked(docs, report);
    return;
  }
  const paths = writeDrafts(report, docs, { root, date });
  const drafts = paths.filter((p) => p.endsWith(".yaml")).length;
  if (drafts) {
    const dir = join(root, DRAFTS_DIR, date);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "PR.md"), prBody(report));
  }
  console.log(`${summary()}; ${plural(drafts, "draft")} written${drafts ? ` to ${DRAFTS_DIR}/${date}/ (PR description in PR.md)` : ""}`);
  failIfNothingWorked(docs, report);
}

/** A day where every fetch or every source failed is a broken run, not a quiet day: exit non-zero so it shows. */
function failIfNothingWorked(docs: SourceDoc[], report: HarvestReport): void {
  const failed = (id: string) => report.errors.some((e) => e.sourceId === id);
  if ((docs.length === 0 && report.errors.length > 0) || (docs.length > 0 && docs.every((d) => failed(d.id)))) {
    for (const e of report.errors.slice(0, 20)) console.error(`error  ${e.sourceId}: ${e.message}`);
    console.error("Every source failed; nothing was read. See the errors above.");
    process.exitCode = 1;
  }
}

/** Intake branches from the last fetch (origin/intake/*): how many drafts each still holds, and whether main has the day's desk run file. */
function intakeBranches(): { name: string; drafts: number; logged: boolean }[] {
  const git = (...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8" });
  const refs = git("for-each-ref", "--format=%(refname:short)", "refs/remotes/origin/intake/").split("\n").filter(Boolean);
  const runs = new Set(git("ls-tree", "--name-only", "origin/main", "docs/desk/runs/").split("\n").map((f) => f.split("/").pop()));
  return refs.flatMap((ref) => {
    const date = intakeDate(ref);
    if (!date) return [];
    const files = git("ls-tree", "--name-only", ref, `${DRAFTS_DIR}/${date}/`).split("\n");
    return [{ name: ref, drafts: files.filter((f) => f.endsWith(".yaml")).length, logged: runs.has(`${date}.yaml`) }];
  });
}

function stale(): void {
  const today = isoDate(flag("--today") ?? ukToday(), "--today");
  const daysFlag = flag("--days");
  const days = daysFlag === undefined ? STALE_INTAKE_DAYS : Number(daysFlag);
  if (!Number.isInteger(days) || days < 0) usage("--days must be a whole number of days");
  const old = staleIntakeBranches(intakeBranches(), today, days);
  if (!old.length) {
    console.log(`No open intake branch is more than ${plural(days, "day")} old.`);
    return;
  }
  for (const s of old) {
    const line = staleLine(s);
    // In GitHub Actions, a warning on the workflow run, so it shows without opening the log. Never fails the run.
    console.log(process.env.GITHUB_ACTIONS === "true" ? `::warning title=Old intake branch::${line}` : line);
  }
}

async function main(): Promise<void> {
  if (command === "stale") {
    stale();
  } else if (command === "day") {
    const date = isoDate(flag("--date") ?? ukYesterday(), "--date");
    await run(date, await fetchDay(date));
  } else if (command === "upload") {
    const url = flag("--url") ?? usage("upload needs --url");
    const title = flag("--title") ?? usage("upload needs --title");
    const date = isoDate(flag("--date") ?? usage("upload needs --date"), "--date");
    const venue = Venue.safeParse(flag("--venue") ?? usage("upload needs --venue"));
    if (!venue.success) usage(`--venue must be one of ${Venue.options.join(", ")}`);
    const file = flag("--file");
    const youtube = flag("--youtube");
    if (!file === !youtube) usage("upload needs exactly one of --file or --youtube");
    const name = flag("--speaker");
    const doc = await sourceFromUpload({
      text: file ? readFileSync(file, "utf8") : undefined,
      youtubeUrl: youtube,
      url,
      title,
      date,
      venue: venue.data,
      speaker: name ? { name, role: flag("--role") ?? null, party: flag("--party") ?? null } : undefined,
    });
    await run(date, { docs: [doc], errors: [] });
  } else {
    usage(command ? `unknown command "${command}"` : undefined);
  }
}

main().catch((e: unknown) => {
  console.error(`harvest failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
