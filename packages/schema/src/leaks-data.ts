import { basename, join, relative } from "node:path";
import { readYamlDir, repoRoot } from "./content-files";
import { LeakFile, byFirstReport, leakWarnings } from "./leaks";

/**
 * content/leaks/*.yaml, read from disk (Node only: server components at build time, scripts, tests).
 * An empty or missing folder is an empty tracker, not an error.
 */

export const LEAKS_DIR = join("content", "leaks");

export interface LeakIssue {
  level: "error" | "warning";
  where: string;
  message: string;
}

/** Parse every leak file; returns the valid ones (newest first) and every problem found. */
export function parseLeaks(root = repoRoot()): { leaks: LeakFile[]; issues: LeakIssue[] } {
  const issues: LeakIssue[] = [];
  const leaks: LeakFile[] = [];
  for (const f of readYamlDir(join(root, LEAKS_DIR))) {
    const where = relative(root, f.path);
    const r = LeakFile.safeParse(f.data);
    if (!r.success) {
      for (const i of r.error.issues) issues.push({ level: "error", where: `${where}:${i.path.join(".")}`, message: i.message });
      continue;
    }
    if (`${r.data.id}.yaml` !== basename(f.path)) issues.push({ level: "error", where, message: `id ${r.data.id} should match the file name` });
    for (const w of leakWarnings(r.data)) issues.push({ level: "warning", where, message: w });
    leaks.push(r.data);
  }
  return { leaks: leaks.sort(byFirstReport), issues };
}

/** The valid leak entries, newest first. Throws if any file is invalid, so a bad file fails the build. */
export function loadLeaks(root = repoRoot()): LeakFile[] {
  const { leaks, issues } = parseLeaks(root);
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length) throw new Error(`content/leaks failed validation:\n${errors.map((i) => `  ${i.where}: ${i.message}`).join("\n")}`);
  return leaks;
}
