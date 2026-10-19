import { categoryOf } from "@openpromises/core";
import { lastChanged, paths, spotlight, words } from "@openpromises/publish";
import { describe, expect, it } from "vitest";
import { loadSeed } from "../src/seed";
import { engineConfig, spotlightInput } from "../src/spotlight";

/**
 * Promises close to the way in (OpenPromises decision 30): the home page's spotlight reads the site's published cards
 * as the engine does, and the engine chooses which to show by its rule, the same for every party.
 */
const seed = loadSeed();
const ids = new Set(seed.cards.map((c) => c.id));
const today = "2026-10-19";
const input = spotlightInput(ids, today);

describe("the home page's promises", () => {
  it("are the cards the site publishes, the ones /promises lists, counted in the opening's words", () => {
    expect(input.views.map((v) => v.id).sort()).toEqual([...ids].sort());
    expect(input.views.every((v) => v.where === "promises")).toBe(true);
    expect(input.tracked).toEqual({ text: `${seed.cards.length} promises tracked`, href: "/promises" });
    expect(input.today).toBe(today);
  });

  it("leave out any card the site does not publish", () => {
    const first = seed.cards[0]!.id;
    const one = spotlightInput(new Set([first]), today);
    expect(one.views.map((v) => v.id)).toEqual([first]);
    expect(one.tracked.text).toBe("1 promise tracked");
  });

  it("link to the card pages and the promises page where the site serves them", () => {
    const p = paths(engineConfig());
    expect(p.card("uk-abolish-non-dom-2024", "en")).toBe("/promise/uk-abolish-non-dom-2024");
    expect(p.promises("en")).toBe("/promises");
  });

  it("are chosen by the engine's rule: the latest changes, then open promises due next, never by hand", () => {
    const s = spotlight(input.views, input.config, today);
    expect(s.total).toBe(seed.cards.length);
    expect(s.recent.length).toBeLessThanOrEqual(3);
    expect(s.due.length).toBeLessThanOrEqual(3);
    const changed = (id: string) => lastChanged(input.views.find((v) => v.id === id)!, today) ?? "";
    const latest = s.recent.map((v) => changed(v.id));
    expect(latest).toEqual([...latest].sort().reverse());
    for (const v of input.views) if (!s.recent.includes(v)) expect(changed(v.id) <= latest.at(-1)!).toBe(true);
    const deadlines = s.due.map((v) => v.current.parameters?.deadline ?? "");
    expect(deadlines).toEqual([...deadlines].sort());
    for (const v of s.due) {
      expect(s.recent).not.toContain(v);
      expect(["open", "progress"]).toContain(categoryOf(input.config, v.card.status));
      expect(v.current.parameters?.deadline! >= today).toBe(true);
    }
  });

  it("say where each party stands in the words of the site's own lists", () => {
    const w = words(input.config, "en");
    expect(["in_power", "opposition", "public_body"].map((s) => w.t(`standing.${s}`))).toEqual(["in government", "in opposition", "public body"]);
  });
});
