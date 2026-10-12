/**
 * Nightly: make silence visible (PRD F4, PROMISE_STANDARD §3).
 *
 * For every card whose deadline has passed without a terminal status, append
 * one automatic `deadline_missed` event. The status is not changed: an editor
 * confirms `quietly_dropped` (or records what happened) after 30 days.
 * Appends only, so the append-only check still passes. Cards in OpenPromises
 * format v1 get the event in their own shape (text as { en }), added as text so
 * the rest of the file keeps its exact formatting.
 *
 *   pnpm deadlines            write the events
 *   pnpm deadlines --dry-run  list what would be written
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { isV1, legacyCard } from "@ledger/schema";
import { appendToBlockSeq } from "../packages/server/src/triage/draft";

const root = join(import.meta.dirname, "..");
const dir = join(root, "content", "promises");
const dryRun = process.argv.includes("--dry-run");
const TERMINAL = new Set(["delivered", "failed", "quietly_dropped", "unscoreable"]);
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

let written = 0;
for (const name of readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort()) {
  const path = join(dir, name);
  const text = readFileSync(path, "utf8");
  const raw = parse(text);
  const card = legacyCard(raw) as { id: string; status: string; deadline?: string; events: { type: string }[] };
  if (!card.deadline || card.deadline >= today || TERMINAL.has(card.status)) continue;
  if (card.events.some((e) => e.type === "deadline_missed")) continue;
  const words = "The deadline passed with no evidence of delivery recorded. An editor confirms or corrects this within 30 days.";
  const event = { date: today, type: "deadline_missed", text: isV1(raw) ? { en: words } : words, auto: true };
  console.log(`${card.id}: deadline ${card.deadline} passed (status ${card.status})`);
  if (dryRun) continue;
  writeFileSync(path, appendToBlockSeq(text, "events", event, []));
  written++;
}
console.log(dryRun ? "dry run: nothing written" : `${written} deadline_missed event(s) appended`);
