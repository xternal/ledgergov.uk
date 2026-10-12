import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSeed } from "@ledger/schema/seed";
import { RECEIPT_EXAMPLES, createModel, receiptBasis, taxReceipt } from "../src";
import type { ReceiptContext } from "../../../apps/web/lib/receipt-copy";
import {
  imageFileName,
  receiptImage,
  receiptImageContent,
  shareImage,
  type ImageEnv,
  type ReceiptPalette,
} from "../../../apps/web/lib/receipt-image";

/**
 * Your tax receipt never lets a reader's salary leave their browser (CLAUDE.md invariant 7): no request carries it, no
 * address holds it, nothing stores or counts it, and no route on the site takes one.
 */

const ROOT = resolve(import.meta.dirname, "../../..");
const WEB = join(ROOT, "apps/web");
const read = (path: string) => readFileSync(path, "utf8");

// ---------------------------------------------------------------- the calculator's code, and everything it imports

/** Resolve an import to a file in this repository, or null for an outside package (react, next). */
function resolveImport(from: string, spec: string): string | null {
  let base: string | null = null;
  if (spec.startsWith("@/")) base = join(WEB, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else if (spec === "@ledger/engine") base = join(ROOT, "packages/engine/src/index");
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`cannot resolve ${spec} from ${relative(ROOT, from)}`);
}

/** Every file of ours the entry points load (type-only imports carry no code and are skipped). */
function importGraph(entries: string[]): string[] {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const m of read(file).matchAll(/^\s*(?:import|export)\s+(type\s+)?(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/gm)) {
      if (m[1]) continue;
      const next = resolveImport(file, m[2]!);
      if (next) queue.push(next);
    }
  }
  return [...seen];
}

const ENTRIES = ["components/TaxReceipt.tsx", "components/ReceiptPaper.tsx", "lib/receipt-image.ts", "lib/receipt-copy.ts"].map((f) => join(WEB, f));

/** Ways code could send, keep or expose what the reader typed. */
const FORBIDDEN: [string, RegExp][] = [
  ["sends nothing over the network", /\bfetch\s*\(|XMLHttpRequest|sendBeacon|new\s+WebSocket|EventSource|\bimport\s*\(/],
  ["stores nothing", /localStorage|sessionStorage|indexedDB|document\.cookie|\bcaches\./],
  ["never writes the address", /history\.(?:push|replace)State|location\.(?:assign|replace)\s*\(|location\.(?:href|search|hash)\s*=|searchParams|useRouter|useSearchParams/],
  ["counts nothing", /\btrack\s*\(|lib\/analytics/],
  ["has no form that could submit", /<form\b|\bname=["{]/],
];

describe("the receipt's code in the browser", () => {
  const files = importGraph(ENTRIES);

  it("loads only our own small modules, and no server code", () => {
    const names = files.map((f) => relative(ROOT, f));
    expect(names).toContain("apps/web/components/ShareBar.tsx");
    expect(names.some((n) => n.startsWith("packages/server") || n.includes("/lib/data") || n.includes("/lib/receipt.ts"))).toBe(false);
  });

  it.each(FORBIDDEN)("%s", (_what, pattern) => {
    for (const file of files) {
      // ShareBar opens apps' share pages with the page's own address (no salary in it) and never fetches.
      const hits = read(file)
        .split("\n")
        .filter((line) => pattern.test(line) && !line.trim().startsWith("*") && !line.trim().startsWith("//"));
      expect(hits, relative(ROOT, file)).toEqual([]);
    }
  });

  it("keeps the salary input out of any form, with no name to submit it under", () => {
    const src = read(join(WEB, "components/TaxReceipt.tsx"));
    const input = src.slice(src.indexOf("<input"), src.indexOf("/>", src.indexOf("<input")));
    expect(input).toContain('id="receipt-salary"');
    expect(input).not.toMatch(/\bname=/);
    expect(src).not.toMatch(/<form\b/);
  });
});

// ---------------------------------------------------------------- the picture: drawn and shared without a request

const seed = loadSeed();
const basis = receiptBasis(createModel(seed.statement, seed.levers), seed.tax);
const ctx: ReceiptContext = {
  basis,
  lines: seed.statement.spending.map((l) => ({ id: l.id, label: l.label, desc: null, bn: l.bn, quality: l.quality, note: null, source: null, href: `/#line-${l.id}` })),
  taxYear: seed.tax.meta.tax_year,
  geography: seed.tax.meta.geography,
  taxQuality: seed.tax.meta.quality,
  taxSources: [],
  statementYear: seed.statement.meta.fiscal_year,
  statementLabel: seed.statement.meta.vintage_label,
  borrowing: { quality: "sourced", note: null, source: null, href: "/#line-borrowing" },
  printedUrl: "ledgergov.uk/receipt",
};
const palette: ReceiptPalette = { bg: "white", sunk: "grey", line: "grey", lineStrong: "grey", ink: "black", muted: "grey", debt: "orange", debtInk: "orange", debtSoft: "orange" };
const MARK = { tile: "brown", paths: [{ d: "M0 0h1v1z", fill: "blue" }] };
/** An unusual salary, so its digits cannot turn up by chance. */
const SALARY = 37_913;

/** A canvas that records the text drawn on it. */
function fakeEnv(share: { canShare: boolean; share?: (data: ShareData) => Promise<void> }) {
  const texts: string[] = [];
  const clicked: { download: string; href: string }[] = [];
  const pen = new Proxy(
    {},
    {
      get: (_t, key) => {
        if (key === "measureText") return (s: string) => ({ width: s.length * 12 });
        if (key === "fillText") return (s: string) => texts.push(s);
        return () => undefined;
      },
      set: () => true,
    },
  );
  const canvas = { width: 0, height: 0, getContext: () => pen, toBlob: (cb: (b: Blob) => void) => cb(new Blob(["png"], { type: "image/png" })) };
  const env: ImageEnv = {
    document: {
      createElement: ((tag: string) => {
        if (tag === "canvas") return canvas;
        const a = { href: "", download: "", click: () => clicked.push({ download: a.download, href: a.href }), remove: () => undefined };
        return a;
      }) as unknown as Document["createElement"],
      body: { appendChild: () => undefined } as unknown as HTMLElement,
      fonts: { load: async () => [] },
    },
    navigator: { canShare: () => share.canShare, share: share.share ?? (async () => undefined) },
    createObjectURL: () => "blob:local",
    revokeObjectURL: () => undefined,
  };
  return { env, texts, clicked };
}

describe("the receipt picture", () => {
  const fetchSpy = vi.fn(() => {
    throw new Error("no request may be made");
  });
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("XMLHttpRequest", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  const receipt = taxReceipt(basis, SALARY);
  const content = receiptImageContent(ctx, receipt, MARK);
  const digits = String(SALARY);
  const grouped = SALARY.toLocaleString("en-GB");

  it("shows the tax and its split, not the salary", async () => {
    const { env, texts } = fakeEnv({ canShare: false });
    await receiptImage(content, palette, "Geist", env);
    expect(texts.length).toBeGreaterThan(seed.statement.spending.length);
    expect(texts.join(" ")).not.toContain(digits);
    expect(texts.join(" ")).not.toContain(grouped);
    expect(JSON.stringify(content)).not.toContain(digits);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is shared as a file through the share sheet, with words that carry no salary", async () => {
    const shareSpy = vi.fn(async (_data: ShareData): Promise<void> => undefined);
    const { env, clicked } = fakeEnv({ canShare: true, share: shareSpy });
    const blob = await receiptImage(content, palette, "Geist", env);
    const outcome = await shareImage(blob, imageFileName(ctx), { title: "Your tax receipt", text: "Mine, from LedgerGov.UK: https://ledgergov.uk/receipt" }, env);
    expect(outcome).toBe("shared");
    expect(shareSpy).toHaveBeenCalledOnce();
    const data = shareSpy.mock.calls[0]![0];
    expect(data.files?.[0]?.name).toBe(imageFileName(ctx));
    expect(data.url).toBeUndefined();
    expect(JSON.stringify({ title: data.title, text: data.text, name: data.files?.[0]?.name })).not.toContain(digits);
    expect(clicked).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is downloaded from a local blob: link where files cannot be shared", async () => {
    const { env, clicked } = fakeEnv({ canShare: false });
    const blob = await receiptImage(content, palette, "Geist", env);
    expect(await shareImage(blob, imageFileName(ctx), { title: "t", text: "t" }, env)).toBe("downloaded");
    expect(clicked).toEqual([{ download: `tax-receipt-${ctx.taxYear}.png`, href: "blob:local" }]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to a download when the share sheet refuses, and does nothing when the reader closes it", async () => {
    const refused = fakeEnv({ canShare: true, share: async () => Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" })) });
    const blob = await receiptImage(content, palette, "Geist", refused.env);
    expect(await shareImage(blob, imageFileName(ctx), { title: "t", text: "t" }, refused.env)).toBe("downloaded");
    const closed = fakeEnv({ canShare: true, share: async () => Promise.reject(Object.assign(new Error("no"), { name: "AbortError" })) });
    expect(await shareImage(blob, imageFileName(ctx), { title: "t", text: "t" }, closed.env)).toBe("cancelled");
    expect(closed.clicked).toEqual([]);
  });
});

// ---------------------------------------------------------------- no route takes a salary

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("the site's routes", () => {
  const APP = join(WEB, "app");
  const files = walk(APP).filter((f) => /\.(ts|tsx)$/.test(f));
  const SALARY_WORDS = /salary|salaries|wage|earnings|\bincome\b/i;

  it("have no address segment named for a salary", () => {
    for (const f of files) {
      for (const segment of relative(APP, dirname(f)).split("/")) expect(segment, relative(ROOT, f)).not.toMatch(SALARY_WORDS);
    }
  });

  it("have no handler or page that reads a salary from a request", () => {
    // Anything that reads the request: a route handler, a server action, a page with search params.
    const readsRequest = /searchParams|nextUrl|formData\s*\(|\.json\s*\(\s*\)|"use server"/;
    for (const f of files.filter((x) => readsRequest.test(read(x)))) {
      const src = read(f);
      const reads = src.split("\n").filter((line) => readsRequest.test(line) && SALARY_WORDS.test(line));
      expect(reads, relative(ROOT, f)).toEqual([]);
      if (/\/route\.ts$/.test(f)) expect(src, relative(ROOT, f)).not.toMatch(/salary/i);
    }
  });

  it("serve /receipt as a static page and only the site's fixed examples under it", () => {
    const dir = join(APP, "receipt");
    const own = walk(dir).map((f) => relative(dir, f)).sort();
    expect(own).toEqual(["[example]/opengraph-image.tsx", "[example]/page.tsx", "opengraph-image.tsx", "page.tsx"]);
    for (const f of own) {
      const src = read(join(dir, f));
      expect(src, f).not.toMatch(/searchParams|Number\s*\(|parseInt|parseFloat|"use server"/);
      if (f.startsWith("[example]")) {
        expect(src, f).toMatch(/export const dynamicParams = false;/);
        expect(src, f).toMatch(/generateStaticParams\(\) \{\s*return RECEIPT_EXAMPLES\.map\(\(e\) => \(\{ example: e\.slug \}\)\);/);
      }
    }
    expect(RECEIPT_EXAMPLES.map((e) => e.slug)).toEqual(["25k", "35k", "50k", "100k"]);
  });
});
