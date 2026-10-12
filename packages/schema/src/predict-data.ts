import { join } from "node:path";
import { readYamlDir, repoRoot } from "./content-files";
import { PredictRound } from "./predict";

/**
 * content/predict/*.yaml, parsed. Node only (server components, route
 * handlers, scripts). Throws on a bad file, so the build fails rather than
 * asking readers a broken question.
 */
export function loadPredictRounds(root = repoRoot()): PredictRound[] {
  const rounds = readYamlDir(join(root, "content", "predict")).map(({ path, data }) => {
    const r = PredictRound.safeParse(data);
    if (!r.success) throw new Error(`${path} failed validation:\n${r.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`);
    const file = path.split(/[\\/]/).pop()!.replace(/\.ya?ml$/, "");
    if (file !== r.data.id) throw new Error(`${path}: the file name must be the set's id (${r.data.id}.yaml)`);
    return r.data;
  });
  // The newest Budget first: /budget/predict asks the first one.
  return rounds.sort((a, b) => b.closes_at.localeCompare(a.closes_at));
}

/** Problems with content/predict/*.yaml, for pnpm validate. */
export function predictIssues(root = repoRoot()): string[] {
  try {
    loadPredictRounds(root);
    return [];
  } catch (e) {
    return [(e as Error).message];
  }
}
