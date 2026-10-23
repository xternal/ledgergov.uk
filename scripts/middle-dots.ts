/**
 * pnpm check:dots: no middle-dot (·) separators anywhere on the site (docs/DESIGN_HANDOFF.md, Visual direction; Pavel's
 * rule for his pages and posts, 23 October 2026). Items are set apart by layout (a gap, a line break) or a comma.
 *
 * Two checks share the finder below. packages/server/test/middle-dots.test.ts reads every string and every piece of
 * JSX text in the app's code, so a dot fails `pnpm test` on any route, dynamic or not, before anything is built. This
 * script runs after `pnpm build` in CI and reads every page the build rendered: its HTML, its React payload, and route
 * bodies such as llms.txt and the feeds. So a dot that arrives with the data (a card, a source's title) fails too.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const BUILT = join(ROOT, "apps/web/.next/server/app");

// The middle dot and the characters that look like it, as text, as HTML entities, and as JSON escapes.
const DOT = /[\u00B7\u0387\u2027\u2219\u22C5\u30FB\uFF65]|&(?:middot|centerdot|#0*183|#x0*b7);|\\u00b7/gi;

/** Each middle dot in `text`, with a little of what is around it; none means the text is clean. */
export function middleDots(text: string): string[] {
  return [...text.matchAll(DOT)].map((m) => text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, " ").trim());
}

/** Every file under `dir` whose name ends with one of `ends`. */
export function filesUnder(dir: string, ends: readonly string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path, ends);
    return ends.some((e) => name.endsWith(e)) ? [path] : [];
  });
}

/** Whether a route body the build wrote is text a reader gets (a page in Markdown, a feed, JSON, SVG), not an image. */
function isText(body: string): boolean {
  const meta = body.replace(/\.body$/, ".meta");
  if (!existsSync(meta)) return !readFileSync(body).includes(0);
  const type = (JSON.parse(readFileSync(meta, "utf8")) as { headers?: Record<string, string> }).headers?.["content-type"] ?? "";
  return /^(text\/|image\/svg|application\/([\w.+-]*\+)?(json|xml)\b)/.test(type);
}

function main() {
  let files: string[];
  try {
    files = filesUnder(BUILT, [".html", ".rsc", ".body"]).filter((f) => !f.endsWith(".body") || isText(f));
  } catch {
    throw new Error(`No build at ${relative(ROOT, BUILT)}: run pnpm build first.`);
  }
  const pages = files.filter((f) => f.endsWith(".html")).length;
  if (!pages) throw new Error(`The build at ${relative(ROOT, BUILT)} has no rendered pages: run pnpm build first.`);
  const problems = files.flatMap((f) => middleDots(readFileSync(f, "utf8")).map((s) => `${relative(BUILT, f)}: …${s}…`));
  for (const p of problems) console.error(p);
  console.log(`Middle dots: ${pages} rendered pages and ${files.length - pages} payloads and route bodies read, ${problems.length} ${problems.length === 1 ? "dot" : "dots"} found.`);
  if (problems.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
