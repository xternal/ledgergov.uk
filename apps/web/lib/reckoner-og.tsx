import { ImageResponse } from "next/og";
import { OG, ogFonts } from "./og";
import { MARK_DATA_URI } from "./brand";
import { RECKONER_KICKER } from "./reckoner-copy";
import type { ReckonerYear } from "@ledger/engine";
import { cardTitle, fromTo, hmrcFigure, pointsText, rangeLike, sourceName, type ReckonerCard, type ReckonerEdition } from "./reckoner";

export const RECKONER_CARD_ALT =
  "LedgerGov.UK: what one change to a UK tax would raise a year, HMRC's estimate for the first and last year it covers, with the range and the HMRC edition it comes from";

interface Shown {
  value: string;
  label: string;
  range: string;
  bn: number;
}

const shown = (y: ReckonerYear, label: string): Shown => ({ value: hmrcFigure(y.range[1]), label, range: `range ${rangeLike(y.range)}`, bn: y.range[1] });

/**
 * What a card's image shows: the first and last year of its headline change;
 * a stepped card adds its biggest step in the last year, where HMRC's
 * figures move most.
 */
function figuresFor(card: ReckonerCard): Shown[] {
  const c = card.headline;
  if (!card.spec.stepped) return [shown(c.first, `in ${c.first.period}, the first year`), shown(c.last, `in ${c.last.period}`)];
  const steps = card.changes.filter((x) => x.lever_id === c.lever_id);
  const biggest = steps.at(-1)!;
  const name = c.label.toLowerCase();
  return [
    shown(c.first, `${name} ${pointsText(c.by)}, ${c.first.period}`),
    shown(c.last, `${name} ${pointsText(c.by)}, ${c.last.period}`),
    ...(biggest !== c ? [shown(biggest.last, `${name} ${pointsText(biggest.by)}, ${biggest.last.period}`)] : []),
  ];
}

/** A card's share image: the change, what it raises in each year shown with its range, and HMRC's edition. */
export async function reckonerCardImage(card: ReckonerCard, edition: ReckonerEdition) {
  const fonts = await ogFonts();
  const figures = figuresFor(card);
  const sub = card.spec.stepped ? `${card.headline.label}: ${fromTo(card.headline)}` : fromTo(card.headline);
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: OG.bg, color: OG.ink, padding: "52px 64px", fontFamily: "Geist" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 26, fontWeight: 600 }}>
        <img src={MARK_DATA_URI} width={28} height={28} alt="" />
        LedgerGov.UK
        <span style={{ marginLeft: 10, color: OG.muted }}>{RECKONER_KICKER}</span>
      </div>
      <div style={{ display: "flex", fontSize: 58, fontWeight: 600, letterSpacing: -2.2, lineHeight: 1.05, marginTop: 34, maxWidth: 1060 }}>{cardTitle(card)}</div>
      <div style={{ display: "flex", fontSize: 28, color: OG.muted, marginTop: 14 }}>{`${sub}, HMRC's estimate`}</div>
      <div style={{ display: "flex", gap: 48, marginTop: "auto" }}>
        {figures.map((f) => (
          <div key={f.label} style={{ display: "flex", flexDirection: "column", maxWidth: 340 }}>
            <div style={{ display: "flex", fontSize: 68, fontWeight: 600, letterSpacing: -2.4, color: f.bn < 0 ? OG.debt : OG.rec }}>{f.value}</div>
            <div style={{ display: "flex", fontSize: 23, color: OG.ink, marginTop: 4 }}>{f.label}</div>
            <div style={{ display: "flex", fontSize: 20, color: OG.muted, marginTop: 2 }}>{f.range}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", marginTop: 24, fontSize: 20, color: OG.muted }}>{`HMRC, ${sourceName(edition)}, edition published ${edition.published}`}</div>
    </div>,
    { ...OG.size, fonts },
  );
}
