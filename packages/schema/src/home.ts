import { editorShownAs } from "./approvals";
import type { CardView } from "./content";
import { forecastGap } from "./forecast";
import type { EventType, Status } from "./promises";

/**
 * What the home page's first screen shows besides the figures (the redrawn home page, 23 October 2026), each picked
 * by a fixed rule from the cards, never by hand: the promises to watch, and the logbook of what changed.
 */

const headline = (c: CardView) => c.file.headline ?? c.current.text;
const OPEN: readonly Status[] = ["promised", "in_plan", "legislated", "funded", "delivering"];
const latest = <T>(xs: T[], date: (x: T) => string) => xs.reduce<T | null>((a, x) => (!a || date(x) > date(a) ? x : a), null);

export interface WatchTile {
  card: CardView;
  /** The day it happened, or the deadline for "due next". */
  date: string;
}

export interface HomeTiles {
  /** The promise most recently delivered (its latest "delivered" step up to today). */
  delivered: WatchTile | null;
  /** The promise most recently not met: a "failed" or "deadline missed" step, on a card that has not been delivered since. */
  notMet: WatchTile | null;
  /** The open promise whose deadline comes soonest, from today on. */
  dueNext: WatchTile | null;
  /** The most recently made promise with a target and the forecast at the time (OpenPromises decision 36). */
  forecast: WatchTile | null;
}

export function homeTiles(cards: readonly CardView[], today: string): HomeTiles {
  const stepOf = (types: readonly EventType[], ok: (c: CardView) => boolean) =>
    latest(
      cards.filter(ok).flatMap((card) => card.file.events.filter((e) => types.includes(e.type) && e.date <= today).map((e) => ({ card, date: e.date }))),
      (t) => t.date,
    );
  const due = cards
    .filter((c) => OPEN.includes(c.file.status) && c.file.deadline && c.file.deadline >= today)
    .map((card) => ({ card, date: card.file.deadline! }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.card.id.localeCompare(b.card.id));
  return {
    delivered: stepOf(["delivered"], (c) => c.file.status === "delivered"),
    notMet: stepOf(["failed", "deadline_missed"], (c) => c.file.status === "failed" || c.file.status === "quietly_dropped"),
    dueNext: due[0] ?? null,
    forecast: latest(
      cards.filter((c) => forecastGap(c.current.parameters ?? undefined)).map((card) => ({ card, date: card.file.made_on })),
      (t) => t.date,
    ),
  };
}

/** A status step the logbook reports when a card moves. */
const MOVES: readonly EventType[] = ["in_plan", "legislated", "funded", "delivering", "delivered", "failed", "deadline_missed"];
/** Within one day: moves first, then corrections, new cards and checks. */
const ORDER = { moved: 0, corrected: 1, new: 2, checked: 3 } as const;

export interface LogEntry {
  date: string;
  kind: keyof typeof ORDER;
  /** What a reader sees, without the kind: "Free bus travel for every child in August", "Keir Starmer: 14 new promises". */
  text: string;
  href: string;
  /** For "moved": the step it moved to. */
  step?: EventType;
}

/**
 * The logbook: what was added, moved, corrected or checked, newest first, up to `max` lines. A card counts as added on
 * its first review (every card is reviewed when it is added); several added for one person on one day are one line, as
 * are one editor's approvals on one day. An editor is named only when they chose to be (decision 23).
 */
export function logbook(cards: readonly CardView[], today: string, max = 6, named?: readonly string[]): LogEntry[] {
  const out: LogEntry[] = [];
  const added = new Map<string, CardView[]>();
  const approved = new Map<string, CardView[]>();
  for (const c of cards) {
    const reviews = (c.file.reviews ?? []).filter((r) => r.on <= today);
    const first = reviews.map((r) => r.on).sort()[0];
    if (first) added.set(`${first}|${c.actor.id}`, [...(added.get(`${first}|${c.actor.id}`) ?? []), c]);
    for (const r of reviews)
      if (r.kind === "editor" && r.approves) {
        const key = `${r.on}|${editorShownAs(r.by, named)}`;
        approved.set(key, [...(approved.get(key) ?? []), c]);
      }
    for (const e of c.file.events)
      if (MOVES.includes(e.type) && e.date <= today) out.push({ date: e.date, kind: "moved", text: headline(c), href: `/promise/${c.id}`, step: e.type });
    for (const x of c.file.corrections ?? []) if (x.date <= today) out.push({ date: x.date, kind: "corrected", text: headline(c), href: `/promise/${c.id}` });
  }
  for (const [key, list] of added) {
    const date = key.split("|")[0]!;
    const c = list[0]!;
    out.push(
      list.length === 1
        ? { date, kind: "new", text: headline(c), href: `/promise/${c.id}` }
        : { date, kind: "new", text: `${c.actor.name}: ${list.length} new promises`, href: `/actor/${c.actor.id}` },
    );
  }
  for (const [key, list] of approved) {
    const [date, who] = key.split("|") as [string, string];
    const by = `${who[0]!.toUpperCase()}${who.slice(1)}`;
    out.push(
      list.length === 1
        ? { date, kind: "checked", text: `${by} approved “${headline(list[0]!)}”`, href: `/promise/${list[0]!.id}` }
        : { date, kind: "checked", text: `${by} approved ${list.length} cards`, href: "/promises" },
    );
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || ORDER[a.kind] - ORDER[b.kind] || a.text.localeCompare(b.text)).slice(0, max);
}
