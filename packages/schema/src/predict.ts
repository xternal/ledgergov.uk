import { z } from "zod";
import { IsoDate } from "./provenance";

/**
 * Predict the Budget (Day 9): a set of questions about what a Budget will
 * contain, each with a fixed set of answers that the Budget documents settle.
 * One YAML file per set in content/predict/<id>.yaml, so editors change the
 * wording in a pull request, not in code. Readers' predictions are stored by
 * the set's id and the question and option ids (packages/server/src/predict),
 * so after launch an id never changes; wording may be fixed, meaning may not.
 * After the Budget, an editor fills in each question's `answer` and
 * `evidence_url`, and the site scores every prediction against them
 * (docs/PREDICT_THE_BUDGET.md).
 */

/** Ids are short slugs: they appear in stored predictions and never change after launch. */
export const PREDICT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const Id = z.string().max(48).regex(PREDICT_ID, "use lower-case letters, digits and single dashes");

/** A moment in UTC, written with a Z, e.g. 2026-10-28T12:30:00Z: no time-zone guessing around the clock change. */
const UtcMoment = z.iso.datetime().refine((s) => s.endsWith("Z"), "write the time in UTC, ending in Z");

export const PredictOption = z.strictObject({
  id: Id,
  /** The answer as the form shows it, e.g. "It goes up". */
  label: z.string().min(1).max(80),
  /** A few words for the share image and lists, e.g. "Up". */
  short: z.string().min(1).max(22),
});
export type PredictOption = z.infer<typeof PredictOption>;

export const PredictSource = z.strictObject({ title: z.string().min(3).max(160), url: z.url() });

export const PredictQuestion = z.strictObject({
  id: Id,
  /** The subject in a few words, for lists and the share image, e.g. "Basic rate of income tax". */
  topic: z.string().min(3).max(30),
  /** The question as asked: neutral, one subject, settled by a named document. */
  text: z.string().min(10).max(200),
  options: z.array(PredictOption).min(2).max(5),
  /** Why we ask: where things stand today and what is being discussed, in plain words. */
  why: z.string().min(20).max(700),
  sources: z.array(PredictSource).min(1).max(4),
  /** Which Budget document, and which table or line in it, settles the answer. */
  settled_by: z.string().min(10).max(300),
  /** After the Budget: the option the documents show. An editor approves it. */
  answer: Id.nullable().default(null),
  /** The page that shows it, with #page=NN for a PDF. */
  evidence_url: z.url().nullable().default(null),
});
export type PredictQuestion = z.infer<typeof PredictQuestion>;

export const PredictRound = z
  .strictObject({
    id: Id,
    /** The Budget this set is about, e.g. "Autumn Budget 2026". */
    budget: z.string().min(3).max(60),
    budget_date: IsoDate,
    /** Predictions close when the Budget statement starts. The one setting for the closing time. */
    closes_at: UtcMoment,
    questions: z.array(PredictQuestion).min(8).max(10),
  })
  .superRefine((r, ctx) => {
    const seen = new Set<string>();
    r.questions.forEach((q, i) => {
      if (seen.has(q.id)) ctx.addIssue({ code: "custom", path: ["questions", i, "id"], message: `question id "${q.id}" is used twice` });
      seen.add(q.id);
      const options = new Set<string>();
      q.options.forEach((o, j) => {
        if (options.has(o.id)) ctx.addIssue({ code: "custom", path: ["questions", i, "options", j, "id"], message: `option id "${o.id}" is used twice` });
        options.add(o.id);
      });
      if (q.answer !== null && !options.has(q.answer))
        ctx.addIssue({ code: "custom", path: ["questions", i, "answer"], message: `answer "${q.answer}" is not one of this question's options` });
      if ((q.answer === null) !== (q.evidence_url === null))
        ctx.addIssue({ code: "custom", path: ["questions", i, "evidence_url"], message: "an answer and its evidence_url go together" });
    });
    if (!r.closes_at.startsWith(r.budget_date))
      ctx.addIssue({ code: "custom", path: ["closes_at"], message: "predictions close on Budget day, when the statement starts" });
  });
export type PredictRound = z.infer<typeof PredictRound>;

/** A reader's answers: question id → option id, one for every question. */
export type PredictAnswers = Record<string, string>;

/** Whether predictions for this set are still open at `now`. */
export const predictOpen = (round: Pick<PredictRound, "closes_at">, now = new Date()) => now.getTime() < Date.parse(round.closes_at);

/** Every question answered with one of its options, and nothing else. */
export function completeAnswers(round: Pick<PredictRound, "questions">, answers: unknown): answers is PredictAnswers {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return false;
  const a = answers as Record<string, unknown>;
  if (Object.keys(a).length !== round.questions.length) return false;
  return round.questions.every((q) => typeof a[q.id] === "string" && q.options.some((o) => o.id === a[q.id]));
}

/**
 * How a prediction scores once editors have filled in the answers (Day 13):
 * one point per question whose answer matches. Questions not yet settled are
 * not counted, so a partly settled set gives a partial score.
 */
export function scorePrediction(round: Pick<PredictRound, "questions">, answers: PredictAnswers): { right: number; settled: number } {
  const settled = round.questions.filter((q) => q.answer !== null);
  return { right: settled.filter((q) => answers[q.id] === q.answer).length, settled: settled.length };
}

/** How a reader shared their predictions; counted per day, never with the code (analytics privacy rules). */
export const SHARE_METHODS = ["native", "copy", "whatsapp", "telegram", "x", "linkedin", "facebook", "email"] as const;
export type ShareMethod = (typeof SHARE_METHODS)[number];
export const isShareMethod = (x: unknown): x is ShareMethod => typeof x === "string" && (SHARE_METHODS as readonly string[]).includes(x);
