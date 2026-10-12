"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { taxReceipt, type TaxReceipt as Receipt } from "@ledger/engine";
import { grouped, poundsPence } from "@/lib/format";
import { RECEIPT_IMAGE_ALT, RECEIPT_LINE, RECEIPT_TITLE, borrowedPerPoundSpent, pence1, receiptRows, type ReceiptContext } from "@/lib/receipt-copy";
import {
  RECEIPT_IMAGE,
  browserEnv,
  canShareFiles,
  downloadImage,
  imageFileName,
  receiptImage,
  receiptImageContent,
  shareImage,
  type ReceiptPalette,
} from "@/lib/receipt-image";
import { MARK } from "@/lib/brand";
import { ReceiptPaper, ReceiptTable } from "./ReceiptPaper";
import { ShareBar } from "./ShareBar";

/** Up to £999,999,999: more digits are ignored as you type. */
const MAX_DIGITS = 9;
/** Arrow keys move the salary by £1,000; with Shift, by £10,000. */
const STEP = 1_000;
const BIG_STEP = 10_000;
/** Wait for typing to pause before announcing the result or redrawing the image. */
const SETTLE_MS = 600;

const digitsOf = (s: string) => s.replace(/\D/g, "");

function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/**
 * "Your tax receipt": the reader types a salary and sees their income tax and National Insurance split by what the
 * state spends it on, with the borrowing on top, and can share it as an image.
 *
 * Privacy (CLAUDE.md invariant 7): the salary lives in this component's state only. It is never sent (this file makes
 * no request), never put in the address or a link, never stored and never counted. The input has no name and sits in
 * no form, so pressing Enter submits nothing. The image is drawn on this device and shows the tax, not the salary.
 * packages/server/test/receipt-privacy.test.ts checks all of this.
 */
export function TaxReceipt({
  ctx,
  palette,
  initialSalary,
  examples,
  pageUrl,
}: {
  ctx: ReceiptContext;
  palette: ReceiptPalette;
  initialSalary: number;
  /** The site's example salaries, as quick picks. */
  examples: number[];
  /** The page's own address, without any salary, for the share buttons. */
  pageUrl: string;
}) {
  const [salary, setSalary] = useState(initialSalary);
  const receipt = useMemo(() => taxReceipt(ctx.basis, salary), [ctx.basis, salary]);
  const settled = useSettled(receipt, SETTLE_MS);
  const settledSalary = useSettled(salary, SETTLE_MS);

  // Keep the caret after the same digit when the thousands separators move.
  const input = useRef<HTMLInputElement>(null);
  const caretDigits = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = input.current;
    const n = caretDigits.current;
    caretDigits.current = null;
    if (!el || n === null || document.activeElement !== el) return;
    let pos = 0;
    for (let seen = 0; pos < el.value.length && seen < n; pos++) if (/\d/.test(el.value[pos]!)) seen++;
    el.setSelectionRange(pos, pos);
  });

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    caretDigits.current = digitsOf(raw.slice(0, e.target.selectionStart ?? raw.length)).length;
    const digits = digitsOf(raw).slice(0, MAX_DIGITS);
    setSalary(digits ? Number(digits) : 0);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const step = e.shiftKey ? BIG_STEP : STEP;
    // To the next round step up or down: £521,500 goes to £522,000 or £521,000.
    const next = (s: number) => (e.key === "ArrowUp" ? Math.floor(s / step) * step + step : Math.ceil(s / step) * step - step);
    setSalary((s) => Math.min(10 ** MAX_DIGITS - 1, Math.max(0, next(s))));
  };

  // Phones: the salary, the receipt, then sharing. Wider screens: the salary and sharing on the left, the receipt on the right.
  return (
    <div className="grid items-start gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,460px)] md:grid-rows-[auto_1fr] md:gap-x-12">
      <div className="grid content-start gap-6 md:col-start-1 md:row-start-1">
        <div className="grid gap-2 rounded-panel border border-line p-5">
          <label htmlFor="receipt-salary" className="text-label font-medium text-muted">
            Your salary, before tax, a year
          </label>
          <div className="relative">
            <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[24px] font-semibold text-faint">
              £
            </span>
            <input
              ref={input}
              id="receipt-salary"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
              aria-describedby="receipt-salary-note"
              value={salary ? grouped(salary) : ""}
              placeholder="0"
              onChange={onChange}
              onKeyDown={onKeyDown}
              className="w-full rounded-control border border-line-strong bg-bg py-2.5 pl-8 pr-3 text-[24px] font-semibold tracking-[-0.02em] text-ink"
            />
          </div>
          <p id="receipt-salary-note" className="m-0 text-caption text-muted">
            Worked out on this device. Your salary is never sent to us, never put in a link and never stored.
          </p>
          <div className="mt-2 grid gap-1.5">
            <span className="text-caption text-muted">Or try</span>
            <div className="flex flex-wrap gap-2">
              {examples.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={salary === s}
                  onClick={() => setSalary(s)}
                  className="inline-flex min-h-9 cursor-pointer items-center rounded-full bg-bg px-3 text-label font-medium text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] hover:shadow-[inset_0_0_0_1px_var(--ink)] aria-pressed:bg-sunk aria-pressed:shadow-[inset_0_0_0_1px_var(--ink)]"
                >
                  £{grouped(s)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <Summary ctx={ctx} receipt={receipt} />
      </div>

      <div className="grid gap-4 md:col-start-2 md:row-span-2 md:row-start-1">
        <div className="rounded-panel bg-sunk px-3 py-6 sm:px-6">
          <ReceiptPaper ctx={ctx} receipt={receipt} headingId="receipt-h" />
        </div>
        {/* Announced once typing pauses, not on every key. */}
        <p className="sr-only" aria-live="polite">
          {settled.tax_pence > 0
            ? `You pay ${poundsPence(settled.tax_pence)} a year. With the borrowing on top, the state spent ${poundsPence(settled.spent_pence)} on your behalf.`
            : "No income tax or National Insurance on this salary."}
        </p>
        <ReceiptTable ctx={ctx} receipt={receipt} id="receipt-table" />
      </div>

      <div className="grid content-start gap-8 md:col-start-1 md:row-start-2">
        <ShareImage ctx={ctx} palette={palette} receipt={settled} ready={settledSalary === salary} pageUrl={pageUrl} />
        <div className="grid gap-2">
          <h2 className="m-0 text-body font-semibold">Or share the page</h2>
          <p className="m-0 text-label text-muted">The link opens this page with no salary in it, so each person sees their own.</p>
          <ShareBar url={pageUrl} title={`${RECEIPT_TITLE} | LedgerGov.UK`} text={RECEIPT_LINE} label="Share the page" />
        </div>
      </div>
    </div>
  );
}

/** The three numbers in one line each, above the share buttons. */
function Summary({ ctx, receipt }: { ctx: ReceiptContext; receipt: Receipt }) {
  if (receipt.tax_pence === 0) {
    return <p className="m-0 text-body text-muted">On this salary you pay no income tax or National Insurance, so your receipt is empty.</p>;
  }
  const biggest = receiptRows(ctx, receipt)[0]!;
  return (
    <p className="m-0 text-body">
      You pay <strong className="font-semibold">{poundsPence(receipt.tax_pence)}</strong> a year. The biggest line is {biggest.info.label.toLowerCase()},{" "}
      {poundsPence(biggest.pence)}. On top, the state borrowed <strong className="font-semibold text-debt-ink">{poundsPence(receipt.borrowed_pence)}</strong> in
      your name: {pence1(borrowedPerPoundSpent(ctx))} of every £1 it spent.
    </p>
  );
}

/**
 * The receipt as an image, drawn on this device once typing pauses, so a tap on Share can open the share sheet at once
 * (some phones refuse a share that starts long after the tap). Shared as a file, or downloaded where files cannot be shared.
 */
function ShareImage({ ctx, palette, receipt, ready, pageUrl }: { ctx: ReceiptContext; palette: ReceiptPalette; receipt: Receipt; ready: boolean; pageUrl: string }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [files, setFiles] = useState(false);
  const [status, setStatus] = useState("");
  const name = imageFileName(ctx);
  const content = useMemo(() => receiptImageContent(ctx, receipt, MARK), [ctx, receipt]);

  useEffect(() => setFiles(canShareFiles(browserEnv())), []);

  useEffect(() => {
    let live = true;
    let url: string | null = null;
    const env = browserEnv();
    receiptImage(content, palette, getComputedStyle(document.body).fontFamily, env)
      .then((b) => {
        if (!live) return;
        url = env.createObjectURL(b);
        setBlob(b);
        setPreview(url);
      })
      .catch(() => live && setStatus("This browser could not draw the image."));
    return () => {
      live = false;
      if (url) env.revokeObjectURL(url);
    };
  }, [content, palette]);

  const busy = !blob || !ready;
  const share = async () => {
    if (!blob) return;
    const outcome = await shareImage(blob, name, { title: RECEIPT_TITLE, text: `${RECEIPT_LINE} Mine, from LedgerGov.UK: ${pageUrl}` }, browserEnv());
    setStatus(outcome === "downloaded" ? `Saved as ${name}.` : outcome === "shared" ? "Shared." : "");
  };
  const download = () => {
    if (!blob) return;
    downloadImage(blob, name, browserEnv());
    setStatus(`Saved as ${name}.`);
  };

  return (
    <div className="grid gap-3">
      <h2 className="m-0 text-body font-semibold">Share your receipt as a picture</h2>
      <p className="m-0 text-label text-muted">
        The picture is made on this device. It shows your tax, not your salary, though anyone could work one out from the other. Nothing is sent to us.
      </p>
      <div className="flex flex-wrap items-start gap-4">
        {preview && (
          // A picture made in the browser (a blob: address), so a plain img, not next/image.
          <img
            src={preview}
            width={RECEIPT_IMAGE.width}
            height={RECEIPT_IMAGE.height}
            alt={RECEIPT_IMAGE_ALT(ctx)}
            className="h-auto w-[120px] rounded-control shadow-[0_0_0_1px_var(--line)]"
          />
        )}
        <div className="grid gap-2">
          <button
            type="button"
            onClick={files ? share : download}
            disabled={busy}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control bg-ink px-5 text-[15px] font-semibold text-bg hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {files ? "Share the picture" : "Download the picture"}
          </button>
          {files && (
            <button
              type="button"
              onClick={download}
              disabled={busy}
              className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-full bg-bg px-3 text-label font-medium text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] hover:shadow-[inset_0_0_0_1px_var(--ink)] disabled:cursor-wait disabled:opacity-60"
            >
              Download instead
            </button>
          )}
          <span aria-live="polite" className="text-label text-muted">
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}
