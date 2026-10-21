import { getPortrait, getSeed } from "@/lib/data";
import { OG } from "@/lib/og";
import { actorImage } from "@/lib/actor-og";
import { CREDIT_COLUMNS } from "@/components/CreditTable";
import { actorLine, cardsOfActor, todayIso } from "@/lib/promises";

export const alt = "LedgerGov.UK: a politician's or party's promises and how they stand, with the official portrait where Parliament publishes one";
export const size = OG.size;
export const contentType = "image/png";

export function generateStaticParams() {
  return getSeed().actors.map((a) => ({ id: a.id }));
}

/** The actor's share image: the same numbers as the page, and the official portrait for an MP who has one. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seed = getSeed();
  const actor = seed.actors.find((a) => a.id === id)!;
  const party = actor.party_id ? seed.actors.find((a) => a.id === actor.party_id) : null;
  // The same cards as the page: a party's page includes its members' cards.
  const cards = cardsOfActor(seed.cards, actor);
  const [delivered = 0, inProgress = 0, notMet = 0, undone = 0] = CREDIT_COLUMNS.map((col) => cards.filter((c) => col.statuses.includes(c.file.status)).length);
  return actorImage({
    name: actor.name,
    role: actorLine(actor, party, todayIso()),
    portrait: actor.kind === "person" ? getPortrait(actor.parliament_member_id) : null,
    total: cards.length,
    delivered,
    inProgress,
    notMetOrUndone: notMet + undone,
  });
}
