import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { LeakFile, byFirstReport, isOfficialUrl, leakWarnings } from "../src/leaks";
import { loadLeaks, parseLeaks } from "../src/leaks-data";

/** A made-up entry for tests only: not a real report. */
const base = () => ({
  id: "example-threshold-freeze",
  headline: "Extend the freeze on income tax thresholds",
  area: "taxes",
  summary: "An outlet reports, citing Treasury sources, that the freeze would run two more years.",
  reported: [{ outlet: "Example Times", date: "2026-10-19", url: "https://example.org/a", archived_url: "https://web.archive.org/web/2026/https://example.org/a" }],
  status: "trailed",
});

const parse = (x: unknown) => LeakFile.safeParse(x);
const messages = (x: unknown) => {
  const r = parse(x);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("leak entries (content/leaks)", () => {
  it("accepts a trailed measure with only its report", () => {
    expect(parse(base()).success).toBe(true);
  });

  it("keeps trailed apart from announced: each status needs its own evidence", () => {
    expect(messages({ ...base(), status: "announced" })).toContain("status announced needs what the Budget did, with its evidence");
    expect(messages({ ...base(), status: "confirmed" })).toContain("a confirmed measure says who confirmed it, when and where");
    const budget = { date: "2026-10-28", text: "Thresholds frozen to April 2031.", evidence_url: "https://www.gov.uk/government/publications/budget-2026#page=12" };
    expect(messages({ ...base(), budget })).toContain("a trailed measure has no confirmation or Budget outcome yet: change the status");
    expect(parse({ ...base(), status: "announced", budget }).success).toBe(true);
    expect(parse({ ...base(), status: "not_in_budget", budget: { ...budget, text: "Not in the Budget documents." } }).success).toBe(true);
  });

  it("takes a Budget outcome only from an official page", () => {
    const budget = { date: "2026-10-28", text: "Done.", evidence_url: "https://example.org/budget-story" };
    expect(messages({ ...base(), status: "announced", budget }).join()).toMatch(/Budget document: a link on gov.uk/);
    expect(isOfficialUrl("https://assets.publishing.service.gov.uk/x.pdf")).toBe(true);
    expect(isOfficialUrl("https://obr.uk/efo/")).toBe(true);
    expect(isOfficialUrl("https://notgov.uk.example.com/")).toBe(false);
  });

  it("gives a cost only with its source and who made it", () => {
    const cost = { range: [-8, -8, -8], basis: "per_year", period: "2029-30", by: { kind: "independent", name: "IFS" }, source_url: "https://ifs.org.uk/x" };
    expect(parse({ ...base(), estimated_cost: cost }).success).toBe(true);
    const { source_url: _, ...unsourced } = cost;
    expect(parse({ ...base(), estimated_cost: unsourced }).success).toBe(false);
    expect(parse({ ...base(), estimated_cost: { ...cost, range: [-7, -9, -8] } }).success).toBe(false);
    expect(parse({ ...base(), estimated_cost: { ...cost, basis: "a_lot" } }).success).toBe(false);
  });

  it("checks the headline, unknown fields and the order of reports", () => {
    expect(messages({ ...base(), headline: "Tax freeze." }).length).toBeGreaterThan(0);
    expect(parse({ ...base(), verdict: "bad idea" }).success).toBe(false);
    const late = { outlet: "Later Post", date: "2026-10-18", url: "https://example.org/b" };
    expect(messages({ ...base(), reported: [...base().reported, late] })).toContain("list the reports earliest first: the first is the original");
  });

  it("warns when a report has no archived copy", () => {
    const r = parse({ ...base(), reported: [{ outlet: "Example Times", date: "2026-10-19", url: "https://example.org/a" }] });
    expect(r.success && leakWarnings(r.data)).toEqual(["Example Times (2026-10-19) has no archived_url; archive it at web.archive.org/save"]);
  });

  it("reads a folder: id matches the file name, newest first, an empty folder is an empty tracker", () => {
    const root = mkdtempSync(join(tmpdir(), "leaks-"));
    expect(loadLeaks(root)).toEqual([]);
    mkdirSync(join(root, "content", "leaks"), { recursive: true });
    const older = { ...base(), id: "older-measure", reported: [{ ...base().reported[0], date: "2026-10-19" }] };
    const newer = { ...base(), id: "newer-measure", reported: [{ ...base().reported[0], date: "2026-10-21" }] };
    writeFileSync(join(root, "content", "leaks", "older-measure.yaml"), stringify(older));
    writeFileSync(join(root, "content", "leaks", "newer-measure.yaml"), stringify(newer));
    expect(loadLeaks(root).map((l) => l.id)).toEqual(["newer-measure", "older-measure"]);
    writeFileSync(join(root, "content", "leaks", "misnamed.yaml"), stringify({ ...base(), id: "something-else" }));
    expect(parseLeaks(root).issues.map((i) => i.message)).toContain("id something-else should match the file name");
    expect(() => loadLeaks(root)).toThrow(/content\/leaks failed validation/);
  });

  it("sorts by the original report", () => {
    const a = parse({ ...base(), id: "a" });
    const b = parse({ ...base(), id: "b", reported: [{ ...base().reported[0], date: "2026-10-25" }] });
    expect(a.success && b.success && [a.data, b.data].sort(byFirstReport).map((l) => l.id)).toEqual(["b", "a"]);
  });
});

describe("content/leaks in the repository", () => {
  it("every entry is valid", () => {
    expect(() => loadLeaks()).not.toThrow();
  });
});

describe("the template in docs/EDITORS.md", () => {
  it("is a valid entry, so editors can copy it", async () => {
    const { readFileSync } = await import("node:fs");
    const { parse: parseYaml } = await import("yaml");
    const guide = readFileSync(join(import.meta.dirname, "../../../docs/EDITORS.md"), "utf8");
    const section = guide.split("## How to add a leak")[1]!.split("\n## ")[0]!;
    const block = section.split("```yaml\n")[1]!.split("```")[0]!;
    const r = LeakFile.safeParse(parseYaml(block));
    expect(r.success ? [] : r.error.issues).toEqual([]);
  });
});
