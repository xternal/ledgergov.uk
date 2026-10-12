import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./content-files";
import { BudgetScorecard, byDateDesc } from "./budget";

/** data/build/budget/<event>.json, read from disk (Node only: server components at build time, scripts, tests). */

export const BUDGET_DIR = join("data", "build", "budget");

export interface RawScorecardFile {
  /** Repo-relative, e.g. "data/build/budget/autumn-budget-2025.json". */
  path: string;
  data: unknown;
}

export function readScorecardFiles(root = repoRoot()): RawScorecardFile[] {
  const dir = join(root, BUDGET_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ path: join(BUDGET_DIR, f), data: JSON.parse(readFileSync(join(dir, f), "utf8")) }));
}

/** Parse every scorecard; newest event first. */
export function parseScorecards(raw: RawScorecardFile[]): { data: BudgetScorecard[]; issues: string[] } {
  const issues: string[] = [];
  const data: BudgetScorecard[] = [];
  for (const f of raw) {
    const r = BudgetScorecard.safeParse(f.data);
    if (!r.success) {
      issues.push(...r.error.issues.map((i) => `${f.path}:${i.path.join(".")}: ${i.message}`));
      continue;
    }
    const name = f.path.split(/[\\/]/).at(-1);
    if (name !== `${r.data.id}.json`) issues.push(`${f.path}: file name should be ${r.data.id}.json`);
    data.push(r.data);
  }
  return { data: data.sort(byDateDesc), issues };
}

/** The scorecards, newest first. Throws on a bad file, so the build fails rather than publishing a table that does not add up. */
export function loadScorecards(root = repoRoot()): BudgetScorecard[] {
  const { data, issues } = parseScorecards(readScorecardFiles(root));
  if (issues.length) throw new Error(`Budget scorecard data failed validation:\n${issues.map((i) => `  ${i}`).join("\n")}`);
  return data;
}
