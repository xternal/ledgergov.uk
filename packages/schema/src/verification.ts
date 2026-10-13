/**
 * How far each card has been verified (OpenPromises 0.6.0, decision 23): the
 * engine's `verification` counts the editors' approvals as its approvals rule
 * does, and `verificationText` puts the level in words ("Verified by Pavel
 * Guzhikov and 1 independent editor", "Checked automatically by AI Journalist,
 * not yet verified by an editor", "Not yet verified by an editor").
 *
 * It needs the private editors list, which says which editors chose to be
 * named (`named: true`) and who was an editor when. The list reaches the build
 * through OPENPROMISES_EDITORS_YAML or OPENPROMISES_EDITORS (readEditors), and
 * the web app's getSeed adds the labels (withVerification). Without it there is
 * no label, and the site keeps its earlier wording (approvedByText in
 * approvals.ts) so a deploy before the list is set still says who checked each card.
 *
 * Its own entry (@ledger/schema/verification), kept out of seed.ts and the
 * package index: the engine's packages are ES modules only, and the repository's
 * scripts (pnpm validate, alerts, review), which tsx runs as CommonJS, load seed.ts.
 *
 * Nothing here returns or prints an editor's party: a verification holds only
 * the named editors' handles, a count of the others and the automated reviewers.
 */
import { existsSync, readFileSync } from "node:fs";
import { approvers, EditorsFile, needsApprovals, verification, type Actor, type Card, type Editor as EngineEditor, type VerificationLevel } from "@openpromises/core";
import { verificationText, words } from "@openpromises/publish";
import { parse } from "yaml";
import type { ActorFile, PromiseFile } from "./content";
import type { Seed } from "./seed";

/**
 * The parts of openpromises.config.ts the label reads: publish by checks
 * (decision 22) and the automated reviewer's current name. Its words are the
 * engine's defaults, which are LedgerGov.UK's own (`verify.*`, no override in
 * the config's messages). verification.test.ts checks this against the config.
 */
export const SITE_EDITORIAL = {
  approvals: 2,
  publish: "checked",
  renamed: { "Junior Editor": "AI Journalist" } as Record<string, string>,
} as const;

let english: ReturnType<typeof words> | undefined;

export interface CardVerification {
  level: VerificationLevel;
  /** The label as readers see it: "Verified by Pavel Guzhikov and 1 independent editor". */
  text: string;
  /** Editors who approved and chose to be named, in the order they approved. */
  named: string[];
  /** Editors who approved and chose to be counted, not named. */
  counted: number;
  /** The automated reviewers, by their current names ("AI Journalist"). */
  automated: string[];
  /** The day of the latest approval that counts; null when no editor has approved the card. */
  on: string | null;
  /** True when the card has one editor's approval and needs a second before publication (a reader's submission). */
  secondToCome: boolean;
}

/** The engine reads only these fields of a card and its actors, which keep their names in our shape. */
const asCard = (f: PromiseFile) => ({ id: f.id, actor_id: f.actor_id, origin: f.origin, reviews: f.reviews }) as unknown as Card;

/** One card's verification, from the editors list. */
export function cardVerification(f: PromiseFile, actors: ReadonlyMap<string, ActorFile>, editors: readonly EngineEditor[]): CardVerification {
  const card = asCard(f);
  const ctx = { actors: actors as unknown as ReadonlyMap<string, Actor>, editors };
  const v = verification(card, ctx)!;
  const valid = approvers(card, ctx);
  const on = f.reviews.filter((r) => r.kind === "editor" && r.approves === true && valid.has(r.by)).map((r) => r.on).sort().at(-1) ?? null;
  const editorial = { editorial: SITE_EDITORIAL } as unknown as Parameters<typeof verificationText>[1];
  return {
    level: v.level,
    text: verificationText({ verification: v }, editorial, (english ??= words({ messages: {} }, "en")))!,
    named: v.named,
    counted: v.counted,
    automated: v.automated.map((by) => SITE_EDITORIAL.renamed[by] ?? by),
    on,
    secondToCome: v.level === "editor" && needsApprovals(card, { editorial: SITE_EDITORIAL } as unknown as Parameters<typeof needsApprovals>[1]),
  };
}

/** Every card with its verification label, as the engine's cardViews adds it: only with the editors list. */
export function withVerification(seed: Seed, editors: readonly EngineEditor[] | null): Seed {
  if (!editors) return seed;
  const actors = new Map(seed.actors.map((a) => [a.id, a]));
  return { ...seed, cards: seed.cards.map((c) => ({ ...c, verification: cardVerification(c.file, actors, editors) })) };
}

/**
 * The private editors list (OpenPromises FORMAT.md §12), or null when the build
 * has none. Read from OPENPROMISES_EDITORS_YAML, the file's text (Vercel, CI's
 * build), or else from the file at OPENPROMISES_EDITORS (a laptop). Never
 * committed. A list not in the engine's shape stops the build, saying where it
 * is wrong but never what it holds, so no editor's party reaches a log.
 */
export function readEditors(env: Record<string, string | undefined> = process.env): EngineEditor[] | null {
  const inline = env.OPENPROMISES_EDITORS_YAML?.trim();
  const file = env.OPENPROMISES_EDITORS?.trim();
  if (!inline && !file) return null;
  const from = inline ? "OPENPROMISES_EDITORS_YAML" : "the file at OPENPROMISES_EDITORS";
  if (!inline && !existsSync(file!)) throw new Error(`no editors list at OPENPROMISES_EDITORS (${file}): point it at your copy of the list, or unset it`);
  let data: unknown;
  try {
    data = parse(inline || readFileSync(file!, "utf8"));
  } catch {
    throw new Error(`the editors list in ${from} is not YAML`);
  }
  const r = EditorsFile.safeParse(data);
  if (!r.success) {
    const where = r.error.issues.map((i) => i.path.join(".") || "(top level)").join(", ");
    throw new Error(`the editors list in ${from} is not in the expected shape (editors: a list of handle, since, party, named), at: ${where}`);
  }
  return r.data.editors;
}
