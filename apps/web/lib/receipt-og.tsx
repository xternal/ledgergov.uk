import { ImageResponse } from "next/og";
import type { TaxReceipt } from "@ledger/engine";
import { OG, ogFonts } from "./og";
import { MARK_DATA_URI } from "./brand";
import { fixed, grouped, poundsPence } from "./format";
import { RECEIPT_LINE, RECEIPT_TITLE, borrowedPerPoundSpent, onTopPerPound, pence1, receiptRows, type ReceiptContext } from "./receipt-copy";

/**
 * Share cards (1200×630) for /receipt and the site's example receipts, drawn on the server. They show the split of £1 of
 * tax, or a fixed example salary's receipt: never a reader's salary, which never reaches the server.
 */

export const RECEIPT_PAGE_ALT =
  "LedgerGov.UK, Your tax receipt: what each £1 of income tax and National Insurance pays for, split like public spending, with the borrowing on top";
export const RECEIPT_EXAMPLE_ALT =
  "LedgerGov.UK: a till receipt for income tax and National Insurance on one of the site's example salaries, split by what the state spends it on, with the borrowing on top and the total";

/** Lines on the slip before "and N more": the page's card lists pence only; an example's slip also has its total. */
const SHOWN = 7;
const SHOWN_WITH_TOTAL = 6;
const PENCE_PER_POUND = 100;

interface SlipRow {
  label: string;
  value: string;
}

function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 26, fontWeight: 600 }}>
      <img src={MARK_DATA_URI} width={30} height={30} alt="" />
      LedgerGov.UK
    </div>
  );
}

/** A paper slip on the grey counter, like the receipt on the page. */
function Slip({ heading, rows, more, borrowed, total }: { heading: string; rows: SlipRow[]; more: string | null; borrowed: SlipRow; total: SlipRow | null }) {
  const line = { display: "flex", justifyContent: "space-between", gap: 24 } as const;
  return (
    <div style={{ display: "flex", width: SLIP_WIDTH, height: "100%", background: OG.sunk, padding: "34px 30px", borderRadius: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", width: "100%", background: OG.bg, padding: "26px 30px", fontSize: 22, color: OG.ink }}>
        <div style={{ display: "flex", flexShrink: 0, fontSize: 19, color: OG.muted, paddingBottom: 10, borderBottom: `2px solid ${OG.line}` }}>{heading}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, paddingTop: 12 }}>
          {rows.map((r) => (
            <div key={r.label} style={line}>
              <span>{r.label}</span>
              <span>{r.value}</span>
            </div>
          ))}
          {more && <div style={{ display: "flex", color: OG.muted, fontSize: 19 }}>{more}</div>}
        </div>
        <div style={{ ...line, marginTop: "auto", paddingTop: 12, borderTop: `2px solid ${OG.line}`, color: OG.debt, fontWeight: 600 }}>
          <span>{borrowed.label}</span>
          <span>{borrowed.value}</span>
        </div>
        {total && (
          <div style={{ ...line, marginTop: 10, paddingTop: 10, borderTop: `3px solid ${OG.ink}`, fontWeight: 600, fontSize: 22 }}>
            <span>{total.label}</span>
            <span>{total.value}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Left: the words; right: the slip. Both have fixed widths, so lines wrap inside them. */
const LEFT_WIDTH = 540;
const SLIP_WIDTH = 490;

function Card({ left, slip }: { left: React.ReactNode; slip: React.ReactNode }) {
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: OG.bg, color: OG.ink, padding: "52px 56px 52px 64px", gap: 50, fontFamily: "Geist" }}>
      <div style={{ display: "flex", flexDirection: "column", width: LEFT_WIDTH, height: "100%" }}>{left}</div>
      {slip}
    </div>
  );
}

/** /receipt: what each £1 of tax pays for. No salary at all. */
export async function receiptPageImage(ctx: ReceiptContext) {
  const fonts = await ogFonts();
  const per = (bn: number) => `${fixed((bn / ctx.basis.spending_bn) * PENCE_PER_POUND, 1)}p`;
  const rows = ctx.lines.slice(0, SHOWN).map((l) => ({ label: l.label, value: per(l.bn) }));
  const rest = ctx.lines.length - SHOWN;
  return new ImageResponse(
    <Card
      left={
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
          <Brand />
          <div style={{ display: "flex", fontSize: 72, fontWeight: 600, letterSpacing: -2.6, lineHeight: 1.02, marginTop: 40 }}>{RECEIPT_TITLE}</div>
          <div style={{ display: "flex", fontSize: 32, color: OG.muted, marginTop: 20, lineHeight: 1.25 }}>{RECEIPT_LINE}</div>
          <div style={{ display: "flex", fontSize: 24, color: OG.ink, marginTop: "auto", lineHeight: 1.35 }}>
            {`Enter a salary: your ${ctx.taxYear} income tax and National Insurance, line by line, worked out on your device.`}
          </div>
        </div>
      }
      slip={
        <Slip
          heading={`Each £1 of your tax, split like spending in ${ctx.statementYear}`}
          rows={rows}
          more={rest > 0 ? `and ${rest} more lines` : null}
          borrowed={{ label: "Borrowed on top", value: `+${pence1(onTopPerPound(ctx))}` }}
          total={null}
        />
      }
    />,
    { ...OG.size, fonts },
  );
}

/** An example receipt: the site's fixed salary, its tax and the top of its split. */
export async function receiptExampleImage(ctx: ReceiptContext, salary: number, r: TaxReceipt) {
  const fonts = await ogFonts();
  const all = receiptRows(ctx, r);
  const rows = all.slice(0, SHOWN_WITH_TOTAL).map(({ info, pence }) => ({ label: info.label, value: poundsPence(pence) }));
  const rest = all.length - SHOWN_WITH_TOTAL;
  return new ImageResponse(
    <Card
      left={
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
          <Brand />
          <div style={{ display: "flex", fontSize: 30, color: OG.muted, marginTop: 34 }}>{`${RECEIPT_TITLE}, ${ctx.taxYear}`}</div>
          <div style={{ display: "flex", fontSize: 56, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05, marginTop: 8 }}>{`On £${grouped(salary)} a year`}</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", gap: 4 }}>
            <div style={{ display: "flex", fontSize: 24, color: OG.muted }}>Income tax and National Insurance</div>
            <div style={{ display: "flex", fontSize: 64, fontWeight: 600, letterSpacing: -2.4 }}>{poundsPence(r.tax_pence)}</div>
            <div style={{ display: "flex", fontSize: 24, color: OG.debt, fontWeight: 600, marginTop: 10 }}>
              {`+ ${poundsPence(r.borrowed_pence)} borrowed on top, ${pence1(borrowedPerPoundSpent(ctx))} of every £1 spent`}
            </div>
          </div>
        </div>
      }
      slip={
        <Slip
          heading={`Split like spending in ${ctx.statementYear}`}
          rows={rows}
          more={rest > 0 ? `and ${rest} more lines` : null}
          borrowed={{ label: "Borrowed on top", value: poundsPence(r.borrowed_pence) }}
          total={{ label: "Spent on your behalf", value: poundsPence(r.spent_pence) }}
        />
      }
    />,
    { ...OG.size, fonts },
  );
}
