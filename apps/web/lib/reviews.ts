import { APPROVALS_NEEDED, approvedByText, editorShownAs, type CardView, type PromiseFile, type Review } from "@ledger/schema";
import { longDate } from "./format";

/** The card's latest review, if any. */
export const latestReview = (f: PromiseFile): Review | null => f.reviews.at(-1) ?? null;

/** Our automated reviewer. It was called "Junior Editor" until 8 Oct 2026. */
export const AI_JOURNALIST = "AI Journalist";

/**
 * Reviews are append-only, so stored ones keep the name they were given;
 * readers see the reviewer's current name.
 */
const RENAMED: Record<string, string> = { "Junior Editor": AI_JOURNALIST };
export const reviewerName = (by: string) => RENAMED[by] ?? by;

/** "AI Journalist (automated)", "Pavel Guzhikov (editor)", "an independent editor", for the card. Editors not on NAMED_EDITORS are not named. */
export const reviewerLabel = (r: Review) =>
  r.kind === "editor" ? (editorShownAs(r.by) === r.by ? `${r.by} (editor)` : editorShownAs(r.by)) : `${reviewerName(r.by)} (${r.kind === "automated" ? "automated" : "legal review"})`;

/**
 * Without the editors list, the card's "Checked by …" line: the editors who approved it ("Pavel Guzhikov and
 * 1 independent editor"), or else its latest review, and what is still to come.
 */
export function checkedBy(f: PromiseFile): { who: string; on: string; automated: boolean; toCome: string } | null {
  const approved = approvedByText(f.reviews);
  // What is still to come follows the approvals themselves (APPROVALS_NEEDED: one since 17 October 2026), not a flag someone must remember to clear.
  if (approved) return { who: approved.text, on: approved.on, automated: false, toCome: approved.count < APPROVALS_NEEDED ? "; another editor's check to come" : "" };
  const r = latestReview(f);
  return r ? { who: reviewerLabel(r), on: r.on, automated: r.kind === "automated", toCome: f.editor_check_required ? "; human editor review to come" : "" } : null;
}

/**
 * The card's review line and the list's tick. With the editors list the build gives each card the engine's
 * verification (OpenPromises decision 23): "Verified by Pavel Guzhikov and 1 independent editor on 12 October 2026",
 * "Checked automatically by AI Journalist, not yet verified by an editor", "Not yet verified by an editor". Without
 * it, the wording before the label, so a build without the list still says who checked each card.
 * `short` leaves out the day and what is to come, for the list's tick; `verified`: an editor has approved it, which
 * earns the tick.
 */
export function reviewLine(c: CardView): { text: string; short: string; automated: boolean; verified: boolean } | null {
  const v = c.verification;
  if (v) {
    const editors = v.level === "editor" || v.level === "editors";
    const on = editors && v.on ? ` on ${longDate(v.on)}` : "";
    return { text: `${v.text}${on}${v.secondToCome ? "; another editor's check to come" : ""}`, short: v.text, automated: v.level === "automated", verified: editors };
  }
  const checked = checkedBy(c.file);
  return checked
    ? { text: `Checked by ${checked.who} on ${longDate(checked.on)}${checked.toCome}`, short: `Checked by ${checked.who}`, automated: checked.automated, verified: true }
    : null;
}

/** What AI Journalist is, in one line, wherever its name appears. */
export const AI_JOURNALIST_NOTE =
  "AI Journalist is our automated reviewer: it re-reads every card against its live sources (the quote word for word, dates, evidence, status, cost, neutral wording, legal risk). An editor, Pavel Guzhikov, then checks each card against its sources and approves it.";
