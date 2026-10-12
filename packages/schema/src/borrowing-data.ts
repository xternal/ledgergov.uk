import borrowingRaw from "../../../data/build/borrowing.json";
import { BorrowingBundle } from "./borrowing";

/** data/build/borrowing.json, parsed. Throws on a bad file, so the build fails rather than drawing wrong numbers. */
export function loadBorrowing(raw: unknown = borrowingRaw): BorrowingBundle {
  const r = BorrowingBundle.safeParse(raw);
  if (!r.success) {
    throw new Error(`data/build/borrowing.json failed validation:\n${r.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  }
  return r.data;
}
