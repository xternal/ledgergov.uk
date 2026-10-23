import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { filesUnder, middleDots } from "../../../scripts/middle-dots";

/**
 * No middle-dot (·) separators anywhere on the site (docs/DESIGN_HANDOFF.md, Visual direction; Pavel's rule for his
 * pages and posts, 23 October 2026): items are set apart by layout or a comma. This reads every string and every piece
 * of JSX text the pages, components, share images and route handlers are made from, comments aside, so it covers every
 * route without a build. After the build, CI reads the rendered pages too (scripts/middle-dots.ts).
 */

const ROOT = join(import.meta.dirname, "../../..");
const CODE = [".ts", ".tsx"];
/** Where the site's words come from: the app, and the packages whose text it shows or serves. */
const SOURCES = [
  ...["app", "components", "lib"].flatMap((d) => filesUnder(join(ROOT, "apps/web", d), CODE)),
  ...["schema", "engine", "server"].flatMap((p) => filesUnder(join(ROOT, "packages", p, "src"), CODE)),
  // The harvest writes the editors' intake pull requests on GitHub, which are not pages of the site.
].filter((f) => !f.includes("/packages/server/src/harvest/"));
const TEXT = [...filesUnder(join(ROOT, "apps/web/public"), [".txt", ".md", ".xml", ".json", ".webmanifest", ".svg"]), ...filesUnder(join(ROOT, "apps/web/styles"), [".css"])];

/** The text a source file can put on a page: string literals, template text and JSX text, each with its line. */
function shownText(path: string, code = readFileSync(path, "utf8")): { line: number; text: string }[] {
  const src = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: { line: number; text: string }[] = [];
  const visit = (n: ts.Node) => {
    // `.text` is the string as it runs (escapes such as \xB7 decoded); JSX text keeps its entities, such as &middot;.
    if (ts.isStringLiteral(n) || ts.isTemplateLiteralToken(n) || ts.isJsxText(n)) out.push({ line: src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1, text: n.text ?? "" });
    ts.forEachChild(n, visit);
  };
  visit(src);
  return out;
}

describe("middle dots", () => {
  it("are found as a character, a look-alike, an HTML entity or a JSON escape", () => {
    for (const s of ["Made by Pavel Guzhikov · guzh.uk", "a\u0387b", "a \u22C5 b", "a&middot;b", "a &#183; b", "a&#xB7;b", '{"t":"a\\u00b7b"}']) expect(middleDots(s), s).toHaveLength(1);
    for (const s of ["Made by Pavel Guzhikov, guzh.uk", "3.5% of spending", "• a list", "a — b", "&amp;mid"]) expect(middleDots(s), s).toEqual([]);
  });

  it("are in none of the text the site's code shows, serves or draws into its share images", () => {
    expect(SOURCES.length).toBeGreaterThan(200);
    const found = SOURCES.flatMap((f) => shownText(f).flatMap(({ line, text }) => middleDots(text).map((s) => `${relative(ROOT, f)}:${line}: ${s}`)));
    expect(found).toEqual([]);
  });

  it("are in none of the app's static text files or styles", () => {
    expect(TEXT.length).toBeGreaterThan(0);
    const found = TEXT.flatMap((f) => middleDots(readFileSync(f, "utf8")).map((s) => `${relative(ROOT, f)}: ${s}`));
    expect(found).toEqual([]);
  });

  it("are looked for in strings, templates and JSX text, not in comments, which no reader sees", () => {
    const code = ["// a · comment", "/* a · block */", 'export const s = "a · b";', "export const E = () => <p>{/* · */}c&middot;d{`e \\xB7 f`}</p>;"].join("\n");
    expect(shownText("sample.tsx", code).flatMap((t) => middleDots(t.text))).toEqual(["a · b", "c&middot;d", "e · f"]);
    expect(shownText(join(ROOT, "apps/web/lib/method-og.tsx")).some((t) => t.text.trim() === "LedgerGov.UK")).toBe(true);
  });
});
