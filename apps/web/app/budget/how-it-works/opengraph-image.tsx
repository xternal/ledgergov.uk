import { ImageResponse } from "next/og";
import { getFiscalTargets } from "@/lib/data";
import { OG, ogFonts } from "@/lib/og";
import { MARK_DATA_URI } from "@/lib/brand";
import { BUDGET, budgetDay } from "@/lib/budget";
import { RULES, headroomView } from "@/lib/headroom";
import { gbpBn } from "@/lib/format";

export const alt = "LedgerGov.UK: the Chancellor's headroom against each fiscal rule at each OBR forecast, from the OBR's own tables";
export const size = OG.size;
export const contentType = "image/png";
export const revalidate = 3600;

const BAR_MAX_PX = 560;

/** The share card: the headroom against the two fiscal rules at each OBR assessment, as bars, with the latest stated. */
export default async function Image() {
  const v = headroomView(getFiscalTargets());
  const rules = v.rules.filter((r) => r.rule !== "welfare_cap");
  const hi = Math.max(...rules.flatMap((r) => r.points.map((p) => Math.abs(p.margin.value))), 1);
  const fonts = await ogFonts();
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: OG.bg, color: OG.ink, padding: "44px 60px", fontFamily: "Geist" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, fontWeight: 600 }}>
        <img src={MARK_DATA_URI} width={24} height={24} alt="" />
        {`LedgerGov.UK · ${BUDGET.name}`}
      </div>
      <div style={{ display: "flex", fontSize: 46, fontWeight: 600, letterSpacing: -1.5, lineHeight: 1.05, marginTop: 16 }}>How a Budget works: the Chancellor&apos;s headroom</div>
      <div style={{ display: "flex", fontSize: 22, color: OG.muted, marginTop: 10 }}>
        {`How far the OBR's forecast is from breaking each fiscal rule in ${rules[0]?.targetYear ?? ""}`}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 26 }}>
        {rules.map((r) => (
          <div key={r.rule} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", fontSize: 22, fontWeight: 600 }}>{RULES[r.rule].name}</div>
            {r.points.map((p) => {
              const latest = p.vintage === v.latest.vintage;
              return (
                <div key={p.vintage} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ display: "flex", width: 180, fontSize: 19, color: latest ? OG.ink : OG.muted }}>{p.edition}</div>
                  <div
                    style={{
                      display: "flex",
                      height: 20,
                      width: Math.max(4, (Math.abs(p.margin.value) / hi) * BAR_MAX_PX),
                      background: p.margin.value < 0 ? OG.debt : OG.rec,
                      opacity: latest ? 1 : 0.42,
                      borderRadius: 3,
                    }}
                  />
                  <div style={{ display: "flex", fontSize: 21, fontWeight: latest ? 600 : 400 }}>{gbpBn(p.margin.value)}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", marginTop: "auto", fontSize: 19, color: OG.muted }}>
        {`OBR, ${v.latest.edition} forecast, ${v.latest.table}${v.since?.status === "not_assessed" ? `; no assessment in ${v.since.edition}` : ""}. Budget day: ${budgetDay()}`}
      </div>
    </div>,
    { ...OG.size, fonts },
  );
}
