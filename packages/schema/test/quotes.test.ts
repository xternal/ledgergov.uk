import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/content-files";
import { withQuoteChecks } from "../src/quotes";
import { loadSeed } from "../src/seed";

/**
 * What each card says of its quote (OpenPromises decision 35): an editor's check at the source with its day, else a
 * machine's word-for-word match in a stored copy (content/quotes.json), else not yet checked. In the engine's words.
 */
const seed = loadSeed();
const root = repoRoot();
const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** A copy of content/ in which no editor has checked any quote yet, with quotes.json as given. */
function withoutEditorsChecks(quotes: string): string {
  const dir = mkdtempSync(join(tmpdir(), "ledger-quotes-"));
  cpSync(join(root, "content", "actors"), join(dir, "content", "actors"), { recursive: true });
  mkdirSync(join(dir, "content", "promises"));
  for (const f of readdirSync(join(root, "content", "promises")).filter((n) => n.endsWith(".yaml"))) {
    const text = readFileSync(join(root, "content", "promises", f), "utf8").replace(/quote_checked_on: "\d{4}-\d{2}-\d{2}"/g, "quote_checked_on: null");
    writeFileSync(join(dir, "content", "promises", f), text);
  }
  writeFileSync(join(dir, "content", "quotes.json"), quotes);
  return dir;
}

describe("what each card says of its quote", () => {
  it("every card the site serves says it, and a card an editor checked gives the day", () => {
    const cards = withQuoteChecks(seed).cards;
    expect(cards.map((c) => c.id)).toEqual(seed.cards.map((c) => c.id));
    for (const c of cards) {
      expect(c.quote, c.id).toBeDefined();
      const on = c.current.quote_checked_on;
      if (on) expect(c.quote, c.id).toEqual({ kind: "checked", on, text: `Quote checked word for word at its source on ${longDate(on)}`, md: `checked word for word at its source on ${longDate(on)}` });
    }
  });

  it("without an editor's check, a quote matched exactly in a stored copy says so, and one not yet matched says that", () => {
    const quotes = readFileSync(join(root, "content", "quotes.json"), "utf8");
    const cards = withQuoteChecks(seed, withoutEditorsChecks(quotes)).cards;
    const matched = cards.filter((c) => c.quote?.kind === "matched");
    const none = cards.filter((c) => c.quote?.kind === "none");
    expect(matched.length).toBeGreaterThan(0);
    expect(none.length).toBeGreaterThan(0);
    expect(matched.length + none.length).toBe(cards.length);
    expect(matched[0]!.quote).toEqual({ kind: "matched", on: null, text: "Quote matches a stored copy of its source word for word", md: "matches a stored copy of its source word for word" });
    expect(none[0]!.quote).toEqual({ kind: "none", on: null, text: "Quote not yet checked against its source", md: "not yet checked against its source" });

    // The match is the stored check's: without quotes.json, nothing is matched.
    expect(withQuoteChecks(seed, withoutEditorsChecks("{}")).cards.every((c) => c.quote?.kind === "none")).toBe(true);
  });
});
