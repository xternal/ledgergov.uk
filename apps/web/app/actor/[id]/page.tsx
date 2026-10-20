import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CardView, PolicyArea, Status } from "@ledger/schema";
import { ActorTimeline, KeyPromises, PromisesByMonth } from "@openpromises/react";
import { actorJsonLd, areaPath, clip, DESCRIPTION_MAX, officialPages, statusCounts } from "@ledger/server/seo";
import { STATUS_LABEL } from "@/lib/copy";
import { getActorStory, getAreaCoverage, getPortrait, getSeed } from "@/lib/data";
import { contractTotals } from "@ledger/schema";
import { longDate, signedBn, signedMoney } from "@/lib/format";
import { delayText, showsContracts } from "@/lib/contracts";
import { SiteHeader } from "@/components/SiteHeader";
import { PromiseList } from "@/components/PromiseList";
import { CREDIT_COLUMNS, MixBar, creditRows } from "@/components/CreditTable";
import { FollowButton } from "@/components/FollowPanel";
import { followOptions } from "@/app/follow/targets";
import { JsonLd } from "@/components/JsonLd";
import { OPEN_GRAPH, seoContext } from "@/lib/site";
import { AREA_LABEL, TERMINAL, cardsOfActor, costText, roleText, todayIso } from "@/lib/promises";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return getSeed().actors.map((a) => ({ id: a.id }));
}
export const dynamicParams = false;

function cardsFor(id: string) {
  const seed = getSeed();
  const actor = seed.actors.find((a) => a.id === id);
  if (!actor) return null;
  // A party's page includes its members' cards; a person's page only their own.
  const cards = cardsOfActor(seed.cards, actor);
  return { actor, cards, seed };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const r = cardsFor(id);
  if (!r) return {};
  const title = `${r.actor.name}: promises and how they stand`;
  const mix = statusCounts(r.cards)
    .map((x) => `${x.count} ${STATUS_LABEL[x.status].toLowerCase()}`)
    .join(", ");
  const description = clip(
    `${r.cards.length} tracked ${r.cards.length === 1 ? "promise" : "promises"} by ${r.actor.name}${mix ? `: ${mix}` : ""}. Each with its cost a year, who pays, the evidence and a dated timeline.`,
    DESCRIPTION_MAX,
  );
  return {
    title: `${title} | LedgerGov.UK`,
    description,
    alternates: { canonical: `/actor/${id}`, types: { "application/atom+xml": [{ url: `/feeds/actor/${id}.xml`, title: `Changes to ${r.actor.name}'s promises` }] } },
    openGraph: { ...OPEN_GRAPH, title, description, type: "profile", url: `/actor/${id}` },
    twitter: { card: "summary_large_image", title, description },
    // An actor named only as the body that must deliver someone else's promises (outcome_by) has no cards of its own yet: keep that empty page out of search.
    ...(r.cards.length ? {} : { robots: { index: false, follow: true } }),
  };
}

/** "4 promised, 1 in plan": how a group of promises stands, in the site's own status words. */
const mixWords = (counts: { status: Status; count: number }[]) => counts.map((x) => `${x.count} ${STATUS_LABEL[x.status].toLowerCase()}`).join(", ");

/** The day a delivered promise was delivered: its last Delivered event. */
const deliveredOn = (c: CardView) => c.file.events.filter((e) => e.type === "delivered").at(-1)?.date ?? null;

export default async function ActorPage({ params }: Props) {
  const { id } = await params;
  const r = cardsFor(id);
  if (!r) notFound();
  const { actor, cards, seed } = r;
  const today = todayIso();
  const party = actor.party_id ? seed.actors.find((a) => a.id === actor.party_id) : null;
  const row = creditRows(cards, "actor").reduce(
    (acc, x) => ({
      ...acc,
      counts: acc.counts.map((n, i) => n + x.counts[i]!),
      byOthers: acc.byOthers.map((n, i) => n + x.byOthers[i]!),
      costed: acc.costed + x.costed,
      pledgedBn: acc.pledgedBn + x.pledgedBn,
      fundingNamed: acc.fundingNamed + x.fundingNamed,
    }),
    { counts: CREDIT_COLUMNS.map(() => 0), byOthers: CREDIT_COLUMNS.map(() => 0), costed: 0, pledgedBn: 0, fundingNamed: 0 },
  );
  const [delivered = 0, inProgress = 0, notMet = 0, undone = 0, unscoreable = 0] = row.counts;
  const byOthers = row.byOthers.reduce((a, b) => a + b, 0);
  const progressMix = mixWords(statusCounts(cards).filter((x) => CREDIT_COLUMNS[1]!.statuses.includes(x.status)));
  const toCome = cards.filter((c) => c.file.deadline && c.file.deadline >= today && !TERMINAL.includes(c.file.status)).length;
  const first = cards.map((c) => c.file.made_on).sort()[0];
  // Contracts behind delivery (M6b): only for cards that show them, so the total matches what the cards list.
  const contracts = contractTotals(cards.filter((c) => showsContracts(c.file.status)).flatMap((c) => c.contracts));
  const structuredData = actorJsonLd(actor, party ?? null, cards, seoContext());
  // The official pages the structured data names (sameAs), shown to readers too: websites first, then social accounts.
  const official = officialPages(actor);
  const ids = new Set(cards.map((c) => c.id));
  // Every area the site lists, empty ones too (OpenPromises decision 33): the same tiles on every actor's page.
  const areas = getAreaCoverage(ids);
  // The actor's promises as one story (decision 34): key promises, the timeline and promises made each month.
  const story = getActorStory(ids);
  const portrait = actor.kind === "person" ? getPortrait(actor.parliament_member_id) : null;
  const deliveredCards = cards.filter((c) => c.file.status === "delivered").sort((a, b) => (deliveredOn(b) ?? "").localeCompare(deliveredOn(a) ?? ""));
  return (
    <>
      <JsonLd data={structuredData} />
      <SiteHeader current="/promises" />
      <main className="mx-auto grid max-w-[1120px] gap-16 px-4 pb-20 pt-10 sm:px-6">
        <section aria-labelledby="actor-h" className="flex flex-wrap items-start gap-x-12 gap-y-6">
          {portrait && (
            <figure className="m-0 grid w-[160px] flex-none gap-2 sm:w-[240px]">
              <img
                src={portrait.src}
                alt={`Official portrait of ${actor.name}${portrait.taken ? `, ${portrait.taken}` : ""}`}
                width={560}
                height={747}
                className="aspect-[3/4] h-auto w-full rounded-[12px] border border-line bg-sunk object-cover"
              />
              <figcaption className="text-caption text-muted">
                Official portrait{portrait.taken ? `, ${portrait.taken}` : ""}: <a href={portrait.source}>{portrait.credit}</a>, <a href={portrait.licence.url}>{portrait.licence.name}</a>, cropped
              </figcaption>
            </figure>
          )}
          <div className="grid min-w-0 flex-[999_1_520px] content-start gap-5">
            <div className="grid gap-2">
              <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-label font-medium">
                <a href="/promises">All promises</a>
                <a href="/actor">Everyone on the ledger</a>
              </p>
              <h1 id="actor-h" className="m-0 text-[clamp(30px,4.4vw,46px)] font-semibold leading-[1.06] tracking-[-0.035em]">
                {actor.name}
              </h1>
              <p className="m-0 text-lead text-muted">
                {actor.kind === "party" ? "Party" : roleText(actor, today) || "Person"}
                {party ? `, ${party.name}` : ""}
              </p>
            </div>
            <div className="grid gap-1">
              <p className="m-0 text-title font-semibold">
                {cards.length ? `${cards.length} ${cards.length === 1 ? "promise" : "promises"} on the ledger` : "No promises on the ledger yet"}
              </p>
              {first && <p className="m-0 text-label text-muted">The first made on {longDate(first)}.</p>}
            </div>
            {cards.length > 0 && (
              <dl className="m-0 grid grid-cols-3 gap-6 border-y border-line py-5">
                <div className="grid content-start gap-1.5">
                  <dt className="order-2 text-label text-muted">delivered</dt>
                  <dd className="order-1 m-0 text-[clamp(32px,5vw,46px)] font-semibold leading-none tracking-[var(--tracking-figure)] text-good">{delivered}</dd>
                </div>
                <div className="grid content-start gap-1.5">
                  <dt className="order-2 text-label text-muted">in progress{progressMix ? `: ${progressMix}` : ""}</dt>
                  <dd className="order-1 m-0 text-[clamp(32px,5vw,46px)] font-semibold leading-none tracking-[var(--tracking-figure)] text-warn">{inProgress}</dd>
                </div>
                <div className="grid content-start gap-1.5">
                  <dt className="order-2 text-label text-muted">not met or undone</dt>
                  <dd className={`order-1 m-0 text-[clamp(32px,5vw,46px)] font-semibold leading-none tracking-[var(--tracking-figure)] ${notMet + undone ? "text-bad" : "text-muted"}`}>
                    {notMet + undone}
                  </dd>
                </div>
              </dl>
            )}
            {cards.length > 0 && (
              <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4 text-sm">
                <div className="grid">
                  <dt className="order-2 text-label text-muted">
                    {row.costed ? `have a yearly cost, ${signedBn(row.pledgedBn)} a year in all` : "have a yearly cost"}
                  </dt>
                  <dd className="order-1 m-0 font-semibold">
                    {row.costed} of {cards.length}
                  </dd>
                </div>
                <div className="grid">
                  <dt className="order-2 text-label text-muted">say how they would be paid for</dt>
                  <dd className="order-1 m-0 font-semibold">
                    {row.fundingNamed} of {cards.length}
                  </dd>
                </div>
                <div className="grid">
                  <dt className="order-2 text-label text-muted">have a deadline still to come</dt>
                  <dd className="order-1 m-0 font-semibold">
                    {toCome} of {cards.length}
                  </dd>
                </div>
                {unscoreable > 0 && (
                  <div className="grid">
                    <dt className="order-2 text-label text-muted">too vague to score</dt>
                    <dd className="order-1 m-0 font-semibold">
                      {unscoreable} of {cards.length}
                    </dd>
                  </div>
                )}
              </dl>
            )}
            {byOthers > 0 && <p className="m-0 text-[12.5px] text-muted">{byOthers} of these outcomes were brought about by others; each card says by whom.</p>}
            <p className="m-0 text-[12.5px] text-muted">No score: the mix speaks for itself. Every actor is held to the same promise standard.</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <FollowButton label={`Follow ${actor.name}`} trackKind="actor" target={{ kind: "actor", id: actor.id }} options={followOptions()} />
              {official.length > 0 && (
                <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-label text-muted">
                  <span>Official pages:</span>
                  {official.map((o) => (
                    <a key={o.url} href={o.url} rel="noopener noreferrer" target="_blank">
                      {o.label}
                    </a>
                  ))}
                </p>
              )}
            </div>
          </div>
        </section>

        <section aria-labelledby="areas-h" className="grid gap-4">
          <div className="grid gap-1">
            <h2 id="areas-h" className="m-0 text-title font-semibold">
              Promises by area
            </h2>
            <p className="m-0 text-label text-muted">
              Every area the ledger tracks, the same ten for everyone. &ldquo;None recorded&rdquo; means no promise in that area is on the ledger yet, not that none was
              made.
            </p>
          </div>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 p-0">
            {areas.map((a) => {
              const label = AREA_LABEL[a.area as PolicyArea];
              const counts = CREDIT_COLUMNS.map((col) => a.counts.filter((x) => col.statuses.includes(x.status as Status)).reduce((n, x) => n + x.count, 0));
              return (
                <li key={a.area}>
                  {a.count ? (
                    <a href={areaPath(a.area as PolicyArea)} className="grid h-full content-start gap-1.5 rounded-[12px] border border-line p-4 text-ink no-underline hover:bg-sunk">
                      <span className="text-label font-medium">{label}</span>
                      <span className="text-[28px] font-semibold leading-tight tracking-[var(--tracking-figure)]">{a.count}</span>
                      <MixBar counts={counts} total={a.count} />
                      <span className="text-[12.5px] text-muted">{mixWords(a.counts as { status: Status; count: number }[])}</span>
                    </a>
                  ) : (
                    <div className="grid h-full content-start gap-1.5 rounded-[12px] border border-dashed border-line-strong p-4 text-muted">
                      <span className="text-label font-medium">{label}</span>
                      <span className="text-[28px] font-semibold leading-tight tracking-[var(--tracking-figure)] text-faint" aria-hidden>
                        0
                      </span>
                      <span className="text-[12.5px]">None recorded</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <KeyPromises views={story.views} config={story.config} today={today} />

        <ActorTimeline views={story.views} config={story.config} today={today} />

        {(story.views.length > 0 || deliveredCards.length > 0) && (
          <div className="flex flex-wrap items-start gap-x-12 gap-y-10">
            <div className="min-w-0 flex-[1_1_420px]">
              <PromisesByMonth views={story.views} config={story.config} today={today} />
            </div>
            {deliveredCards.length > 0 && (
              <section aria-labelledby="delivered-h" className="grid min-w-0 flex-[1_1_360px] gap-3">
                <h2 id="delivered-h" className="m-0 text-title font-semibold">
                  Delivered
                </h2>
                <ul className="m-0 grid list-none gap-4 p-0">
                  {deliveredCards.map((c) => (
                    <li key={c.id}>
                      <a href={`/promise/${c.id}`} className="grid gap-1.5 border-t-2 border-good pt-3 text-ink no-underline">
                        <span className="text-caption font-semibold text-good">{deliveredOn(c) ? `Delivered ${longDate(deliveredOn(c)!)}` : "Delivered"}</span>
                        <span className="text-[17px] font-semibold leading-snug">{c.file.headline ?? c.current.text}</span>
                        <span className="text-[12.5px] text-muted">{costText(c)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {contracts.count > 0 && (
          <section aria-labelledby="contracts-h" className="grid gap-3">
            <h2 id="contracts-h" className="text-title font-semibold">
              Contracts behind delivery
            </h2>
            <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 sm:grid-cols-3">
              <div className="grid gap-0.5">
                <dt className="text-label text-muted">Contracts linked</dt>
                <dd className="m-0 text-[26px] font-semibold tracking-[var(--tracking-figure)]">{contracts.count}</dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-label text-muted">Change in value since the first notice</dt>
                <dd className={`m-0 text-[26px] font-semibold tracking-[var(--tracking-figure)] ${contracts.valueDelta > 0 ? "text-debt-ink" : ""}`}>
                  {contracts.valueDelta ? signedMoney(contracts.valueDelta) : "None"}
                </dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-label text-muted">Median delay to the end date</dt>
                <dd className="m-0 text-[26px] font-semibold tracking-[var(--tracking-figure)]">{delayText(contracts.medianMonthsLate ?? 0)}</dd>
              </div>
            </dl>
            <p className="m-0 text-[12.5px] text-muted">
              Across the public contracts editors linked to these promises once they were funded or under way, read from the contract notices. Each promise card lists
              its contracts.
            </p>
          </section>
        )}

        {cards.length > 0 && (
          <section aria-labelledby="cards-h" className="grid gap-4">
            <h2 id="cards-h" className="text-title font-semibold">
              {cards.length === 1 ? "The promise" : `All ${cards.length} promises`}
            </h2>
            <PromiseList cards={cards} today={null} />
          </section>
        )}
      </main>
    </>
  );
}
