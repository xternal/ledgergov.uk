import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { ALSO_BY, alsoByLlms, MAKER } from "../../../apps/web/lib/site";

/**
 * The owner's other project (docs/DECISIONS.md "Also by the author", Pavel, 19 October 2026): a card above the
 * footer on every page and one line in llms.txt, nothing else. The card is the same everywhere: it takes no props
 * and only the root layout renders it, so no page, promise, party or topic can place or vary it. Plain links with
 * no query string and no referrer, nothing counted (CLAUDE.md invariant 7), no Ruminator figures.
 */

const WEB = join(import.meta.dirname, "../../../apps/web");
const read = (path: string) => readFileSync(join(WEB, path), "utf8");

// The llms.txt route reads the site's data through lib/data.ts, which marks itself server-only; Next.js allows that
// import on the server, so the test does too.
const serverOnly = vi.hoisted(async () => (await import("node:fs")).realpathSync(new URL("../../../apps/web/node_modules/server-only/index.js", import.meta.url)));
vi.mock(await serverOnly, () => ({}));

// React and the component come from the web app, as Next.js would load them (this package has no React of its own).
const web = createRequire(join(WEB, "package.json"));
const { createElement } = web("react") as { createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown };
const { renderToStaticMarkup } = web("react-dom/server") as { renderToStaticMarkup: (element: unknown) => string };
const load = (path: string) => import(pathToFileURL(join(WEB, path)).href);
const { AlsoBy } = (await load("components/AlsoBy.tsx")) as { AlsoBy: () => unknown };
const card = () => renderToStaticMarkup(createElement(AlsoBy));
/** A string as React writes it into HTML (apostrophes escaped). */
const html = (s: string) => renderToStaticMarkup(createElement("span", null, s)).slice("<span>".length, -"</span>".length);

/** Every source file of the web app, as a path relative to apps/web. */
function* sources(dir = WEB): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (/\.(tsx?|mjs|js|json|css|txt)$/.test(name)) yield relative(WEB, p);
  }
}

describe("the card above the footer", () => {
  it("shows the label, the name, what it is, who it is for and how to ask for access", () => {
    const out = card();
    for (const text of [ALSO_BY.label, ALSO_BY.name, ALSO_BY.text, ALSO_BY.audience, ALSO_BY.cta]) expect(out).toContain(html(text));
    expect(ALSO_BY.label).toBe("Also by the author");
    expect(ALSO_BY.name).toBe("Ruminator.xyz");
    expect(ALSO_BY.cta).toBe("Request access");
  });

  it("links to the project and to its access request with plain links that send no referrer", () => {
    const out = card();
    expect(out).toContain(`<a href="${ALSO_BY.url}" rel="noopener noreferrer" target="_blank" class="text-ink">${ALSO_BY.name}</a>`);
    expect(out).toContain(`<a href="${ALSO_BY.access}" rel="noopener noreferrer" target="_blank" class="whitespace-nowrap font-medium">${ALSO_BY.cta}</a>`);
    const links = [...out.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
    expect(links).toHaveLength(2);
    for (const a of links) expect(a).toContain('rel="noopener noreferrer"');
    // The site opens outside links in a new tab (the footer's "Buy me a matcha"); the card does the same.
    expect(read("app/layout.tsx")).toContain(`<a href={MAKER.coffee} rel="noopener noreferrer" target="_blank">`);
    expect(MAKER.coffee).toMatch(/^https:/);
  });

  it("carries nothing that tells the other site who came or from where", () => {
    expect(ALSO_BY.url).toBe("https://ruminator.xyz/");
    expect(ALSO_BY.access).toBe("https://ruminator.xyz/request-access");
    for (const url of [ALSO_BY.url, ALSO_BY.access]) {
      const u = new URL(url);
      expect(u.protocol).toBe("https:");
      expect(u.search).toBe("");
      expect(u.hash).toBe("");
      expect(url).not.toMatch(/[?#]/);
    }
    for (const href of card().matchAll(/href="([^"]*)"/g)) expect(href[1]).not.toMatch(/[?#]/);
  });

  it("has no figures, no images, no scripts and nothing that counts a click", () => {
    expect(Object.values(ALSO_BY).join(" ")).not.toMatch(/\d/);
    expect(card()).not.toMatch(/<(img|svg|picture|script|iframe|form|button)\b|\son[a-z]+=/i);
    const code = read("components/AlsoBy.tsx");
    expect([...code.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1])).toEqual(["@/lib/site"]);
    expect(code).not.toMatch(/"use client"|\btrack\(|analytics|onClick|fetch\(|sendBeacon|localStorage|document\.cookie/);
  });

  it("is the same on every page: it takes no props, and only the root layout renders it, inside the footer", () => {
    expect(AlsoBy.length).toBe(0);
    expect(card()).toBe(card());
    const layout = read("app/layout.tsx");
    expect(layout.match(/<AlsoBy\b[^>]*>/g)).toEqual(["<AlsoBy />"]);
    expect(layout.indexOf("<AlsoBy />")).toBeGreaterThan(layout.indexOf("{children}"));
    expect(layout.indexOf("<AlsoBy />")).toBeGreaterThan(layout.indexOf("<footer"));
    expect(layout.indexOf("<AlsoBy />")).toBeLessThan(layout.indexOf("</footer>"));
    // No other file places it, varies it, or mentions the project: no promise, party or topic page, no line above the header.
    const mentions = [...sources()].filter((f) => /\bAlsoBy\b|\bALSO_BY\b|alsoByLlms|ruminator/i.test(readFileSync(join(WEB, f), "utf8")));
    // The family switcher beside the logo names it too, as one site of the family (docs/DECISIONS.md, 23 Oct 2026).
    expect(mentions.sort()).toEqual(["app/layout.tsx", "app/llms.txt/route.ts", "components/AlsoBy.tsx", "components/siteLinks.ts", "lib/site.ts"]);
  });
});

describe("llms.txt", () => {
  const line = "- [Ruminator.xyz](https://ruminator.xyz/): Russia's regional and local press, read every day; by invitation, paid subscription.";

  it("names the project under its own heading, in one line", () => {
    expect(alsoByLlms()).toEqual(["## Also by the author", "", line]);
  });

  it("ends with that section, once, and links nowhere else on the project", { timeout: 60_000 }, async () => {
    const { GET } = (await load("app/llms.txt/route.ts")) as { GET: () => Response };
    const text = await GET().text();
    expect(text.endsWith(`\n\n## Also by the author\n\n${line}\n`)).toBe(true);
    expect(text.split("\n").filter((l) => /ruminator/i.test(l))).toEqual([line]);
  });
});
