/**
 * Record an editor's approval of a card (docs/EDITORS.md, "Recording your approval").
 *
 *   pnpm review <card id> --by "<your handle>" [--note "what you checked"] [--on YYYY-MM-DD] [--dry-run]
 *
 * Reads the private editors list from OPENPROMISES_EDITORS (or --editors <file>),
 * refuses an approval the rules would not count (packages/schema/src/approvals.ts),
 * and appends one review to the card: kind editor, approves: true. When the card
 * reaches the approvals it needs (APPROVALS_NEEDED: one since 17 October 2026, two
 * before) it drops `editor_check_required`, so the card stops saying "human editor
 * review to come". Appends only, so the append-only check still passes.
 *
 * Cards in OpenPromises format v1 (all published cards since 12 October 2026) are
 * handed to the engine's own `openpromises review`, which applies the same rules and
 * writes the review in v1. Cards still in the old format are written here, by text.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseDocument } from "yaml";
import { APPROVALS_NEEDED, ActorFile, PromiseFile, appendReviewText, approvalRefusal, approvers, isV1, legacyActor, legacyCard, parseEditors, stable, ukDay } from "@ledger/schema";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const fail = (m: string): never => {
  console.error(`refused: ${m}`);
  process.exit(1);
};

const VALUE_FLAGS = new Set(["--by", "--note", "--on", "--editors"]);
const id = args.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(args[i - 1] ?? ""));
const by = flag("by");
if (!id || !by) fail('usage: pnpm review <card id> --by "<your handle>" [--note "what you checked"] [--on YYYY-MM-DD] [--dry-run]');
const dryRun = args.includes("--dry-run");
const today = ukDay();
const on = flag("on") ?? today;
const note = flag("note") ?? "Checked against the editors' checklist (docs/EDITORS.md): quote, sources, dates, status, cost and wording";

const listFile = flag("editors") ?? process.env.OPENPROMISES_EDITORS;
if (!listFile) fail("no editors list: set OPENPROMISES_EDITORS to your copy of it (it is private and never in this repository)");
if (!existsSync(resolve(listFile!))) fail(`there is no editors list at ${listFile}`);
let editors;
try {
  editors = parseEditors(readFileSync(resolve(listFile!), "utf8"));
} catch (e) {
  fail((e as Error).message);
}

const path = join(root, "content", "promises", `${id}.yaml`);
if (!existsSync(path)) fail(`there is no published card "${id}" in content/promises`);
const raw = parseDocument(readFileSync(path, "utf8")).toJS();
const card = PromiseFile.parse(legacyCard(raw));

const actors = new Map<string, ActorFile>();
const actorPath = join(root, "content", "actors", `${card.actor_id}.yaml`);
if (existsSync(actorPath)) {
  const actor = ActorFile.parse(legacyActor(parseDocument(readFileSync(actorPath, "utf8")).toJS()));
  actors.set(actor.id, actor);
  const partyPath = actor.party_id && join(root, "content", "actors", `${actor.party_id}.yaml`);
  if (partyPath && existsSync(partyPath)) {
    const party = ActorFile.parse(legacyActor(parseDocument(readFileSync(partyPath, "utf8")).toJS()));
    actors.set(party.id, party);
  }
}

const refusal = approvalRefusal(card, by!, on, today, editors!, actors);
if (refusal) fail(refusal);

const review = { by: by!, kind: "editor" as const, on, note, approves: true as const };

if (isV1(raw)) {
  const count = approvers({ ...card, reviews: [...card.reviews, review] }, editors!, actors).size;
  console.log(`${id}: ${by} approves (${count} of ${APPROVALS_NEEDED})`);
  if (dryRun) {
    console.log("dry run: nothing written");
    process.exit(0);
  }
  // The engine writes the review in format v1 and applies the same rules again.
  execFileSync(join(root, "node_modules", ".bin", "openpromises"), ["review", id!, "--by", by!, "--note", note, ...(flag("on") ? ["--on", on] : [])], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, OPENPROMISES_EDITORS: resolve(listFile!) },
  });
  process.exit(0);
}
const after = approvers({ ...card, reviews: [...card.reviews, review] }, editors!, actors).size;
const complete = after >= APPROVALS_NEEDED;

// Edit the text so nothing else in the file moves, then check that the only change is the new review (and the dropped flag).
const text = appendReviewText(readFileSync(path, "utf8"), review, complete);
const check = PromiseFile.parse(parseDocument(text).toJS());
const { editor_check_required: _flag, ...expected } = { ...card, reviews: [...card.reviews, review] };
const { editor_check_required: _flag2, ...got } = check;
if (stable(got) !== stable(expected) || (!complete && check.editor_check_required !== card.editor_check_required))
  fail(`could not append the review to ${id} cleanly; add it by hand (docs/EDITORS.md)`);

console.log(`${id}: ${by} approves (${after} of ${APPROVALS_NEEDED})${complete ? "; the card no longer needs an editor check" : ""}`);
if (dryRun) {
  console.log("dry run: nothing written");
} else {
  writeFileSync(path, text);
}
