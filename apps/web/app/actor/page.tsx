import type { Metadata } from "next";
import type { ActorFile, CardView } from "@ledger/schema";
import { actorIndexJsonLd } from "@ledger/server/seo";
import { getSeed } from "@/lib/data";
import { SiteHeader } from "@/components/SiteHeader";
import { CREDIT_COLUMNS, MixBar } from "@/components/CreditTable";
import { JsonLd } from "@/components/JsonLd";
import { cardsOfActor, roleText, shortName, todayIso } from "@/lib/promises";
import { OPEN_GRAPH, seoContext } from "@/lib/site";

const TITLE = "People, parties and public bodies";
const DESCRIPTION =
  "Everyone whose promises LedgerGov.UK tracks: each person, party and public body, with how many promises they have made and where those promises stand. The same standard for everyone.";

export const metadata: Metadata = {
  title: `${TITLE}: whose promises the ledger tracks | LedgerGov.UK`,
  description: DESCRIPTION,
  alternates: { canonical: "/actor" },
  openGraph: { ...OPEN_GRAPH, title: `${TITLE} whose promises the ledger tracks`, description: DESCRIPTION, type: "website", url: "/actor" },
  twitter: { card: "summary_large_image", title: `${TITLE} whose promises the ledger tracks`, description: DESCRIPTION },
};

const GROUPS: { kind: ActorFile["kind"]; title: string }[] = [
  { kind: "person", title: "People" },
  { kind: "party", title: "Parties" },
  { kind: "government", title: "Governments and public bodies" },
];

interface Row {
  actor: ActorFile;
  cards: CardView[];
  counts: number[];
}

/** "1 delivered, 13 in progress": the status mix in words, beside the bar that shows it. */
const mixText = (counts: number[]) =>
  counts
    .map((n, i) => (n ? `${n} ${CREDIT_COLUMNS[i]!.label.toLowerCase()}` : null))
    .filter(Boolean)
    .join(", ");

export default function ActorIndexPage() {
  const seed = getSeed();
  const today = todayIso();
  const rows: Row[] = seed.actors
    .map((actor) => {
      const cards = cardsOfActor(seed.cards, actor);
      return { actor, cards, counts: CREDIT_COLUMNS.map((col) => cards.filter((c) => col.statuses.includes(c.file.status)).length) };
    })
    .sort((a, b) => b.cards.length - a.cards.length || a.actor.name.localeCompare(b.actor.name));
  const groups = GROUPS.map((g) => ({ ...g, rows: rows.filter((r) => r.actor.kind === g.kind) })).filter((g) => g.rows.length);
  const party = (a: ActorFile) => (a.party_id ? seed.actors.find((p) => p.id === a.party_id) : undefined);
  const structuredData = actorIndexJsonLd(
    { path: "/actor", name: TITLE, description: DESCRIPTION, actors: groups.flatMap((g) => g.rows.map((r) => r.actor)), cards: seed.cards },
    seoContext(),
  );
  return (
    <>
      <JsonLd data={structuredData} />
      <SiteHeader current="/actor" />
      <main className="mx-auto grid max-w-[1000px] gap-10 px-4 pb-20 pt-10 sm:px-6">
        <div className="grid gap-2">
          <a href="/promises" className="justify-self-start text-label font-medium">
            All promises
          </a>
          <h1 className="m-0 text-[clamp(30px,4.4vw,44px)] font-semibold leading-[1.06] tracking-[-0.035em]">{TITLE}</h1>
          <p className="m-0 max-w-[680px] text-lead text-muted">
            Everyone whose promises the ledger tracks. Each page shows their promises, what they would cost a year and where each one stands, held to the same
            standard.
          </p>
          <p className="m-0 text-label text-muted">{groups.map((g) => `${g.rows.length} ${g.title.toLowerCase()}`).join(", ")}</p>
        </div>

        {groups.map((g) => (
          <section key={g.kind} aria-labelledby={`${g.kind}-h`} className="grid gap-3">
            <h2 id={`${g.kind}-h`} className="text-title font-semibold">
              {g.title}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">{`${g.title}: how many promises each has made, and where they stand`}</caption>
                <thead>
                  <tr className="border-b border-line text-[12.5px] text-muted">
                    <th scope="col" className="py-2.5 pr-4 text-left font-medium">
                      Name
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
                  {g.rows.map((r) => {
                    const p = party(r.actor);
                    const role = roleText(r.actor, today);
                    return (
                      <tr key={r.actor.id} className="border-b border-line align-top">
                        <th scope="row" className="py-2.5 pr-4 text-left font-normal">
                          <a href={`/actor/${r.actor.id}`} className="font-medium">
                            {r.actor.name}
                          </a>
                          {(role || p) && <span className="block text-caption text-muted">{[role, p && shortName(p)].filter(Boolean).join(", ")}</span>}
                        </th>
                        <td className="py-2.5 pr-4 text-right font-semibold tracking-[var(--tracking-figure)]">
                          {r.cards.length || <span className="font-normal text-muted">None recorded</span>}
                        </td>
                        <td className="py-2.5">
                          {r.cards.length > 0 && (
                            <div className="grid max-w-[260px] gap-1.5">
                              <MixBar counts={r.counts} total={r.cards.length} />
                              <span className="text-caption text-muted">{mixText(r.counts)}</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <p className="m-0 border-t border-line pt-6 text-label text-muted">
          A party&rsquo;s count includes its people&rsquo;s promises. Someone missing? <a href="/#contribute">Send us a promise</a> with a link to where it was
          said.
        </p>
      </main>
    </>
  );
}
