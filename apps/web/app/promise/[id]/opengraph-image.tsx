import { ImageResponse } from "next/og";
import { getSeed } from "@/lib/data";
import { OG, ogFonts } from "@/lib/og";
import { STATUS_LABEL } from "@/lib/copy";
import { fixed, gbp, gbpBn, longDate, perHousehold, rangeText, shareOf } from "@/lib/format";
import { costSense, whoLine } from "@/lib/promises";
import { MARK_DATA_URI } from "@/lib/brand";
import { forecastGap, type ForecastGap } from "@ledger/schema";

export const alt = "A LedgerGov.UK promise card: the quote, its status, cost, per household and who pays";
export const size = OG.size;
export const contentType = "image/png";

export function generateStaticParams() {
  return getSeed().cards.map((c) => ({ id: c.id }));
}

const STATUS_COLOR: Record<string, string> = {
  delivered: OG.good,
  failed: OG.bad,
  quietly_dropped: OG.bad,
  in_plan: OG.rec,
  legislated: OG.rec,
  funded: "#A3480A",
  delivering: "#A3480A",
  promised: OG.muted,
  unscoreable: OG.muted,
};
const MAX_QUOTE_CHARS = 150;

/** The target's zone and line and the forecast's mark on one scale, with the gap in words (OpenPromises decision 36), as on the card page. */
function gapScale(g: ForecastGap) {
  const W = 1200 - 128;
  const at = (x: number) => Math.min(1, Math.max(0, x / g.max)) * W;
  const t = at(g.metric.target);
  const f = at(g.baseline.value);
  const label = (x: number, top: number, color: string, s: string) => {
    const right = x > W * 0.6;
    return <div style={{ display: "flex", position: "absolute", top, ...(right ? { right: W - x } : { left: Math.max(0, x - 40) }), fontSize: 24, fontWeight: 600, color, whiteSpace: "nowrap" }}>{s}</div>;
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto", paddingTop: 20, borderTop: `2px solid ${OG.line}` }}>
      <div style={{ display: "flex", position: "relative", height: 92 }}>
        <div style={{ display: "flex", position: "absolute", top: 38, left: 0, width: W, height: 14, borderRadius: 7, background: OG.sunk, border: `1px solid ${OG.line}` }} />
        <div style={{ display: "flex", position: "absolute", top: 38, height: 14, borderRadius: 7, background: OG.good, opacity: 0.3, ...(g.ceiling ? { left: 0, width: t } : { left: t, width: W - t }) }} />
        <div style={{ display: "flex", position: "absolute", top: 28, left: t - 3, width: 6, height: 34, borderRadius: 3, background: OG.good }} />
        <div style={{ display: "flex", position: "absolute", top: 29, left: f - 16, width: 32, height: 32, borderRadius: 16, background: OG.ink, border: `5px solid ${OG.bg}` }} />
        {label(f, -2, OG.ink, `${g.forecastLabel}, ${g.baseline.by.name}`)}
        {label(t, 64, OG.good, g.targetLabel)}
      </div>
      <div style={{ display: "flex", fontSize: 28, fontWeight: 600 }}>{g.words}</div>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seed = getSeed();
  const card = seed.cards.find((c) => c.id === id)!;
  const fonts = await ogFonts();
  const p = card.current.parameters;
  const sense = p?.how_much_bn_per_year ? costSense(p.how_much_bn_per_year) : null;
  const cost = sense?.abs ?? null;
  const spending = seed.statement.spending.reduce((a, l) => a + l.bn, 0);
  const hh = (x: number) => gbp(perHousehold(x, seed.statement.macro.households_m));
  const gap = forecastGap(p ?? undefined);
  const quote = card.current.text.length > MAX_QUOTE_CHARS ? `${card.current.text.slice(0, MAX_QUOTE_CHARS - 1).trimEnd()}…` : card.current.text;
  const stat = (label: string, value: string, sub: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
      <div style={{ fontSize: 22, color: OG.muted }}>{label}</div>
      <div style={{ fontSize: 42, fontWeight: 600, letterSpacing: -1.2 }}>{value}</div>
      <div style={{ fontSize: 20, color: OG.muted }}>{sub}</div>
    </div>
  );
  const forecastWhen = gap ? `The forecast was published on ${longDate(gap.baseline.published_on)}, before the promise` : null;
  const funding = p === null ? "Unscoreable: no who, how much, when or from where" : p.funded_by ? `Paid for by: ${p.funded_by}` : "Funding not stated when it was announced";
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: OG.bg, color: OG.ink, padding: "52px 64px", fontFamily: "Geist" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 26, fontWeight: 600 }}>
          <img src={MARK_DATA_URI} width={26} height={26} alt="" />
          LedgerGov.UK
        </div>
        <div style={{ display: "flex", fontSize: 24, fontWeight: 600, color: STATUS_COLOR[card.file.status] ?? OG.ink, border: `2px solid ${STATUS_COLOR[card.file.status] ?? OG.ink}`, padding: "4px 16px", borderRadius: 999 }}>
          {card.broughtAboutBy ? `${STATUS_LABEL[card.file.status]} by ${card.broughtAboutBy.name}` : STATUS_LABEL[card.file.status]}
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 24, color: OG.muted, marginTop: 34 }}>{`${whoLine(card)}, ${longDate(card.file.made_on)}`}</div>
      <div style={{ display: "flex", fontSize: 46, fontWeight: 600, letterSpacing: -1.4, lineHeight: 1.15, marginTop: 10 }}>{`“${quote}”`}</div>
      {gap ? (
        gapScale(gap)
      ) : cost ? (
        <div style={{ display: "flex", gap: 36, marginTop: "auto", paddingTop: 24, borderTop: `2px solid ${OG.line}` }}>
          {stat(sense?.raises ? "Raises a year" : "Costs a year", gbpBn(cost[1]), `range ${rangeText(cost, gbpBn)}`)}
          {stat(sense?.raises ? "Per household, on average" : "Per household", hh(cost[1]), `range ${rangeText(cost, hh)}`)}
          {stat("Share of spending", `${fixed(shareOf(cost[1], spending), 2)}%`, `of ${gbpBn(spending)}`)}
        </div>
      ) : (
        <div style={{ display: "flex", marginTop: "auto", paddingTop: 24, borderTop: `2px solid ${OG.line}`, fontSize: 30, color: OG.muted }}>
          {p === null ? "Not costable" : "Cost not stated or not yet costed"}
        </div>
      )}
      <div style={{ display: "flex", fontSize: 22, color: forecastWhen || !p?.funded_by ? OG.muted : OG.ink, marginTop: 18 }}>{forecastWhen ?? (funding.length > 120 ? `${funding.slice(0, 119)}…` : funding)}</div>
    </div>,
    { ...size, fonts },
  );
}
