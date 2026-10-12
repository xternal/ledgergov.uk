import { randomInt } from "node:crypto";
import { completeAnswers, predictOpen, type PredictAnswers, type PredictRound, type ShareMethod } from "@ledger/schema";
import type { Config } from "../config";
import type { Db } from "../db";
import { rateLimit, verifySpamCheck } from "../spam";
import { countUsage } from "../usage";

/**
 * Predict the Budget (Day 9). A reader answers a fixed set of questions about
 * a Budget; we keep a random code, the answers and the hour, nothing else (no
 * IP address, email, name or cookie). The code is the share link. Readers see
 * how everyone predicted only once enough people have (the site's minimum
 * count, as for follower counts), so a small crowd reveals nobody. Predictions
 * close when the Budget statement starts. Abuse controls are the forms' own:
 * the ALTCHA proof of work and a daily limit per salted, IP-free bucket.
 */

/** Sets of predictions per connection (salted, IP-free) per day: generous, because mobile networks and offices share addresses. */
export const PREDICT_DAILY_LIMIT = 30;
/** Predictions are deleted this many months after they are made: about a year after the Budget they are about. */
export const PREDICTION_RETENTION_MONTHS = 13;
/** Share-button counts per connection per day, so one reader cannot inflate them. */
const SHARE_COUNT_DAILY_LIMIT = 30;

/** No 0/o, 1/i/l: a code read aloud or retyped stays right. 31 letters, 10 long: about 50 bits, not guessable. */
export const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const CODE_LENGTH = 10;
const CODE_SHAPE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function newPredictionCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export const isPredictionCode = (x: unknown): x is string => typeof x === "string" && CODE_SHAPE.test(x);

/** The page that shows a set of predictions, and the link people share. */
export const predictionPath = (code: string) => `/budget/predict/r/${code}`;

// ---------------------------------------------------------------- validation

export type PredictParse =
  | { ok: true; answers: PredictAnswers; altcha: string }
  | { ok: false; field: "body" | "answers" | "altcha"; /** Questions left unanswered, in the form's order. */ missing?: string[] };

/**
 * Body of POST /api/predict: { answers: { question id: option id }, altcha }.
 * Every question needs one of its options; nothing else is accepted.
 */
export function parsePrediction(body: unknown, round: Pick<PredictRound, "questions">): PredictParse {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, field: "body" };
  const b = body as Record<string, unknown>;
  const raw = b.answers;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, field: "answers", missing: round.questions.map((q) => q.id) };
  const given = raw as Record<string, unknown>;
  const known = new Set(round.questions.map((q) => q.id));
  if (Object.keys(given).some((k) => !known.has(k))) return { ok: false, field: "answers" };
  // Stored in the form's order, with only the ids.
  const answers: PredictAnswers = {};
  for (const q of round.questions) {
    const v = given[q.id];
    if (typeof v === "string" && q.options.some((o) => o.id === v)) answers[q.id] = v;
  }
  if (!completeAnswers(round, answers)) {
    const missing = round.questions.filter((q) => !(q.id in answers)).map((q) => q.id);
    return { ok: false, field: "answers", missing };
  }
  if (typeof b.altcha !== "string" || !b.altcha) return { ok: false, field: "altcha" };
  return { ok: true, answers, altcha: b.altcha };
}

// ---------------------------------------------------------------- making a prediction

/** How everyone predicted: counts per option, or nothing below the minimum count. */
export interface Crowd {
  /** How many sets of predictions; null below `threshold`. */
  total: number | null;
  /** The minimum count, so the page can say when the crowd will show. */
  threshold: number;
  /** Question id → option id → how many chose it; null below `threshold`. A question with fewer answers than that is left out. */
  questions: Record<string, Record<string, number>> | null;
}

export type MakeResult =
  | { ok: true; code: string; crowd: Crowd }
  | { ok: false; httpStatus: 400 | 410 | 429; error: "invalid" | "closed" | "spam_check" | "rate_limited"; field?: string; missing?: string[] };

export interface MakeDeps {
  db: Db;
  config: Config;
  round: PredictRound;
  /** Per-client key for rate limiting (the request IP); never stored. */
  clientKey: string;
  now?: Date;
  /** Defaults to the ALTCHA check; tests may stand in for it. */
  verifySpam?: (payload: string) => Promise<boolean>;
  dailyLimit?: number;
}

const HOUR_MS = 3_600_000;

export async function makePrediction(body: unknown, deps: MakeDeps): Promise<MakeResult> {
  const { db, config, round } = deps;
  const now = deps.now ?? new Date();
  const blocked = (reason: "closed" | "invalid" | "spam_check" | "rate_limited") => countUsage(db, { event: "prediction_blocked", props: { reason } }, 1, now);

  // 1. Closed when the statement starts: before anything else, so no check is spent on it.
  if (!predictOpen(round, now)) {
    await blocked("closed");
    return { ok: false, httpStatus: 410, error: "closed" };
  }
  // 2. Validate before the spam check, so a reader fixing an answer keeps their solved check.
  const parsed = parsePrediction(body, round);
  if (!parsed.ok) {
    await blocked("invalid");
    return { ok: false, httpStatus: 400, error: "invalid", field: parsed.field, ...(parsed.missing ? { missing: parsed.missing } : {}) };
  }
  // 3. Spam check (each solved challenge is accepted once), then 4. the daily limit.
  const verify = deps.verifySpam ?? ((payload: string) => verifySpamCheck(db, config, payload));
  if (!(await verify(parsed.altcha))) {
    await blocked("spam_check");
    return { ok: false, httpStatus: 400, error: "spam_check" };
  }
  if (!(await rateLimit(db, deps.clientKey, "predict", deps.dailyLimit ?? PREDICT_DAILY_LIMIT, now))) {
    await blocked("rate_limited");
    return { ok: false, httpStatus: 429, error: "rate_limited" };
  }

  // 5. Store the code, the set, the answers and the hour. A clash of random codes is all but impossible; try again if it happens.
  const madeAt = new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS).toISOString();
  let code: string | null = null;
  for (let attempt = 0; attempt < 5 && !code; attempt++) {
    const candidate = newPredictionCode();
    const rows = await db.query<{ code: string }>(
      "INSERT INTO prediction (code, round, answers, made_at) VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING RETURNING code",
      [candidate, round.id, JSON.stringify(parsed.answers), madeAt],
    );
    code = rows[0]?.code ?? null;
  }
  if (!code) throw new Error("could not allocate a prediction code");
  await countUsage(db, { event: "prediction_made", props: { round: round.id } }, 1, now);
  return { ok: true, code, crowd: await crowd(db, round, config.followerCountThreshold) };
}

// ---------------------------------------------------------------- reading

export interface Prediction {
  code: string;
  round: string;
  answers: PredictAnswers;
  /** The hour it was made (ISO, UTC). */
  madeAt: string;
}

/** One set of predictions by its code, or null. Anything that is not a code shape is not looked up. */
export async function getPrediction(db: Db, code: unknown): Promise<Prediction | null> {
  if (!isPredictionCode(code)) return null;
  const [row] = await db.query<{ code: string; round: string; answers: PredictAnswers | string; made_at: Date | string }>(
    "SELECT code, round, answers, made_at FROM prediction WHERE code = $1",
    [code],
  );
  if (!row) return null;
  const answers = typeof row.answers === "string" ? (JSON.parse(row.answers) as PredictAnswers) : row.answers;
  return { code: row.code, round: row.round, answers, madeAt: new Date(row.made_at).toISOString() };
}

/**
 * How everyone predicted on a set: counts per option for the set's current
 * questions and options. Below `threshold` sets of predictions, nothing at all,
 * not even the total.
 */
export async function crowd(db: Db, round: Pick<PredictRound, "id" | "questions">, threshold: number): Promise<Crowd> {
  const min = Math.max(1, threshold);
  const [row] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM prediction WHERE round = $1", [round.id]);
  const total = Number(row?.n ?? 0);
  if (total < min) return { total: null, threshold: min, questions: null };
  const rows = await db.query<{ question: string; option: string; n: number }>(
    `SELECT a.key AS question, a.value AS option, count(*)::int AS n
       FROM prediction p, jsonb_each_text(p.answers) a
      WHERE p.round = $1
      GROUP BY a.key, a.value`,
    [round.id],
  );
  const questions: Record<string, Record<string, number>> = {};
  for (const q of round.questions) questions[q.id] = Object.fromEntries(q.options.map((o) => [o.id, 0]));
  for (const r of rows) {
    const counts = questions[r.question];
    if (counts && r.option in counts) counts[r.option] = Number(r.n);
  }
  // A question answered by fewer than the minimum (only if one was added after predictions opened) shows nothing.
  for (const [id, counts] of Object.entries(questions)) if (Object.values(counts).reduce((a, n) => a + n, 0) < min) delete questions[id];
  return { total, threshold: min, questions };
}

// ---------------------------------------------------------------- housekeeping and counts

/** Delete predictions 13 months after they were made. Run daily (alerts maintenance job). Returns how many. */
export async function prunePredictions(db: Db, now = new Date()): Promise<number> {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - PREDICTION_RETENTION_MONTHS);
  return (await db.query("DELETE FROM prediction WHERE made_at < $1 RETURNING code", [cutoff.toISOString()])).length;
}

/** Count one press of a share button: how, never which predictions. Capped per connection per day. */
export async function countShare(db: Db, method: ShareMethod, clientKey: string, now = new Date()): Promise<void> {
  if (await rateLimit(db, clientKey, "prediction_shared", SHARE_COUNT_DAILY_LIMIT, now)) {
    await countUsage(db, { event: "prediction_shared", props: { method } }, 1, now);
  }
}
