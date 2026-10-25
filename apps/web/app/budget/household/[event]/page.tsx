import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sourceRefUrl, t1Range, type HouseholdExampleYear, type HouseholdSnapshot, type HouseholdYearResult } from "@ledger/schema";
import { policyEngineCompareUrl } from "@ledger/server/model";
import { getHouseholdSnapshots, getScorecards } from "@/lib/data";
import { BUDGET } from "@/lib/budget";
import { longDate } from "@/lib/format";
import {
  REASON_LABEL,
  bn1,
  changedYears,
  computedOn,
  gbpWhole,
  gbpYear,
  householdCopy,
  householdFaq,
  householdLabels,
  householdPath,
  measureLinks,
  pct0,
  pct2,
  rangeOf,
  rangeOfSize,
} from "@/lib/household";
import { SiteHeader } from "@/components/SiteHeader";
import { BudgetNav } from "@/components/BudgetNav";
import { NavLinks } from "@/components/NavLinks";
import { JsonLd } from "@/components/JsonLd";
import { WinnersBar } from "@/components/WinnersBar";
import { DecilePair, TableView } from "@/components/HouseholdCharts";
import { QualityBadge } from "@/components/ui";
import { BudgetSalaryCheck } from "@/components/BudgetSalaryCheck";
import { absolute, MAKER, OPEN_GRAPH, SITE_NAME } from "@/lib/site";

type Props = { params: Promise<{ event: string }> };

const load = (id: string): HouseholdSnapshot | null => getHouseholdSnapshots().find((s) => s.id === id) ?? null;

export function generateStaticParams() {
  return getHouseholdSnapshots().map((s) => ({ event: s.id }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = load((await params).event);
  if (!s) return {};
  const { title, description } = householdCopy(s);
  const path = householdPath(s);
  return {
    title: `${title} | LedgerGov.UK`,
    description,
    alternates: { canonical: path },
    openGraph: { ...OPEN_GRAPH, title, description, type: "article", url: path },
    twitter: { card: "summary_large_image", title, description },
  };
}

const h2 = "m-0 text-title font-semibold";
const section = "grid grid-cols-[minmax(0,1fr)] gap-5 scroll-mt-28";
const figure = "m-0 text-figure font-semibold tracking-figure tabular-nums";
/** The page's sections, in order, for the "On this page" menu: before PolicyEngine answers, the model's parts are one "To follow" section at the end. */
function sectionsFor(s: HouseholdSnapshot, noModel: boolean) {
  const treasury = s.input.treasury ? [{ href: "#treasury", label: "Treasury's view" }] : [];
  const end = [
    { href: "#how", label: "How it works" },
    { href: "#faq", label: "Questions" },
  ];
  if (noModel)
    return [
      { href: "#summary", label: "Summary" },
      { href: "#your-tax", label: "Your tax" },
      { href: "#measures", label: "Measures" },
      ...treasury,
      { href: "#to-follow", label: "To follow" },
      ...end,
    ];
  return [
    { href: "#summary", label: "Summary" },
    { href: "#deciles", label: "By income" },
    { href: "#winners", label: "Gains and losses" },
    { href: "#households", label: "Example households" },
    { href: "#your-tax", label: "Your tax" },
    { href: "#measures", label: "Measures" },
    ...treasury,
    ...end,
  ];
}
const tone = (v: number) => (v > 0.005 ? "text-good" : v < -0.005 ? "text-debt-ink" : "text-muted");

/**
 * /budget/household/<event>: what a fiscal event's tax and benefit measures do to household incomes, by income
 * tenth, as gains and losses, and for six fixed example households, before and after; the measures left out and
 * why; the Treasury's own chart beside ours. Built only from data/build/budget/household/<event>.json, written once
 * by `pnpm household -- <event>` on Budget night (docs/BUDGET_DAY.md).
 */
export default async function HouseholdPage({ params }: Props) {
  const s = load((await params).event);
  if (!s) notFound();
  const c = householdCopy(s);
  const l = householdLabels(s);
  const path = householdPath(s);
  const rehearsal = s.kind === "rehearsal";
  const t = s.input.treasury;
  const modelled = s.input.measures.filter((m) => m.modelled);
  const left = s.input.measures.filter((m) => !m.modelled);
  const scorecardIds = getScorecards().map((x) => x.id);
  const faq = householdFaq(s);
  const others = getHouseholdSnapshots().filter((x) => x.id !== s.id);
  const startYear = Number(c.head.slice(0, 4));
  // Before PolicyEngine answers (the "no model" fallback): the measures, the salary check and the Treasury's chart in
  // full; the summary, deciles, gains and losses and households follow once it does.
  const noModel = c.view.state === "no_model";
  const compareUrl = policyEngineCompareUrl(s, startYear);

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: c.title,
      description: c.description,
      url: absolute(path),
      inLanguage: "en-GB",
      isAccessibleForFree: true,
      creator: { "@type": "Organization", name: SITE_NAME, url: absolute("/") },
      author: { "@type": "Person", name: MAKER.name, url: MAKER.url },
      publisher: { "@type": "Organization", "@id": absolute("/#org"), name: SITE_NAME, url: absolute("/") },
      datePublished: s.computed_at.slice(0, 10),
      temporalCoverage: `${s.input.years[0]!.slice(0, 4)}-04/${Number(s.input.years.at(-1)!.slice(0, 4)) + 1}-03`,
      spatialCoverage: { "@type": "Place", name: "United Kingdom" },
      variableMeasured: s.provider
        ? "Change in household income after tax and benefits, by income tenth, % and £ a year"
        : "Income tax and employees' National Insurance on a salary, without and with the Budget; the Budget's tax and benefit measures, each with its source",
      measurementTechnique: s.provider
        ? `Static microsimulation with PolicyEngine UK ${s.provider.model_version} (data ${s.provider.data_version})`
        : "The Budget's published rates and thresholds, applied to a salary in the reader's browser; a static microsimulation with PolicyEngine UK follows once it answers",
      about: { "@type": "Event", name: s.name, startDate: s.date, organizer: { "@type": "GovernmentOrganization", name: "HM Treasury" } },
      isBasedOn: s.input.sources.map((x) => x.url),
      citation: "https://policyengine.org/uk",
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: absolute("/") },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Promise ledger", item: absolute("/promises") },
        { "@type": "ListItem", position: 2, name: BUDGET.name, item: absolute("/budget") },
        { "@type": "ListItem", position: 3, name: c.title, item: absolute(path) },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];

  return (
    <>
      <JsonLd data={structuredData} />
      <SiteHeader current="/promises" />
      <div className="sticky top-14 z-10 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1000px] px-2 py-1.5 sm:px-4">
          <NavLinks links={sectionsFor(s, noModel)} spy label="On this page" />
        </div>
      </div>
      <main className="mx-auto grid max-w-[1000px] grid-cols-[minmax(0,1fr)] gap-14 px-4 pb-20 pt-10 sm:px-6">
        <header className="grid max-w-[70ch] gap-4">
          <BudgetNav current={path} />
          <a href="/budget" className="justify-self-start text-label font-medium">
            {BUDGET.name}
          </a>
          <p className="m-0 text-label font-medium text-muted">
            {s.name}, {longDate(s.date)}
            {rehearsal ? ": last year's Budget" : ""}
          </p>
          <h1 className="m-0 text-[clamp(30px,4.4vw,44px)] font-semibold leading-[1.06] tracking-[-0.035em]">{c.title}</h1>
          {noModel ? (
            <p className="m-0 text-lead text-muted">
              What the {s.name} changes in taxes and benefits, each measure linked to the page that announces it; what it means for your own income tax
              and National Insurance, worked out in your browser{s.input.treasury ? "; and the Treasury's own chart" : ""}. Who gains and who loses, for
              the whole country by income and for six example households, follows once PolicyEngine answers.
            </p>
          ) : (
            <p className="m-0 text-lead text-muted">
              Who gains and who loses from the {s.name}&apos;s changes to taxes and benefits, for the whole country by income and for six example
              households, before and after. We lead with {c.head}, the first full year of most of the measures, with {c.side} beside it.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <QualityBadge quality="modelled">{l.estimate}</QualityBadge>
            <span className="text-caption font-medium text-muted">{l.notOfficial}</span>
            <span className="text-caption font-medium text-muted">{l.model}</span>
            <span className="text-caption text-muted">
              {noModel ? "Our estimate: " : "Worked out with "}
              <a href="https://policyengine.org/uk">PolicyEngine</a>&apos;s open model{noModel ? ", once it answers" : ""}
            </span>
          </div>
          {noModel && (
            <div className="grid gap-1.5 rounded-control border border-line bg-sunk/60 px-4 py-3">
              <p className="m-0 font-semibold">Not yet in full</p>
              <p className="m-0 text-muted">
                PolicyEngine, the charity whose open model of UK taxes and benefits we use for our estimate, had not answered when this page was
                published on {computedOn(s)}. What is here is complete and was checked by an editor: the measures with their pages, your own tax on a
                salary{s.input.treasury ? " and the Treasury's own chart" : ""}. The summary, the change by income tenth, who gains and who loses and
                the six example households follow once PolicyEngine answers (<a href="#to-follow">what follows</a>).
              </p>
            </div>
          )}
          {rehearsal && (
            <div className="grid gap-1.5 rounded-control border border-line bg-sunk/60 px-4 py-3">
              <p className="m-0 font-semibold">A rehearsal, on last year&apos;s Budget</p>
              <p className="m-0 text-muted">
                This page shows the {s.name} of {longDate(s.date)}, worked out on {computedOn(s)} in exactly the way we will work out the {BUDGET.name} on
                the morning after it. It is not this year&apos;s Budget.
                {s.input.compared_with && (
                  <>
                    {" "}
                    We checked it against <a href={s.input.compared_with.url}>{s.input.compared_with.name}</a>: where the inputs are the same, the money
                    raised and spent agrees closely; how the gains spread across incomes differs, mostly because the model now ranks households
                    differently (see <a href="#faq">Questions</a>).
                  </>
                )}
              </p>
            </div>
          )}
        </header>

        {noModel ? (
          <NoModelSummary s={s} />
        ) : (
          <>
            {c.headResult && c.sideResult ? <PopulationSections s={s} head={c.headResult} side={c.sideResult} /> : <HeldPopulation s={s} />}
            {c.headHouseholds && c.sideHouseholds ? (
              <HouseholdsSection s={s} head={c.headHouseholds} side={c.sideHouseholds} />
            ) : (
              <ToFollow id="households" title="Six example households, before and after" text="The six example households follow once an editor has checked them." />
            )}
          </>
        )}

        <section id="your-tax" aria-labelledby="your-tax-h" className={section}>
          <div className="grid max-w-[70ch] gap-1">
            <h2 id="your-tax-h" className={h2}>
              Your income tax and National Insurance
            </h2>
            <p className="m-0 text-muted">
              What the {s.name}&apos;s changes to income tax and employees&apos; National Insurance mean on your own salary, worked out in your browser.
            </p>
          </div>
          <BudgetSalaryCheck calculator={s.calculator} defaultYear={c.head} eventName={s.name} />
        </section>

        <section id="measures" aria-labelledby="measures-h" className={section}>
          <div className="grid max-w-[70ch] gap-1">
            <h2 id="measures-h" className={h2}>
              The measures
            </h2>
            <p className="m-0 text-muted">
              Each measure links to the page of the document that announced it. “Without” is what would have applied had the Budget not happened.
            </p>
          </div>
          <div className="grid gap-2">
            <h3 className="m-0 text-[16px] font-semibold">
              {noModel ? `In our estimate once PolicyEngine answers (${modelled.length})` : `In the estimate (${modelled.length})`}
            </h3>
            <ul className="m-0 grid list-none border-t border-line p-0">
              {modelled.map((m) => {
                const links = measureLinks(s, m, scorecardIds);
                const changes = (m.parameters ?? []).map((p) => ({ p, years: changedYears(s, p) })).filter((x) => x.years.length);
                return (
                  <li key={m.id} className="grid gap-1.5 border-b border-line py-3">
                    <p className="m-0 font-medium text-ink">{m.name}</p>
                    <p className="m-0 text-caption text-muted">
                      From {longDate(m.effective)}. <a href={links.source}>{links.sourceTitle}{m.source.page ? `, page ${m.source.page}` : ""}</a>
                      {links.scorecard && (
                        <>
                          , <a href={links.scorecard}>its line in the Treasury&apos;s table</a>
                        </>
                      )}
                    </p>
                    <details className="group text-caption">
                      <summary className="cursor-pointer font-medium text-accent">What changes</summary>
                      <ul className="m-0 mt-2 grid gap-1.5 pl-4 text-muted">
                        {changes.map(({ p, years }) => (
                          <li key={p.path}>
                            <span className="text-ink">{p.label}</span>:{" "}
                            {years.map((y, i) => (
                              <span key={y.year}>
                                {i > 0 && "; "}
                                {y.year} {y.pre} → {y.post}
                              </span>
                            ))}
                          </li>
                        ))}
                      </ul>
                      {m.note && <p className="m-0 mt-2 text-muted">{m.note}</p>}
                    </details>
                  </li>
                );
              })}
            </ul>
          </div>
          {left.length > 0 && (
            <div className="grid gap-2">
              <h3 className="m-0 text-[16px] font-semibold">Not in the estimate ({left.length})</h3>
              <ul className="m-0 grid list-none border-t border-line p-0">
                {left.map((m) => {
                  const links = measureLinks(s, m, scorecardIds);
                  return (
                    <li key={m.id} className="grid gap-1 border-b border-line py-3">
                      <p className="m-0 font-medium text-ink">{m.name}</p>
                      <p className="m-0 text-caption font-medium text-muted">{REASON_LABEL[m.not_modelled!.reason]}</p>
                      <p className="m-0 text-sm text-muted">{m.not_modelled!.note}</p>
                      <p className="m-0 text-caption text-muted">
                        <a href={links.source}>{links.sourceTitle}{m.source.page ? `, page ${m.source.page}` : ""}</a>
                        {links.scorecard && (
                          <>
                            , <a href={links.scorecard}>its line in the Treasury&apos;s table</a>
                          </>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {s.input.note && <p className="m-0 max-w-[70ch] text-caption text-muted">{s.input.note}</p>}
        </section>

        {t && (
          <section id="treasury" aria-labelledby="treasury-h" className={section}>
            <div className="grid max-w-[70ch] gap-1">
              <h2 id="treasury-h" className={h2}>
                The Treasury&apos;s own chart, {t.year}
              </h2>
              <p className="m-0 text-muted">
                HM Treasury publishes its own estimate with every Budget. It counts {t.covers}. Its figures are official; it gives no range.
              </p>
              <p className="m-0 border-l-2 border-rec pl-3 text-ink">
                {noModel ? "Why ours, when it follows, will differ" : "Why the two differ"}: {t.differs}
              </p>
            </div>
            <DecilePair
              label={`The Treasury's estimate for ${t.year}, as a share of net income by income tenth. Taxes and welfare: from ${pct2(t.pct.deciles[0]!.tax + t.pct.deciles[0]!.welfare)} in tenth 1 to ${pct2(t.pct.deciles[9]!.tax + t.pct.deciles[9]!.welfare)} in tenth 10. With public services: ${pct2(t.pct.deciles[0]!.overall)} to ${pct2(t.pct.deciles[9]!.overall)}.`}
              valueText={pct2}
              main={{ label: "Taxes and welfare, in cash", values: t.pct.deciles.map((d) => d.tax + d.welfare) }}
              beside={{ label: "With the value of public services added", values: t.pct.deciles.map((d) => d.overall) }}
            />
            <TableView label={`The Treasury's estimate by income tenth, ${t.year}`}>
              <table className="w-full border-collapse whitespace-nowrap text-sm tabular-nums">
                <caption className="sr-only">{t.title}</caption>
                <thead>
                  <tr className="border-b border-line text-left text-caption text-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Income tenth
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      Tax
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      Welfare
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      Public services
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      Overall
                    </th>
                    {t.gbp && (
                      <th scope="col" className="py-2 text-right font-medium">
                        Overall, £ a year
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {[...t.pct.deciles, t.pct.all].map((d, i) => (
                    <tr key={i} className="border-b border-line">
                      <th scope="row" className="py-2 pr-4 text-left font-normal">
                        {i === 10 ? "All households" : i === 0 ? "1 (lowest)" : i === 9 ? "10 (highest)" : i + 1}
                      </th>
                      <td className="py-2 pr-4 text-right">{pct2(d.tax)}</td>
                      <td className="py-2 pr-4 text-right">{pct2(d.welfare)}</td>
                      <td className="py-2 pr-4 text-right">{pct2(d.services)}</td>
                      <td className="py-2 pr-4 text-right font-medium">{pct2(d.overall)}</td>
                      {t.gbp && <td className="py-2 text-right">{gbpYear((i === 10 ? t.gbp.all : t.gbp.deciles[i]!).overall)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableView>
            <p className="m-0 text-caption text-muted">
              Source: HM Treasury, <a href={sourceRefUrl(s.input.sources, t.source)}>{t.title}</a>, Open Government Licence v3.0.
              {t.read_from === "chart"
                ? " The Treasury publishes no table of these figures; we read them from the chart's drawing in the PDF, to about a hundredth of a point."
                : ""}
            </p>
          </section>
        )}

        {noModel && (
          <section id="to-follow" aria-labelledby="to-follow-h" className={section}>
            <div className="grid max-w-[70ch] gap-1">
              <h2 id="to-follow-h" className={h2}>
                To follow once PolicyEngine answers
              </h2>
              <p className="m-0 text-muted">
                These parts need PolicyEngine&apos;s answers. They follow as soon as it answers, worked out from the same measures and checked by two
                editors; nothing else on the page changes.
              </p>
            </div>
            <ul className="m-0 grid max-w-[70ch] list-none border-t border-line p-0">
              {[
                "Summary: how many households are better and worse off, and what the measures raise or cost",
                "Change in income, by income tenth",
                "Who gains and who loses, within each income tenth",
                "Six example households, before and after",
              ].map((what) => (
                <li key={what} className="border-b border-line py-3 font-medium text-ink">
                  {what}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section id="how" aria-labelledby="how-h" className="grid max-w-[70ch] scroll-mt-28 gap-3 border-t border-line pt-8">
          <h2 id="how-h" className={h2}>
            How it works
          </h2>
          <p className="m-0 text-muted">
            Editors type each measure from the Budget documents, every figure with its page: the value in each year without the Budget, and with it.
            We send the two complete sets of rules to <a href="https://policyengine.org/uk">PolicyEngine</a>, a charity whose open-source model of
            UK taxes and benefits runs them over a large survey of households that represents the country (the Family Resources Survey, reweighted
            by PolicyEngine). It works out every household&apos;s income both ways and adds up the differences by income tenth.
          </p>
          <p className="m-0 text-muted">
            It is a static estimate: nobody changes their work, spending or savings because of the Budget. PolicyEngine gives one figure for each
            result; we show it with a ±10% range and label it an estimate. It is not an official figure and not advice about anyone&apos;s own taxes.
          </p>
          {s.provider && compareUrl ? (
            <p className="m-0 text-muted">
              We asked PolicyEngine once, on {computedOn(s)}, not each time someone opens the page, and nothing about readers is ever sent. Every answer
              came from one version of the model: PolicyEngine UK {s.provider.model_version}, data {s.provider.data_version}. An editor checked the
              measures before this page was published. You can open the same comparison in <a href={compareUrl}>PolicyEngine&apos;s own app</a>, or
              read <a href={`https://github.com/xternal/ledgergov.uk/blob/main/${s.measures_file}`}>the measures file</a> and{" "}
              <a href="https://github.com/xternal/ledgergov.uk/blob/main/docs/MODEL.md">our method</a>.
            </p>
          ) : (
            <p className="m-0 text-muted">
              PolicyEngine had not answered when this page was published on {computedOn(s)}, so the parts that need it follow. We ask it once, not each
              time someone opens the page, and nothing about readers is ever sent. The salary check needs no model: it applies the Budget&apos;s own
              rates and thresholds, typed from its documents, to the salary you type, in your browser. An editor checked the measures and the
              Treasury&apos;s figures before this page was published. Read{" "}
              <a href={`https://github.com/xternal/ledgergov.uk/blob/main/${s.measures_file}`}>the measures file</a> and{" "}
              <a href="https://github.com/xternal/ledgergov.uk/blob/main/docs/MODEL.md">our method</a>.
            </p>
          )}
          <p className="m-0 text-label">
            <a href="/budget">What {BUDGET.name} could do to the government&apos;s promises</a>
            {others.length > 0 && (
              <>
                {" "}
                Other Budgets:{" "}
                {others.map((o, i) => (
                  <span key={o.id}>
                    {i > 0 && ", "}
                    <a href={householdPath(o)}>{o.name}</a>
                  </span>
                ))}
              </>
            )}
          </p>
        </section>

        <section id="faq" aria-labelledby="faq-h" className="grid scroll-mt-28 gap-4">
          <h2 id="faq-h" className={h2}>
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
      </main>
    </>
  );
}

/** Summary, deciles and gains and losses: the population results, shown once an editor has reviewed them. */
function PopulationSections({ s, head, side }: { s: HouseholdSnapshot; head: HouseholdYearResult; side: HouseholdYearResult }) {
  const c = householdCopy(s);
  const l = householdLabels(s);
  const better = c.better ?? 0;
  const worse = c.worse ?? 0;
  const decileRows = head.deciles.map((d, i) => ({ d, side: side.deciles[i]! }));
  return (
    <>
        <section id="summary" aria-labelledby="summary-h" className={section}>
          <h2 id="summary-h" className="sr-only">
            Summary
          </h2>
          <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 sm:grid-cols-4">
            <div className="grid content-start gap-0.5">
              <dt className="text-label text-muted">Households better off in {c.head}</dt>
              <dd className={`${figure} text-good`}>{pct0(better)}</dd>
              <dd className="m-0 text-caption text-muted">range {rangeOf(better, pct0)}</dd>
            </div>
            <div className="grid content-start gap-0.5">
              <dt className="text-label text-muted">Worse off</dt>
              <dd className={`${figure} text-debt-ink`}>{pct0(worse)}</dd>
              <dd className="m-0 text-caption text-muted">range {rangeOf(worse, pct0)}</dd>
            </div>
            <div className="grid content-start gap-0.5">
              <dt className="text-label text-muted">Lowest incomes, tenth 1</dt>
              <dd className={`${figure} ${tone(head.deciles[0]!.rel_change_pct)}`}>{pct2(head.deciles[0]!.rel_change_pct)}</dd>
              <dd className="m-0 text-caption text-muted">{gbpYear(head.deciles[0]!.avg_change_gbp)} a year per household</dd>
            </div>
            <div className="grid content-start gap-0.5">
              <dt className="text-label text-muted">Highest incomes, tenth 10</dt>
              <dd className={`${figure} ${tone(head.deciles[9]!.rel_change_pct)}`}>{pct2(head.deciles[9]!.rel_change_pct)}</dd>
              <dd className="m-0 text-caption text-muted">{gbpYear(head.deciles[9]!.avg_change_gbp)} a year per household</dd>
            </div>
          </dl>
          <p className="m-0 max-w-[70ch] text-muted">
            In {c.head} the measures we can model {c.netText} for the public finances (range {rangeOfSize(head.budget.net_bn, bn1)}), before anyone changes
            what they do. In {c.side}: {pct0(side.winners.all.gain_less_5 + side.winners.all.gain_more_5)} of households better off,{" "}
            {pct0(side.winners.all.lose_less_5 + side.winners.all.lose_more_5)} worse off. {l.band}
          </p>
        </section>

        <section id="deciles" aria-labelledby="deciles-h" className={section}>
          <div className="grid max-w-[70ch] gap-1">
            <h2 id="deciles-h" className={h2}>
              Change in income, by income tenth
            </h2>
            <p className="m-0 text-muted">
              Average change in household income after tax and benefits, as a share of that income. Households are ranked by that income as it is,
              not adjusted for household size, and each tenth holds a tenth of the people: a large family on a modest income can sit in a middle
              tenth. Whiskers show the range.
            </p>
          </div>
          <DecilePair
            label={`Change in household income by income tenth: in ${c.head} from ${pct2(head.deciles[0]!.rel_change_pct)} in tenth 1 to ${pct2(head.deciles[9]!.rel_change_pct)} in tenth 10; in ${c.side} from ${pct2(side.deciles[0]!.rel_change_pct)} to ${pct2(side.deciles[9]!.rel_change_pct)}.`}
            valueText={pct2}
            main={{ label: c.head, values: head.deciles.map((d) => d.rel_change_pct), ranges: head.deciles.map((d) => [t1Range(d.rel_change_pct)[0], t1Range(d.rel_change_pct)[2]]) }}
            beside={{ label: c.side, values: side.deciles.map((d) => d.rel_change_pct), ranges: side.deciles.map((d) => [t1Range(d.rel_change_pct)[0], t1Range(d.rel_change_pct)[2]]) }}
          />
          <TableView label={`Change in income by income tenth, ${c.head} and ${c.side}`}>
            <table className="w-full border-collapse whitespace-nowrap text-sm tabular-nums">
              <caption className="sr-only">Change in household income by income tenth</caption>
              <thead>
                <tr className="border-b border-line text-left text-caption text-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Income tenth
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    {c.head}
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    Range
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    £ a year
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    {c.side}
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    £ a year
                  </th>
                </tr>
              </thead>
              <tbody>
                {decileRows.map(({ d, side: sd }) => (
                  <tr key={d.decile} className="border-b border-line">
                    <th scope="row" className="py-2 pr-4 text-left font-normal">
                      {d.decile === 1 ? "1 (lowest)" : d.decile === 10 ? "10 (highest)" : d.decile}
                    </th>
                    <td className="py-2 pr-4 text-right">{pct2(d.rel_change_pct)}</td>
                    <td className="py-2 pr-4 text-right text-muted">{rangeOf(d.rel_change_pct, pct2)}</td>
                    <td className="py-2 pr-4 text-right">{gbpYear(d.avg_change_gbp)}</td>
                    <td className="py-2 pr-4 text-right">{pct2(sd.rel_change_pct)}</td>
                    <td className="py-2 text-right">{gbpYear(sd.avg_change_gbp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableView>
        </section>

        <section id="winners" aria-labelledby="winners-h" className={section}>
          <div className="grid max-w-[70ch] gap-1">
            <h2 id="winners-h" className={h2}>
              Who gains and who loses, {c.head}
            </h2>
            <p className="m-0 text-muted">
              The share of households whose income after tax and benefits goes up or down, and by how much, for everyone and within each income
              tenth.
            </p>
          </div>
          <div className="max-w-[640px]">
            <WinnersBar winners={head.winners} />
          </div>
        </section>

    </>
  );
}

/** While the population results wait for review (the fallback rule): the sections stay, saying what follows. */
function HeldPopulation({ s }: { s: HouseholdSnapshot }) {
  return (
    <>
      <ToFollow
        id="summary"
        title="Summary"
        text={`Our estimate for the whole country, by income, follows once an editor has checked it. Until then: the example households, your own tax on a salary, the measures and the Treasury's own chart for the ${s.name}, below.`}
      />
      <ToFollow id="deciles" title="Change in income, by income tenth" text="Follows once an editor has checked it." />
      <ToFollow id="winners" title="Who gains and who loses" text="Follows once an editor has checked it." />
    </>
  );
}

/**
 * Before PolicyEngine answers: what the page has, from the documents themselves (the measures, the Treasury's chart),
 * and a plain line on what follows. No empty charts.
 */
function NoModelSummary({ s }: { s: HouseholdSnapshot }) {
  const t = s.input.treasury;
  const modelled = s.input.measures.filter((m) => m.modelled).length;
  const cash = t ? t.pct.deciles.map((d) => d.tax + d.welfare) : null;
  return (
    <section id="summary" aria-labelledby="summary-h" className={section}>
      <h2 id="summary-h" className="sr-only">
        Summary
      </h2>
      <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 sm:grid-cols-4">
        <div className="grid content-start gap-0.5">
          <dt className="text-label text-muted">Tax and benefit measures</dt>
          <dd className={figure}>{s.input.measures.length}</dd>
          <dd className="m-0 text-caption text-muted">each linked to its page</dd>
        </div>
        <div className="grid content-start gap-0.5">
          <dt className="text-label text-muted">For our estimate</dt>
          <dd className={figure}>{modelled}</dd>
          <dd className="m-0 text-caption text-muted">{s.input.measures.length - modelled} not in it, each with the reason</dd>
        </div>
        {t && cash && (
          <>
            <div className="grid content-start gap-0.5">
              <dt className="text-label text-muted">Treasury, lowest incomes, tenth 1</dt>
              <dd className={`${figure} ${tone(cash[0]!)}`}>{pct2(cash[0]!)}</dd>
              <dd className="m-0 text-caption text-muted">taxes and welfare, {t.year}</dd>
            </div>
            <div className="grid content-start gap-0.5">
              <dt className="text-label text-muted">Highest incomes, tenth 10</dt>
              <dd className={`${figure} ${tone(cash[9]!)}`}>{pct2(cash[9]!)}</dd>
              <dd className="m-0 text-caption text-muted">share of income, official</dd>
            </div>
          </>
        )}
      </dl>
      <p className="m-0 max-w-[70ch] text-muted">
        Our own estimate for the whole country (how many households are better or worse off, and by how much in each income tenth) and the six
        example households follow once PolicyEngine answers.{t ? ` The Treasury's figures are its own and count ${t.covers}: its chart is below.` : ""}
      </p>
    </section>
  );
}

function ToFollow({ id, title, text }: { id: string; title: string; text: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={section}>
      <h2 id={`${id}-h`} className={h2}>
        {title}
      </h2>
      <p className="m-0 max-w-[70ch] rounded-control border border-line bg-sunk/60 px-4 py-3 text-muted">{text}</p>
    </section>
  );
}

/** The six example households, before and after: a list on phones, a table on wider screens. */
function HouseholdsSection({ s, head, side }: { s: HouseholdSnapshot; head: HouseholdExampleYear; side: HouseholdExampleYear }) {
  const c = householdCopy(s);
  return (
        <section id="households" aria-labelledby="households-h" className={section}>
          <div className="grid max-w-[70ch] gap-1">
            <h2 id="households-h" className={h2}>
              Six example households, before and after
            </h2>
            <p className="m-0 text-muted">
              Income after tax and benefits in {c.head}, without the {s.name} and with it. The households are fixed and the same for everyone: in
              England, earnings held the same each year, and spending what the Office for National Statistics finds a similar household spends, so
              changes to VAT and fuel duty reach them. Benefits are claimed where due.
            </p>
          </div>
          {/* Phones: one block per household; wider screens: the table. */}
          <ul className="m-0 grid list-none border-t border-line p-0 sm:hidden">
            {head.rows.map((r) => {
              const sideRow = side.rows.find((x) => x.id === r.id)!;
              return (
                <li key={r.id} className="grid gap-1 border-b border-line py-3">
                  <p className="m-0 font-medium text-ink">{r.label}</p>
                  <p className={`m-0 text-[22px] font-semibold tabular-nums tracking-figure ${tone(r.change_gbp)}`}>
                    {gbpYear(r.change_gbp)} <span className="text-label font-medium tracking-normal text-muted">a year in {c.head}</span>
                  </p>
                  <p className="m-0 text-caption tabular-nums text-muted">
                    range {rangeOf(r.change_gbp, gbpYear)}; {gbpWhole(r.pre_net_gbp)} without, {gbpWhole(r.post_net_gbp)} with
                  </p>
                  <p className="m-0 text-caption tabular-nums text-muted">
                    {c.side}: {gbpYear(sideRow.change_gbp)}
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto sm:block" role="region" aria-label="Six example households" tabIndex={0}>
            <table className="w-full min-w-[640px] border-collapse text-left text-sm tabular-nums">
              <caption className="sr-only">
                Six example households: income after tax and benefits in {c.head} without and with the {s.name}, and the change in {c.side}
              </caption>
              <thead>
                <tr className="border-b border-line-strong text-caption text-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Household
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Without, {c.head}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    With
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Change a year
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Change in {c.side}
                  </th>
                </tr>
              </thead>
              <tbody>
                {head.rows.map((r) => {
                  const sideRow = side.rows.find((x) => x.id === r.id)!;
                  return (
                    <tr key={r.id} className="border-b border-line align-top">
                      <th scope="row" className="py-2.5 pr-3 font-normal leading-snug">
                        {r.label}
                      </th>
                      <td className="py-2.5 pr-3 text-right">{gbpWhole(r.pre_net_gbp)}</td>
                      <td className="py-2.5 pr-3 text-right">{gbpWhole(r.post_net_gbp)}</td>
                      <td className="py-2.5 pr-3 text-right">
                        <span className={`block font-semibold ${tone(r.change_gbp)}`}>{gbpYear(r.change_gbp)}</span>
                        <span className="block text-caption text-muted">{rangeOf(r.change_gbp, gbpYear)}</span>
                      </td>
                      <td className={`py-2.5 text-right ${tone(sideRow.change_gbp)}`}>{gbpYear(sideRow.change_gbp)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
  );
}
