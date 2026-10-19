import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { loadSeed } from "@ledger/schema/seed";
import { spotlightInput } from "@ledger/schema/spotlight";

/**
 * Promises close to the way in (OpenPromises decision 30; docs/DECISIONS.md, 19 October 2026): the engine's
 * PromiseSpotlight second on the home page, after the site's own opening, which says "N promises tracked →"; every
 * promise row says "Open the promise →"; "Promises" stays in the menu. And the footer has no middle dots
 * (docs/DESIGN_HANDOFF.md).
 */

const WEB = join(import.meta.dirname, "../../../apps/web");
const read = (path: string) => readFileSync(join(WEB, path), "utf8");

// React and the components come from the web app, as Next.js would load them (this package has no React of its own).
const web = createRequire(join(WEB, "package.json"));
const { createElement } = web("react") as { createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown };
const { renderToStaticMarkup } = web("react-dom/server") as { renderToStaticMarkup: (element: unknown) => string };
const load = (path: string) => import(pathToFileURL(join(WEB, path)).href);
const { PromiseSpotlight } = (await load("node_modules/@openpromises/react/dist/index.js")) as { PromiseSpotlight: unknown };
const { PromiseList } = (await load("components/PromiseList.tsx")) as { PromiseList: unknown };
const { SITE_LINKS } = (await load("components/siteLinks.ts")) as { SITE_LINKS: { href: string; label: string }[] };

const seed = loadSeed();
const today = "2026-10-19";
const s = spotlightInput(new Set(seed.cards.map((c) => c.id)), today);
const spotlightHtml = renderToStaticMarkup(createElement(PromiseSpotlight, { views: s.views, config: s.config, today: s.today, actors: s.actors }));
/** Each list row: the card it links to and what the link holds. */
const rows = (html: string) => [...html.matchAll(/<li\b[^>]*><a\b[^>]*\bhref="(\/promise\/[^"]+)"[^>]*>(.*?)<\/a><\/li>/gs)].map((m) => ({ href: m[1]!, body: m[2]! }));

describe("the home page's promises", () => {
  it("come second, after the site's own opening and before the budget statement, which stays the main product", () => {
    const ledger = read("components/Ledger.tsx");
    const at = (s: string) => ledger.indexOf(s);
    for (const s of ["<Hero", "{spotlight", "<KpiStrip", "<StatementSection", "<PromisesSection"]) expect(at(s), s).toBeGreaterThan(0);
    expect(at("<Hero")).toBeLessThan(at("{spotlight"));
    expect(at("{spotlight")).toBeLessThan(at("<KpiStrip"));
    expect(at("<KpiStrip")).toBeLessThan(at("<StatementSection"));
    // The page renders the engine's own component, so every site shows promises the same way.
    expect(read("app/page.tsx")).toMatch(/import \{ PromiseSpotlight \} from "@openpromises\/react"/);
  });

  it("say how many promises are tracked and link to them all", () => {
    expect(spotlightHtml).toContain(`<a href="/promises">${seed.cards.length} promises tracked</a>`);
    expect(spotlightHtml).toContain(`<a href="/promises">All promises →</a>`);
    // The opening says it too, with a link to the promises page.
    expect(read("components/Masthead.tsx")).toContain("{tracked.text} →");
  });

  it("open each card in one click, and every row says so", () => {
    const shown = rows(spotlightHtml);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThanOrEqual(6);
    for (const r of shown) {
      expect(seed.cards.map((c) => `/promise/${c.id}`)).toContain(r.href);
      expect(r.body).toContain('<span class="op-row__open" aria-hidden="true">Open the promise →</span>');
    }
  });

  it("keep Promises in the menu", () => {
    expect(SITE_LINKS).toContainEqual(expect.objectContaining({ href: "/promises", label: "Promises" }));
  });
});

describe("the site's own promise list", () => {
  it("ends every row with Open the promise →, hidden from screen readers since the whole row is the link", () => {
    const cards = seed.cards.slice(0, 4);
    const html = renderToStaticMarkup(createElement(PromiseList, { cards, today }));
    const shown = rows(html);
    expect(shown.map((r) => r.href)).toEqual(cards.map((c) => `/promise/${c.id}`));
    for (const r of shown) expect(r.body).toMatch(/<span aria-hidden="true"[^>]*>Open the promise →<\/span><\/span>$/);
  });
});

describe("the footer", () => {
  it("separates its items by layout, with no middle dots (docs/DESIGN_HANDOFF.md)", () => {
    const layout = read("app/layout.tsx");
    const footer = layout.slice(layout.indexOf("<footer"), layout.indexOf("</footer>"));
    expect(footer).toContain("Buy me a coffee");
    expect(footer).not.toContain("·");
  });
});
