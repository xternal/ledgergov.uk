import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReckonerYear } from "@ledger/engine";
import { getSeed } from "@/lib/data";
import { leverValueText } from "@/lib/levers";
import { BUDGET } from "@/lib/budget";
import {
  bandText,
  capitalise,
  cardDescription,
  cardJsonLd,
  cardTitle,
  effectWords,
  findCard,
  fromTo,
  getReckoner,
  hmrcFigure,
  pointsText,
  quoteText,
  rangeEnds,
  rateText,
  sourceName,
  type CardChange,
  type ReckonerCard,
} from "@/lib/reckoner";
import { RECKONER_COPY as C, RECKONER_PATH, RECKONER_TITLE } from "@/lib/reckoner-copy";
import { SiteHeader } from "@/components/SiteHeader";
import { JsonLd } from "@/components/JsonLd";
import { CopyButton } from "@/components/CopyButton";
import { QualityBadge, SourcesProvider, WithProvenance } from "@/components/ui";
import { OPEN_GRAPH } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getReckoner().cards.map((c) => ({ slug: c.spec.slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const card = findCard((await params).slug);
  if (!card) return {};
  const { edition } = getReckoner();
  const title = cardTitle(card);
  const description = cardDescription(card, edition);
  return {
    title: `${title} | LedgerGov.UK`,
    description,
    alternates: { canonical: card.path },
    openGraph: { ...OPEN_GRAPH, title, description, type: "article", url: card.path, section: RECKONER_TITLE },
    twitter: { card: "summary_large_image", title, description },
  };
}

const provenanceOf = (c: CardChange) => ({ quality: c.quality, source_id: c.source_id, method_note: c.lever.method_note });
const tone = (bn: number) => (bn < 0 ? "text-debt-ink" : "text-rec");

/** "range £6.2bn to £7.6bn", each end kept on one line. */
function RangeLine({ y, prefix = "" }: { y: ReckonerYear; prefix?: string }) {
  const [low, high] = rangeEnds(y.range);
  return (
    <>
      {prefix}
      <span className="whitespace-nowrap">{low}</span> to <span className="whitespace-nowrap">{high}</span>
    </>
  );
}

/** One year of a per-unit card: HMRC's figure, large, with its range and provenance. */
function Year({ c, y, label }: { c: CardChange; y: ReckonerYear; label: string }) {
  return (
    <div className="grid content-start gap-1">
      <div className="text-label text-muted">
        {y.period}, {label}
      </div>
      {/* The tip opens rightwards: on a phone the two years stack at the left edge. */}
      <WithProvenance p={provenanceOf(c)}>
        <span className={`text-[clamp(36px,7vw,52px)] font-semibold leading-none tracking-[var(--tracking-figure)] ${tone(y.range[1])}`}>{hmrcFigure(y.range[1])}</span>
      </WithProvenance>
      <div className="text-label text-muted">
        <RangeLine y={y} prefix={y.range[1] < 0 ? "a net loss; range " : "range "} />
      </div>
    </div>
  );
}

/** A figure in a step table: HMRC's figure and its range. The table's provenance sits once above it, where its tip has room. */
function StepCell({ y }: { y: ReckonerYear }) {
  return (
    <td className="py-3 pr-3 align-top">
      <span className={`text-[17px] font-semibold ${tone(y.range[1])}`}>{hmrcFigure(y.range[1])}</span>
      <span className="block text-caption text-muted">
        <RangeLine y={y} />
      </span>
    </td>
  );
}

/** A stepped card (capital gains tax): each lever's steps as HMRC costs them, nothing in between. */
function Steps({ card }: { card: ReckonerCard }) {
  return (
    <>
      {card.spec.levers.map(({ lever_id, label }) => {
        const rows = card.changes.filter((c) => c.lever_id === lever_id);
        const head = rows[0]!;
        const id = `${lever_id}-h`;
        return (
          <section key={lever_id} aria-labelledby={id} className="grid gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id={id} className="m-0 text-title font-semibold">
                {label}, {leverValueText(head.lever, head.from)} now
              </h2>
              <WithProvenance p={provenanceOf(head)}>
                <QualityBadge quality={head.quality}>Where these figures come from</QualityBadge>
              </WithProvenance>
            </div>
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                HMRC&apos;s estimates for raising the {label.toLowerCase()} of {card.spec.short.toLowerCase()}, in pounds a year. A minus is a net loss.
              </caption>
              <thead>
                <tr className="border-b border-line text-left text-caption text-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Rise
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {head.first.period}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {head.last.period}
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    <span className="sr-only">Sandbox</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.by} className="border-b border-line">
                    <th scope="row" className="py-3 pr-3 text-left align-top font-medium">
                      {pointsText(c.by)}
                      <span className="block text-caption font-normal text-muted">{fromTo(c)}</span>
                    </th>
                    <StepCell y={c.first} />
                    <StepCell y={c.last} />
                    <td className="py-3 text-right align-top">
                      <a href={c.sandboxHref} className="whitespace-nowrap text-label font-medium">
                        Try it<span className="sr-only">: {label.toLowerCase()} {fromTo(c)} in the sandbox</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      <p className="m-0 text-label text-muted">A minus is a net loss: HMRC expects less tax, not more, because people sell fewer assets.</p>
    </>
  );
}

/**
 * /tax/<slug>: one tax change and what HMRC says it raises, to quote and link
 * to. Every figure is the sandbox lever's, checked against HMRC's observation
 * (lib/reckoner.ts); the words are in lib/reckoner-copy.ts.
 */
export default async function TaxCardPage({ params }: Props) {
  const card = findCard((await params).slug);
  if (!card) notFound();
  const seed = getSeed();
  const r = getReckoner();
  const { edition } = r;
  const c = card.headline;
  const quote = quoteText(card, edition);
  const rows = [...new Set(card.changes.map((x) => x.row).filter((x): x is string => !!x))];
  const others = r.cards.filter((o) => o !== card);

  return (
    <SourcesProvider sources={seed.sources}>
      <JsonLd data={cardJsonLd(card, edition, RECKONER_TITLE)} />
      <SiteHeader current="/#scenario" />
      <main className="mx-auto grid max-w-[880px] gap-10 px-4 pb-20 pt-10 sm:px-6">
        <header className="grid gap-4">
          <a href={RECKONER_PATH} className="justify-self-start text-label font-medium no-underline">
            ← {C.allCards}
          </a>
          <p className="m-0 text-label font-medium text-muted">HMRC&apos;s estimate · edition published {edition.published}</p>
          <h1 className="m-0 text-[clamp(30px,4.4vw,44px)] font-semibold leading-[1.06] tracking-[-0.035em]">{cardTitle(card)}</h1>
          <p className="m-0 max-w-[68ch] text-lead text-muted">{card.spec.about(rateText(card))}</p>
        </header>

        {card.spec.stepped ? (
          <Steps card={card} />
        ) : (
          <section aria-label={`What ${card.spec.change} raises`} className="grid gap-6 border-y border-line py-6 sm:grid-cols-2">
            <Year c={c} y={c.first} label="the first year" />
            <Year c={c} y={c.last} label="the last year HMRC shows" />
          </section>
        )}

        <div className="grid max-w-[68ch] gap-2">
          <p className="m-0">
            <span className="font-semibold">HMRC&apos;s caveat.</span> {card.spec.caveat}
          </p>
          <p className="m-0 text-muted">{card.spec.eitherWay ? C.eitherWay(card.spec.unit) : C.riseOnly}</p>
        </div>

        {!card.spec.stepped && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <a href={c.sandboxHref} className="rounded-control bg-ink px-4 py-2 text-sm font-semibold text-bg no-underline hover:opacity-90">
              {C.sandbox}
            </a>
            <span className="text-label text-muted">{C.sandboxNote}</span>
          </div>
        )}

        <section aria-labelledby="quote-h" className="grid gap-3 rounded-panel bg-sunk p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="quote-h" className="m-0 text-label font-semibold">
              {C.quoteTitle}
            </h2>
            <CopyButton text={quote} label="Copy the quote" />
          </div>
          <p className="m-0 [overflow-wrap:anywhere]">{quote}</p>
        </section>

        <section aria-labelledby="source-h" className="grid max-w-[68ch] gap-3 border-t border-line pt-8">
          <h2 id="source-h" className="m-0 text-title font-semibold">
            Where this comes from
          </h2>
          <p className="m-0 text-muted">
            From HMRC&apos;s <a href={edition.source.url}>{sourceName(edition)}</a>, the edition published {edition.published}, the latest (on file as{" "}
            {edition.vintage}).{" "}
            {rows.length > 0 && (
              <>
                HMRC&apos;s {rows.length > 1 ? "rows" : "row"}: {rows.map((row) => `“${row}”`).join("; ")}.
              </>
            )}
          </p>
          <p className="m-0 text-muted">
            HMRC works out each figure for a change made at the start of {edition.firstYear}, on its own, on the official forecast of the time, and shows each
            year to {edition.lastYear}. It includes how taxpayers respond, where HMRC models it, but no wider effects on the economy. HMRC publishes one
            figure a year; we show a range of {bandText(edition.band)} either side of it, our usual band where a source gives none.
          </p>
          <p className="m-0 text-muted">
            See <a href="/method">how the numbers are made</a>, or the <a href="/budget">{BUDGET.name}</a> page.
          </p>
        </section>

        <nav aria-labelledby="others-h" className="grid gap-3">
          <h2 id="others-h" className="m-0 text-title font-semibold">
            Other tax changes
          </h2>
          <ul className="m-0 grid list-none border-t border-line p-0">
            {others.map((o) => (
              <li key={o.spec.slug} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line py-3">
                <a href={o.path} className="font-medium">
                  {capitalise(o.spec.change)}
                </a>
                <span className="text-label text-muted">
                  {o.spec.stepped ? `${o.headline.label.toLowerCase()} ${pointsText(o.headline.by)}: ` : ""}
                  {effectWords(o.headline.first.range[1])} in {o.headline.first.period}
                </span>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </SourcesProvider>
  );
}
