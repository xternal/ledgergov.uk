"use client";

import { useId, useState, type ReactNode } from "react";
import type { Quality } from "@ledger/schema";
import type { TaxReceipt } from "@ledger/engine";
import { LogoMark } from "@/lib/brand";
import { poundsPence } from "@/lib/format";
import {
  RECEIPT_TITLE,
  borrowedPerPoundSpent,
  borrowedText,
  illustrationText,
  lineShareText,
  pct1,
  pence1,
  ratesText,
  receiptRows,
  type ReceiptContext,
  type ReceiptSource,
} from "@/lib/receipt-copy";
import { QualityBadge, TextButton } from "./ui";

/** The weaker of two qualities: a figure is only as good as what it is made from. */
const RANK: Record<Quality, number> = { sourced: 0, approx: 1, modelled: 2, training: 3 };
const weaker = (a: Quality, b: Quality): Quality => (RANK[a] >= RANK[b] ? a : b);

/** A figure whose source shows on hover or keyboard focus (DESIGN_HANDOFF principle 4), with the edition of each source. */
export function Sourced({
  quality,
  text,
  sources,
  children,
  align = "end",
}: {
  quality: Quality;
  text: string;
  sources: (ReceiptSource | null)[];
  children: ReactNode;
  /** "end" opens the tip leftwards, for figures at the right edge. */
  align?: "start" | "end";
}) {
  const id = useId();
  return (
    <span className="tip-host inline-flex" tabIndex={0} aria-describedby={id}>
      {children}
      <span className="tip text-left" role="tooltip" id={id} data-align={align}>
        <span className="grid gap-1">
          <QualityBadge quality={quality} />
          <span>{text}</span>
          {sources
            .filter((s): s is ReceiptSource => !!s)
            .map((s) => (
              <a key={s.url + s.edition} href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium">
                {s.title}
                {s.edition ? `, edition ${s.edition}` : ""}
              </a>
            ))}
        </span>
      </span>
    </span>
  );
}

const rowClass = "flex items-baseline justify-between gap-4";
const lineLink = "text-ink decoration-line-strong hover:decoration-ink";

/**
 * The receipt, laid out like a till receipt: what you pay, what it pays for (each line linked to its part of the
 * Statement), the borrowing on top and the total. Used by the calculator (the reader's own, in their browser) and by
 * the site's example pages (drawn on the server). It never sees a salary, only the receipt.
 */
export function ReceiptPaper({ ctx, receipt, heading = RECEIPT_TITLE, headingId }: { ctx: ReceiptContext; receipt: TaxReceipt; heading?: string; headingId: string }) {
  const rates = ratesText(ctx);
  const [incomeTaxSource, niSource] = ctx.taxSources;
  const rows = receiptRows(ctx, receipt);
  const share = borrowedPerPoundSpent(ctx);
  const spentQuality = weaker(ctx.taxQuality, ctx.borrowing.quality);

  return (
    <section aria-labelledby={headingId} className="receipt-paper relative isolate mx-auto w-full max-w-[460px] px-5 py-9 text-[14px] sm:px-8 sm:text-[15px]">
      <header className="grid justify-items-center gap-1 text-center">
        <span className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
          <LogoMark />
          LedgerGov.UK
        </span>
        <h2 id={headingId} className="m-0 mt-2 text-[24px] font-semibold leading-tight tracking-[-0.02em]">
          {heading}
        </h2>
        <p className="m-0 text-caption text-muted">
          Tax year {ctx.taxYear}, {ctx.geography}
        </p>
      </header>

      <dl className="m-0 mt-5 grid gap-1.5 border-t border-dashed border-line-strong pt-4">
        <div className={rowClass}>
          <dt>Income tax</dt>
          <dd className="m-0">
            <Sourced quality={ctx.taxQuality} text={`Income tax for ${ctx.taxYear}. ${rates.incomeTax}`} sources={[incomeTaxSource ?? null]}>
              {poundsPence(receipt.income_tax_pence)}
            </Sourced>
          </dd>
        </div>
        <div className={rowClass}>
          <dt>National Insurance</dt>
          <dd className="m-0">
            <Sourced quality={ctx.taxQuality} text={`${rates.ni} Rates for ${ctx.taxYear}.`} sources={[niSource ?? null]}>
              {poundsPence(receipt.ni_pence)}
            </Sourced>
          </dd>
        </div>
        <div className={`${rowClass} mt-1 border-t border-line-strong pt-2 font-semibold`}>
          <dt>You pay a year</dt>
          <dd className="m-0">
            <Sourced quality={ctx.taxQuality} text={`Income tax plus National Insurance, at ${ctx.taxYear} rates.`} sources={ctx.taxSources}>
              {poundsPence(receipt.tax_pence)}
            </Sourced>
          </dd>
        </div>
      </dl>

      <div className="mt-5 border-t border-dashed border-line-strong pt-4">
        <h3 className="m-0 text-caption font-medium text-muted">What it pays for, split like spending in {ctx.statementYear}</h3>
        <dl className="m-0 mt-2 grid gap-1.5">
          {rows.map(({ info, pence }) => (
            <div key={info.id} className={rowClass}>
              <dt className="min-w-0">
                <a href={info.href} className={lineLink}>
                  {info.label}
                </a>
              </dt>
              <dd className="m-0 shrink-0">
                <Sourced quality={weaker(ctx.taxQuality, info.quality)} text={`${lineShareText(ctx, info)}${info.note ? ` ${info.note}` : ""}`} sources={[info.source, ...ctx.taxSources]}>
                  {poundsPence(pence)}
                </Sourced>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <dl className="m-0 mt-5 grid gap-1 border-t border-dashed border-line-strong pt-4">
        <div className={`${rowClass} font-semibold text-debt-ink`}>
          <dt className="flex items-center gap-2">
            <i className="hatch inline-block size-3 rounded-[2px]" aria-hidden />
            <a href={ctx.borrowing.href} className="text-debt-ink decoration-current">
              Borrowed on top
            </a>
          </dt>
          <dd className="m-0">
            <Sourced quality={weaker(ctx.taxQuality, ctx.borrowing.quality)} text={borrowedText(ctx)} sources={[ctx.borrowing.source]}>
              {poundsPence(receipt.borrowed_pence)}
            </Sourced>
          </dd>
        </div>
        <p className="m-0 pl-5 text-caption text-muted">{pence1(share)} of every £1 the state spent was borrowed</p>
        <div className={`${rowClass} mt-3 border-t-[3px] border-double border-ink pt-3 text-[17px] font-semibold sm:text-[18px]`}>
          <dt>Spent on your behalf</dt>
          <dd className="m-0">
            <Sourced quality={spentQuality} text="Your tax plus the borrowing on top: what the state spent in your name, at the Statement's split." sources={[...ctx.taxSources, ctx.borrowing.source]}>
              {poundsPence(receipt.spent_pence)}
            </Sourced>
          </dd>
        </div>
      </dl>

      <footer className="mt-5 grid gap-1 border-t border-dashed border-line-strong pt-4 text-center text-caption text-muted">
        <p className="m-0">{illustrationText}</p>
        <p className="m-0">
          Rates: GOV.UK and HMRC, {ctx.taxYear}. Spending: {ctx.statementYear}, {ctx.statementLabel}.
        </p>
      </footer>
    </section>
  );
}

/** The receipt as a table (CLAUDE.md: a table view of every chart), with each line's share and its source's edition. */
export function ReceiptTable({ ctx, receipt, id }: { ctx: ReceiptContext; receipt: TaxReceipt; id: string }) {
  const [open, setOpen] = useState(false);
  const rows = receiptRows(ctx, receipt);
  const cell = "py-2 pr-4";
  return (
    <div>
      <TextButton aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {open ? "Hide table" : "Show as table"}
      </TextButton>
      {open && (
        <div id={id} role="region" aria-label="Your tax receipt as a table" tabIndex={0} className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse whitespace-nowrap text-sm">
            <caption className="sr-only">
              Income tax and National Insurance for {ctx.taxYear}, split by the Statement&apos;s spending in {ctx.statementYear}, with the borrowing on top
            </caption>
            <thead>
              <tr className="border-b border-line text-left text-[12.5px] text-muted">
                <th className={`${cell} font-medium`}>Line</th>
                <th className={`${cell} text-right font-medium`}>Share of spending</th>
                <th className={`${cell} text-right font-medium`}>Your tax</th>
                <th className="py-2 font-medium">Source and edition</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ info, pence }) => (
                <tr key={info.id} className="border-b border-line">
                  <th scope="row" className={`${cell} text-left font-normal`}>
                    {info.label}
                  </th>
                  <td className={`${cell} text-right`}>{pct1(info.bn / ctx.basis.spending_bn)}</td>
                  <td className={`${cell} text-right`}>{poundsPence(pence)}</td>
                  <td className="py-2 text-muted">{info.source ? `${info.source.title}${info.source.edition ? `, ${info.source.edition}` : ""}` : ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-b border-line font-semibold">
                <th scope="row" className={`${cell} text-left`}>
                  You pay a year
                </th>
                <td className={`${cell} text-right`}>{pct1(1)}</td>
                <td className={`${cell} text-right`}>{poundsPence(receipt.tax_pence)}</td>
                <td className="py-2 font-normal text-muted">{ctx.taxSources.map((s) => `${s.title}${s.edition ? `, ${s.edition}` : ""}`).join("; ")}</td>
              </tr>
              <tr className="border-b border-line">
                <th scope="row" className={`${cell} text-left font-normal`}>
                  Borrowed on top
                </th>
                <td className={`${cell} text-right`}></td>
                <td className={`${cell} text-right`}>{poundsPence(receipt.borrowed_pence)}</td>
                <td className="py-2 text-muted">{ctx.borrowing.source ? `${ctx.borrowing.source.title}${ctx.borrowing.source.edition ? `, ${ctx.borrowing.source.edition}` : ""}` : ""}</td>
              </tr>
              <tr className="font-semibold">
                <th scope="row" className={`${cell} text-left`}>
                  Spent on your behalf
                </th>
                <td className={`${cell} text-right`}></td>
                <td className={`${cell} text-right`}>{poundsPence(receipt.spent_pence)}</td>
                <td className="py-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
