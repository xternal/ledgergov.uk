import type { Metadata } from "next";
import type { BorrowingBundle, BorrowingFigure } from "@ledger/schema";
import { getBorrowing } from "@/lib/data";
import { SiteHeader } from "@/components/SiteHeader";
import { BorrowingChart } from "@/components/BorrowingChart";
import { JsonLd } from "@/components/JsonLd";
import { QualityBadge, SourcesProvider, WithProvenance } from "@/components/ui";
import { QUALITY_HELP } from "@/lib/copy";
import { gbpBn, longDate, signedBn } from "@/lib/format";
import { todayIso } from "@/lib/promises";
import { BUDGET } from "@/lib/budget";
import {
  BORROWING_COPY as T,
  borrowingDescription,
  borrowingFaq,
  borrowingShareTitle,
  borrowingTitle,
  borrowingView,
  monthLong,
  nextMonth,
  ukDay,
  ukTime,
} from "@/lib/borrowing-copy";
import { absolute, MAKER, OPEN_GRAPH, SITE_NAME } from "@/lib/site";

/** Re-render hourly, so "next figures" turns into "new figures are out" on release day without a deploy. */
export const revalidate = 3600;

export function generateMetadata(): Metadata {
  const b = getBorrowing();
  const title = borrowingShareTitle(b);
  const description = borrowingDescription(b);
  return {
    title: `${borrowingTitle(b)} | LedgerGov.UK`,
    description,
    alternates: { canonical: "/borrowing" },
    openGraph: { ...OPEN_GRAPH, title, description, type: "article", url: "/borrowing" },
    twitter: { card: "summary_large_image", title, description },
  };
}

function structuredData(b: BorrowingBundle, today: string) {
  const description = borrowingDescription(b);
  const edition = (id: string) =>
    id === "ons_psf" ? b.outturn.provenance.vintage : id === "obr_monthly_profiles" ? b.profile?.provenance.vintage : b.year_forecast?.vintage;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: `UK public sector borrowing so far in ${b.fiscal_year}, month by month, against the OBR forecast`,
      description,
      url: absolute("/borrowing"),
      inLanguage: "en-GB",
      isAccessibleForFree: true,
      license: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
      creator: { "@type": "Organization", "@id": absolute("/#org"), name: SITE_NAME, url: absolute("/") },
      author: { "@type": "Person", name: MAKER.name, url: MAKER.url },
      ...(b.release?.released_at ? { dateModified: b.release.released_at } : {}),
      temporalCoverage: `${b.months[0]}/${b.months.at(-1)}`,
      spatialCoverage: { "@type": "Place", name: "United Kingdom" },
      variableMeasured: ["Public sector net borrowing, excluding public sector banks (ONS)", "OBR monthly profile of public sector net borrowing"],
      isBasedOn: b.sources.map((s) => ({
        "@type": "Dataset",
        name: s.title,
        url: s.url,
        publisher: { "@type": "Organization", name: s.publisher },
        ...(s.published_on ? { datePublished: s.published_on } : {}),
        ...(edition(s.id) ? { version: edition(s.id) } : {}),
      })),
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: absolute("/") },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: absolute("/") },
        { "@type": "ListItem", position: 2, name: "Statement", item: absolute("/#statement") },
        { "@type": "ListItem", position: 3, name: T.h1, item: absolute("/borrowing") },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: borrowingFaq(b, today).map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];
}

const SOURCE_ORDER = ["ons_psf", "obr_monthly_profiles", "obr_efo"];

/** A headline number with its provenance one focus away. Figures on the right open their tip leftwards. */
function Figure({ f, value, label, detail, tone, align = "start" }: { f: BorrowingFigure; value: string; label: string; detail: string; tone?: string; align?: "start" | "end" }) {
  return (
    <div className="grid content-start gap-1 border-t border-line pt-3">
      <WithProvenance p={f} align={align} className="w-full">
        <span className={`text-figure font-semibold tracking-figure tabular-nums ${tone ?? ""}`}>{value}</span>
      </WithProvenance>
      <span className="text-label text-ink">{label}</span>
      <span className="text-caption text-muted">{detail}</span>
    </div>
  );
}

export default function BorrowingPage() {
  const b = getBorrowing();
  const v = borrowingView(b);
  const today = todayIso();
  const faq = borrowingFaq(b, today);
  const r = b.release;
  const s = b.so_far;
  const edition = b.profile?.edition;
  const vintages: Record<string, string | undefined> = {
    ons_psf: b.outturn.provenance.vintage,
    obr_monthly_profiles: b.profile?.provenance.vintage,
    obr_efo: b.year_forecast?.vintage,
  };
  const beforeBudget = today < BUDGET.date;
  // The figures first, then the forecast they are compared with.
  const sources = [...b.sources].sort((x, y) => SOURCE_ORDER.indexOf(x.id) - SOURCE_ORDER.indexOf(y.id));

  return (
    <>
      <JsonLd data={structuredData(b, today)} />
      <SiteHeader current="/#statement" />
      <SourcesProvider sources={b.sources}>
        <main className="mx-auto grid max-w-[1200px] grid-cols-[minmax(0,1fr)] gap-10 px-4 pb-20 pt-10 sm:px-6">
          <header className="grid max-w-[70ch] gap-3">
            <a href="/#statement" className="justify-self-start text-label font-medium">
              {T.back}
            </a>
            <h1 className="m-0 text-[clamp(30px,4.4vw,44px)] font-semibold leading-[1.06] tracking-[-0.035em]">{T.h1}</h1>
            <p className="m-0 text-lead text-muted">
              From {v.span} the government borrowed <b className="font-semibold text-ink">{gbpBn(v.out)}</b>
              {v.diff !== null && edition ? (
                v.versus === "in line with" ? (
                  <>, in line with the Office for Budget Responsibility&apos;s forecast for those months.</>
                ) : (
                  <>
                    , <b className="font-semibold text-ink">{gbpBn(Math.abs(v.diff))} {v.diff > 0 ? "more" : "less"}</b> than the Office for Budget
                    Responsibility (OBR) expected for those months in its {edition} forecast.
                  </>
                )
              ) : (
                <>.</>
              )}{" "}
              {b.year_forecast && (
                <>
                  For the whole year to {monthLong(b.months.at(-1)!)} the OBR forecasts {gbpBn(b.year_forecast.bn)}.
                </>
              )}
            </p>
            {r && (
              <p className="m-0 text-label text-muted">
                Latest figures:{" "}
                <a href={r.url} className="font-medium">
                  {r.title}
                </a>
                , ONS,{" "}
                <a href={r.calendar_url}>
                  published {r.released_at ? `${ukDay(r.released_at)} at ${ukTime(r.released_at)}` : longDate(b.sources.find((x) => x.id === "ons_psf")?.published_on ?? "")}
                </a>
                .
              </p>
            )}
          </header>

          <section aria-label={`Borrowing from ${v.span}`} className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
            <Figure f={s.outturn} value={gbpBn(s.outturn.bn)} label={`borrowed from ${v.span}`} detail="ONS figures, month by month" tone="text-debt-ink" />
            {s.profile && edition && (
              <Figure f={s.profile} value={gbpBn(s.profile.bn)} label="in the OBR's forecast for those months" detail={`Its ${edition} forecast, split by month`} align="end" />
            )}
            {s.difference && v.versus && (
              <Figure
                f={s.difference}
                value={signedBn(s.difference.bn)}
                label={v.versus === "in line with" ? "in line with the forecast" : `${v.versus} the forecast so far`}
                detail="ONS figures minus the OBR's path"
                tone={v.versus === "above" ? "text-bad" : v.versus === "below" ? "text-good" : ""}
              />
            )}
            {s.last_year && v.lastYear !== null && (
              <Figure f={s.last_year} value={gbpBn(s.last_year.bn)} label={`in the same months a year earlier`} detail={`${v.lastYearSpan}, as since revised`} align="end" />
            )}
          </section>

          {v.newerForecast && b.year_forecast && edition && (
            <p className="m-0 max-w-[70ch] border-l-2 border-line-strong pl-4 text-muted">
              The OBR&apos;s {b.year_forecast.edition} forecast puts borrowing for the whole year at {gbpBn(b.year_forecast.bn)}. It has not yet split that forecast
              into months, so the comparison here still uses its {edition} path.
            </p>
          )}
          {!b.profile && (
            <p className="m-0 max-w-[70ch] border-l-2 border-line-strong pl-4 text-muted">
              The OBR has not yet published its month-by-month path for {b.fiscal_year}, so this page shows the ONS figures on their own for now.
            </p>
          )}

          <section aria-labelledby="chart-h" className="grid max-w-[900px] gap-3">
            <h2 id="chart-h" className="m-0 text-title font-semibold">
              Month by month
            </h2>
            <p className="m-0 max-w-[70ch] text-muted">
              Each point is the total borrowed since April. The orange line stops at {v.through}, the newest month ONS has published; the dashed line is where
              the OBR&apos;s forecast expected the total to be at each month{b.last_year ? ", and the thin line is last year for comparison" : ""}.
            </p>
            <BorrowingChart b={b} />
          </section>

          <section aria-labelledby="when-h" className="grid gap-x-10 gap-y-6 border-t border-line pt-10 md:grid-cols-2">
            <div className="grid max-w-[62ch] content-start gap-3">
              <h2 id="when-h" className="m-0 text-title font-semibold">
                When the figures change
              </h2>
              {r ? (
                <p className="m-0 text-muted">
                  The Office for National Statistics publishes borrowing once a month. These figures, to {v.through}, come from{" "}
                  <a href={r.url}>{r.title}</a>, published{" "}
                  {r.released_at ? `on ${ukDay(r.released_at)} at ${ukTime(r.released_at)}` : "this month"}.{" "}
                  {r.next_on &&
                    (r.next_on > today
                      ? `The next release, with figures to ${monthLong(nextMonth(b.through))}, is due on ${ukDay(r.next_on)}${r.next_at ? ` at ${ukTime(r.next_at)}` : ""}.`
                      : `ONS's next release was due on ${ukDay(r.next_on)}; this page changes once we have read it.`)}
                </p>
              ) : (
                <p className="m-0 text-muted">The Office for National Statistics publishes borrowing once a month.</p>
              )}
              <p className="m-0 text-muted">
                Our data job reads each new release early the next morning and updates this page once the change has been checked. ONS revises recent months
                in every release, so the total so far can move.
              </p>
            </div>
            <div className="grid max-w-[62ch] content-start gap-3">
              <h2 className="m-0 text-title font-semibold">About the forecast path</h2>
              {b.profile ? (
                <p className="m-0 text-muted">
                  The OBR forecasts borrowing for the whole year. To let anyone check progress, it splits that forecast into months using past patterns of tax
                  and spending: its path for {b.fiscal_year}, from the {b.profile.edition} forecast, came out
                  {b.profile.published_on ? ` on ${ukDay(b.profile.published_on)}` : ""}. The OBR calls it broad-brush and illustrative and publishes it as one
                  line with no range, so it is drawn as one line here. A gap part way through the year can grow or close by March.
                </p>
              ) : (
                <p className="m-0 text-muted">
                  The OBR forecasts borrowing for the whole year and, some weeks after each forecast, splits it into months so progress can be checked. This
                  page compares with that path once it is out.
                </p>
              )}
              {beforeBudget && (
                <p className="m-0 text-muted">
                  The Chancellor presents the <a href="/budget">{BUDGET.name}</a> on {ukDay(BUDGET.date)}, with a new OBR forecast. Whether borrowing is
                  running above or below the last forecast is part of the background to it.
                </p>
              )}
            </div>
          </section>

          <section aria-labelledby="faq-h" className="border-t border-line pt-10">
            <h2 id="faq-h" className="m-0 mb-6 text-title font-semibold">
              Questions
            </h2>
            <div className="grid gap-x-10 gap-y-6 text-sm md:grid-cols-2">
              {faq.map(({ q, a }) => (
                <div key={q} className="grid max-w-[60ch] gap-1.5">
                  <h3 className="m-0 text-body font-semibold text-ink">{q}</h3>
                  <p className="m-0 text-muted">{a}</p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="sources-h" className="border-t border-line pt-10">
            <h2 id="sources-h" className="m-0 mb-4 text-title font-semibold">
              {T.sourcesTitle}
            </h2>
            <ul className="m-0 grid list-none gap-3 p-0 text-label">
              {sources.map((src) => (
                <li key={src.id} className="grid gap-0.5">
                  <a href={src.url} target="_blank" rel="noopener noreferrer" className="font-medium">
                    {src.title}
                  </a>
                  <span className="text-muted">
                    {src.publisher}
                    {src.published_on ? `, published ${longDate(src.published_on)}` : ""}
                    {vintages[src.id] ? `. Edition used: ${vintages[src.id]}` : ""}
                    {src.licence ? `. ${src.licence}` : ""}.
                  </span>
                </li>
              ))}
            </ul>
            <ul className="m-0 mt-5 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-caption text-muted">
              <li className="flex items-center gap-2">
                <QualityBadge quality="sourced" />
                <span>{QUALITY_HELP.sourced} Totals so far are sums of the published months, as in the ONS bulletin.</span>
              </li>
              <li>Hover over or focus a number to see its method and source.</li>
            </ul>
            <p className="m-0 mt-4 max-w-[70ch] text-caption text-muted">
              See the whole year&apos;s income and spending in <a href="/#statement">the Statement</a>, and <a href="/method">how the numbers are made</a>.
            </p>
          </section>
        </main>
      </SourcesProvider>
    </>
  );
}
