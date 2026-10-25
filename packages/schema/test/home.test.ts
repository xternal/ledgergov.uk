import { describe, expect, it } from "vitest";
import { homeTiles, logbook, type CardView } from "../src/index";
import { loadSeed } from "../src/seed";

const seed = loadSeed();
const base = seed.cards[0]!;
/** A card with only what the rules read. */
const card = (id: string, over: { status?: string; events?: { date: string; type: string }[]; reviews?: { by: string; kind: string; on: string; approves?: boolean }[]; deadline?: string; actor?: string }): CardView =>
  ({
    ...base,
    id,
    actor: { ...base.actor, id: over.actor ?? "a", name: over.actor ?? "A" },
    current: { ...base.current, parameters: null },
    file: { ...base.file, id, headline: `H ${id}`, status: over.status ?? "promised", events: over.events ?? [], reviews: over.reviews ?? [], corrections: [], deadline: over.deadline, made_on: "2026-01-01" },
  }) as unknown as CardView;

describe("the home page's promises to watch", () => {
  it("picks the latest delivered, the latest not met, the soonest open deadline, by fixed rules", () => {
    const cards = [
      card("d1", { status: "delivered", events: [{ date: "2026-09-01", type: "delivered" }] }),
      card("d2", { status: "delivered", events: [{ date: "2026-10-01", type: "delivered" }] }),
      card("f1", { status: "failed", events: [{ date: "2026-07-21", type: "failed" }] }),
      card("o1", { deadline: "2026-11-30" }),
      card("o2", { deadline: "2026-10-28" }),
      card("o3", { deadline: "2026-10-01" }),
      card("x", { status: "delivered", deadline: "2026-10-24" }),
    ];
    const t = homeTiles(cards, "2026-10-23");
    expect([t.delivered?.card.id, t.notMet?.card.id, t.dueNext?.card.id, t.dueNext?.date, t.forecast]).toEqual(["d2", "f1", "o2", "2026-10-28", null]);
  });

  it("shows the halve-inflation card as the forecast at the time on the real cards", () => {
    expect(homeTiles(seed.cards, "2026-10-23").forecast?.card.id).toBe("uk-halve-inflation-2023");
  });
});

describe("the logbook", () => {
  const reviews = (on: string, by = "Pavel Guzhikov") => [{ by: "AI Journalist", kind: "automated", on }, { by, kind: "editor", on, approves: true }];
  it("groups a day's new cards by person and an editor's approvals by day, newest first, moves before the rest", () => {
    const cards = [
      card("a1", { actor: "Keir Starmer", reviews: reviews("2026-10-20") }),
      card("a2", { actor: "Keir Starmer", reviews: reviews("2026-10-20") }),
      card("b1", { actor: "Kemi Badenoch", reviews: reviews("2026-10-21") }),
      card("m1", { actor: "Andy Burnham", reviews: reviews("2026-09-01"), status: "delivered", events: [{ date: "2026-10-21", type: "delivered" }] }),
    ];
    expect(logbook(cards, "2026-10-23", 6).map((e) => `${e.date} ${e.kind} ${e.text}`)).toEqual([
      "2026-10-21 moved H m1",
      "2026-10-21 new H b1",
      "2026-10-21 checked Pavel Guzhikov approved “H b1”",
      "2026-10-20 new Keir Starmer: 2 new promises",
      "2026-10-20 checked Pavel Guzhikov approved 2 cards",
      "2026-09-01 new H m1",
    ]);
  });

  it("names only the editors who chose to be named, and leaves out what has not happened yet", () => {
    const cards = [card("c1", { reviews: reviews("2026-10-20", "Goodwill Stranger") }), card("c2", { reviews: reviews("2026-12-01") })];
    expect(logbook(cards, "2026-10-23").map((e) => e.text)).toEqual(["H c1", "An independent editor approved “H c1”"]);
  });
});
