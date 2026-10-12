import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fromPublicLedger, fromPublicLedgerActor } from "@openpromises/core";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { ActorFile, PromiseFile, comparableCard, isV1, legacyActor, legacyCard, stable } from "../src";
import { repoRoot } from "../src/content-files";

/**
 * The reader is the exact inverse of the engine's converter (src/v1.ts). Run on
 * every card and actor in the repository, in whichever format it is now: old-format
 * files go forward with the engine and back with the reader and must come out
 * unchanged; v1 files go back, forward and back again and must be stable, and must
 * pass our own schema.
 */
const root = repoRoot();
const files = (dir: string) =>
  readdirSync(join(root, "content", dir))
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => ({ name: f, raw: parse(readFileSync(join(root, "content", dir, f), "utf8")) as unknown }));

describe("format v1 reader", () => {
  const cards = files("promises");
  const actors = files("actors");

  it("has cards and actors to check", () => {
    expect(cards.length).toBeGreaterThan(50);
    expect(actors.length).toBeGreaterThan(10);
  });

  it.each(cards.map((c) => [c.name, c.raw] as const))("card %s comes back exactly", (_name, raw) => {
    if (isV1(raw)) {
      const back = legacyCard(raw);
      expect(stable(legacyCard(fromPublicLedger(back)))).toBe(stable(back));
      expect(PromiseFile.safeParse(back).error).toBeUndefined();
    } else {
      // Exact, apart from the one thing the engine does not keep: an empty cost written out as null.
      expect(stable(legacyCard(fromPublicLedger(raw)))).toBe(stable(comparableCard(raw)));
      expect(stable(comparableCard(fromPublicLedger(raw)))).toBe(stable(comparableCard(raw)));
    }
  });

  it.each(actors.map((a) => [a.name, a.raw] as const))("actor %s comes back exactly", (_name, raw) => {
    if (isV1(raw)) {
      const back = legacyActor(raw);
      expect(stable(legacyActor(fromPublicLedgerActor(back)))).toBe(stable(back));
      expect(ActorFile.safeParse(back).error).toBeUndefined();
    } else {
      expect(stable(legacyActor(fromPublicLedgerActor(raw)))).toBe(stable(raw));
    }
  });

  it("leaves files in the old format alone", () => {
    const raw = { id: "x", policy_area: "taxes" };
    expect(legacyCard(raw)).toBe(raw);
    expect(legacyActor(raw)).toBe(raw);
  });

  it("drops what the converter made from comments, which our shape has no place for", () => {
    const card = legacyCard({ format: "openpromises/1", id: "x", links: { contracts: [{ ocid: "ocds-h6vhtk-058e4b", note: { en: "why" } }, { ocid: "ocds-b5fd17-1", notice_url: "https://example.org/n", note: { en: "why" } }] } }) as { contracts: unknown[] };
    expect(card.contracts).toEqual(["ocds-h6vhtk-058e4b", { ocid: "ocds-b5fd17-1", notice_url: "https://example.org/n" }]);
    const actor = legacyActor({ format: "openpromises/1", id: "a", name: { en: "A" }, kind: "person", roles: [{ title: { en: "Minister" }, from: "2026-07-20", source: { url: "https://example.org" } }], same_as_checked_on: "2026-10-09" }) as Record<string, unknown>;
    expect(actor).toEqual({ id: "a", name: "A", kind: "person", roles: [{ title: "Minister", from: "2026-07-20" }] });
  });

  it("gives the card its deadline back from the current version, or from x on a card without parameters", () => {
    const v = (parameters: unknown) => ({ version: 1, text: "t", recorded_on: "2024-01-01", source_url: "https://example.org", parameters });
    expect((legacyCard({ format: "openpromises/1", id: "x", versions: [v({ deadline: "2029-03-31", who: { en: "w" } })] }) as Raw).deadline).toBe("2029-03-31");
    expect((legacyCard({ format: "openpromises/1", id: "x", versions: [v(null)], x: { deadline: "2027-01-01" } }) as Raw).deadline).toBe("2027-01-01");
  });
});

type Raw = Record<string, unknown>;
