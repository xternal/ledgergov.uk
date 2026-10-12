import raw from "../../../data/build/fiscal_targets.json";
import { FiscalTargetsBundle } from "./fiscal-targets";

/** data/build/fiscal_targets.json, parsed. Throws on a bad file, so the build fails rather than drawing wrong numbers. */
export function loadFiscalTargets(data: unknown = raw): FiscalTargetsBundle {
  const r = FiscalTargetsBundle.safeParse(data);
  if (!r.success) {
    throw new Error(`data/build/fiscal_targets.json failed validation:\n${r.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  }
  return r.data;
}
