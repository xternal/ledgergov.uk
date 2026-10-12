import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The site's colours (apps/web/styles/tokens.css) against the owner's rules for dark mode (dark brown since 12 October
 * 2026): every text colour passes WCAG AA (4.5:1) on each background, every data colour 3:1, body text about 13:1 and
 * never above 14:1, a warm background that is not black, and the browser bar and the mark in step with the tokens.
 */

const file = (path: string) => readFileSync(new URL(`../../../apps/web/${path}`, import.meta.url), "utf8");
const css = file("styles/tokens.css");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const body = css.slice(start + selector.length + 2, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

const light = block(":root");
const dark = block(':root[data-theme="dark"]');
const darkByMedia = block(':root:not([data-theme="light"])');

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const BACKGROUNDS = ["bg", "surface", "sunk"] as const;
const TEXT = ["ink", "muted", "faint", "accent", "rec", "debt-ink", "good", "warn", "bad", "idle"] as const;
const DATA = ["rec", "debt", "spend", "good", "warn", "bad", "idle", "faint", "muted"] as const;
const AA_TEXT = 4.5;
const AA_GRAPHICS = 3;

describe("dark mode colours", () => {
  it("are the same whether the reader's system or the page asks for dark", () => {
    expect(darkByMedia).toEqual(dark);
  });

  it.each(TEXT.flatMap((t) => BACKGROUNDS.map((b) => [t, b] as const)))("text %s on %s passes WCAG AA", (text, bg) => {
    expect(contrast(dark[text]!, dark[bg]!)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(DATA.flatMap((d) => BACKGROUNDS.map((b) => [d, b] as const)))("data colour %s on %s passes 3:1", (data, bg) => {
    expect(contrast(dark[data]!, dark[bg]!)).toBeGreaterThanOrEqual(AA_GRAPHICS);
  });

  it("keeps body text at about 13:1 and never above 14:1, so it does not glare", () => {
    const body = contrast(dark.ink!, dark.bg!);
    expect(body).toBeGreaterThanOrEqual(12);
    expect(body).toBeLessThanOrEqual(14);
  });

  it("has a warm background lifted off black, never navy", () => {
    const [r, g, b] = rgb(dark.bg!);
    expect(r).toBeGreaterThan(b!);
    expect(g).toBeGreaterThan(b!);
    expect(luminance(dark.bg!)).toBeGreaterThan(luminance("#141414"));
  });

  it("keeps blue out of the chrome: links and focus are not blue", () => {
    for (const token of ["accent", "focus"]) {
      const [r, , b] = rgb(dark[token]!);
      expect(r, token).toBeGreaterThan(b!);
    }
  });
});

describe("light mode colours", () => {
  it.each(["ink", "muted", "accent", "rec", "debt-ink", "good", "warn", "bad"].flatMap((t) => ["bg", "sunk"].map((b) => [t, b] as const)))(
    "text %s on %s passes WCAG AA",
    (text, bg) => {
      expect(contrast(light[text]!, light[bg]!)).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );
});

describe("the browser bar and the mark", () => {
  it("sets the dark theme-color to the dark background", () => {
    expect(file("app/layout.tsx")).toContain(`{ media: "(prefers-color-scheme: dark)", color: "${dark.bg}" }`);
  });

  it("draws the favicon with the same tile and colours as the mark in lib/brand.tsx", () => {
    const svg = file("app/icon.svg");
    const brand = file("lib/brand.tsx");
    const svgFills = [...svg.matchAll(/fill="(#[0-9a-f]{6})"/gi)].map((m) => m[1]!.toLowerCase());
    const brandFills = [...brand.matchAll(/(?:tile|fill): "(#[0-9a-f]{6})"/gi)].map((m) => m[1]!.toLowerCase());
    expect(svgFills).toEqual(brandFills);
    expect(svgFills[0]).toBe(dark.bg);
  });
});
