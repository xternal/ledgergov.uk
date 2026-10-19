/**
 * Promises close to the way in (OpenPromises decision 30, 0.10.0; docs/DECISIONS.md, 19 October 2026). The home page
 * shows the engine's PromiseSpotlight second, after the site's own opening: how many promises are tracked and where
 * they stand, the three latest changes and the three open promises due next, each a link to its card. The engine
 * chooses them by its rule (`spotlight()` in @openpromises/publish), never by hand, the same for every party.
 *
 * The component reads cards as the engine does, in format v1, with the site's OpenPromises configuration. This module
 * gives it the cards the site publishes (the ones /promises lists), read from content/ as the engine's own check reads
 * them, so the count and the choice agree with the rest of the site.
 *
 * Its own entry (@ledger/schema/spotlight), like verification.ts: the engine's packages are ES modules only, and the
 * repository's scripts, which tsx runs as CommonJS, load the package index.
 */
import { join } from "node:path";
import { Actor, Card, migrateActor, migrateCard, resolveConfig, type Config } from "@openpromises/core";
import { cardViews, paths, words, type CardView as EngineCardView } from "@openpromises/publish";
import siteConfig from "../../../openpromises.config";
import { readYamlDir, repoRoot } from "./content-files";
import { isV1 } from "./v1";

let resolved: Config | undefined;

/** The site's OpenPromises configuration (openpromises.config.ts), resolved as the engine's check reads it. */
export function engineConfig(): Config {
  resolved ??= resolveConfig(siteConfig);
  return resolved;
}

export interface SpotlightInput {
  config: Config;
  /** The cards the site publishes, as the engine's views, newest first. */
  views: EngineCardView[];
  /** Every actor, so each row can say where its party stands. */
  actors: ReadonlyMap<string, Actor>;
  /** The day the choice is made for (UK time). A static page shows its build day's choice, as /promises does. */
  today: string;
  /** The opening's line, in the engine's words: "125 promises tracked", linking to the promises page. */
  tracked: { text: string; href: string };
}

/**
 * The spotlight's input for the cards in `ids` (the site's own published cards). A file in the site's older format is
 * converted on the way in, as the engine's check does (config `legacy`). A card or actor the engine cannot read stops
 * the build, as a bad seed file does; CI's OpenPromises check names it first.
 */
export function spotlightInput(ids: ReadonlySet<string>, today: string, root = repoRoot()): SpotlightInput {
  const config = engineConfig();
  const legacy = config.legacy;
  function read<T>(dir: string, parse: (data: unknown) => T, migrate: (raw: unknown) => unknown): T[] {
    return readYamlDir(join(root, "content", dir)).map((f) => {
      try {
        return parse(legacy && !isV1(f.data) ? migrate(f.data) : f.data);
      } catch (e) {
        throw new Error(`${f.path} is not in a shape the OpenPromises engine reads: ${(e as Error).message.split("\n")[0]}`);
      }
    });
  }
  const cards = read("promises", (d) => Card.parse(d), (raw) => migrateCard(legacy!, raw)).filter((c) => ids.has(c.id));
  const actors = new Map(read("actors", (d) => Actor.parse(d), (raw) => migrateActor(legacy!, raw)).map((a) => [a.id, a]));
  const views = cardViews(cards, actors);
  const L = config.locales.default;
  return {
    config,
    views,
    actors,
    today,
    tracked: { text: words(config, L).n("spotlight.count", views.length), href: paths(config).promises(L) },
  };
}
