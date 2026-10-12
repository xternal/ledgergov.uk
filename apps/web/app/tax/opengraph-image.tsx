import { OG } from "@/lib/og";
import { figuresImage } from "@/lib/method-og";
import { getReckoner, hmrcFigure } from "@/lib/reckoner";
import { RECKONER_KICKER } from "@/lib/reckoner-copy";

export const alt = "LedgerGov.UK: what a one-point change to each main UK tax would raise a year, HMRC's estimates, the three largest shown";
export const size = OG.size;
export const contentType = "image/png";

/** Rows on the image: the largest one-unit changes in the first year. */
const SHOWN = 3;

export default async function Image() {
  const { cards, edition } = getReckoner();
  const top = cards
    .filter((c) => !c.spec.stepped)
    .sort((a, b) => b.headline.first.range[1] - a.headline.first.range[1])
    .slice(0, SHOWN);
  return figuresImage({
    kicker: RECKONER_KICKER,
    title: "What one point on each tax raises",
    figures: top.map((c) => ({ value: hmrcFigure(c.headline.first.range[1]), label: `${c.spec.short}, ${c.headline.first.period}` })),
    foot: `HMRC's estimates, edition published ${edition.published} · each with its range and caveat on the site`,
  });
}
