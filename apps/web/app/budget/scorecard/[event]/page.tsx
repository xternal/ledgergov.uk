import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { countedLines, effectOf, scorecardPageUrl, scorecardTotal, type BudgetScorecard, type ScorecardMeasure, type ScorecardTotal } from "@ledger/schema";
import { getScorecards } from "@/lib/data";
import { BUDGET } from "@/lib/budget";
import { longDate } from "@/lib/format";
import {
  HEAD_LABEL,
  TOTAL_KIND_LABEL,
  cellText,
  effectText,
  footTotals,
  gbpMExact,
  gbpMShort,
  groupedRows,
  largest,
  scorecardCopy,
  scorecardPath,
} from "@/lib/scorecard";
import { SiteHeader } from "@/components/SiteHeader";
import { BudgetNav } from "@/components/BudgetNav";
import { NavLinks } from "@/components/NavLinks";
import { JsonLd } from "@/components/JsonLd";
import { absolute, MAKER, OPEN_GRAPH, SITE_NAME } from "@/lib/site";

type Props = { params: Promise<{ event: string }> };

const load = (id: string): BudgetScorecard | null => getScorecards().find((s) => s.id === id) ?? null;

export function generateStaticParams() {
  return getScorecards().map((s) => ({ event: s.id }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = load((await params).event);
  if (!s) return {};
  const { title, description } = scorecardCopy(s);
  const path = scorecardPath(s);
  return {
    title: `${title} | LedgerGov.UK`,
    description,
    alternates: { canonical: path },
    openGraph: { ...OPEN_GRAPH, title, description, type: "article", url: path },
    twitter: { card: "summary_large_image", title, description },
  };
}

const h2 = "m-0 text-title font-semibold";
const section = "grid grid-cols-[minmax(0,1fr)] gap-4 scroll-mt-10";
const TOP_EACH_WAY = 5;
const SECTIONS = [
  { href: "#summary", label: "Summary" },
  { href: "#biggest", label: "Biggest" },
  { href: "#measures", label: "Every measure" },
  { href: "#years", label: "Every year" },
  { href: "#how", label: "How it is made" },
];

const effectClass = (v: number) => (effectOf(v) === "raises" ? "text-rec" : effectOf(v) === "costs" ? "text-debt-ink" : "text-muted");
/** The words before the colon, when the Treasury names a measure "Subject: what it does". */
const shortName = (m: ScorecardMeasure) => (m.name.includes(":") && m.name.indexOf(":") < 70 ? m.name.slice(0, m.name.indexOf(":")) : m.name);

/**
 * /budget/scorecard/<event>: every line of the Treasury's table of policy decisions for one fiscal event, as
 * printed, built only from data/build/budget/<event>.json (etl/budget_costings.py). The page leads with the
 * last year the Treasury costs and keeps every year in the full table.
 */
export default async function ScorecardPage({ params }: Props) {
  const s = load((await params).event);
  if (!s) notFound();
  const { title, description, summary, netText } = scorecardCopy(s);
  const i = summary.index;
  const year = summary.year;
  const path = scorecardPath(s);
  const total = scorecardTotal(s);
  const others = getScorecards().filter((x) => x.id !== s.id);
  const groups = groupedRows(s);
  const counted = countedLines(s).length;
  const ofWhich = s.measures.length - counted;
  const copyKind = s.source.copy_url ? (s.source.copy_url.endsWith(".xlsx") ? "the Treasury's own spreadsheet of the table" : "the table as GOV.UK publishes it in HTML") : null;
  const firstPage = s.table.pages[0]!;
  const lastPage = s.table.pages.at(-1)!;
  const failed = s.checks.filter((c) => !c.ok);

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: title,
      description,
      url: absolute(path),
      inLanguage: "en-GB",
      isAccessibleForFree: true,
      license: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
      creator: { "@type": "GovernmentOrganization", name: s.source.publisher },
      publisher: { "@type": "Organization", "@id": absolute("/#org"), name: SITE_NAME, url: absolute("/") },
      author: { "@type": "Person", name: MAKER.name, url: MAKER.url },
      datePublished: s.date,
      isBasedOn: s.source.document_url,
      temporalCoverage: `${s.years[0]!.slice(0, 4)}-04/${s.years.at(-1)!.slice(0, 4)}-03`,
      spatialCoverage: { "@type": "Place", name: "United Kingdom" },
      variableMeasured: `Exchequer impact of each policy decision, £ million a year (${s.years[0]} to ${s.years.at(-1)})`,
      about: { "@type": "Event", name: s.name, startDate: s.date, organizer: { "@type": "GovernmentOrganization", name: "HM Treasury" } },
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: absolute("/") },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Promise ledger", item: absolute("/promises") },
        { "@type": "ListItem", position: 2, name: BUDGET.name, item: absolute("/budget") },
        { "@type": "ListItem", position: 3, name: `${s.name} scorecard`, item: absolute(path) },
      ],
    },
  ];

  return (
    <>
      <JsonLd data={structuredData} />
      <SiteHeader current="/promises" />
      <div className="sticky top-14 z-10 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1000px] px-2 py-1.5 sm:px-4">
          <NavLinks links={SECTIONS} spy label="On this page" />
        </div>
      </div>
      <main className="mx-auto grid max-w-[1000px] grid-cols-[minmax(0,1fr)] gap-12 px-4 pb-20 pt-10 sm:px-6">
        <header className="grid max-w-[70ch] gap-4">
          <BudgetNav current={path} />
          <a href="/budget" className="justify-self-start text-label font-medium">
            {BUDGET.name}
          </a>
          <p className="m-0 text-label font-medium text-muted">
            {longDate(s.date)} · HM Treasury, {s.source.title}, Table {s.table.number}
          </p>
          <h1 className="m-0 text-[clamp(30px,4.4vw,44px)] font-semibold leading-[1.06] tracking-[-0.035em]">{title}</h1>
          <p className="m-0 text-lead text-muted">
            Every Budget comes with a table of its policy decisions: each new measure, with what it does to the public finances in every year from {s.years[0]}{" "}
            to {s.years.at(-1)}. Here are all {s.measures.length} lines as the Treasury printed them, each linked to its page. We lead with {year}, the
            last year the Treasury costs, when most measures have settled; every year is in the full table.
          </p>
          <p className="m-0 text-muted">
            A measure that <span className="font-medium text-rec">raises</span> money brings in tax or saves spending. One that{" "}
            <span className="font-medium text-debt-ink">costs</span> money cuts tax or spends more; unless something else pays for it, the government borrows
            it. These are the Treasury&apos;s own estimates, published as single figures without a range.
          </p>
        </header>

        <section id="summary" aria-labelledby="summary-h" className={section}>
          <h2 id="summary-h" className="sr-only">
            Summary
          </h2>
          <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 sm:grid-cols-4">
            <div className="grid content-start gap-0.5">
              <dt className="text-label text-muted">All the measures, {year}</dt>
              <dd className={`m-0 text-figure font-semibold tracking-figure tabular-nums ${effectClass(summary.total)}`}>
                {effectOf(summary.total) === "nil" ? gbpMShort(0) : gbpMShort(summary.total)}
              </dd>
              <dd className="m-0 text-caption text-muted">{effectOf(summary.total) === "nil" ? "no net effect" : effectOf(summary.total) === "raises" ? "raised that year, net" : "cost that year, net"}</dd>
            </div>
            <div className="grid content-start gap-0.5">
              <dt className="text-label text-muted">Raise money</dt>
              <dd className="m-0 text-figure font-semibold tracking-figure tabular-nums text-rec">{gbpMShort(summary.raises.m)}</dd>
              <dd className="m-0 text-caption text-muted">{summary.raises.count} measures</dd>
            </div>
            <div className="grid content-start gap-0.5">
              <dt className="text-label text-muted">Cost money</dt>
              <dd className="m-0 text-figure font-semibold tracking-figure tabular-nums text-debt-ink">{gbpMShort(summary.costs.m)}</dd>
              <dd className="m-0 text-caption text-muted">{summary.costs.count} measures</dd>
            </div>
            <div className="grid content-start gap-0.5">
              <dt className="text-label text-muted">No effect in {year}</dt>
              <dd className="m-0 text-figure font-semibold tracking-figure tabular-nums">{summary.nil}</dd>
              <dd className="m-0 text-caption text-muted">measures with nothing that year</dd>
            </div>
          </dl>
          <div className="grid max-w-[70ch] gap-2 rounded-control border border-line bg-sunk/60 px-4 py-4">
            <p className="m-0 font-semibold">It adds up</p>
            <p className="m-0 text-muted">
              The Treasury&apos;s total for {year} is <b className="font-semibold text-ink">{gbpMExact(summary.total)}</b>. Its {counted} lines
              {ofWhich > 0 ? ` (leaving out ${ofWhich} “of which” lines, which are part of the line above)` : ""} add up to{" "}
              <b className="font-semibold text-ink">{gbpMExact(summary.sum)}</b>
              {summary.difference === 0
                ? ", exactly the same."
                : `: ${gbpMExact(summary.difference)} apart, which is rounding. The Treasury rounds each line to the nearest £${s.rounding_m}m and adds up before rounding, so the printed lines can drift from the printed total by a few million.`}{" "}
              Together the measures {netText} in {year}.
            </p>
            <p className="m-0 text-label text-muted">
              Read from <a href={scorecardPageUrl(s, firstPage)}>{s.source.title}, Table {s.table.number}</a> (pages {firstPage} to {lastPage} of the PDF)
              {copyKind ? (
                <>
                  , and checked line by line against <a href={s.source.copy_url}>{copyKind}</a>: every figure matches
                  {s.copy_differences?.length ? <> (<a href="#how">{s.copy_differences.length === 1 ? "one line" : `${s.copy_differences.length} lines`} worded or labelled differently</a>)</> : null}.
                </>
              ) : (
                "."
              )}
            </p>
          </div>
        </section>

        <section id="biggest" aria-labelledby="biggest-h" className={section}>
          <div className="grid max-w-[70ch] gap-1">
            <h2 id="biggest-h" className={h2}>
              The biggest in {year}
            </h2>
            <p className="m-0 text-muted">The measures that raise the most and cost the most that year. Each links to its line below.</p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2">
            {(["raises", "costs"] as const).map((way) => (
              <div key={way} className="grid content-start gap-2">
                <h3 className="m-0 text-label font-semibold uppercase tracking-[0.06em] text-muted">{way === "raises" ? "Raise the most" : "Cost the most"}</h3>
                <ol className="m-0 grid list-none border-t border-line p-0">
                  {largest(s, way, TOP_EACH_WAY).map((m) => (
                    <li key={String(m.line)} className="flex items-baseline justify-between gap-4 border-b border-line py-2.5">
                      <a href={`#line-${m.line}`} className="min-w-0 text-ink">
                        {shortName(m)}
                      </a>
                      <span className={`shrink-0 font-semibold tabular-nums ${effectClass(m.values[i]!)}`}>{gbpMShort(m.values[i]!)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

        <section id="measures" aria-labelledby="measures-h" className={section}>
          <div className="grid max-w-[70ch] gap-1">
            <h2 id="measures-h" className={h2}>
              Every measure, under the Treasury&apos;s headings
            </h2>
            <p className="m-0 text-muted">
              In the table&apos;s own order and words, with what each line does in {year}. The page number opens the Budget document at that line.
              {s.table.has_head ? " The Treasury marks each line as tax or spending by its largest effect." : ""}
            </p>
          </div>
          {groups.map((g, gi) => (
            <div key={gi} className="grid gap-2">
              {g.group && <h3 className="m-0 text-[16px] font-semibold">{g.group}</h3>}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">
                    {g.group ?? s.name}: each line, what it does in {year}, and its page
                  </caption>
                  <thead>
                    <tr className="border-b border-line-strong text-caption text-muted">
                      <th scope="col" className="w-10 py-2 pr-2 font-medium">
                        Line
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Measure
                      </th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">
                        {year}
                      </th>
                      <th scope="col" className="w-12 py-2 text-right font-medium">
                        Page
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.measures.map((m) => (
                      <MeasureRow key={String(m.line)} s={s} m={m} i={i} notes={g.notes.filter((t) => t.after_line === m.line)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <div className="grid gap-2">
            <h3 className="m-0 text-[16px] font-semibold">The Treasury&apos;s totals</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">The totals at the foot of the table, for {year}</caption>
                <tbody>
                  {footTotals(s).map((t) => (
                    <TotalRowView key={t.label} s={s} t={t} i={i} />
                  ))}
                </tbody>
              </table>
            </div>
            {s.table.has_head && (
              <p className="m-0 text-label text-muted">
                The tax and spending totals count both sides of every measure, so they need not match the lines marked tax or spending.
              </p>
            )}
          </div>
        </section>

        <section id="years" aria-labelledby="years-h" className={section}>
          <div className="grid max-w-[70ch] gap-1">
            <h2 id="years-h" className={h2}>
              Every year, every line
            </h2>
            <p className="m-0 text-muted">
              The whole table in £ million as printed, with the sum of the lines and the rounding gap for each year. &ldquo;*&rdquo; is the Treasury&apos;s
              mark for a negligible figure.
            </p>
          </div>
          <details className="group">
            <summary className="cursor-pointer text-label font-medium text-accent">
              <span className="group-open:hidden">Show the full table</span>
              <span className="hidden group-open:inline">Hide the full table</span>
            </summary>
            <div role="region" aria-label={`${s.name}: every line for every year`} tabIndex={0} className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-caption tabular-nums">
                <caption className="sr-only">
                  {s.name} policy decisions, £ million, {s.years[0]} to {s.years.at(-1)}
                </caption>
                <thead>
                  <tr className="border-b border-line-strong text-muted">
                    <th scope="col" className="py-2 pr-2 font-medium">
                      Line
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Measure
                    </th>
                    {s.years.map((y) => (
                      <th key={y} scope="col" className="py-2 pl-2 text-right font-medium">
                        {y}
                      </th>
                    ))}
                    <th scope="col" className="py-2 pl-2 text-right font-medium">
                      Page
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {s.measures.map((m) => (
                    <tr key={String(m.line)} className="border-b border-line align-top">
                      <td className="py-1.5 pr-2 text-muted">{m.line}</td>
                      <th scope="row" className={`max-w-[34ch] py-1.5 pr-3 font-normal ${m.of_which ? "pl-3 text-muted" : ""}`}>
                        {m.name}
                      </th>
                      {s.years.map((y, yi) => (
                        <td key={y} className="whitespace-nowrap py-1.5 pl-2 text-right">
                          {cellText(m, s.years, yi)}
                        </td>
                      ))}
                      <td className="py-1.5 pl-2 text-right">
                        <a href={scorecardPageUrl(s, m.page)}>{m.page}</a>
                      </td>
                    </tr>
                  ))}
                  {s.totals.map((t) => (
                    <tr key={t.label} className="border-b border-line align-top font-medium">
                      <td className="py-1.5 pr-2" />
                      <th scope="row" className="max-w-[34ch] py-1.5 pr-3 font-medium">
                        {t.label}
                      </th>
                      {s.years.map((y, yi) => (
                        <td key={y} className="whitespace-nowrap py-1.5 pl-2 text-right">
                          {cellText(t, s.years, yi)}
                        </td>
                      ))}
                      <td className="py-1.5 pl-2 text-right">
                        <a href={scorecardPageUrl(s, t.page)}>{t.page}</a>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b border-line align-top text-muted">
                    <td className="py-1.5 pr-2" />
                    <th scope="row" className="py-1.5 pr-3 font-normal">
                      The {counted} lines added up (this site)
                    </th>
                    {s.sum_of_lines.map((v, yi) => (
                      <td key={s.years[yi]} className="whitespace-nowrap py-1.5 pl-2 text-right">
                        {gbpMExact(v)}
                      </td>
                    ))}
                    <td />
                  </tr>
                  <tr className="align-top text-muted">
                    <td className="py-1.5 pr-2" />
                    <th scope="row" className="py-1.5 pr-3 font-normal">
                      Treasury total minus the lines: rounding
                    </th>
                    {s.sum_of_lines.map((v, yi) => (
                      <td key={s.years[yi]} className="whitespace-nowrap py-1.5 pl-2 text-right">
                        {gbpMExact(total.values[yi]! - v)}
                      </td>
                    ))}
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </section>

        <section id="how" aria-labelledby="how-h" className="grid max-w-[70ch] scroll-mt-10 gap-3 border-t border-line pt-8">
          <h2 id="how-h" className={h2}>
            How this page is made
          </h2>
          <p className="m-0 text-muted">
            A program reads the table from the Budget document as printed (
            <a href={s.source.document_url}>the PDF on GOV.UK</a>): every word with its place on the page, so each figure lands in its year&apos;s column and
            each line keeps its number, its words, its heading and its page. Nothing is typed in by hand except the Treasury&apos;s total, which a person
            copies from the PDF so the program&apos;s reading can be checked against it.
          </p>
          <p className="m-0 text-muted">
            Before anything is published it must pass every check: the lines run 1 to {s.measures.length} with none missing, every line has a figure for
            every year, the total matches the one copied by hand, the lines add up to it within rounding in every year
            {copyKind ? `, and every figure and total matches ${copyKind}` : ""}.{" "}
            {failed.length === 0 ? `All ${s.checks.length} checks passed.` : `${failed.length} checks failed.`}
          </p>
          <p className="m-0 text-muted">
            Signs are the Treasury&apos;s: the effect on the Exchequer, so money raised is positive and money spent or given up is negative. A
            measure&apos;s figure is the change it makes in that year compared with no change in policy; it is not the cost of a whole programme.
          </p>
          {s.copy_differences && s.copy_differences.length > 0 && (
            <>
              <h3 className="m-0 mt-2 text-[16px] font-semibold">Where the Treasury&apos;s two versions differ</h3>
              <p className="m-0 text-label text-muted">
                Every figure is the same in both. These lines differ in wording or in whether they are marked tax or spending; a person checked each in
                the printed document, and this page follows the printed document.
              </p>
              <ul className="m-0 grid gap-1.5 pl-5 text-label text-muted">
                {s.copy_differences.map((d) => (
                  <li key={`${d.line}-${d.field}`}>
                    <a href={`#line-${d.line}`}>Line {d.line}</a>: {d.reason}
                    {d.field === "name" && <> The copy reads: &ldquo;{d.copy}&rdquo;</>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {Object.keys(s.footnotes).length > 0 && (
            <>
              <h3 className="m-0 mt-2 text-[16px] font-semibold">The Treasury&apos;s notes to the table</h3>
              <ul className="m-0 grid gap-1.5 pl-5 text-label text-muted">
                {Object.entries(s.footnotes).map(([k, v]) => (
                  <li key={k}>
                    <span className="font-medium text-ink">{k}</span> {v}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="m-0 text-label text-muted">
            Source: HM Treasury, <a href={s.source.url}>{s.source.title}</a>, published {longDate(s.source.published_on)}, {s.source.licence}.
          </p>
          {others.length > 0 && (
            <p className="m-0 text-label">
              Other fiscal events:{" "}
              {others.map((o, oi) => (
                <span key={o.id}>
                  {oi > 0 && " · "}
                  <a href={scorecardPath(o)}>{o.name}</a>
                </span>
              ))}
            </p>
          )}
          <p className="m-0 text-label">
            <a href="/budget">What {BUDGET.name} could do to the government&apos;s promises</a>
          </p>
        </section>
      </main>
    </>
  );
}

/** One line of the table: its number, words and heading, what it does in the headline year, and its page. */
function MeasureRow({ s, m, i, notes }: { s: BudgetScorecard; m: ScorecardMeasure; i: number; notes: ScorecardTotal[] }) {
  const v = m.values[i]!;
  return (
    <>
      <tr id={`line-${m.line}`} className="scroll-mt-10 border-b border-line align-top target:bg-sunk">
        <td className="py-2.5 pr-2 tabular-nums text-muted">{m.line}</td>
        <th scope="row" className={`py-2.5 pr-3 font-normal leading-snug ${m.of_which ? "pl-4 text-muted" : "text-ink"}`}>
          {m.name}
          {(m.head || m.of_which) && (
            <span className="mt-0.5 block text-caption text-muted">{m.of_which ? "Part of the line above, not added again" : HEAD_LABEL[m.head!]}</span>
          )}
        </th>
        <td className="whitespace-nowrap py-2.5 pr-3 text-right">
          <span className={`block font-semibold tabular-nums ${effectClass(m.negligible?.includes(s.years[i]!) ? 0 : v)}`}>{effectText(m, s.years, i)}</span>
          <span className="block text-caption tabular-nums text-muted">{cellText(m, s.years, i)}</span>
        </td>
        <td className="py-2.5 text-right">
          <a href={scorecardPageUrl(s, m.page)} aria-label={`Line ${m.line} in the Budget document, page ${m.page} of the PDF`}>
            {m.page}
          </a>
        </td>
      </tr>
      {notes.map((t) => (
        <TotalRowView key={t.label} s={s} t={t} i={i} />
      ))}
    </>
  );
}

/** A subtotal, memo line or total as the Treasury prints it: not a measure, not added again. */
function TotalRowView({ s, t, i }: { s: BudgetScorecard; t: ScorecardTotal; i: number }) {
  const v = t.values[i]!;
  const main = t.kind === "total";
  return (
    <tr className={`border-b border-line align-top ${main ? "font-semibold" : "text-muted"}`}>
      <td className="w-10 py-2.5 pr-2" />
      <th scope="row" className={`py-2.5 pr-3 leading-snug ${main ? "font-semibold text-ink" : "font-normal"}`}>
        {t.label}
        <span className="mt-0.5 block text-caption font-normal text-muted">{TOTAL_KIND_LABEL[t.kind]}</span>
      </th>
      <td className={`whitespace-nowrap py-2.5 pr-3 text-right tabular-nums ${main ? effectClass(v) : ""}`}>{cellText(t, s.years, i)}</td>
      <td className="w-12 py-2.5 text-right">
        <a href={scorecardPageUrl(s, t.page)} aria-label={`${t.label}, page ${t.page} of the PDF`}>
          {t.page}
        </a>
      </td>
    </tr>
  );
}
