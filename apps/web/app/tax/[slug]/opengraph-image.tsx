import { OG } from "@/lib/og";
import { findCard, getReckoner } from "@/lib/reckoner";
import { RECKONER_CARD_ALT, reckonerCardImage } from "@/lib/reckoner-og";

export const alt = RECKONER_CARD_ALT;
export const size = OG.size;
export const contentType = "image/png";

export function generateStaticParams() {
  return getReckoner().cards.map((c) => ({ slug: c.spec.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const card = findCard((await params).slug)!;
  return reckonerCardImage(card, getReckoner().edition);
}
