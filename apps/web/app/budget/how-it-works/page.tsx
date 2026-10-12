import type { Metadata } from "next";
import type { Observation } from "@ledger/schema";
import { getFiscalTargets } from "@/lib/data";
import { BUDGET } from "@/lib/budget";
import { HOW_IT_WORKS_PATH, RULES, RULE_ORDER, RULE_SOURCES, headroomView, latestPoint, type HeadroomView } from "@/lib/headroom";
import { gbpBn } from "@/lib/format";
import { todayIso } from "@/lib/promises";
import { SiteHeader } from "@/components/SiteHeader";
import { BudgetNav } from "@/components/BudgetNav";
import { HeadroomChart } from "@/components/HeadroomChart";
import { JsonLd } from "@/components/JsonLd";
import { SourcesProvider, WithProvenance } from "@/components/ui";
import { absolute, MAKER, OPEN_GRAPH, SITE_NAME } from "@/lib/site";

/** Hourly, like /budget, so the page turns from "the next Budget" to "the latest" on the day without a deploy. */
export const revalidate = 3600;

/** "Wednesday 28 October 2026" */
const dayDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", { ...o, timeZone: "Europe/London" });
  return `${part({ weekday: "long" })} ${part({ day: "numeric" })} ${part({ month: "long" })} ${part({ year: "numeric" })}`;
};
const pctOf = (o: Observation | undefined) => (o ? `${Math.round(o.value)}%` : "");
const oneDp = (x: number) => x.toFixed(1);

const TITLE = "How a Budget works, and the Chancellor's headroom";

function summary(v: HeadroomView) {
  const s = latestPoint(v, "current_budget")!;
  const i = latestPoint(v, "psnfl")!;
  return { s, i, year: s.margin.period, edition: v.latest.edition };
}

const DESCRIPTION = (() => {
  const { s, i, year, edition } = summary(headroomView(getFiscalTargets()));
  return `What a Budget is, the fiscal rules the government has set, and how far the OBR's forecast is from breaking each one. In its latest assessment (${edition}) the OBR put the headroom at ${gbpBn(s.margin.value)} against the stability rule and ${gbpBn(i.margin.value)} against the investment rule in ${year}.`;
})();

export const metadata: Metadata = {
  title: `${TITLE} | LedgerGov.UK`,
  description: DESCRIPTION,
  alternates: { canonical: HOW_IT_WORKS_PATH },
  openGraph: { ...OPEN_GRAPH, title: TITLE, description: DESCRIPTION, type: "article", url: HOW_IT_WORKS_PATH },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

function faq(v: HeadroomView, when: string) {
  const { s, i, year, edition } = summary(v);
  const since = v.since;
  return [
    {
      q: "What is the Chancellor's headroom?",
      a: `How far the OBR's forecast is from breaking a fiscal rule, in pounds. In its ${edition} forecast the OBR judged the government on course to meet the stability rule by ${gbpBn(s.margin.value)} and the investment rule by ${gbpBn(i.margin.value)} in ${year}.`,
    },
    ...(since?.status === "not_assessed"
      ? [
          {
            q: `Why is there no headroom figure from ${since.edition}?`,
            a: `Since February 2026 the Charter for Budget Responsibility asks the OBR to judge the rules once a year, at the Budget. Its ${since.edition} forecast said so and made no assessment.`,
          },
        ]
      : []),
    {
      q: "Is the headroom money the government has spare?",
      a: "No. It is the gap between the OBR's forecast and the line a rule draws, in one future year. A new forecast can widen or close it, and so can the Chancellor's decisions.",
    },
    {
      q: "Who sets the rules, and who checks them?",
      a: "The Treasury sets them in the Charter for Budget Responsibility, which Parliament approves. The Office for Budget Responsibility, an independent public body, judges whether the government is on course to meet them.",
    },
    { q: "When is the next assessment?", a: `With the Budget on ${when}, when the OBR publishes its new forecast.` },
  ];
}

function structuredData(v: HeadroomView, questions: { q: string; a: string }[]) {
  const sources = getFiscalTargets().sources;
  const modified = sources.map((s) => s.published_on ?? "").sort().at(-1);
  const url = absolute(HOW_IT_WORKS_PATH);
  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: TITLE,
      description: DESCRIPTION,
      url,
      mainEntityOfPage: url,
      inLanguage: "en-GB",
      isAccessibleForFree: true,
      ...(modified ? { dateModified: modified } : {}),
      author: { "@type": "Person", name: MAKER.name, url: MAKER.url },
      publisher: { "@type": "Organization", "@id": absolute("/#org"), name: SITE_NAME, url: absolute("/") },
      about: [
        { "@type": "Event", name: BUDGET.name, startDate: BUDGET.date, location: { "@type": "Place", name: "House of Commons, London" }, organizer: { "@type": "GovernmentOrganization", name: "HM Treasury" } },
        ...RULE_ORDER.map((r) => ({ "@type": "Thing", name: RULES[r].name })),
      ],
      isBasedOn: [
        ...sources.map((s) => ({ "@type": "Dataset", name: s.title, url: s.url, publisher: { "@type": "GovernmentOrganization", name: s.publisher }, ...(s.published_on ? { datePublished: s.published_on } : {}) })),
        { "@type": "Legislation", name: "Charter for Budget Responsibility: Autumn 2025", url: RULE_SOURCES.charter.page, publisher: { "@type": "GovernmentOrganization", name: "HM Treasury" } },
      ],
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: absolute("/") },
    },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: questions.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { name: SITE_NAME, path: "/" },
        { name: "Promise ledger", path: "/promises" },
        { name: BUDGET.name, path: "/budget" },
        { name: "How a Budget works", path: HOW_IT_WORKS_PATH },
      ].map((it, n) => ({ "@type": "ListItem", position: n + 1, name: it.name, item: absolute(it.path) })),
    },
  ];
}

/** A headline number with its provenance one focus away. */
function Figure({ value, label, detail, p, align = "start" }: { value: string; label: string; detail: string; p: Observation; align?: "start" | "end" }) {
  return (
    <div className="grid content-start gap-1 border-t border-line pt-3">
      <WithProvenance p={p} align={align} className="w-full">
        <span className="text-figure font-semibold tracking-figure tabular-nums">{value}</span>
      </WithProvenance>
      <span className="text-label text-ink">{label}</span>
      <span className="text-caption text-muted">{detail}</span>
    </div>
  );
}

const h2 = "m-0 text-title font-semibold";
const prose = "grid max-w-[68ch] gap-3";

/**
 * /budget/how-it-works: what a Budget is, the fiscal rules in the government's own words, and the
 * OBR's headroom against each at every forecast that assessed them. No judgement on whether the
 * headroom is enough: the page reports the OBR's figures and the chance it gives of meeting each rule.
 */
export default function HowABudgetWorks() {
  const data = getFiscalTargets();
  const v = headroomView(data);
  const after = todayIso() >= BUDGET.date;
  const when = dayDate(BUDGET.date);
  const { s, i, year, edition } = summary(v);
  const w = latestPoint(v, "welfare_cap");
  const since = v.since;
  const questions = faq(v, when);
  const surplus = since?.currentBudget;
  const fall = since?.psnflBefore && since?.psnflTarget ? { before: since.psnflBefore, target: since.psnflTarget } : null;
  // The newest assessment came with this Budget once its source edition is dated on or after Budget day.
  const assessedAtBudget = (data.sources.find((x) => x.id === "obr_fiscal_targets")?.published_on ?? "") >= BUDGET.date;

  return (
    <>
      <JsonLd data={structuredData(v, questions)} />
      <SiteHeader current="/promises" />
      <SourcesProvider sources={data.sources}>
        <main className="mx-auto grid max-w-[1000px] grid-cols-[minmax(0,1fr)] gap-12 px-4 pb-20 pt-10 sm:px-6">
          <header className="grid gap-4">
            <BudgetNav current={HOW_IT_WORKS_PATH} />
            <h1 className="m-0 max-w-[24ch] text-[clamp(30px,4.4vw,44px)] font-semibold leading-[1.06] tracking-[-0.035em]">How a Budget works</h1>
            <p className="m-0 max-w-[68ch] text-lead text-muted">
              A Budget is the government&apos;s plan for taxes and spending, which the Chancellor sets out in the House of Commons once a year.{" "}
              {after ? `The latest was on ${when}.` : `The next one is on ${when}.`} On the same day the Office for Budget Responsibility (OBR), the
              independent forecaster, publishes its forecast and judges whether the government is on course to meet the rules it has set itself. The gap
              between the forecast and each rule is the &ldquo;headroom&rdquo;.
            </p>
          </header>

          <section aria-labelledby="latest-h" className="grid gap-4">
            <h2 id="latest-h" className="m-0 text-label font-medium text-muted">
              The latest headroom: OBR, {edition} forecast ({v.latest.table})
            </h2>
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-3">
              <Figure
                value={gbpBn(s.margin.value)}
                label={`against the stability rule in ${year}`}
                detail={s.probability ? `The OBR put the chance of meeting it at ${pctOf(s.probability)}.` : "A central forecast."}
                p={s.margin}
              />
              <Figure
                value={gbpBn(i.margin.value)}
                label={`against the investment rule in ${year}`}
                detail={i.probability ? `The OBR put the chance of meeting it at ${pctOf(i.probability)}.` : "A central forecast."}
                p={i.margin}
              />
              {w && (
                <Figure
                  value={gbpBn(w.margin.value)}
                  label={`against the welfare cap in ${w.margin.period}`}
                  detail={w.spending ? `Forecast spending within the cap: ${gbpBn(w.spending.value)}.` : "A central forecast."}
                  p={w.margin}
                  align="end"
                />
              )}
            </div>
            <p className="m-0 max-w-[68ch] text-sm text-muted">
              {since?.status === "not_assessed"
                ? `No assessment since: the OBR's ${since.edition} forecast did not judge the rules. `
                : since
                  ? `The OBR's ${since.edition} forecast is out; its assessment is being added here. `
                  : ""}
              {!after
                ? `The next assessment comes with the Budget on ${when}.`
                : assessedAtBudget
                  ? `This is the OBR's assessment with the Budget of ${when}.`
                  : `The OBR's forecast with the Budget of ${when} is added here once its tables are published and checked.`}
            </p>
          </section>

          <section aria-labelledby="day-h" className={prose}>
            <h2 id="day-h" className={h2}>
              What happens on Budget day
            </h2>
            <ol className="m-0 grid gap-2 pl-5 text-body">
              <li>The Chancellor tells the House of Commons what the government has decided on taxes and spending.</li>
              <li>The Treasury publishes the Budget documents: every new measure, with what it costs or raises in each year and how that was worked out.</li>
              <li>
                The OBR publishes its forecast for the economy and the public finances with those decisions included, and its judgement on each fiscal
                rule. The government uses the OBR&apos;s forecast as its official forecast.
              </li>
              <li>Changes to taxes then go through Parliament in a Finance Bill.</li>
            </ol>
            <p className="m-0 text-label text-muted">
              Source: <a href={RULE_SOURCES.charterBudget.url}>{RULE_SOURCES.charterBudget.title}</a>
            </p>
            <p className="m-0 text-muted">
              On the evening of the Budget, editors read the documents and update every promise they touch, with a link to the page that shows it:{" "}
              <a href="/budget">the promises to watch</a>.
            </p>
          </section>

          <section aria-labelledby="rules-h" className="grid gap-6">
            <div className={prose}>
              <h2 id="rules-h" className={h2}>
                The rules the government has set
              </h2>
              <p className="m-0 text-muted">
                The Treasury sets its rules in the Charter for Budget Responsibility, which Parliament approves. The version in force became law on 24
                February 2026. The government calls the first two the stability rule and the investment rule (
                <a href={RULE_SOURCES.budget2025.url}>Budget 2025</a>). In the Charter&apos;s words:
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-3 md:gap-6">
              {RULE_ORDER.map((rule) => (
                <article key={rule} aria-labelledby={`rule-${rule}`} className="grid content-start gap-3 border-t border-line pt-4">
                  <h3 id={`rule-${rule}`} className="m-0 text-[17px] font-semibold">
                    {RULES[rule].name}
                  </h3>
                  <blockquote className="m-0 border-l-2 border-line-strong pl-3 text-sm">
                    <p className="m-0">&ldquo;{RULES[rule].charter}&rdquo;</p>
                    <footer className="mt-1 text-caption text-muted">
                      <a href={RULE_SOURCES.charter.url}>Charter, paragraph {RULES[rule].clause}</a>
                    </footer>
                  </blockquote>
                  <p className="m-0 text-sm">
                    <span className="font-medium">In plain words:</span> {RULES[rule].plain}
                  </p>
                  <p className="m-0 text-sm text-muted">
                    <span className="font-medium text-ink">Headroom:</span> {RULES[rule].headroom}.
                  </p>
                  {rule === "welfare_cap" && (
                    <p className="m-0 text-caption text-muted">
                      What it leaves out: <a href={RULE_SOURCES.welfareScope.url}>{RULE_SOURCES.welfareScope.title}</a>
                    </p>
                  )}
                </article>
              ))}
            </div>
            <p className="m-0 max-w-[68ch] text-label text-muted">
              Source: <a href={RULE_SOURCES.charter.url}>{RULE_SOURCES.charter.title}</a> (
              <a href={RULE_SOURCES.charter.page}>publication page</a>). The date it became law: OBR, March 2026 forecast, foreword.
            </p>
          </section>

          <section id="headroom" aria-labelledby="headroom-h" className="grid scroll-mt-20 gap-6">
            <div className={prose}>
              <h2 id="headroom-h" className={h2}>
                The headroom, forecast by forecast
              </h2>
              <p className="m-0 text-muted">
                Headroom is how far the OBR&apos;s central forecast is from breaking a rule, in pounds, in the year the rule names. It is a margin in a
                forecast, not money set aside: a new forecast can widen or close it, and so can the Chancellor&apos;s decisions. The OBR forecasts twice,
                first without a Budget&apos;s new decisions and then with them; the table gives the headroom before them too.
              </p>
            </div>
            <HeadroomChart view={v} caption={`Headroom against each rule in ${year}, at each OBR forecast that assessed the rules, in £ billion`} />
            {since && (
              <div className={prose}>
                <h3 className="m-0 text-[17px] font-semibold">{since.status === "not_assessed" ? `Why ${since.edition} has no figure` : `${since.edition}: being added`}</h3>
                {since.status === "not_assessed" ? (
                  <p className="m-0 text-muted">
                    Since February 2026 the Charter asks the OBR to judge the rules once a year, at the Budget, so its {since.edition} forecast made no
                    assessment (<a href={since.url}>OBR, {since.edition} forecast, foreword</a>). That forecast still gave the measures the rules use
                    {surplus ? (
                      <>
                        : a surplus on day-to-day spending of{" "}
                        <b className="font-semibold text-ink">{gbpBn(-surplus.value)}</b>{" "}
                        in {surplus.period}
                      </>
                    ) : null}
                    {fall ? (
                      <>
                        {surplus ? ", and " : ": "}net financial liabilities of{" "}
                        <b className="font-semibold text-ink">{oneDp(fall.before.value)}%</b>{" "}
                        of GDP in {fall.before.period} and{" "}
                        <b className="font-semibold text-ink">{oneDp(fall.target.value)}%</b>{" "}
                        in {fall.target.period}
                      </>
                    ) : null}{" "}
                    (<a href={since.url}>OBR, {since.edition} forecast, Table A.9</a>). These are the OBR&apos;s forecasts of each measure; the OBR did
                    not present them as headroom.
                  </p>
                ) : (
                  <p className="m-0 text-muted">
                    The OBR&apos;s <a href={since.url}>{since.edition} forecast</a> is published. Its fiscal targets table is added here once it is read
                    and checked.
                  </p>
                )}
              </div>
            )}
            <ul className="m-0 grid max-w-[68ch] gap-2 pl-5 text-sm text-muted">
              <li>
                <span className="text-ink">It is a forecast.</span> The OBR gives the chance of meeting each rule: in {edition},{" "}
                {pctOf(s.probability)} for the stability rule and {pctOf(i.probability)} for the investment rule.
              </li>
              <li>
                <span className="text-ink">It is one year.</span> Each rule is judged in {year}, the year the Charter names.
              </li>
              <li>
                <span className="text-ink">Below zero, a rule would be missed.</span> Bars to the left of the line would show that.
              </li>
            </ul>
          </section>

          <section aria-labelledby="faq-h" className="grid gap-5 border-t border-line pt-8">
            <h2 id="faq-h" className={h2}>
              Questions
            </h2>
            <div className="grid gap-x-10 gap-y-6 text-sm md:grid-cols-2">
              {questions.map(({ q, a }) => (
                <div key={q} className="grid max-w-[60ch] gap-1.5">
                  <h3 className="m-0 text-body font-semibold text-ink">{q}</h3>
                  <p className="m-0 text-muted">{a}</p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="more-h" className={`${prose} border-t border-line pt-8`}>
            <h2 id="more-h" className={h2}>
              How this page works
            </h2>
            <p className="m-0 text-muted">
              Every figure is the OBR&apos;s own, read from the table named beside it; nothing is worked out here. Each night the site checks the
              OBR&apos;s latest forecast; when a new assessment appears, its table is added after a review. The rules are quoted from the Charter word
              for word.
            </p>
            <p className="m-0 text-muted">
              See <a href="/budget">the promises the Budget could fund or break</a>, <a href="/budget/leaks">what has been trailed before it</a> and{" "}
              <a href="/method">how the numbers are made</a>.
            </p>
          </section>
        </main>
      </SourcesProvider>
    </>
  );
}
