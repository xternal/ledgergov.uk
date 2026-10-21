/**
 * What was checked of each card's quote (OpenPromises decision 35, 0.15.0). Beside the quote's source, the card page
 * and its Markdown say the strongest check that holds, in the engine's words:
 *
 * - an editor checked the words at the source (quote_checked_on): "Quote checked word for word at its source on
 *   20 October 2026";
 * - else a machine found them word for word in a stored copy of the source (an `exact` archive check in
 *   content/quotes.json, which `openpromises check-quote --record` writes, or a stored-source span): "Quote matches a
 *   stored copy of its source word for word";
 * - else "Quote not yet checked against its source".
 *
 * The match is the engine's own (`quoteMatched()`), looked up in quotes.json by the engine's key, so the page agrees
 * with the check CI runs. Its own entry (@ledger/schema/quotes), like verification.ts: the engine's packages are ES
 * modules only, and the repository's scripts, which tsx runs as CommonJS, load the package index.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { quoteMatched, type QuoteCheck, type Version } from "@openpromises/core";
import { DIRS, QUOTES_FILE, quoteKey, quoteLang, quoteUrl } from "@openpromises/files";
import { quoteState, quoteStateText, words } from "@openpromises/publish";
import type { CardQuote } from "./content";
import { repoRoot } from "./content-files";
import type { Seed } from "./seed";
import { engineConfig, engineViews } from "./spotlight";

const readText = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : undefined);

/** Every card with what was checked of its current quote, read from content/ as the engine's check reads it. */
export function withQuoteChecks(seed: Seed, root = repoRoot()): Seed {
  const config = engineConfig();
  const content = join(root, "content");
  const checks = JSON.parse(readText(join(content, QUOTES_FILE)) ?? "{}") as Record<string, QuoteCheck>;
  const ctx = {
    config,
    quoteCheck: (v: Version) => checks[quoteKey(v.text, quoteLang(v, config), quoteUrl(v))],
    sourceText: (file: string) => readText(join(content, DIRS.sources, file)),
  };
  const w = words(config, config.locales.default);
  const views = new Map(engineViews(new Set(seed.cards.map((c) => c.id)), root).views.map((v) => [v.id, v]));
  return {
    ...seed,
    cards: seed.cards.map((c) => {
      const v = views.get(c.id);
      if (!v) return c;
      const state = quoteState({ ...v, quoteMatched: v.card.versions.map((x) => quoteMatched(x, ctx)) });
      const quote: CardQuote = { kind: state.kind, on: state.kind === "checked" ? state.on : null, text: quoteStateText(state, w), md: quoteStateText(state, w, "md") };
      return { ...c, quote };
    }),
  };
}
