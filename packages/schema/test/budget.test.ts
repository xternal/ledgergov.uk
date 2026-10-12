import { describe, expect, it } from "vitest";
import { BudgetScorecard, effectOf, scorecardIssues, scorecardPageUrl, scorecardSummary, scorecardTotal, sumOfLines } from "../src/budget";
import { loadScorecards, parseScorecards, readScorecardFiles } from "../src/budget-data";

const committed = loadScorecards();

describe("committed Budget scorecards", () => {
  it("parse, newest first, with the events recorded so far", () => {
    expect(committed.length).toBeGreaterThanOrEqual(2);
    expect(committed.map((s) => s.date)).toEqual([...committed.map((s) => s.date)].sort().reverse());
    expect(committed.map((s) => s.id)).toEqual(expect.arrayContaining(["autumn-budget-2024", "spring-statement-2025"]));
  });

  it("add up: the Treasury's printed total, the sum of its lines, and the rounding between them", () => {
    const ab = committed.find((s) => s.id === "autumn-budget-2024")!;
    expect(scorecardTotal(ab).values).toEqual([-24705, -39550, -35330, -36585, -38775, -32990]);
    expect(sumOfLines(ab)).toEqual(ab.sum_of_lines);
    const sum = scorecardSummary(ab);
    expect(sum.year).toBe("2029-30");
    expect([sum.total, sum.sum, sum.difference]).toEqual([-32990, -33000, 10]);
    expect(Math.abs(sum.difference)).toBeLessThanOrEqual(sum.bound);
    expect(sum.raises.m + sum.costs.m).toBe(sum.sum);
  });

  it("link every line to its page of the PDF", () => {
    const ss = committed.find((s) => s.id === "spring-statement-2025")!;
    const pip = ss.measures.find((m) => m.line === 10)!;
    expect(scorecardPageUrl(ss, pip.page)).toBe(`${ss.source.document_url}#page=37`);
  });
});

describe("scorecardIssues", () => {
  const base = committed.find((s) => s.id === "spring-statement-2025")!;
  const raw = () => JSON.parse(JSON.stringify(base)) as BudgetScorecard;

  it("rejects a line changed by hand so the table no longer adds up", () => {
    const s = raw();
    s.measures[0]!.values[5] = s.measures[0]!.values[5]! - 1000;
    expect(scorecardIssues(s).join()).toMatch(/sum_of_lines .* is not the sum of the lines/);
    s.sum_of_lines = sumOfLines(s);
    expect(scorecardIssues(s).join()).toMatch(/2029-30: the lines add to .* more than rounding allows/);
  });

  it("rejects a missing line, a second total, a failed check and a page outside the table", () => {
    const s = raw();
    s.measures.splice(3, 1);
    s.totals.push({ ...s.totals[0]! });
    s.checks[0]!.ok = false;
    s.measures[0]!.page = 1;
    const text = scorecardIssues(s).join("\n");
    expect(text).toMatch(/line numbers are not 1 to 32/);
    expect(text).toMatch(/expected one total of all policy decisions, found 2/);
    s.totals.pop();
    expect(scorecardIssues(s).join("\n")).toMatch(/check lines failed|check .* failed/);
    expect(scorecardIssues(s).join("\n")).toMatch(/page 1 is not one of the table's pages/);
  });

  it("names a file after its event", () => {
    const files = readScorecardFiles();
    const moved = files.map((f, i) => (i === 0 ? { ...f, path: f.path.replace(/[^/\\]+\.json$/, "other.json") } : f));
    expect(parseScorecards(moved).issues.join()).toMatch(/file name should be/);
  });
});

it("reads the Treasury's sign: positive raises money, negative costs it", () => {
  expect([effectOf(23770), effectOf(-26450), effectOf(0)]).toEqual(["raises", "costs", "nil"]);
});
