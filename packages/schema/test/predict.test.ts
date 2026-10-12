import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { completeAnswers, predictOpen, PredictRound, scorePrediction } from "../src/predict";
import { loadPredictRounds, predictIssues } from "../src/predict-data";

const question = (id: string) => ({
  id,
  topic: `Topic ${id}`,
  text: `Will the Budget do ${id}?`,
  options: [
    { id: "yes", label: "Yes", short: "Yes" },
    { id: "no", label: "No", short: "No" },
  ],
  why: "Because it is being discussed before the Budget.",
  sources: [{ title: "A source", url: "https://www.gov.uk/x" }],
  settled_by: "The Budget document, table 5.1",
});
const ROUND = {
  id: "test-budget",
  budget: "Test Budget",
  budget_date: "2026-10-28",
  closes_at: "2026-10-28T12:30:00Z",
  questions: ["a", "b", "c", "d", "e", "f", "g", "h"].map(question),
};
const issues = (raw: unknown) => {
  const r = PredictRound.safeParse(raw);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("the question sets in content/predict", () => {
  it("parse, with 8 to 10 questions, each with sources and the document that settles it", () => {
    const rounds = loadPredictRounds();
    expect(rounds.length).toBeGreaterThan(0);
    for (const r of rounds) {
      expect(r.questions.length).toBeGreaterThanOrEqual(8);
      expect(r.questions.length).toBeLessThanOrEqual(10);
      for (const q of r.questions) {
        expect(q.sources.length).toBeGreaterThan(0);
        expect(q.settled_by.length).toBeGreaterThan(10);
      }
    }
    expect(predictIssues()).toEqual([]);
  });

  it("close the Autumn Budget 2026 set when the statement starts, 12:30 GMT on 28 October", () => {
    const r = loadPredictRounds().find((x) => x.id === "autumn-budget-2026")!;
    expect(r.closes_at).toBe("2026-10-28T12:30:00Z");
    expect(predictOpen(r, new Date("2026-10-28T12:29:59Z"))).toBe(true);
    expect(predictOpen(r, new Date("2026-10-28T12:30:00Z"))).toBe(false);
  });

  it("are not settled before the Budget", () => {
    const r = loadPredictRounds().find((x) => x.id === "autumn-budget-2026")!;
    if (predictOpen(r)) expect(r.questions.every((q) => q.answer === null && q.evidence_url === null)).toBe(true);
  });
});

describe("the schema", () => {
  it("accepts a well-formed set and fills in empty answers", () => {
    const r = PredictRound.parse(ROUND);
    expect(r.questions[0]!.answer).toBeNull();
    expect(r.questions[0]!.evidence_url).toBeNull();
  });

  it("refuses repeated ids, an answer that is not an option, and an answer without its evidence", () => {
    const twice = { ...ROUND, questions: [...ROUND.questions.slice(0, 7), question("a")] };
    expect(issues(twice)).toEqual(['questions.7.id: question id "a" is used twice']);
    const badAnswer = { ...ROUND, questions: [{ ...question("a"), answer: "maybe", evidence_url: "https://www.gov.uk/budget" }, ...ROUND.questions.slice(1)] };
    expect(issues(badAnswer)).toEqual(['questions.0.answer: answer "maybe" is not one of this question\'s options']);
    const noEvidence = { ...ROUND, questions: [{ ...question("a"), answer: "yes" }, ...ROUND.questions.slice(1)] };
    expect(issues(noEvidence)).toEqual(["questions.0.evidence_url: an answer and its evidence_url go together"]);
    const sameOption = { ...ROUND, questions: [{ ...question("a"), options: [question("a").options[0], question("a").options[0]] }, ...ROUND.questions.slice(1)] };
    expect(issues(sameOption)).toEqual(['questions.0.options.1.id: option id "yes" is used twice']);
  });

  it("needs a closing time in UTC on Budget day, 8 to 10 questions and slug ids", () => {
    expect(issues({ ...ROUND, closes_at: "2026-10-28T12:30:00+01:00" }).join()).toMatch(/closes_at/);
    expect(issues({ ...ROUND, closes_at: "2026-10-29T12:30:00Z" })).toEqual(["closes_at: predictions close on Budget day, when the statement starts"]);
    expect(issues({ ...ROUND, questions: ROUND.questions.slice(0, 7) }).join()).toMatch(/questions/);
    expect(issues({ ...ROUND, id: "Autumn Budget" }).join()).toMatch(/lower-case/);
    expect(issues({ ...ROUND, extra: true }).join()).toMatch(/extra/);
  });

  it("checks the file name against the set's id", () => {
    const root = mkdtempSync(join(tmpdir(), "predict-"));
    mkdirSync(join(root, "content", "predict"), { recursive: true });
    writeFileSync(join(root, "content", "predict", "wrong-name.yaml"), stringify(ROUND));
    expect(predictIssues(root).join()).toMatch(/file name must be the set's id/);
  });
});

describe("answers and scores", () => {
  const round = PredictRound.parse(ROUND);
  const all = Object.fromEntries(round.questions.map((q) => [q.id, "yes"]));

  it("are complete only with one of its options for every question", () => {
    expect(completeAnswers(round, all)).toBe(true);
    expect(completeAnswers(round, { ...all, a: "maybe" })).toBe(false);
    expect(completeAnswers(round, { ...all, z: "yes" })).toBe(false);
    const { a: _a, ...missing } = all;
    expect(completeAnswers(round, missing)).toBe(false);
    expect(completeAnswers(round, null)).toBe(false);
  });

  it("score one point per settled question, counting only settled ones", () => {
    expect(scorePrediction(round, all)).toEqual({ right: 0, settled: 0 });
    const settled = PredictRound.parse({
      ...ROUND,
      questions: ROUND.questions.map((q, i) => (i < 3 ? { ...q, answer: i === 0 ? "no" : "yes", evidence_url: "https://www.gov.uk/budget#page=5" } : q)),
    });
    expect(scorePrediction(settled, all)).toEqual({ right: 2, settled: 3 });
  });
});
