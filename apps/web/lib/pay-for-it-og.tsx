import { ImageResponse } from "next/og";
import { ALL, EVERY_LINE, payFor, type PayResult } from "@ledger/engine";
import { COSTED_BY_LABEL } from "@ledger/schema";
import { OG, ogFonts } from "./og";
import { MARK_DATA_URI } from "./brand";
import { gbpBn } from "./format";
import { PAY_TITLE } from "./pay-for-it-copy";
import {
  FIRST_PLEDGE,
  borrowingHeadline,
  costRange,
  cutPhrase,
  payOptions,
  pctText,
  signedRange,
  shareWords,
  taxPhrase,
  unitsText,
  type PayData,
} from "./pay-for-it-view";

/** Spending grey (styles/tokens.css --spend, light). */
const SPEND = "#52525B";
const HATCH = (color: string) => `repeating-linear-gradient(45deg, ${color} 0 6px, #FDE3D3 6px 12px)`;

export const PAY_INDEX_ALT =
  "LedgerGov.UK, Pay for it: the £2 bus fare cap's yearly cost, and what paying for it with a tax, a cut to every area of spending, or borrowing would take";

function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 26, fontWeight: 600 }}>
      <img src={MARK_DATA_URI} width={28} height={28} alt="" />
      {`LedgerGov.UK · ${PAY_TITLE}`}
    </div>
  );
}

/** A shared plan's image: the pledge and its cost, who pays (a bar and its key), and the change in borrowing with its range. */
export async function planImage(data: PayData, r: PayResult) {
  const fonts = await ogFonts();
  const pledge = data.pledges.find((p) => p.id === r.pledge.id)!;
  const tax = r.tax && data.taxes.find((t) => t.lever_id === r.tax!.lever_id)!;
  const cut = r.cut && data.cuts.find((c) => c.id === r.cut!.line_id)!;
  const rows: { color: string; hatch?: boolean; share: number; words: string; value: string }[] = [
    ...(r.tax && tax ? [{ color: OG.rec, share: r.tax.share, words: `Tax: ${taxPhrase(tax, r.tax.units)}`, value: `${gbpBn(r.tax.raises_bn[1])} (${costRange(r.tax.raises_bn)})` }] : []),
    ...(r.cut && cut ? [{ color: SPEND, share: r.cut.share, words: `Cut: ${cutPhrase(cut, r.cut.pct_of_line)}`, value: gbpBn(r.cut.amount_bn) }] : []),
    ...(r.shares.borrow > 0 ? [{ color: OG.debt, hatch: true, share: r.shares.borrow, words: `Borrowed: ${shareWords[r.shares.borrow]} of it`, value: gbpBn(r.borrowed_bn) }] : []),
  ];
  const by = pledge.costed_by ? `; ${pledge.costed_by.name} (${COSTED_BY_LABEL[pledge.costed_by.kind]})` : "";
  const up = r.d_borrowing_bn[1] > 0.0005;
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: OG.bg, color: OG.ink, padding: "48px 64px", fontFamily: "Geist" }}>
      <Brand />
      <div style={{ display: "flex", fontSize: 54, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05, marginTop: 30, maxWidth: 1060 }}>{pledge.headline}</div>
      <div style={{ display: "flex", fontSize: 24, color: OG.ink, marginTop: 10 }}>{pledge.who}</div>
      <div style={{ display: "flex", fontSize: 24, color: OG.muted, marginTop: 6 }}>{`Costs ${gbpBn(pledge.cost_bn[1])} a year, range ${costRange(pledge.cost_bn)}${by}`}</div>
      <div style={{ display: "flex", height: 26, marginTop: 26, borderRadius: 13, overflow: "hidden", background: OG.sunk }}>
        {rows.map((x) => (
          <div key={x.words} style={{ display: "flex", width: `${x.share}%`, height: "100%", background: x.hatch ? HATCH(x.color) : x.color }} />
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
        {rows.map((x) => (
          <div key={x.words} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", width: 16, height: 16, borderRadius: 3, background: x.hatch ? HATCH(x.color) : x.color }} />
              {x.words}
            </div>
            <div style={{ display: "flex", fontWeight: 600 }}>{x.value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 20, marginTop: "auto" }}>
        <div style={{ display: "flex", fontSize: 44, fontWeight: 600, letterSpacing: -1.4, color: up ? OG.debt : OG.ink }}>{borrowingHeadline(r.d_borrowing_bn)}</div>
        <div style={{ display: "flex", fontSize: 24, color: OG.muted }}>{`range ${signedRange(r.d_borrowing_bn)}`}</div>
      </div>
      <div style={{ display: "flex", marginTop: 14, fontSize: 19, color: OG.muted }}>
        A reader&apos;s plan on LedgerGov.UK. HMRC&apos;s and official figures, no wider economic effects; not a forecast.
      </div>
    </div>,
    { ...OG.size, fonts },
  );
}

/** /pay-for-it's image: the first pledge paid for in full three ways, so the share shows the idea with real figures. */
export async function payIndexImage(data: PayData) {
  const fonts = await ogFonts();
  const opts = payOptions(data);
  const pledge = data.pledges.find((p) => p.id === FIRST_PLEDGE)!;
  const tax = data.taxes[0]!;
  const byTax = payFor(opts, { pledge_id: pledge.id, tax: { lever_id: tax.lever_id, share: ALL }, cut: null });
  const byCut = payFor(opts, { pledge_id: pledge.id, tax: null, cut: { line_id: EVERY_LINE, share: ALL } });
  const borrowed = payFor(opts, { pledge_id: pledge.id, tax: null, cut: null });
  const ways = [
    { title: "A tax", value: unitsText(tax, byTax.tax!.units), label: tax.on, color: OG.rec },
    { title: "A cut", value: pctText(byCut.cut!.pct_of_line), label: "from every area of spending", color: SPEND },
    { title: "Borrowing", value: gbpBn(borrowed.d_borrowing_bn[1]), label: `more a year, range ${costRange(borrowed.d_borrowing_bn)}`, color: OG.debt },
  ];
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: OG.bg, color: OG.ink, padding: "52px 64px", fontFamily: "Geist" }}>
      <Brand />
      <div style={{ display: "flex", fontSize: 62, fontWeight: 600, letterSpacing: -2.4, lineHeight: 1.05, marginTop: 36, maxWidth: 1060 }}>Every promise has a price tag</div>
      <div style={{ display: "flex", fontSize: 28, color: OG.muted, marginTop: 14 }}>{`${pledge.headline}: ${gbpBn(pledge.cost_bn[1])} a year. Three ways to pay for it:`}</div>
      <div style={{ display: "flex", gap: 48, marginTop: "auto" }}>
        {ways.map((w) => (
          <div key={w.title} style={{ display: "flex", flexDirection: "column", flex: 1, borderTop: `4px solid ${w.color}`, paddingTop: 14 }}>
            <div style={{ display: "flex", fontSize: 24, color: OG.muted }}>{w.title}</div>
            <div style={{ display: "flex", fontSize: 62, fontWeight: 600, letterSpacing: -2.2, marginTop: 4 }}>{w.value}</div>
            <div style={{ display: "flex", fontSize: 22, color: OG.ink, marginTop: 4 }}>{w.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", marginTop: 26, fontSize: 20, color: OG.muted }}>
        Pick any costed pledge, from any party, and choose. HMRC&apos;s and official figures, as ranges on the site.
      </div>
    </div>,
    { ...OG.size, fonts },
  );
}

/** For an unknown plan: the site's name and the page's, nothing else. */
export async function plainPayImage() {
  const fonts = await ogFonts();
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: OG.bg, color: OG.ink, fontSize: 48, alignItems: "center", justifyContent: "center", fontFamily: "Geist" }}>
      {`LedgerGov.UK · ${PAY_TITLE}`}
    </div>,
    { ...OG.size, fonts },
  );
}
