import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RECEIPT_EXAMPLES, createModel, findReceiptExample, receiptBasis, taxReceipt, type ReceiptExample, type TaxReceipt } from "@ledger/engine";
import type { Seed } from "@ledger/schema";
import { getSeed, getVintages } from "./data";
import { CATCH_ALL_LINES } from "./chart-config";
import { absolute } from "./site";
import { RECEIPT_PATH, type ReceiptContext, type ReceiptSource } from "./receipt-copy";
import type { ReceiptPalette } from "./receipt-image";

/**
 * "Your tax receipt" on the server: the receipt's context from the data build (the tax year's rates, the Statement's
 * spending lines with their sources and editions) and the site's fixed example receipts. The reader's own salary never
 * reaches this file: their receipt is worked out in the browser (components/TaxReceipt.tsx).
 */

/** The Statement's own line for borrowing, which the receipt's "borrowed on top" links to (components/Sankey.tsx BORROWING_ID). */
const BORROWING_LINE = "borrowing";
const lineHref = (id: string) => `/#line-${id}`;

let cached: ReceiptContext | null = null;

/** The edition of a source the build holds: the newest, which is the one the Statement uses. */
function editionOf(sourceId: string): string | null {
  const s = getVintages().manifest.sources.find((x) => x.id === sourceId);
  return s?.freshness?.vintage ?? s?.vintages?.at(-1) ?? null;
}

function sourceOf(seed: Seed, sourceId: string | undefined): ReceiptSource | null {
  const s = sourceId ? seed.sources.find((x) => x.id === sourceId) : undefined;
  return s ? { title: s.title, url: s.url, edition: editionOf(s.id) } : null;
}

export function getReceiptContext(): ReceiptContext {
  if (cached) return cached;
  const seed = getSeed();
  const { statement, tax } = seed;
  const basis = receiptBasis(createModel(statement, seed.levers), tax);
  const value = (id: string) => basis.spending.find((l) => l.id === id)?.bn ?? 0;
  // The Statement's order (components/Sankey.tsx useFlowLines): largest first, catch-all lines last.
  const last = (id: string) => Number(CATCH_ALL_LINES.has(id));
  const lines = [...statement.spending]
    .sort((a, b) => last(a.id) - last(b.id) || value(b.id) - value(a.id))
    .map((l) => ({
      id: l.id,
      label: l.label,
      desc: l.desc ?? null,
      bn: value(l.id),
      quality: l.quality,
      note: l.method_note ?? null,
      source: sourceOf(seed, l.source_id),
      href: lineHref(l.id),
    }));
  const taxSources = (tax.meta.sources ?? []).map((s) => ({ title: s.title, url: s.url, edition: s.vintage ?? null }));
  if (taxSources.length < 2) throw new Error("receipt: the tax rates need their income tax and National Insurance pages (data/build/app.json tax.meta.sources)");
  cached = {
    basis,
    lines,
    taxYear: tax.meta.tax_year,
    geography: tax.meta.geography,
    taxQuality: tax.meta.quality,
    taxSources,
    statementYear: statement.meta.fiscal_year,
    statementLabel: statement.meta.vintage_label,
    borrowing: {
      quality: statement.borrowing_provenance.quality,
      note: statement.borrowing_provenance.method_note ?? null,
      source: sourceOf(seed, statement.borrowing_provenance.source_id),
      href: lineHref(BORROWING_LINE),
    },
    printedUrl: absolute(RECEIPT_PATH).replace(/^https?:\/\/(www\.)?/, ""),
  };
  return cached;
}

/** One of the site's example receipts, drawn on the server with the same function the reader's browser runs. */
export function exampleReceipt(slug: string): { example: ReceiptExample; receipt: TaxReceipt } | null {
  const example = findReceiptExample(slug);
  return example ? { example, receipt: taxReceipt(getReceiptContext().basis, example.salary) } : null;
}

export const receiptExamples = () => RECEIPT_EXAMPLES.map((e) => ({ example: e, receipt: taxReceipt(getReceiptContext().basis, e.salary) }));

/**
 * The light theme's colours, read from styles/tokens.css, for the image the reader's browser draws: a receipt is paper,
 * so it is drawn light whatever the page's theme, like the site's share cards.
 */
export function lightPalette(): ReceiptPalette {
  const css = readFileSync(join(process.cwd(), "styles", "tokens.css"), "utf8");
  const start = css.indexOf(":root {");
  const block = css.slice(start, css.indexOf("}", start));
  const tokens = Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
  const pick = (name: string) => {
    const v = tokens[name];
    if (!v) throw new Error(`receipt: styles/tokens.css has no --${name} in :root`);
    return v;
  };
  return {
    bg: pick("bg"),
    sunk: pick("sunk"),
    line: pick("line"),
    lineStrong: pick("line-strong"),
    ink: pick("ink"),
    muted: pick("muted"),
    debt: pick("debt"),
    debtInk: pick("debt-ink"),
    debtSoft: pick("debt-soft"),
  };
}
