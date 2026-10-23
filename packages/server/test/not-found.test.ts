import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The family 404 (Pavel, 23 October 2026): a calm "this page isn't here", links home and to the promises, and every
 * site of the family from FAMILY (the switcher's list, in its order), with this one marked as here. Never indexed.
 */

const WEB = join(import.meta.dirname, "../../../apps/web");
const web = createRequire(join(WEB, "package.json"));
const { createElement } = web("react") as { createElement: (type: unknown, props?: unknown) => unknown };
const { renderToStaticMarkup } = web("react-dom/server") as { renderToStaticMarkup: (element: unknown) => string };
// Loaded like the page itself: a static import would make this package's typecheck compile the app's JSX.
const { FAMILY, THIS_SITE } = (await import(pathToFileURL(join(WEB, "components/siteLinks.ts")).href)) as {
  FAMILY: { name: string; href: string; about: string }[];
  THIS_SITE: string;
};
const page = (await import(pathToFileURL(join(WEB, "app/not-found.tsx")).href)) as {
  default: () => unknown;
  metadata: { title?: string; description?: string; robots?: { index?: boolean } };
};
const out = renderToStaticMarkup(createElement(page.default));
const main = out.slice(out.indexOf("<main"));

describe("the 404 page", () => {
  it("says the page isn't here and links home and to the promises", () => {
    expect(main).toContain("This page isn&#x27;t here");
    expect(main).toContain("The link may be old or mistyped.");
    expect(main).toContain('<a href="/">LedgerGov.UK home page</a>');
    expect(main).toContain('<a href="/promises">Promises</a>');
  });

  it("lists every site of the family, in the switcher's order, from FAMILY", () => {
    const names = [...main.matchAll(/<span class="text-body font-semibold">([^<]+)/g)].map((m) => m[1]);
    expect(names).toEqual(FAMILY.map((s) => s.name));
    expect(FAMILY).toHaveLength(6);
    for (const s of FAMILY) {
      expect(main).toContain(s.about.replace(/'/g, "&#x27;"));
      if (s.name !== THIS_SITE) expect(main).toContain(`href="${s.href}"`);
    }
    // The list is imported, never copied into the page.
    const source = readFileSync(join(WEB, "app/not-found.tsx"), "utf8");
    expect(source).toContain('import { FAMILY, THIS_SITE } from "@/components/siteLinks"');
    for (const s of FAMILY) expect(source).not.toContain(s.href);
  });

  it("marks this site as here, linking to its own home page", () => {
    const current = [...main.matchAll(/<a [^>]*aria-current="page"[^>]*>.*?<\/a>/g)].map((m) => m[0]);
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/"');
    expect(current[0]).toContain(THIS_SITE);
    expect(current[0]).toContain("You are here");
  });

  it("is noindex, with its own title and description", () => {
    expect(page.metadata.robots?.index).toBe(false);
    expect(page.metadata.title).toBe("Page not found | LedgerGov.UK");
    expect(page.metadata.description).toMatch(/Page not found/);
    expect(page.metadata).not.toHaveProperty("alternates");
  });

  it("carries the site header", () => {
    expect(out.indexOf("<header")).toBeLessThan(out.indexOf("<main"));
  });
});
