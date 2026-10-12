import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PredictRound, type PredictAnswers } from "@ledger/schema";
import { loadConfig } from "../src/config";
import { type Db, testDb } from "../src/db";
import { createSpamChallenge } from "../src/spam";
import { runMaintenance } from "../src/alerts";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  countShare,
  crowd,
  getPrediction,
  isPredictionCode,
  makePrediction,
  newPredictionCode,
  parsePrediction,
  predictionPath,
  prunePredictions,
  type MakeDeps,
} from "../src/predict";

// A small set of questions in the shape of content/predict/*.yaml (the real file has its own test in packages/schema).
const ROUND = PredictRound.parse({
  id: "test-budget-2026",
  budget: "Test Budget",
  budget_date: "2026-10-28",
  closes_at: "2026-10-28T12:30:00Z",
  questions: Array.from({ length: 8 }, (_, i) => ({
    id: `q${i + 1}`,
    topic: `Question ${i + 1}`,
    text: `Will the Budget do thing number ${i + 1}?`,
    options: [
      { id: "yes", label: "Yes", short: "Yes" },
      { id: "no", label: "No", short: "No" },
    ],
    why: "Because it is being discussed before the Budget.",
    sources: [{ title: "A source", url: "https://www.gov.uk/x" }],
    settled_by: "The Budget document, table 5.1",
  })),
});
const ALL_YES: PredictAnswers = Object.fromEntries(ROUND.questions.map((q) => [q.id, "yes"]));
const config = loadConfig({ FOLLOWER_COUNT_THRESHOLD: "3" });
const NOW = new Date("2026-10-20T14:47:12Z");
const IP = "203.0.113.9";
const pass = async () => true;

let db: Db;
beforeEach(async () => {
  db = await testDb();
});
afterEach(async () => {
  await db.close();
});

const make = (body: unknown, extra: Partial<MakeDeps> = {}) =>
  makePrediction(body, { db, config, round: ROUND, clientKey: IP, now: NOW, verifySpam: pass, ...extra });

const usage = async (event: string, key = "", value = "") =>
  Number((await db.query<{ count: string }>("SELECT count FROM usage_daily WHERE event = $1 AND prop_key = $2 AND prop_value = $3", [event, key, value]))[0]?.count ?? 0);

describe("codes", () => {
  it("are 10 characters from an alphabet without look-alikes, and random", () => {
    const codes = new Set(Array.from({ length: 2000 }, newPredictionCode));
    expect(codes.size).toBe(2000);
    for (const c of codes) expect(isPredictionCode(c)).toBe(true);
    expect(CODE_LENGTH).toBe(10);
    expect(CODE_ALPHABET).not.toMatch(/[01ilo]/);
    expect(isPredictionCode("ABCDEFGHJK")).toBe(false);
    expect(isPredictionCode("abc")).toBe(false);
    expect(isPredictionCode("../../etc1")).toBe(false);
    expect(predictionPath("abcdefghjk")).toBe("/budget/predict/r/abcdefghjk");
  });
});

describe("validation", () => {
  it("accepts one option for every question and keeps only the ids, in the form's order", () => {
    const shuffled = Object.fromEntries(Object.entries(ALL_YES).reverse());
    const r = parsePrediction({ answers: shuffled, altcha: "p", name: "ignored" }, ROUND);
    expect(r.ok && Object.keys(r.answers)).toEqual(ROUND.questions.map((q) => q.id));
  });

  it("lists the questions left unanswered", () => {
    const { q2: _q2, q5: _q5, ...rest } = ALL_YES;
    expect(parsePrediction({ answers: rest, altcha: "p" }, ROUND)).toEqual({ ok: false, field: "answers", missing: ["q2", "q5"] });
    expect(parsePrediction({ altcha: "p" }, ROUND)).toMatchObject({ ok: false, field: "answers", missing: ROUND.questions.map((q) => q.id) });
  });

  it("refuses unknown questions, unknown options and anything that is not a set of answers", () => {
    expect(parsePrediction({ answers: { ...ALL_YES, q99: "yes" }, altcha: "p" }, ROUND)).toEqual({ ok: false, field: "answers" });
    expect(parsePrediction({ answers: { ...ALL_YES, q3: "maybe" }, altcha: "p" }, ROUND)).toMatchObject({ ok: false, field: "answers", missing: ["q3"] });
    expect(parsePrediction({ answers: { ...ALL_YES, q3: ["yes"] }, altcha: "p" }, ROUND)).toMatchObject({ ok: false, field: "answers" });
    expect(parsePrediction({ answers: ["yes"], altcha: "p" }, ROUND)).toMatchObject({ ok: false, field: "answers" });
    expect(parsePrediction(null, ROUND)).toEqual({ ok: false, field: "body" });
    expect(parsePrediction([], ROUND)).toEqual({ ok: false, field: "body" });
    expect(parsePrediction({ answers: ALL_YES }, ROUND)).toEqual({ ok: false, field: "altcha" });
  });

  it("stores nothing for an invalid set and counts why it was refused", async () => {
    const r = await make({ answers: { q1: "yes" }, altcha: "p" });
    expect(r).toMatchObject({ ok: false, httpStatus: 400, error: "invalid", field: "answers" });
    expect(await db.query("SELECT * FROM prediction")).toEqual([]);
    expect(await usage("prediction_blocked", "reason", "invalid")).toBe(1);
  });
});

describe("storing", () => {
  it("keeps only a random code, the set, the answers and the hour", async () => {
    const r = await make({ answers: ALL_YES, altcha: "p", email: "reader@example.org", name: "Reader" });
    expect(r.ok).toBe(true);
    const code = r.ok ? r.code : "";
    expect(isPredictionCode(code)).toBe(true);
    const cols = await db.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'prediction' ORDER BY ordinal_position");
    expect(cols.map((c) => c.column_name)).toEqual(["code", "round", "answers", "made_at"]);
    const [row] = await db.query<{ code: string; round: string; answers: PredictAnswers; made_at: Date }>("SELECT * FROM prediction");
    expect(row).toMatchObject({ code, round: ROUND.id, answers: ALL_YES });
    // Rounded down to the hour: 14:47:12 is kept as 14:00.
    expect(new Date(row!.made_at).toISOString()).toBe("2026-10-20T14:00:00.000Z");
    // Nothing anywhere holds the reader's IP address or what they typed beyond the answers.
    const everything = JSON.stringify([
      await db.query("SELECT * FROM prediction"),
      await db.query("SELECT * FROM rate_bucket"),
      await db.query("SELECT * FROM usage_daily"),
    ]);
    expect(everything).not.toContain(IP);
    expect(everything).not.toContain("reader@example.org");
    expect(everything).not.toContain("Reader");
    // Usage counts carry the set, never the code or the answers.
    expect(await usage("prediction_made", "round", ROUND.id)).toBe(1);
    expect(JSON.stringify(await db.query("SELECT * FROM usage_daily"))).not.toContain(code);
  });

  it("reads a set back by its code, and nothing for anything else", async () => {
    const r = await make({ answers: { ...ALL_YES, q4: "no" }, altcha: "p" });
    const code = r.ok ? r.code : "";
    expect(await getPrediction(db, code)).toEqual({ code, round: ROUND.id, answers: { ...ALL_YES, q4: "no" }, madeAt: "2026-10-20T14:00:00.000Z" });
    expect(await getPrediction(db, "zzzzzzzzzz")).toBeNull();
    expect(await getPrediction(db, "'; DROP TABLE prediction; --")).toBeNull();
    expect(await getPrediction(db, undefined)).toBeNull();
  });

  it("closes when the Budget statement starts", async () => {
    expect((await make({ answers: ALL_YES, altcha: "p" }, { now: new Date("2026-10-28T12:29:59Z") })).ok).toBe(true);
    const late = await make({ answers: ALL_YES, altcha: "p" }, { now: new Date("2026-10-28T12:30:00Z") });
    expect(late).toEqual({ ok: false, httpStatus: 410, error: "closed" });
    expect(await db.query("SELECT code FROM prediction")).toHaveLength(1);
    expect(await usage("prediction_blocked", "reason", "closed")).toBe(1);
  });
});

describe("spam controls", () => {
  it("needs a solved ALTCHA challenge, and accepts each one once", async () => {
    const { solveChallenge } = await import("altcha-lib");
    const { deriveKey } = await import("altcha-lib/algorithms/pbkdf2");
    const challenge = await createSpamChallenge(config, { cost: 10, counter: [1, 20] });
    const solution = await solveChallenge({ challenge, deriveKey } as never);
    const payload = Buffer.from(JSON.stringify({ challenge, solution })).toString("base64");
    const real = { verifySpam: undefined };
    expect((await make({ answers: ALL_YES, altcha: payload }, real)).ok).toBe(true);
    expect(await make({ answers: ALL_YES, altcha: payload }, real)).toEqual({ ok: false, httpStatus: 400, error: "spam_check" }); // replay
    expect(await make({ answers: ALL_YES, altcha: "bm90IGpzb24=" }, real)).toEqual({ ok: false, httpStatus: 400, error: "spam_check" });
    expect(await db.query("SELECT code FROM prediction")).toHaveLength(1);
    expect(await usage("prediction_blocked", "reason", "spam_check")).toBe(2);
  });

  it("limits each connection per day, by a salted bucket that stores no IP", async () => {
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await make({ answers: ALL_YES, altcha: "p" }, { dailyLimit: 2 }));
    expect(results.map((r) => (r.ok ? "ok" : r.error))).toEqual(["ok", "ok", "rate_limited"]);
    expect(results[2]).toMatchObject({ httpStatus: 429 });
    expect((await make({ answers: ALL_YES, altcha: "p" }, { dailyLimit: 2, clientKey: "198.51.100.1" })).ok).toBe(true);
    // The next day the count starts again.
    expect((await make({ answers: ALL_YES, altcha: "p" }, { dailyLimit: 2, now: new Date("2026-10-21T09:00:00Z") })).ok).toBe(true);
    expect(JSON.stringify(await db.query("SELECT * FROM rate_bucket"))).not.toContain(IP);
    expect(await usage("prediction_blocked", "reason", "rate_limited")).toBe(1);
  });
});

describe("how everyone predicted", () => {
  it("shows nothing, not even the total, below the site's minimum count", async () => {
    const first = await make({ answers: ALL_YES, altcha: "p" });
    expect(first.ok && first.crowd).toEqual({ total: null, threshold: 3, questions: null });
    await make({ answers: ALL_YES, altcha: "p" });
    expect(await crowd(db, ROUND, 3)).toEqual({ total: null, threshold: 3, questions: null });
  });

  it("shows counts per option once the minimum count is reached", async () => {
    await make({ answers: ALL_YES, altcha: "p" });
    await make({ answers: { ...ALL_YES, q1: "no" }, altcha: "p" });
    const third = await make({ answers: { ...ALL_YES, q1: "no", q8: "no" }, altcha: "p" });
    expect(third.ok && third.crowd.total).toBe(3);
    const c = third.ok ? third.crowd : null;
    expect(c!.questions!.q1).toEqual({ yes: 1, no: 2 });
    expect(c!.questions!.q8).toEqual({ yes: 2, no: 1 });
    expect(c!.questions!.q2).toEqual({ yes: 3, no: 0 });
  });

  it("counts each set of questions on its own, and only options the set still has", async () => {
    for (let i = 0; i < 3; i++) await make({ answers: ALL_YES, altcha: "p" });
    await db.query("INSERT INTO prediction (code, round, answers, made_at) VALUES ('2345678923', 'other-budget', '{\"q1\":\"no\"}', now())");
    await db.query("INSERT INTO prediction (code, round, answers, made_at) VALUES ('2345678924', $1, $2, now())", [ROUND.id, JSON.stringify({ ...ALL_YES, q1: "retired-option" })]);
    const c = await crowd(db, ROUND, 3);
    expect(c.total).toBe(4);
    expect(c.questions!.q1).toEqual({ yes: 3, no: 0 });
    // A question added later, with fewer answers than the minimum, shows nothing.
    const extended = { id: ROUND.id, questions: [...ROUND.questions, { ...ROUND.questions[0]!, id: "q9" }] };
    const later = await crowd(db, extended, 3);
    expect(later.questions!.q9).toBeUndefined();
    expect(later.questions!.q2).toEqual({ yes: 4, no: 0 });
    expect(await crowd(db, { id: "other-budget", questions: ROUND.questions }, 3)).toMatchObject({ total: null });
    // The threshold is never below one.
    expect((await crowd(db, { id: "other-budget", questions: ROUND.questions }, 0)).total).toBe(1);
  });
});

describe("housekeeping and counts", () => {
  it("deletes predictions 13 months after they were made, in the daily job", async () => {
    await db.query("INSERT INTO prediction (code, round, answers, made_at) VALUES ('2345678922', 'x', '{}', $1)", ["2025-09-20T10:00:00Z"]);
    await db.query("INSERT INTO prediction (code, round, answers, made_at) VALUES ('2345678923', 'x', '{}', $1)", ["2025-12-20T10:00:00Z"]);
    expect(await prunePredictions(db, new Date("2026-11-01T03:00:00Z"))).toBe(1);
    expect(await db.query("SELECT code FROM prediction")).toEqual([{ code: "2345678923" }]);
    const report = await runMaintenance(db, new Date("2027-01-21T03:00:00Z"));
    expect(report.predictions).toBe(1);
    expect(await db.query("SELECT code FROM prediction")).toEqual([]);
  });

  it("counts share buttons by method only, capped per connection", async () => {
    await countShare(db, "whatsapp", IP, NOW);
    await countShare(db, "native", IP, NOW);
    expect(await usage("prediction_shared", "method", "whatsapp")).toBe(1);
    expect(await usage("prediction_shared")).toBe(2);
    for (let i = 0; i < 40; i++) await countShare(db, "copy", IP, NOW);
    expect(await usage("prediction_shared", "method", "copy")).toBe(28);
  });
});
