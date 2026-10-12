import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { predictOpen, type PredictRound } from "@ledger/schema";
import { getPrediction, isPredictionCode, predictionPath, type Prediction } from "@ledger/server/predict";
import { SiteHeader } from "@/components/SiteHeader";
import { JsonLd } from "@/components/JsonLd";
import { PredictionShare } from "@/components/PredictionShare";
import { getServer } from "@/lib/server";
import { roundById } from "@/lib/predict";
import { budgetLinkText } from "@/lib/budget";
import { todayIso } from "@/lib/promises";
import { closingDay, closingTime, PREDICT_PATH, picks, predictTitle, shortDay } from "@/lib/predict-copy";
import { absolute, OPEN_GRAPH, SITE_NAME, siteUrl } from "@/lib/site";

type Props = { params: Promise<{ code: string }> };

/**
 * A set of predictions never changes once made, so each page is rendered on
 * its first visit and kept for an hour (the hour lets scores appear after the
 * Budget without a deploy). Nothing is rendered at build time.
 */
export const revalidate = 3600;
export function generateStaticParams() {
  return [];
}

/** The prediction and its question set, or null for an unknown code. */
async function load(code: string): Promise<{ prediction: Prediction; round: PredictRound } | null> {
  if (!isPredictionCode(code)) return null;
  const { db } = await getServer();
  const prediction = await getPrediction(db, code);
  const round = prediction ? roundById(prediction.round) : null;
  return prediction && round ? { prediction, round } : null;
}

const TITLE = (r: PredictRound) => `My predictions for the ${r.budget}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const r = await load(code);
  if (!r) return { title: `Predictions not found | ${SITE_NAME}`, robots: { index: false } };
  const { round, prediction } = r;
  const title = TITLE(round);
  const shown = picks(round, prediction.answers);
  const description = `${shown
    .slice(0, 4)
    .map((p) => `${p.topic}: ${p.short}`)
    .join("; ")}${shown.length > 4 ? `; and ${shown.length - 4} more` : ""}. ${
    predictOpen(round) ? `Make your own before ${closingTime(round.closes_at)} on ${shortDay(round.closes_at)}.` : "See how everyone predicted."
  }`;
  const path = predictionPath(code);
  return {
    title: `${title} | ${SITE_NAME}`,
    description,
    alternates: { canonical: path },
    // A reader's own predictions, not a page for search: previews yes, indexing no (as shared scenarios, /s/<code>).
    openGraph: { ...OPEN_GRAPH, title, description, type: "article", url: path },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: false },
  };
}

/** /budget/predict/r/<code>: one reader's predictions, the link they share, and the call to make your own. */
export default async function PredictionPage({ params }: Props) {
  const { code } = await params;
  const r = await load(code);
  if (!r) notFound();
  const { round, prediction } = r;
  const open = predictOpen(round);
  const path = predictionPath(code);
  const title = TITLE(round);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { name: SITE_NAME, path: "/" },
      { name: round.budget, path: "/budget" },
      { name: predictTitle(round), path: PREDICT_PATH },
      { name: "A reader's predictions", path },
    ].map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absolute(c.path) })),
  };

  return (
    <>
      <JsonLd data={structuredData} />
      <SiteHeader current="/promises" />
      <main className="mx-auto grid max-w-[760px] grid-cols-[minmax(0,1fr)] gap-10 px-4 pb-20 pt-10 sm:px-6">
        <header className="grid gap-4">
          <a href={PREDICT_PATH} className="justify-self-start text-label font-medium">
            {predictTitle(round)}
          </a>
          <p className="m-0 text-label font-medium text-muted">Made on {shortDay(prediction.madeAt)}, before the Budget</p>
          <h1 className="m-0 text-[clamp(30px,4.4vw,44px)] font-semibold leading-[1.06] tracking-[-0.035em]">{title}</h1>
          <p className="m-0 text-lead text-muted">
            What they think the Chancellor will announce on {closingDay(round.closes_at)}. After the Budget, each answer is checked against the Budget
            documents.
          </p>
        </header>

        <ol className="m-0 grid list-none border-t border-line p-0">
          {round.questions.map((q) => {
            const pick = q.options.find((o) => o.id === prediction.answers[q.id]);
            return (
              <li key={q.id} className="grid gap-1.5 border-b border-line py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-6">
                <span className="grid gap-0.5">
                  <span className="text-label text-muted">{q.topic}</span>
                  <span className="text-sm">{q.text}</span>
                </span>
                <span className="text-[17px] font-semibold sm:text-right">{pick ? pick.short : <span className="font-normal text-muted">No answer</span>}</span>
              </li>
            );
          })}
        </ol>

        <section aria-labelledby="yours-h" className="grid gap-3 rounded-panel bg-sunk p-5 sm:p-6">
          <h2 id="yours-h" className="m-0 text-title font-semibold">
            {open ? "What do you think will happen?" : "Predictions are closed"}
          </h2>
          <p className="m-0 text-muted">
            {open
              ? `Make your own predictions: ${round.questions.length} questions, a couple of minutes, no account. Open until ${closingTime(round.closes_at)} on ${closingDay(round.closes_at)}, when the Budget statement starts.`
              : `They closed at ${closingTime(round.closes_at)} on ${closingDay(round.closes_at)}, when the Budget statement began. See how everyone predicted.`}
          </p>
          <a href={PREDICT_PATH} className="inline-flex min-h-11 w-fit items-center rounded-control bg-ink px-5 text-[15px] font-semibold text-bg no-underline hover:opacity-90">
            {open ? "Make my predictions" : "How everyone predicted"}
          </a>
        </section>

        <section aria-labelledby="share-h" className="grid gap-3">
          <h2 id="share-h" className="m-0 text-body font-semibold">
            Share these predictions
          </h2>
          <PredictionShare url={`${siteUrl()}${path}`} title={title} budget={round.budget} />
        </section>

        <p className="m-0 border-t border-line pt-6 text-label text-muted">
          Made by a reader of LedgerGov.UK; not a LedgerGov.UK forecast. <a href="/budget">{budgetLinkText(todayIso())}</a>
        </p>
      </main>
    </>
  );
}
