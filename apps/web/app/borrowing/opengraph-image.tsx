import { ImageResponse } from "next/og";
import { scaleLinear, scalePoint } from "d3-scale";
import { line } from "d3-shape";
import { getBorrowing } from "@/lib/data";
import { OG, ogFonts } from "@/lib/og";
import { MARK_DATA_URI } from "@/lib/brand";
import { gbpBn, signedBn } from "@/lib/format";
import { borrowingView, monthShort, ukDay } from "@/lib/borrowing-copy";

export const alt = "LedgerGov.UK: UK borrowing so far this year against the OBR's forecast path, month by month, from ONS figures";
export const size = OG.size;
export const contentType = "image/png";

/** The chart in the share image: running totals for this year, the OBR's path (dashed) and last year (faint). */
const CHART = { width: 500, height: 270, pad: 14 } as const;

export default async function Image() {
  const b = getBorrowing();
  const v = borrowingView(b);
  const fonts = await ogFonts();
  const { width: W, height: H, pad } = CHART;
  const all = [...b.outturn.cumulative, ...(b.profile?.cumulative ?? []), ...(b.last_year?.cumulative ?? [])];
  const y = scaleLinear().domain([Math.min(0, ...all), Math.max(...all)]).range([H - pad, pad]);
  const x = scalePoint<string>().domain(b.months).range([pad, W - pad]);
  const d = (values: number[]) =>
    line<number>()
      .x((_, i) => x(b.months[i]!) ?? 0)
      .y((val) => y(val))(values) ?? "";
  const n = b.outturn.cumulative.length;
  const tone = v.versus === "above" ? OG.bad : v.versus === "below" ? OG.good : OG.ink;
  const figure = (value: string, label: string, color: string) => (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontSize: 76, fontWeight: 600, letterSpacing: -2.5, color }}>{value}</div>
      <div style={{ display: "flex", fontSize: 24, color: OG.ink, marginTop: 2, maxWidth: 520 }}>{label}</div>
    </div>
  );

  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: OG.bg, color: OG.ink, padding: "52px 64px", fontFamily: "Geist" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 28, fontWeight: 600 }}>
        <img src={MARK_DATA_URI} width={28} height={28} alt="" />
        LedgerGov.UK · Borrowing
      </div>
      <div style={{ display: "flex", fontSize: 56, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05, marginTop: 30 }}>Borrowing so far this year</div>
      <div style={{ display: "flex", flex: 1, marginTop: 24, gap: 56 }}>
        <div style={{ display: "flex", flexDirection: "column", width: 516 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: "auto" }}>
            {v.diff !== null && v.versus
              ? figure(signedBn(v.diff), v.versus === "in line with" ? "in line with the OBR's forecast" : `${v.versus} the OBR's forecast for ${v.span}`, tone)
              : null}
            {figure(gbpBn(v.out), `borrowed from ${v.span}`, OG.debt)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", width: W }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke={OG.line} strokeWidth={2} />
            {b.last_year && <path d={d(b.last_year.cumulative)} fill="none" stroke={OG.muted} strokeOpacity={0.3} strokeWidth={4} />}
            {b.profile && <path d={d(b.profile.cumulative)} fill="none" stroke={OG.muted} strokeWidth={4} strokeDasharray="12 9" />}
            <path d={d(b.outturn.cumulative)} fill="none" stroke={OG.debt} strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(b.through) ?? 0} cy={y(b.outturn.cumulative[n - 1]!)} r={10} fill={OG.debt} />
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: OG.muted, marginTop: 8 }}>
            <span>{monthShort(b.months[0]!)}</span>
            <span>{b.profile ? "dashed: OBR forecast path" : ""}</span>
            <span>{monthShort(b.months.at(-1)!)}</span>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 22, fontSize: 20, color: OG.muted }}>
        {`ONS figures${b.release?.released_at ? ` published ${ukDay(b.release.released_at)}` : ""}${b.profile ? ` · OBR ${b.profile.edition} forecast path` : ""}`}
      </div>
    </div>,
    { ...size, fonts },
  );
}
