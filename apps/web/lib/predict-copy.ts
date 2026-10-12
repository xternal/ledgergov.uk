import type { PredictAnswers, PredictRound } from "@ledger/schema";

/**
 * Words for Predict the Budget, shared by its pages, share images, structured
 * data and llms.txt. Safe in the browser: no server code here.
 */

export const PREDICT_PATH = "/budget/predict";

const london = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", ...o });

/** "12:30 GMT" (or BST in summer): the closing time in UK time, with its zone. */
export const closingTime = (closesAt: string) =>
  `${london(closesAt, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} ${london(closesAt, { timeZoneName: "short" }).split(" ").pop()}`;

/** "Wednesday 28 October" */
export const closingDay = (closesAt: string) => `${london(closesAt, { weekday: "long" })} ${london(closesAt, { day: "numeric" })} ${london(closesAt, { month: "long" })}`;

/** "28 October" */
export const shortDay = (iso: string) => london(iso.length === 10 ? `${iso}T12:00:00Z` : iso, { day: "numeric", month: "long" });

/** "Predict the Autumn Budget 2026" */
export const predictTitle = (r: Pick<PredictRound, "budget">) => `Predict the ${r.budget}`;

export const predictDescription = (r: Pick<PredictRound, "budget" | "budget_date" | "closes_at" | "questions">) =>
  `${r.questions.length} questions on what the ${r.budget} on ${shortDay(r.budget_date)} will do to income tax, National Insurance, VAT, fuel duty, capital gains tax, defence and the public finances. Make your predictions, see how everyone else predicted and share yours. Open until ${closingTime(r.closes_at)} on ${shortDay(r.closes_at)}; no account, and nothing about you is kept.`;

/** The words that go with a shared link. */
export const shareText = (r: Pick<PredictRound, "budget">) => `My predictions for the ${r.budget}. What do you think the Chancellor will do?`;

/** "Basic rate of income tax: Stays at 20%" for each question, in order. */
export function picks(round: Pick<PredictRound, "questions">, answers: PredictAnswers): { topic: string; text: string; pick: string; short: string }[] {
  return round.questions.flatMap((q) => {
    const o = q.options.find((x) => x.id === answers[q.id]);
    return o ? [{ topic: q.topic, text: q.text, pick: o.label, short: o.short }] : [];
  });
}

/** Percentages that add up as readers expect: whole numbers, from counts. */
export const percent = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

/** The page's questions, shown on it and repeated as FAQPage structured data. */
export const PREDICT_FAQ = (o: { budget: string; threshold: number; retentionMonths: number; closes: string }): { q: string; a: string }[] => [
  {
    q: "What is this?",
    a: `A game of foresight about the ${o.budget}. Each question asks what the Budget will contain, not what it should, and has a fixed set of answers that the Budget documents settle. It is not an opinion poll, and the readers who play are not a representative sample.`,
  },
  {
    q: "Who decides the right answers?",
    a: "The Budget documents themselves: the Budget report, the overview of tax rates and the Office for Budget Responsibility's forecast, published straight after the statement. Two editors record each answer with a link to the page that shows it, and every set of predictions is then scored against them.",
  },
  {
    q: "What do you keep about me?",
    a: `Nothing about you: a random code for your link, your answers and the hour you sent them. No name, email, IP address or cookie. They are deleted ${o.retentionMonths} months after you make them.`,
  },
  {
    q: "Can I see how other people predicted?",
    a: `Yes, once you have sent yours, if at least ${o.threshold} people have predicted, so a small crowd reveals nobody. After predictions close at ${o.closes}, everyone can see the totals.`,
  },
  {
    q: "Can I change my answers?",
    a: "Not once they are sent: a prediction counts from the moment it is made.",
  },
  {
    q: "Are the questions neutral?",
    a: "Each asks what the government will do, in plain words, with every outcome as a possible answer and no answer marked as good or bad. Editors check them under the site's one standard for every party, and each question says why it is asked and which document will settle it.",
  },
];
