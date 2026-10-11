/**
 * Editors' approvals recorded in the card (docs/EDITORS.md, "Recording your
 * approval"). The same rules as the OpenPromises engine applies once the cards
 * are converted (its FORMAT.md §10), so approvals given now carry over:
 *
 * - an approval is a review with `kind: editor` and `approves: true`;
 * - it counts only if its author is on the editors list and was an editor on that day;
 * - an editor never approves a card about their own party (the card's actor, or the actor's party);
 * - a card needs two, from different editors.
 *
 * The editors list is private (it holds each editor's declared party): it
 * lives outside the repository and reaches CI as the OPENPROMISES_EDITORS
 * secret. Nothing here prints an editor's party.
 */
import { parse } from "yaml";
import { z } from "zod";
import type { ActorFile, PromiseFile, Review } from "./content";

export const APPROVALS_NEEDED = 2;

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date written YYYY-MM-DD");

export const Editor = z.object({
  handle: z.string().min(1).max(40),
  since: Day,
  until: Day.optional(),
  /** Declared party membership: a party's actor id, or null for none. */
  party: z.string().nullable(),
});
export type Editor = z.infer<typeof Editor>;

/** The editors list file: `editors:` with one entry per editor. Throws, without echoing the file, if it is not in that shape. */
export function parseEditors(text: string): Editor[] {
  const r = z.object({ editors: z.array(Editor).min(1) }).safeParse(parse(text));
  if (!r.success) {
    const where = r.error.issues.map((i) => i.path.join(".") || "(top level)").join(", ");
    throw new Error(`the editors list is not in the expected shape (editors: a list of handle, since, party), at: ${where}`);
  }
  return r.data.editors;
}

const isEditorOn = (e: Editor, day: string) => day >= e.since && (!e.until || day <= e.until);

/** The party a card is about: the actor itself if it is a party, otherwise the actor's party. */
const cardParty = (card: Pick<PromiseFile, "actor_id">, actors: ReadonlyMap<string, Pick<ActorFile, "kind" | "party_id">>) => {
  const actor = actors.get(card.actor_id);
  return actor?.kind === "party" ? card.actor_id : actor?.party_id;
};

const ownParty = (e: Editor, card: Pick<PromiseFile, "actor_id">, actors: ReadonlyMap<string, Pick<ActorFile, "kind" | "party_id">>) =>
  e.party !== null && (e.party === card.actor_id || e.party === cardParty(card, actors));

/** Handles of the editors whose approvals of this card count. */
export function approvers(
  card: Pick<PromiseFile, "actor_id"> & { reviews: readonly Review[] },
  editors: readonly Editor[],
  actors: ReadonlyMap<string, Pick<ActorFile, "kind" | "party_id">>,
): Set<string> {
  const out = new Set<string>();
  for (const r of card.reviews) {
    if (r.kind !== "editor" || r.approves !== true) continue;
    const e = editors.find((x) => x.handle === r.by);
    if (e && isEditorOn(e, r.on) && !ownParty(e, card, actors)) out.add(r.by);
  }
  return out;
}

/** Why this approval cannot be recorded, in plain words, or null if it can. */
export function approvalRefusal(
  card: Pick<PromiseFile, "id" | "actor_id"> & { reviews: readonly Review[] },
  by: string,
  on: string,
  today: string,
  editors: readonly Editor[],
  actors: ReadonlyMap<string, Pick<ActorFile, "kind" | "party_id">>,
): string | null {
  if (!Day.safeParse(on).success) return `the date is written YYYY-MM-DD, not "${on}"`;
  if (on > today) return `${on} is in the future; an approval is recorded on or after the day it was given`;
  const e = editors.find((x) => x.handle === by);
  if (!e) return `"${by}" is not on the editors list`;
  if (!isEditorOn(e, on)) return `${by} is not an editor on ${on}`;
  if (ownParty(e, card, actors)) return `${by} may not approve a card about their own party; another editor does`;
  if (approvers(card, editors, actors).has(by)) return `${by} has already approved ${card.id}; the second approval comes from a different editor`;
  return null;
}

/** A YAML scalar written the way the cards are: plain when that is safe, otherwise double-quoted. */
const scalar = (s: string) => (/^[A-Za-z][\w .,'()–-]*$/.test(s) && !/\s$/.test(s) ? s : JSON.stringify(s));

/**
 * The card's YAML with one review appended to `reviews:` and, when asked, the
 * `editor_check_required` line removed. Edits the text, not a re-serialised
 * document, so every other line of the file stays exactly as it was.
 */
export function appendReviewText(text: string, review: Review, dropEditorCheck = false): string {
  const entry = [
    `  - by: ${scalar(review.by)}`,
    `    kind: ${review.kind}`,
    `    on: "${review.on}"`,
    ...(review.note ? [`    note: ${scalar(review.note)}`] : []),
    ...(review.approves ? ["    approves: true"] : []),
  ];
  const lines = text.replace(/\n$/, "").split("\n");
  const start = lines.findIndex((l) => /^reviews:\s*(\[\])?\s*$/.test(l));
  if (start < 0) {
    lines.push("reviews:", ...entry);
  } else if (/\[\]/.test(lines[start] ?? "")) {
    lines.splice(start, 1, "reviews:", ...entry);
  } else {
    // The list ends at the next line that starts in the first column (a key or a comment), or at the end of the file.
    let end = lines.findIndex((l, i) => i > start && /^\S/.test(l));
    if (end < 0) end = lines.length;
    while (end > start + 1 && (lines[end - 1] ?? "").trim() === "") end--;
    lines.splice(end, 0, ...entry);
  }
  const out = dropEditorCheck ? lines.filter((l) => !/^editor_check_required:\s*(true|false)\s*$/.test(l)) : lines;
  return `${out.join("\n")}\n`;
}
