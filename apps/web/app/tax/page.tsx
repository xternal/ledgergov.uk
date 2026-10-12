import type { Metadata } from "next";
import { getSeed } from "@/lib/data";
import { bandText, capitalise, fromTo, getReckoner, hmrcFigure, indexJsonLd, pointsText, rangeEnds, sourceName, type ReckonerCard } from "@/lib/reckoner";
import { RECKONER_COPY as C, RECKONER_PATH, RECKONER_TITLE, largestLine, reckonerDescription, reckonerFaq } from "@/lib/reckoner-copy";
import { SiteHeader } from "@/components/SiteHeader";
import { JsonLd } from "@/components/JsonLd";
import { SourcesProvider, WithProvenance } from "@/components/ui";
import { OPEN_GRAPH } from "@/lib/site";

const description = () => reckonerDescription(getReckoner().edition.published);
const faq = () => {
  const { edition } = getReckoner();
  return reckonerFaq({ title: sourceName(edition), date: edition.published, firstYear: edition.firstYear, band: bandText(edition.band) });
};

export function generateMetadata(): Metadata {
  return {
    title: `${RECKONER_TITLE} | LedgerGov.UK`,
    description: description(),
    alternates: { canonical: RECKONER_PATH },
    openGraph: { ...OPEN_GRAPH, title: RECKONER_TITLE, description: description(), type: "website", url: RECKONER_PATH },
    twitter: { card: "summary_large_image", title: RECKONER_TITLE, description: description() },
  };
}

const h2 = "m-0 text-title font-semibold";

/** A year's figure in the list: HMRC's number, its range, and its provenance on hover or focus. */
function YearFigure({ card, which }: { card: ReckonerCard; which: "first" | "last" }) {
  const c = card.headline;
  const y = c[which];
  const [low, high] = rangeEnds(y.range);
  return (
    <div className="grid content-start gap-0.5 sm:justify-items-end">
      <dt className="text-caption text-muted">{y.period}</dt>
      <dd className="m-0 w-full">
        {/* The host spans the column, so the right-hand tip opens leftwards from the column's edge and stays on screen. */}
        <WithProvenance
          p={{ quality: c.quality, source_id: c.source_id, method_note: c.lever.method_note }}
          align={which === "last" ? "end" : "start"}
          className="w-full sm:justify-end"
        >
          <span className={`text-[22px] font-semibold tracking-[var(--tracking-figure)] ${y.range[1] < 0 ? "text-debt-ink" : "text-rec"}`}>{hmrcFigure(y.range[1])}</span>
        </WithProvenance>
      </dd>
      <dd className="m-0 text-caption text-muted">
        range <span className="whitespace-nowrap">{low}</span> to <span className="whitespace-nowrap">{high}</span>
      </dd>
    </div>
  );
}

/**
 * /tax: what a change to each tax raises, from HMRC's ready reckoner, one
 * card each. Every figure, year and date comes from the sandbox's levers and
 * HMRC's observations (lib/reckoner.ts).
 */
export default function TaxIndexPage() {
  const seed = getSeed();
  const r = getReckoner();
  const { edition } = r;
  const largest = largestLine(r.largest.first?.spec, r.largest.last?.spec, edition.firstYear, edition.lastYear);
  const questions = faq();

  return (
    <SourcesProvider sources={seed.sources}>
      <JsonLd data={indexJsonLd(r, RECKONER_TITLE, description(), RECKONER_PATH, questions)} />
      <SiteHeader current="/#scenario" />
      <main className="mx-auto grid max-w-[1000px] gap-12 px-4 pb-20 pt-10 sm:px-6">
        <header className="grid max-w-[68ch] gap-4">
          <p className="m-0 text-label font-medium text-muted">
            HMRC estimates · <a href={edition.source.url}>{sourceName(edition)}</a>, published {edition.published}
          </p>
          <h1 className="m-0 text-[clamp(30px,4.4vw,44px)] font-semibold leading-[1.06] tracking-[-0.035em]">{RECKONER_TITLE}</h1>
          <p className="m-0 text-lead text-muted">{C.lead}</p>
          {largest && <p className="m-0 text-body">{largest}</p>}
        </header>

        <section aria-labelledby="cards-h" className="grid gap-4">
          <h2 id="cards-h" className="sr-only">
            The cards
          </h2>
          <ul className="m-0 grid list-none border-t border-line p-0">
            {r.cards.map((card) => {
              const c = card.headline;
              return (
                <li key={card.spec.slug} className="grid gap-x-8 gap-y-3 border-b border-line py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div className="grid gap-1">
                    <a href={card.path} className="text-[17px] font-semibold leading-snug">
                      {capitalise(card.spec.change)}
                    </a>
                    <span className="text-label text-muted">{card.spec.stepped ? `${c.label} ${pointsText(c.by)}, ${fromTo(c)}; more rises on the card` : fromTo(c)}</span>
                  </div>
                  <dl className="m-0 grid grid-cols-2 gap-x-8">
                    <YearFigure card={card} which="first" />
                    <YearFigure card={card} which="last" />
                  </dl>
                </li>
              );
            })}
          </ul>
          <p className="m-0 max-w-[68ch] text-label text-muted">
            Each figure is HMRC&apos;s, for a change made at the start of {edition.firstYear}, on its own. The range is {bandText(edition.band)} either side, our
            usual band where a source gives none. A minus is a net loss: HMRC expects less tax, not more.
          </p>
        </section>

        <section aria-labelledby="how-h" className="grid gap-6 border-t border-line pt-8">
          <h2 id="how-h" className={h2}>
            How these figures work
          </h2>
          <div className="grid gap-x-10 gap-y-6 text-sm md:grid-cols-2">
            {questions.map(({ q, a }) => (
              <div key={q} className="grid max-w-[60ch] gap-1.5">
                <h3 className="m-0 text-body font-semibold text-ink">{q}</h3>
                <p className="m-0 text-muted">{a}</p>
              </div>
            ))}
          </div>
          <p className="m-0 text-muted">
            Try any change, or several together, in <a href="/#scenario">the sandbox</a>; see <a href="/method">how the numbers are made</a>.
          </p>
        </section>
      </main>
    </SourcesProvider>
  );
}
