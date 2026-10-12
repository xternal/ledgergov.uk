import "server-only";
import type { PolicyArea } from "@ledger/schema";
import { cardHeadline } from "@ledger/server/seo";
import { constituencyBySlug } from "@ledger/server/mp";
import { counterFromEnv, readViews, type ViewsFile } from "@ledger/server/views";
import { getScorecards, getSeed } from "@/lib/data";
import { AREA_LABEL } from "@/lib/promises";
import { BUDGET, BUDGET_TOPICS } from "@/lib/budget";
import { cardTitle, getReckoner } from "@/lib/reckoner";
import { RECKONER_TITLE } from "@/lib/reckoner-copy";
import { PEOPLE_TITLE } from "@/lib/people-copy";
import { PRIVACY_TITLE } from "@/lib/privacy-copy";
import { METHOD_PAGES } from "@/lib/method-copy";

/**
 * /method/numbers: the counter's totals (@ledger/server/views) and a readable name for each page counted. A page
 * that no longer exists, or an address nobody recognises, is shown by its address.
 */

export type ViewsState = { kind: "ready"; file: ViewsFile } | { kind: "not_connected" } | { kind: "unavailable" };

/** The last 30 days' totals, or why there are none: the counter is not connected here, or cannot be read now. */
export async function getViews(): Promise<ViewsState> {
  const counter = counterFromEnv();
  if (!counter) return { kind: "not_connected" };
  try {
    return { kind: "ready", file: await readViews(counter) };
  } catch {
    return { kind: "unavailable" };
  }
}

const FIXED: Record<string, string> = {
  "/": "Home: where public money comes from and goes",
  "/promises": "The promise ledger",
  "/people": PEOPLE_TITLE,
  "/mp": "Your MP",
  "/budget": BUDGET.name,
  "/budget/predict": "Predict the Budget",
  "/tax": RECKONER_TITLE,
  "/editors": "Become an editor",
  "/privacy": PRIVACY_TITLE,
  "/feeds": "Feeds",
  "/follow": "Follow a promise",
  ...Object.fromEntries(METHOD_PAGES.map((p) => [p.href, p.label])),
};

/** A page's name as a reader would know it: the card's headline, the person's name, the constituency, the page's title. */
export function pageLabel(path: string): string {
  if (FIXED[path]) return FIXED[path]!;
  const [, first, second, third] = path.split("/");
  const seed = getSeed();
  if (first === "promise" && second) {
    const card = seed.cards.find((c) => c.id === second);
    if (card) return cardHeadline(card);
  }
  if (first === "actor" && second) {
    const actor = seed.actors.find((a) => a.id === second);
    if (actor) return actor.name;
  }
  if (first === "promises" && second === "area" && third && third in AREA_LABEL) return `Promises: ${AREA_LABEL[third as PolicyArea]}`;
  if (first === "mp" && second) {
    const c = constituencyBySlug(second);
    if (c) return `Your MP: ${c.name}`;
  }
  if (first === "tax" && second) {
    const card = getReckoner().cards.find((c) => c.path === path);
    if (card) return cardTitle(card);
  }
  if (first === "budget" && second === "scorecard" && third) {
    const s = getScorecards().find((x) => x.id === third);
    if (s) return `${s.name}: every measure`;
  }
  if (first === "budget" && second && !third) {
    const topic = BUDGET_TOPICS.find((t) => t.id === second);
    if (topic) return `${BUDGET.name}: ${topic.title}`;
  }
  return path;
}
