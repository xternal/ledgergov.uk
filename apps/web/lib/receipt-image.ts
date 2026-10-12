import type { TaxReceipt } from "@ledger/engine";
import { poundsPence } from "./format";
import { RECEIPT_TITLE, borrowedPerPoundSpent, illustrationText, pence1, receiptRows, type ReceiptContext } from "./receipt-copy";

/**
 * The image of a reader's own tax receipt, drawn in their browser on a canvas and shared as a file (Web Share API) or
 * downloaded. Nothing here makes a network request, and the salary is not on the image: only the tax and its split
 * (CLAUDE.md invariant 7). The page passes the browser what it needs as plain values; tests pass a fake canvas.
 *
 * Portrait, 1080 by 1350 (4:5): the image is posted as a picture, not a link preview, and 4:5 is the tallest shape
 * the main apps show uncropped in a feed or a chat, which suits a receipt's long list.
 */
export const RECEIPT_IMAGE = { width: 1080, height: 1350 } as const;

/** Colours from styles/tokens.css (the light theme: a receipt is paper), read on the server by lib/receipt.ts. */
export interface ReceiptPalette {
  bg: string;
  sunk: string;
  line: string;
  lineStrong: string;
  ink: string;
  muted: string;
  debt: string;
  debtInk: string;
  debtSoft: string;
}

/** The site's mark (lib/brand.tsx MARK): a tile and the paths drawn on it, in a 64 by 64 box. */
export interface BrandMark {
  tile: string;
  paths: readonly { d: string; fill: string }[];
}

/** What the image shows. Amounts in pence; no salary. */
export interface ReceiptImageContent {
  mark: BrandMark;
  title: string;
  /** "Tax year 2026-27, England, Wales and Northern Ireland" */
  subtitle: string;
  incomeTax: number;
  ni: number;
  tax: number;
  rows: { label: string; pence: number }[];
  borrowed: number;
  /** "9.8p of every £1 the state spent was borrowed" */
  borrowedNote: string;
  spent: number;
  /** Small print at the foot: what it is, and the sources. */
  footnotes: string[];
  /** "ledgergov.uk/receipt" */
  printedUrl: string;
}

/** The part of a canvas 2D context the drawing uses (a real CanvasRenderingContext2D in the browser). */
export type Pen = Pick<
  CanvasRenderingContext2D,
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "font"
  | "textAlign"
  | "textBaseline"
  | "fillRect"
  | "fillText"
  | "measureText"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "closePath"
  | "fill"
  | "stroke"
  | "setLineDash"
  | "save"
  | "restore"
  | "translate"
  | "scale"
  | "rect"
  | "clip"
>;

const W = RECEIPT_IMAGE.width;
const PAPER = { left: 108, right: W - 108, top: 40, bottom: RECEIPT_IMAGE.height - 40, tooth: 12, pad: 60 } as const;
const INNER = { left: PAPER.left + PAPER.pad, right: PAPER.right - PAPER.pad } as const;
const MARK_PX = 44;
const MARK_VIEWBOX = 64;
const HATCH_STEP = 6;

/** Words that fit a width, broken at spaces. */
export function wrap(pen: Pen, text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && pen.measureText(next).width > width) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

/** The paper: a white slip with zigzag top and bottom edges, on the grey counter. */
function paper(pen: Pen, p: ReceiptPalette) {
  const { left, right, top, bottom, tooth } = PAPER;
  pen.fillStyle = p.sunk;
  pen.fillRect(0, 0, W, RECEIPT_IMAGE.height);
  pen.beginPath();
  pen.moveTo(left, top + tooth);
  for (let x = left; x < right; x += 2 * tooth) {
    pen.lineTo(x + tooth, top);
    pen.lineTo(Math.min(x + 2 * tooth, right), top + tooth);
  }
  pen.lineTo(right, bottom - tooth);
  for (let x = right; x > left; x -= 2 * tooth) {
    pen.lineTo(x - tooth, bottom);
    pen.lineTo(Math.max(x - 2 * tooth, left), bottom - tooth);
  }
  pen.closePath();
  pen.fillStyle = p.bg;
  pen.fill();
}

function rule(pen: Pen, p: ReceiptPalette, y: number, style: "dashed" | "solid" | "double") {
  pen.save();
  pen.strokeStyle = style === "dashed" ? p.lineStrong : p.ink;
  pen.lineWidth = 2;
  pen.setLineDash(style === "dashed" ? [8, 7] : []);
  for (const dy of style === "double" ? [0, 6] : [0]) {
    pen.beginPath();
    pen.moveTo(INNER.left, y + dy);
    pen.lineTo(INNER.right, y + dy);
    pen.stroke();
  }
  pen.restore();
}

/** Borrowing is hatched as well as orange, as on the site: colour is never the only signal. */
function hatch(pen: Pen, p: ReceiptPalette, x: number, y: number, size: number) {
  pen.save();
  pen.beginPath();
  pen.rect(x, y, size, size);
  pen.clip();
  pen.fillStyle = p.debtSoft;
  pen.fillRect(x, y, size, size);
  pen.strokeStyle = p.debt;
  pen.lineWidth = 3;
  for (let d = -size; d < size; d += HATCH_STEP) {
    pen.beginPath();
    pen.moveTo(x + d, y + size);
    pen.lineTo(x + d + size, y);
    pen.stroke();
  }
  pen.restore();
}

/** The site's mark, drawn from its own paths. Skipped where the canvas cannot draw SVG paths. */
function mark(pen: Pen, brand: BrandMark, x: number, y: number, path: ((d: string) => Path2D) | null) {
  if (!path) return;
  const ctx = pen as CanvasRenderingContext2D;
  pen.save();
  pen.translate(x, y);
  pen.scale(MARK_PX / MARK_VIEWBOX, MARK_PX / MARK_VIEWBOX);
  pen.fillStyle = brand.tile;
  ctx.fill(path(`M14 0h36a14 14 0 0 1 14 14v36a14 14 0 0 1-14 14H14A14 14 0 0 1 0 50V14A14 14 0 0 1 14 0z`));
  for (const m of brand.paths) {
    pen.fillStyle = m.fill;
    ctx.fill(path(m.d));
  }
  pen.restore();
}

/** Draw the receipt. `family` is the page's font stack (Geist), already loaded. */
export function paintReceipt(pen: Pen, c: ReceiptImageContent, p: ReceiptPalette, family: string, path: ((d: string) => Path2D) | null = null) {
  const font = (px: number, weight = 400) => `${weight} ${px}px ${family}`;
  const centre = W / 2;
  const row = (y: number, label: string, amount: string, px: number, weight: number, colour: string) => {
    pen.font = font(px, weight);
    pen.fillStyle = colour;
    pen.textAlign = "left";
    pen.fillText(label, INNER.left, y);
    pen.textAlign = "right";
    pen.fillText(amount, INNER.right, y);
  };
  pen.textBaseline = "alphabetic";
  paper(pen, p);

  // Heading: the mark and the site's name, the title, the tax year.
  let y = PAPER.top + PAPER.tooth + 40;
  pen.font = font(30, 600);
  const brand = "LedgerGov.UK";
  const brandWidth = MARK_PX + 14 + pen.measureText(brand).width;
  const brandLeft = centre - brandWidth / 2;
  mark(pen, c.mark, brandLeft, y, path);
  pen.fillStyle = p.ink;
  pen.textAlign = "left";
  pen.fillText(brand, brandLeft + MARK_PX + 14, y + 32);
  y += MARK_PX + 76;
  pen.textAlign = "center";
  pen.font = font(58, 600);
  pen.fillText(c.title, centre, y);
  y += 42;
  pen.font = font(24);
  pen.fillStyle = p.muted;
  pen.fillText(c.subtitle, centre, y);
  y += 30;
  rule(pen, p, y, "dashed");

  // What you pay.
  y += 44;
  row(y, "Income tax", poundsPence(c.incomeTax), 28, 400, p.ink);
  y += 40;
  row(y, "National Insurance", poundsPence(c.ni), 28, 400, p.ink);
  y += 22;
  rule(pen, p, y, "solid");
  y += 44;
  row(y, "You pay a year", poundsPence(c.tax), 32, 600, p.ink);
  y += 28;
  rule(pen, p, y, "dashed");

  // What it pays for.
  y += 36;
  pen.font = font(22);
  pen.fillStyle = p.muted;
  pen.textAlign = "left";
  pen.fillText("What it pays for", INNER.left, y);
  const rowGap = Math.min(38, Math.floor(400 / Math.max(1, c.rows.length)));
  for (const r of c.rows) {
    y += rowGap;
    row(y, r.label, poundsPence(r.pence), 26, 400, p.ink);
  }
  y += 30;
  rule(pen, p, y, "dashed");

  // Borrowed on top, and the total.
  y += 44;
  hatch(pen, p, INNER.left, y - 22, 24);
  pen.font = font(28, 600);
  pen.fillStyle = p.debtInk;
  pen.textAlign = "left";
  pen.fillText("Borrowed on top", INNER.left + 36, y);
  pen.textAlign = "right";
  pen.fillText(poundsPence(c.borrowed), INNER.right, y);
  y += 32;
  pen.font = font(21);
  pen.fillStyle = p.muted;
  pen.textAlign = "left";
  pen.fillText(c.borrowedNote, INNER.left + 36, y);
  y += 26;
  rule(pen, p, y, "double");
  y += 54;
  row(y, "Spent on your behalf", poundsPence(c.spent), 36, 600, p.ink);
  y += 30;
  rule(pen, p, y, "dashed");

  // Small print and the address.
  pen.font = font(20);
  pen.fillStyle = p.muted;
  pen.textAlign = "center";
  for (const note of c.footnotes) {
    for (const line of wrap(pen, note, INNER.right - INNER.left)) {
      y += 28;
      pen.fillText(line, centre, y);
    }
  }
  y += 44;
  pen.font = font(26, 600);
  pen.fillStyle = p.ink;
  pen.fillText(c.printedUrl, centre, y);
}

/** The image's content for a receipt: the tax and its split, never the salary. */
export function receiptImageContent(ctx: ReceiptContext, r: TaxReceipt, brand: BrandMark): ReceiptImageContent {
  return {
    mark: brand,
    title: RECEIPT_TITLE,
    subtitle: `Tax year ${ctx.taxYear}, ${ctx.geography}`,
    incomeTax: r.income_tax_pence,
    ni: r.ni_pence,
    tax: r.tax_pence,
    rows: receiptRows(ctx, r).map(({ info, pence }) => ({ label: info.label, pence })),
    borrowed: r.borrowed_pence,
    borrowedNote: `${pence1(borrowedPerPoundSpent(ctx))} of every £1 the state spent was borrowed`,
    spent: r.spent_pence,
    footnotes: [illustrationText, `Rates: GOV.UK and HMRC, ${ctx.taxYear}. Spending: ${ctx.statementYear}, ${ctx.statementLabel}.`],
    printedUrl: ctx.printedUrl,
  };
}

/** The file name the picture is saved or shared as: the tax year, nothing about the reader. */
export const imageFileName = (ctx: ReceiptContext) => `tax-receipt-${ctx.taxYear}.png`;

/** What the drawing and the sharing need from the browser. Tests pass fakes. */
export interface ImageEnv {
  document: Pick<Document, "createElement" | "body"> & { fonts?: { load(font: string): Promise<unknown> } };
  navigator?: Partial<Pick<Navigator, "share" | "canShare">>;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  makePath?: (d: string) => Path2D;
}

export function browserEnv(): ImageEnv {
  return {
    document,
    navigator,
    createObjectURL: (b) => URL.createObjectURL(b),
    revokeObjectURL: (u) => URL.revokeObjectURL(u),
    makePath: typeof Path2D === "undefined" ? undefined : (d) => new Path2D(d),
  };
}

/** Draw the receipt to a PNG, in the page's own font once it has loaded. */
export async function receiptImage(c: ReceiptImageContent, p: ReceiptPalette, family: string, env: ImageEnv): Promise<Blob> {
  // Wait for the weights the image uses, so the first draw is not in a fallback font.
  await Promise.all([400, 600].map((w) => env.document.fonts?.load(`${w} 40px ${family}`).catch(() => undefined)));
  const canvas = env.document.createElement("canvas");
  canvas.width = RECEIPT_IMAGE.width;
  canvas.height = RECEIPT_IMAGE.height;
  const pen = canvas.getContext("2d");
  if (!pen) throw new Error("This browser cannot draw the image.");
  paintReceipt(pen, c, p, family, env.makePath ?? null);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("This browser cannot make the image."))), "image/png"));
}

export type ShareOutcome = "shared" | "downloaded" | "cancelled";

/** Save a file the browser holds, with a temporary local link (blob:), never a request. */
export function downloadImage(blob: Blob, name: string, env: ImageEnv) {
  const href = env.createObjectURL(blob);
  const a = env.document.createElement("a");
  a.href = href;
  a.download = name;
  env.document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => env.revokeObjectURL(href), 1_000);
}

/**
 * Share the image as a file through the device's share sheet where it can take files (most phones), else download it.
 * The words that go with it carry the page's address, never the salary.
 */
export async function shareImage(blob: Blob, name: string, words: { title: string; text: string }, env: ImageEnv): Promise<ShareOutcome> {
  const file = new File([blob], name, { type: "image/png" });
  const nav = env.navigator;
  if (nav?.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: words.title, text: words.text });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
      // Not allowed (some browsers drop the tap's permission while the image was being made): save it instead.
    }
  }
  downloadImage(blob, name, env);
  return "downloaded";
}

/** Can this browser share files? Checked once in the browser; the server renders the download version. */
export function canShareFiles(env: ImageEnv): boolean {
  try {
    return !!env.navigator?.share && !!env.navigator.canShare?.({ files: [new File([""], "receipt.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}
