import { ImageResponse } from "next/og";
import type { HouseholdSnapshot } from "@ledger/schema";
import { EXAMPLE_SALARIES } from "@ledger/server/model";
import { getHouseholdSnapshots } from "@/lib/data";
import { OG, ogFonts } from "@/lib/og";
import { MARK_DATA_URI } from "@/lib/brand";
import { gbpWhole, gbpYear, householdCopy, pct2 } from "@/lib/household";
import { ratesChangedYears, salaryCheckYear, salaryExamples } from "@/lib/salary-check";

// One alt for every state of the page: the picture is a bar chart of what the Budget does to household incomes, from
// our estimate by income tenth, the example households, the Treasury's own chart or the salary check (see barsFor).
export const alt =
  "LedgerGov.UK: what a Budget does to household incomes, as a bar chart: by income tenth from the lowest incomes to the highest, for example households, or on example salaries";
export const size = OG.size;
export const contentType = "image/png";

export function generateStaticParams() {
  return getHouseholdSnapshots().map((s) => ({ event: s.id }));
}

/** Chart area, px: bars grow up or down from the zero line. */
const CHART_H = 280;
const CHART_W = 1080;

interface Bars {
  caption: string;
  bars: { label: string; value: number; text: string }[];
  foot: string;
}

/**
 * What the share card shows (householdView): the decile chart for the headline year; while the deciles wait for
 * review (the fallback rule), the six example households; while those wait too, or before PolicyEngine has answered,
 * the Treasury's own chart; with no chart either, the salary check on the example single adults' three salaries.
 */
function barsFor(s: HouseholdSnapshot): Bars {
  const c = householdCopy(s);
  const model = s.provider ? `An estimate, not official, with PolicyEngine UK ${s.provider.model_version}` : "";
  const follows = c.view.state === "no_model" ? "Our own estimate follows once PolicyEngine answers" : "Our own estimate follows once an editor has checked it";
  if (c.view.share === "deciles" && c.headResult && c.better !== null && c.worse !== null)
    return {
      caption: `Change in income after tax and benefits, ${c.head}, by income tenth (1 = lowest)`,
      bars: c.headResult.deciles.map((d) => ({ label: String(d.decile), value: d.rel_change_pct, text: pct2(d.rel_change_pct) })),
      foot: `${model}: ${Math.round(c.better * 100)}% of households better off, ${Math.round(c.worse * 100)}% worse off`,
    };
  if (c.view.share === "households" && c.headHouseholds)
    return {
      caption: `Six example households: change in income after tax and benefits, ${c.head}, £ a year`,
      bars: c.headHouseholds.rows.map((r, i) => ({ label: String(i + 1), value: r.change_gbp, text: gbpYear(r.change_gbp) })),
      foot: `${model}. 1 to 3: single adults on three salaries; 4: a couple with two children; 5: a lone parent; 6: pensioners`,
    };
  const t = s.input.treasury;
  if (c.view.share === "treasury" && t)
    return {
      caption: `The Treasury's estimate, ${t.year}: taxes and welfare by income tenth, % of net income`,
      bars: t.pct.deciles.map((d, i) => ({ label: String(i + 1), value: d.tax + d.welfare, text: pct2(d.tax + d.welfare) })),
      foot: `HM Treasury, Impact on households (official). ${follows}`,
    };
  const year = salaryCheckYear(s.calculator, c.head);
  const changes = ratesChangedYears(s.calculator).some((y) => y.year === year);
  const examples = salaryExamples(
    s.calculator,
    year,
    EXAMPLE_SALARIES.map((e) => e.salary_gbp),
  );
  return {
    caption: `Income tax and National Insurance, ${year}: change in take-home pay a year`,
    bars: examples.map((e) => ({ label: `${gbpWhole(e.salary_gbp)} a year`, value: e.change_gbp, text: gbpYear(e.change_gbp) })),
    foot: `${changes ? "The Budget's own rates; not official, not tax advice" : `No change to these rates in ${year}`}. ${follows}`,
  };
}

export default async function Image({ params }: { params: Promise<{ event: string }> }) {
  const { event } = await params;
  const s = getHouseholdSnapshots().find((x) => x.id === event)!;
  const { caption, bars, foot } = barsFor(s);
  const values = bars.map((b) => b.value);
  const top = Math.max(0, ...values);
  const bottom = Math.min(0, ...values);
  const scale = (CHART_H - 70) / (top - bottom || 1);
  const zero = 35 + top * scale;
  const slot = (CHART_W - 40) / bars.length;
  const barW = Math.min(64, slot * 0.6);
  const fonts = await ogFonts();
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: OG.bg, color: OG.ink, padding: "44px 60px", fontFamily: "Geist" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, fontWeight: 600 }}>
        <img src={MARK_DATA_URI} width={24} height={24} alt="" />
        {`LedgerGov.UK · ${s.name}${s.kind === "rehearsal" ? " (last year's Budget)" : ""}`}
      </div>
      <div style={{ display: "flex", fontSize: 50, fontWeight: 600, letterSpacing: -1.8, lineHeight: 1.05, marginTop: 16 }}>
        {s.kind === "rehearsal" ? "What it did to households" : "What it does to households"}
      </div>
      <div style={{ display: "flex", fontSize: 22, color: OG.muted, marginTop: 8 }}>{caption}</div>
      <div style={{ display: "flex", position: "relative", height: CHART_H, marginTop: 18, borderBottom: `1px solid ${OG.line}` }}>
        <div style={{ display: "flex", position: "absolute", left: 0, right: 0, top: zero, height: 2, background: OG.muted }} />
        {bars.map((b, i) => {
          const h = Math.max(2, Math.abs(b.value) * scale);
          const y = b.value >= 0 ? zero - h : zero + 2;
          const left = 20 + i * slot + (slot - barW) / 2;
          return (
            <div key={i} style={{ display: "flex" }}>
              <div style={{ display: "flex", position: "absolute", left, top: y, width: barW, height: h, background: b.value >= 0 ? OG.good : OG.debt, borderRadius: 3 }} />
              <div
                style={{
                  display: "flex",
                  position: "absolute",
                  left: left - 30,
                  width: barW + 60,
                  justifyContent: "center",
                  top: b.value >= 0 ? y - 30 : y + h + 4,
                  fontSize: 21,
                  fontWeight: 600,
                }}
              >
                {b.text}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", position: "relative", height: 26, marginTop: 6 }}>
        {bars.map((b, i) => (
          <div key={i} style={{ display: "flex", position: "absolute", left: 20 + i * slot, width: slot, justifyContent: "center", fontSize: 18, color: OG.muted }}>
            {b.label}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", marginTop: "auto", fontSize: 19, color: OG.muted }}>{foot}</div>
    </div>,
    { ...OG.size, fonts },
  );
}
