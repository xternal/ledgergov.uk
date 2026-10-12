import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  HouseholdMeasure,
  HouseholdMeasuresFile,
  PE_UNLIMITED,
  measuresFileIssues,
  nextFiscalYear,
  parameterNumber,
  sourceRefUrl,
  unitIssue,
} from "../src/household";
import {
  loadHouseholdSnapshots,
  parseHouseholdSnapshots,
  parseMeasuresFile,
  readHouseholdSnapshotFiles,
  readMeasuresFiles,
  taxSeedIssues,
  textSha256,
} from "../src/household-data";
import { repoRoot } from "../src/content-files";

const root = repoRoot();
const measures = readMeasuresFiles(root);
const rehearsal = measures.find((m) => m.path.endsWith("autumn-budget-2025.yaml"))!;
const file = () => HouseholdMeasuresFile.parse(parse(rehearsal.text)) as HouseholdMeasuresFile;
const issuesOf = (edit: (f: HouseholdMeasuresFile) => void) => {
  const f = structuredClone(file());
  edit(f);
  return measuresFileIssues(f).join("\n");
};

describe("the committed measures files", () => {
  it("parse, with no TODO left and the file named after its event", () => {
    expect(measures.length).toBeGreaterThanOrEqual(1);
    for (const m of measures) expect(parseMeasuresFile(m).issues, m.path).toEqual([]);
  });

  it("the Autumn Budget 2025 rehearsal says what it is and links every measure to its page", () => {
    const f = file();
    expect(f.kind).toBe("rehearsal");
    expect([f.headline_year, f.side_year]).toEqual(["2027-28", "2026-27"]);
    const twoChild = f.measures.find((m) => m.id === "two-child-limit")!;
    expect(sourceRefUrl(f.sources, twoChild.source)).toMatch(/Budget_2025_Web_Accessible\.pdf#page=94$/);
    // Every measure that is not modelled says why, in words a reader can follow.
    for (const m of f.measures.filter((x) => !x.modelled)) expect(m.not_modelled!.note.length).toBeGreaterThan(40);
    expect(f.measures.filter((m) => !m.modelled).map((m) => m.not_modelled!.reason)).toEqual(expect.arrayContaining(["needs_code", "no_parameter", "new_tax"]));
  });
});

describe("measuresFileIssues catches typing slips", () => {
  it("a rate typed as a percentage", () => {
    expect(unitIssue("/1", 20)).toMatch(/PolicyEngine writes 20% as 0.2/);
    expect(unitIssue("/1", 0.2)).toBeNull();
    expect(unitIssue("/1", "unlimited")).toMatch(/not a rate/);
    expect(unitIssue("currency-GBP", -1)).toMatch(/cannot be negative/);
    expect(
      issuesOf((f) => {
        f.measures.find((m) => m.id === "savings-tax")!.parameters![0]!.post["2027-28"] = 22;
      }),
    ).toMatch(/savings-tax gov.hmrc.income_tax.rates.savings.basic post 2027-28: 22 is not a rate/);
  });

  it("a year left out, or one that is not in the file", () => {
    expect(
      issuesOf((f) => {
        delete f.measures[0]!.parameters![0]!.pre["2030-31"];
      }),
    ).toMatch(/no pre value for 2030-31/);
    expect(
      issuesOf((f) => {
        f.measures[0]!.parameters![0]!.post["2031-32"] = 2;
      }),
    ).toMatch(/2031-32, which is not one of the years/);
    expect(
      issuesOf((f) => {
        f.years = ["2026-27", "2028-29"];
      }),
    ).toMatch(/one after another/);
  });

  it("a parameter set by two measures, an unknown source, a duplicate id", () => {
    expect(
      issuesOf((f) => {
        f.measures[1]!.parameters!.push(structuredClone(f.measures[0]!.parameters![0]!));
      }),
    ).toMatch(/is set by both two-child-limit and fuel-duty/);
    expect(
      issuesOf((f) => {
        f.measures[0]!.source.source = "budget-2027";
      }),
    ).toMatch(/unknown source "budget-2027"/);
    expect(
      issuesOf((f) => {
        f.measures[1]!.id = f.measures[0]!.id;
      }),
    ).toMatch(/appears twice/);
  });

  it("a measure must be modelled with parameters, or say why not", () => {
    const m = file().measures.find((x) => x.id === "rail-fares-freeze")!;
    expect(HouseholdMeasure.safeParse({ ...m, not_modelled: undefined }).success).toBe(false);
    expect(HouseholdMeasure.safeParse({ ...m, modelled: true }).success).toBe(false);
  });

  it("flags a TODO left in the file", () => {
    const { issues } = parseMeasuresFile({ ...rehearsal, text: rehearsal.text.replace("note: Tax credits ended", "note: TODO check. Tax credits ended") });
    expect(issues.join()).toMatch(/a TODO is left/);
  });

  it("writes no limit as a number PolicyEngine reads as unlimited", () => {
    expect(parameterNumber("unlimited")).toBe(PE_UNLIMITED);
    expect(parameterNumber(2)).toBe(2);
    expect(nextFiscalYear("2029-30")).toBe("2030-31");
    expect(nextFiscalYear("2099-00")).toBe("2100-01");
  });
});

describe("the templates for Budget night", () => {
  const doc = parse(readFileSync(join(root, "content/budget/household/_templates.yaml"), "utf8")) as {
    model: { version: string };
    years: string[];
    templates: unknown[];
  };

  it("cover the likely levers, each a valid measure once its source page is filled in", () => {
    const ids = doc.templates.map((t) => (t as { id: string }).id);
    for (const lever of [
      "income-tax-basic-rate",
      "income-tax-personal-allowance",
      "ni-employee-rates",
      "vat-standard-rate",
      "vat-household-electricity",
      "fuel-duty",
      "capital-gains-tax",
      "universal-credit-standard-allowance",
      "child-benefit",
      "state-pension",
      "stamp-duty",
      "inheritance-tax",
      "corporation-tax",
      "business-rates",
      "new-tax",
    ])
      expect(ids, lever).toContain(lever);
    for (const t of doc.templates) {
      const r = HouseholdMeasure.safeParse(t);
      expect(r.success, `${(t as { id: string }).id}: ${r.error?.issues[0]?.message}`).toBe(true);
      const m = r.data!;
      for (const p of m.parameters ?? []) {
        for (const y of doc.years) expect(p.pre[y], `${m.id} ${p.path} ${y}`).toBeDefined();
        expect(p.post).toEqual(p.pre);
        for (const v of Object.values(p.pre)) expect(unitIssue(p.unit, v), `${m.id} ${p.path}`).toBeNull();
      }
    }
  });

  it("start from the law where PolicyEngine is behind it: National Insurance thresholds frozen to April 2031", () => {
    const ni = doc.templates.find((t) => (t as { id: string }).id === "ni-employee-thresholds") as HouseholdMeasure;
    const pt = ni.parameters!.find((p) => p.path.endsWith("primary_threshold"))!;
    expect(Object.values(pt.pre)).toEqual([241.73, 241.73, 241.73, 241.73, 241.73]);
    expect(pt.pre_source?.where).toBe("Table 4.1, line 46");
    expect(doc.model.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("snapshots", () => {
  it("every committed snapshot parses and was computed from its measures file as it is now", () => {
    const snapshots = loadHouseholdSnapshots(root);
    expect(snapshots.map((s) => s.id)).toContain("autumn-budget-2025");
  });

  it("refuse a snapshot whose measures file changed after it was computed", () => {
    const raw = readHouseholdSnapshotFiles(root);
    const edited = measures.map((m) => (m === rehearsal ? { ...m, text: `${m.text}\n# edited\n` } : m));
    const { issues } = parseHouseholdSnapshots(raw, edited);
    expect(issues.join()).toMatch(/changed after this snapshot was computed; run `pnpm household -- autumn-budget-2025` again/);
    expect(parseHouseholdSnapshots(raw, measures).issues).toEqual([]);
    expect(textSha256("a")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuse a snapshot with a failed check or a missing year", () => {
    const raw = readHouseholdSnapshotFiles(root).filter((f) => f.path.endsWith("autumn-budget-2025.json"));
    const bad = structuredClone(raw[0]!.data) as { checks: { ok: boolean }[]; results: unknown[] };
    bad.checks[0]!.ok = false;
    bad.results.pop();
    const { issues } = parseHouseholdSnapshots([{ ...raw[0]!, data: bad }], measures);
    expect(issues.join("\n")).toMatch(/check .* failed/);
    expect(issues.join("\n")).toMatch(/results for 2026-27, 2027-28, 2028-29, 2029-30, expected/);
  });
});

describe("a post-Budget tax seed says what the Budget's measures file says", () => {
  // A scratch copy of the repo's seeds and the rehearsal's measures, the rehearsal turned into a Budget so that a
  // seed for 2027-28 is a post-Budget seed for it (dated before 6 April 2027, a year it covers).
  const scratch = (seed2027: (s: Record<string, Record<string, unknown>>) => void) => {
    const dir = mkdtempSync(join(tmpdir(), "household-seed-"));
    mkdirSync(join(dir, "data", "seed"), { recursive: true });
    mkdirSync(join(dir, "content", "budget", "household"), { recursive: true });
    for (const name of ["uk_tax_2025-26.json", "uk_tax_2026-27.json"]) copyFileSync(join(root, "data", "seed", name), join(dir, "data", "seed", name));
    const seed = JSON.parse(readFileSync(join(root, "data", "seed", "uk_tax_2026-27.json"), "utf8")) as Record<string, Record<string, unknown>>;
    seed.meta!.tax_year = "2027-28";
    seed2027(seed);
    writeFileSync(join(dir, "data", "seed", "uk_tax_2027-28.json"), JSON.stringify(seed));
    writeFileSync(join(dir, "content", "budget", "household", "autumn-budget-2025.yaml"), rehearsal.text.replace("kind: rehearsal", "kind: budget"));
    return dir;
  };

  it("passes in the repository, and when the seed has the measures file's rates", () => {
    expect(taxSeedIssues(root)).toEqual([]);
    // 2027-28 in the rehearsal: thresholds frozen with and without it, so the seed keeps 2026-27's figures.
    expect(taxSeedIssues(scratch(() => undefined))).toEqual([]);
  });

  it("fails when the seed and the measures file differ on a rate both have", () => {
    const issues = taxSeedIssues(
      scratch((s) => {
        s.income_tax!.personal_allowance_gbp = 13_000;
      }),
    );
    expect(issues.join("\n")).toMatch(
      /uk_tax_2027-28\.json: personal_allowance_gbp is 13000, but content\/budget\/household\/autumn-budget-2025\.yaml \(personal-tax-thresholds .*\) gives 12570 for 2027-28: the measures file is the one place/,
    );
  });

  it("fails when the seed changes a rate the measures file leaves alone: the Budget's rates are typed in the measures file first", () => {
    const issues = taxSeedIssues(
      scratch((s) => {
        s.income_tax!.higher_rate_pct = 42;
      }),
    );
    expect(issues.join("\n")).toMatch(/higher_rate_pct is 42, but .*autumn-budget-2025\.yaml does not change it \(data\/seed\/uk_tax_2026-27\.json has 40\): type the Budget's rates in the measures file first/);
  });
});
