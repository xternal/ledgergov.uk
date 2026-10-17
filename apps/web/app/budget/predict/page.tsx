import type { Metadata } from "next";
import { predictOpen } from "@ledger/schema";
import { PREDICTION_RETENTION_MONTHS } from "@ledger/server/predict";
import { SiteHeader } from "@/components/SiteHeader";
import { BudgetNav } from "@/components/BudgetNav";
import { JsonLd } from "@/components/JsonLd";
import { PredictForm } from "@/components/PredictForm";
import { currentRound } from "@/lib/predict";
import { closingDay, closingTime, PREDICT_FAQ, PREDICT_PATH, predictDescription, predictTitle, shortDay } from "@/lib/predict-copy";
import { followerThreshold } from "@/lib/privacy-copy";
import { absolute, OPEN_GRAPH, SITE_NAME, siteUrl } from "@/lib/site";

/**
 * Re-render every five minutes, so the page turns from the form to "closed"
 * soon after the statement starts without a deploy. The form also closes
 * itself in the browser at the exact time, and the server refuses late
 * predictions whatever the page shows.
 */
export const revalidate = 300;

export function generateMetadata(): Metadata {
  const round = currentRound();
  const title = predictTitle(round);
  const description = predictDescription(round);
  return {
    title: `${title}: ${round.questions.length} questions | ${SITE_NAME}`,
    description,
    alternates: { canonical: PREDICT_PATH },
    openGraph: { ...OPEN_GRAPH, title, description, type: "website", url: PREDICT_PATH },
    twitter: { card: "summary_large_image", title, description },
  };
}

const h2 = "m-0 text-title font-semibold";
const h3 = "m-0 text-body font-semibold text-ink";

/**
 * /budget/predict: the reader predicts what the Budget will contain, sees how
 * everyone else predicted, and shares their picks. The questions come from
 * content/predict/*.yaml; scoring against the Budget documents comes later
 * (docs/PREDICT_THE_BUDGET.md).
 */
export default function PredictPage() {
  const round = currentRound();
  const open = predictOpen(round);
  const title = predictTitle(round);
  const closes = `${closingTime(round.closes_at)} on ${shortDay(round.closes_at)}`;
  const faq = PREDICT_FAQ({ budget: round.budget, threshold: followerThreshold(), retentionMonths: PREDICTION_RETENTION_MONTHS, closes });
  const url = absolute(PREDICT_PATH);
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": url,
      url,
      name: title,
      description: predictDescription(round),
      inLanguage: "en-GB",
      isPartOf: { "@type": "WebSite", "@id": absolute("/#website"), name: SITE_NAME, url: absolute("/") },
      about: {
        "@type": "Event",
        name: round.budget,
        startDate: round.closes_at,
        location: { "@type": "Place", name: "House of Commons, London" },
        organizer: { "@type": "GovernmentOrganization", name: "HM Treasury" },
      },
      mainEntity: {
        "@type": "ItemList",
        name: `The ${round.questions.length} questions`,
        numberOfItems: round.questions.length,
        itemListElement: round.questions.map((q, i) => ({ "@type": "ListItem", position: i + 1, name: q.text })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { name: SITE_NAME, path: "/" },
        { name: "Promise ledger", path: "/promises" },
        { name: round.budget, path: "/budget" },
        { name: title, path: PREDICT_PATH },
      ].map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absolute(c.path) })),
    },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ];

  return (
    <>
      <JsonLd data={structuredData} />
      <SiteHeader current="/promises" />
      <main className="mx-auto grid max-w-[760px] grid-cols-[minmax(0,1fr)] gap-10 px-4 pb-20 pt-10 sm:px-6">
        <header className="grid gap-4">
          <BudgetNav current={PREDICT_PATH} />
          <a href="/budget" className="justify-self-start text-label font-medium">
            {round.budget}
          </a>
          <p className="m-0 text-label font-medium text-muted">
            Budget day {closingDay(round.closes_at)} · {open ? `predictions close at ${closingTime(round.closes_at)}, when the statement starts` : "predictions closed"}
          </p>
          <h1 className="m-0 text-[clamp(30px,4.4vw,44px)] font-semibold leading-[1.06] tracking-[-0.035em]">{title}</h1>
          <p className="m-0 text-lead text-muted">
            {round.questions.length} questions on what the Chancellor will announce. Pick what you think will happen, see how everyone else
            predicted, and share yours. After the Budget we check every answer against the Budget documents.
          </p>
          <p className="m-0 text-label text-muted">No account. We keep your answers and a random code for your link, nothing about you.</p>
        </header>

        <PredictForm
          round={{ id: round.id, budget: round.budget, budget_date: round.budget_date, closes_at: round.closes_at, questions: round.questions }}
          siteUrl={siteUrl()}
          closedAtRender={!open}
        />

        <section aria-labelledby="how-h" className="grid gap-3 border-t border-line pt-8">
          <h2 id="how-h" className={h2}>
            How it works
          </h2>
          <p className="m-0 text-muted">
            Every question is about something the Budget documents will settle without argument: a tax rate in the overview of tax rates, a measure in
            the Budget report&apos;s table of policy decisions, or a figure in the Office for Budget Responsibility&apos;s forecast. Each one says why it
            is asked, with sources, and which document settles it. Predictions close at {closes}, when the Chancellor stands up.
          </p>
          <p className="m-0 text-muted">
            The same evening editors start reading the documents, as they do for <a href="/budget">every promise the Budget can move</a>. An editor
            records each answer with a link to the page that shows it, and every set of predictions gets its score.
          </p>
        </section>

        <section aria-labelledby="faq-h" className="grid gap-5 border-t border-line pt-8">
          <h2 id="faq-h" className={h2}>
            Questions
          </h2>
          {faq.map(({ q, a }) => (
            <div key={q} className="grid max-w-[62ch] gap-1.5">
              <h3 className={h3}>{q}</h3>
              <p className="m-0 text-muted">{a}</p>
            </div>
          ))}
          <p className="m-0 text-label text-muted">
            More in the <a href="/privacy#predict">privacy notice</a>.
          </p>
        </section>
      </main>
    </>
  );
}
