import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { PolicyArea, Status } from "@ledger/schema";
import { actorJsonLd, areaPath, clip, DESCRIPTION_MAX, officialPages, statusCounts } from "@ledger/server/seo";
import { STATUS_LABEL } from "@/lib/copy";
import { getAreaCoverage, getSeed } from "@/lib/data";
import { AREA_LABEL } from "@/lib/promises";
import { contractTotals } from "@ledger/schema";
import { signedBn, signedMoney } from "@/lib/format";
import { delayText, showsContracts } from "@/lib/contracts";
import { SiteHeader } from "@/components/SiteHeader";
import { PromiseList } from "@/components/PromiseList";
import { CREDIT_COLUMNS, MixBar, creditRows } from "@/components/CreditTable";
import { FollowButton } from "@/components/FollowPanel";
import { followOptions } from "@/app/follow/targets";
import { JsonLd } from "@/components/JsonLd";
import { OPEN_GRAPH, seoContext } from "@/lib/site";
import { cardsOfActor, roleText, todayIso } from "@/lib/promises";

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

export default async function ActorPage({ params }: Props) {
  const { id } = await params;
  const r = cardsFor(id);
  if (!r) notFound();
  const { actor, cards, seed } = r;
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
  // Contracts behind delivery (M6b): only for cards that show them, so the total matches what the cards list.
  const contracts = contractTotals(cards.filter((c) => showsContracts(c.file.status)).flatMap((c) => c.contracts));
  const structuredData = actorJsonLd(actor, party ?? null, cards, seoContext());
  // The official pages the structured data names (sameAs), shown to readers too: websites first, then social accounts.
  const official = officialPages(actor);
  // Every area the site lists, empty ones too (OpenPromises decision 33): the same rows on every actor's page.
  const areas = getAreaCoverage(new Set(cards.map((c) => c.id)));
  return (
    <>
      <JsonLd data={structuredData} />
      <SiteHeader current="/promises" />
      <main className="mx-auto grid max-w-[1000px] gap-10 px-4 pb-20 pt-10 sm:px-6">
        <div className="grid gap-2">
          <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-label font-medium">
            <a href="/promises">All promises</a>
            <a href="/actor">Everyone on the ledger</a>
          </p>
          <h1 className="m-0 text-[clamp(30px,4.4vw,44px)] font-semibold leading-[1.06] tracking-[-0.035em]">{actor.name}</h1>
          <p className="m-0 text-lead text-muted">
            {actor.kind === "party" ? "Party" : roleText(actor, todayIso()) || "Person"}
            {party ? `, ${party.name}` : ""}
          </p>
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
          <div className="mt-2">
            <FollowButton label={`Follow ${actor.name}`} trackKind="actor" target={{ kind: "actor", id: actor.id }} options={followOptions()} />
          </div>
        </div>

        <section aria-labelledby="record-h" className="grid gap-4">
          <h2 id="record-h" className="text-title font-semibold">
            Track record
          </h2>
          <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 sm:grid-cols-4">
            <div className="grid gap-0.5">
              <dt className="text-label text-muted">Cards</dt>
              <dd className="m-0 text-[26px] font-semibold tracking-[var(--tracking-figure)]">{cards.length}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-label text-muted">Net cost of costed cards, a year</dt>
              <dd className="m-0 text-[26px] font-semibold tracking-[var(--tracking-figure)]">{row.costed ? signedBn(row.pledgedBn) : "none"}</dd>
              <dd className="m-0 text-[12.5px] text-muted">
                {row.costed} of {cards.length} cards costed
              </dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-label text-muted">Funding named</dt>
              <dd className="m-0 text-[26px] font-semibold tracking-[var(--tracking-figure)]">
                {row.fundingNamed} of {cards.length}
              </dd>
            </div>
            <div className="grid content-start gap-2">
              <dt className="text-label text-muted">Status mix</dt>
              <dd className="m-0">
                <MixBar counts={row.counts} total={Math.max(cards.length, 1)} />
              </dd>
            </div>
          </dl>
          <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-label text-muted">
            {CREDIT_COLUMNS.map((c, i) => (
              <li key={c.label} className="inline-flex items-center gap-1.5">
                <i className="size-2 rounded-full" style={{ background: c.color }} aria-hidden />
                {c.label}: <b className="font-semibold text-ink">{row.counts[i]}</b>
                {row.byOthers[i] ? ` (${row.byOthers[i]} by others)` : ""}
              </li>
            ))}
          </ul>
          <p className="m-0 text-[12.5px] text-muted">No score: the mix speaks for itself. Every actor is held to the same promise standard.</p>
        </section>

        <section aria-labelledby="areas-h" className="grid gap-4">
          <h2 id="areas-h" className="text-title font-semibold">
            Promises by area
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{`${actor.name}'s promises in each policy area, and where they stand`}</caption>
              <thead>
                <tr className="border-b border-line text-[12.5px] text-muted">
                  <th scope="col" className="py-2.5 pr-4 text-left font-medium">
                    Area
                  </th>
                  <th scope="col" className="py-2.5 pr-4 text-right font-medium">
                    Promises
                  </th>
                  <th scope="col" className="py-2.5 text-left font-medium">
                    Where they stand
                  </th>
                </tr>
              </thead>
              <tbody>
                {areas.map((r) => (
                  <tr key={r.area} className="border-b border-line">
                    <th scope="row" className="py-2.5 pr-4 text-left font-normal">
                      {r.count ? <a href={areaPath(r.area as PolicyArea)}>{AREA_LABEL[r.area as PolicyArea]}</a> : <span className="text-muted">{AREA_LABEL[r.area as PolicyArea]}</span>}
                    </th>
                    <td className="py-2.5 pr-4 text-right font-semibold tracking-[var(--tracking-figure)]">{r.count || <span className="font-normal text-muted">None recorded</span>}</td>
                    <td className="py-2.5 text-muted">{r.counts.map((x) => `${x.count} ${STATUS_LABEL[x.status as Status].toLowerCase()}`).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 text-[12.5px] text-muted">
            Every area the ledger tracks, the same list for everyone. &ldquo;None recorded&rdquo; means no promise in that area is on the ledger yet, not that none was made.
          </p>
        </section>

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

        <section aria-labelledby="cards-h" className="grid gap-4">
          <h2 id="cards-h" className="text-title font-semibold">
            Promises
          </h2>
          <PromiseList cards={cards} today={null} />
        </section>
      </main>
    </>
  );
}
