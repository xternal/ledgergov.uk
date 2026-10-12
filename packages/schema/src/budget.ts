import { z } from "zod";
import { FiscalYear, IsoDate, Quality } from "./provenance";

/**
 * The Budget scorecard (P7/P8): the Treasury's table of policy decisions for one fiscal event, read from the
 * document as printed by etl/budget_costings.py into data/build/budget/<event>.json.
 *
 * Figures are £ million as the Treasury prints them, with its sign: Exchequer impact, so a positive figure
 * raises money (a tax rise, a saving) and a negative one costs money (a tax cut, new spending). "*" in the
 * table (negligible: under £2.5m either way) is kept as the year in `negligible`, and counts as zero.
 * Every figure is the Treasury's own central estimate, published without a range.
 */

const Values = z.array(z.number().int());

export const ScorecardMeasure = z
  .object({
    /** The table's own line number. */
    line: z.union([z.number().int().positive(), z.string().min(1)]),
    /** The measure as the table words it. */
    name: z.string().min(1),
    /** The table's heading the line sits under, if it has headings. */
    group: z.string().min(1).nullable(),
    /** The table's "Head" column, when it has one: whether the Treasury counts it as tax or spending. */
    head: z.enum(["tax", "spend"]).optional(),
    /** The PDF page (1 = the file's first page) the line starts on: link with #page=N. */
    page: z.number().int().positive(),
    /** £m for each of `years`, Exchequer sign. */
    values: Values,
    negligible: z.array(FiscalYear).optional(),
    /** An "o/w" (of which) line: part of the line above, not added again. */
    of_which: z.literal(true).optional(),
    footnotes: z.array(z.string().min(1)).optional(),
  })
  .strict();
export type ScorecardMeasure = z.infer<typeof ScorecardMeasure>;

export const ScorecardTotalKind = z.enum(["total", "total_tax", "total_spending", "subtotal", "memo"]);
export type ScorecardTotalKind = z.infer<typeof ScorecardTotalKind>;

export const ScorecardTotal = z
  .object({
    label: z.string().min(1),
    /** total: all policy decisions (exactly one); total_tax / total_spending: the Treasury's split; subtotal: over `lines`; memo: for information. */
    kind: ScorecardTotalKind,
    page: z.number().int().positive(),
    values: Values,
    negligible: z.array(FiscalYear).optional(),
    /** The line it is printed after. */
    after_line: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
    lines: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
    footnotes: z.array(z.string().min(1)).optional(),
  })
  .strict();
export type ScorecardTotal = z.infer<typeof ScorecardTotal>;

export const ScorecardCheck = z.object({ id: z.string().min(1), ok: z.boolean(), message: z.string().min(1) }).strict();

export const BudgetScorecard = z
  .object({
    /** "autumn-budget-2025": the page is /budget/scorecard/<id>. */
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name: z.string().min(1),
    /** The day of the statement and the documents. */
    date: IsoDate,
    source: z
      .object({
        id: z.string().min(1),
        title: z.string().min(1),
        publisher: z.string().min(1),
        /** The GOV.UK page that lists the event's documents. */
        url: z.url(),
        /** The PDF the table is read from and every line links to. */
        document_url: z.url(),
        document_sha256: z.string().regex(/^[0-9a-f]{64}$/),
        published_on: IsoDate,
        licence: z.string().min(1),
        /** The same table published another way (spreadsheet or GOV.UK HTML), checked line by line. */
        copy_url: z.url().optional(),
      })
      .strict(),
    vintage: z.string().min(1),
    quality: Quality,
    unit: z.literal("gbp_m"),
    table: z.object({ number: z.string().min(1), title: z.string().min(1), pages: z.array(z.number().int().positive()).min(1), has_head: z.boolean() }).strict(),
    years: z.array(FiscalYear).min(1),
    /** The year the page leads with: the last the Treasury costs. */
    headline_year: FiscalYear,
    /** What the Treasury rounds each line to, in £m (5 in recent tables). */
    rounding_m: z.number().int().positive(),
    groups: z.array(z.string().min(1)),
    measures: z.array(ScorecardMeasure).min(1),
    totals: z.array(ScorecardTotal).min(1),
    /** The measures added up for each year, leaving out "o/w" lines. */
    sum_of_lines: Values,
    /** The table's own footnotes, by marker. */
    footnotes: z.record(z.string(), z.string()),
    /** What the parser checked; every one must pass for the file to be published. */
    checks: z.array(ScorecardCheck).min(1),
    /** Lines where the printed table and the Treasury's copy differ in wording or tax/spend mark (never in figures), checked by a person in the PDF; the page uses the PDF's. */
    copy_differences: z
      .array(
        z
          .object({
            line: z.union([z.number().int().positive(), z.string().min(1)]),
            field: z.enum(["name", "head"]),
            pdf: z.string().min(1),
            copy: z.string().min(1),
            reason: z.string().min(1),
          })
          .strict(),
      )
      .optional(),
    recorded: z.object({ fetched_at: z.string().min(1), extractor: z.string().min(1) }).partial().strict(),
  })
  .strict()
  .superRefine((s, ctx) => {
    for (const issue of scorecardIssues(s)) ctx.addIssue({ code: "custom", message: issue });
  });
export type BudgetScorecard = z.infer<typeof BudgetScorecard>;

/** The lines that count towards the total: every measure but the "o/w" (of which) lines. */
export const countedLines = (s: Pick<BudgetScorecard, "measures">) => s.measures.filter((m) => !m.of_which);

export const sumOfLines = (s: Pick<BudgetScorecard, "measures" | "years">) =>
  s.years.map((_, i) => countedLines(s).reduce((a, m) => a + m.values[i]!, 0));

/** The most rounding can move the sum of printed lines from the printed total: half the rounding unit per line that is not zero, and once for the total. */
export function roundingBound(s: Pick<BudgetScorecard, "measures" | "years" | "rounding_m">, i: number): number {
  const year = s.years[i]!;
  const moving = countedLines(s).filter((m) => m.values[i] !== 0 || m.negligible?.includes(year)).length;
  return (s.rounding_m / 2) * (moving + 1);
}

/** The total of all policy decisions, as printed. */
export function scorecardTotal(s: Pick<BudgetScorecard, "totals">): ScorecardTotal {
  const t = s.totals.find((x) => x.kind === "total");
  if (!t) throw new Error("scorecard has no total of all policy decisions");
  return t;
}

/**
 * Rules the parser already enforces, checked again on the file itself, so a hand edit cannot publish a
 * table that does not add up: one total, every line with every year, line numbers 1 to N, the sum of the
 * lines as recorded and within rounding of the printed total, and every check passed.
 */
export function scorecardIssues(s: z.input<typeof BudgetScorecard>): string[] {
  const issues: string[] = [];
  const n = s.years.length;
  if (s.quality !== "sourced") issues.push(`quality must be "sourced": these are the Treasury's own figures`);
  if (!s.years.includes(s.headline_year)) issues.push(`headline_year ${s.headline_year} is not one of the years`);
  const rows = [...s.measures.map((m) => ({ what: `line ${m.line}`, ...m })), ...s.totals.map((t) => ({ what: t.label, ...t }))];
  for (const r of rows) {
    if (r.values.length !== n) issues.push(`${r.what}: ${r.values.length} figures for ${n} years`);
    for (const y of r.negligible ?? []) if (!s.years.includes(y)) issues.push(`${r.what}: negligible year ${y} is not one of the years`);
    if (!s.table.pages.includes(r.page)) issues.push(`${r.what}: page ${r.page} is not one of the table's pages`);
  }
  const lines = s.measures.map((m) => String(m.line));
  if (lines.some((l, i) => l !== String(i + 1))) issues.push(`line numbers are not 1 to ${lines.length}`);
  const totals = s.totals.filter((t) => t.kind === "total");
  if (totals.length !== 1) {
    issues.push(`expected one total of all policy decisions, found ${totals.length}`);
    return issues;
  }
  const sums = s.years.map((_, i) => s.measures.filter((m) => !m.of_which).reduce((a, m) => a + (m.values[i] ?? 0), 0));
  if (sums.join() !== s.sum_of_lines.join()) issues.push(`sum_of_lines ${s.sum_of_lines.join()} is not the sum of the lines ${sums.join()}`);
  sums.forEach((sum, i) => {
    const bound = roundingBound({ measures: s.measures as ScorecardMeasure[], years: s.years, rounding_m: s.rounding_m }, i);
    const diff = totals[0]!.values[i]! - sum;
    if (Math.abs(diff) > bound) issues.push(`${s.years[i]}: the lines add to ${sum}, ${diff} from the printed total, more than rounding allows (${bound})`);
  });
  for (const c of s.checks) if (!c.ok) issues.push(`check ${c.id} failed: ${c.message}`);
  return issues;
}

/** A line's link: the PDF at the page the line is printed on. */
export const scorecardPageUrl = (s: Pick<BudgetScorecard, "source">, page: number) => `${s.source.document_url}#page=${page}`;

export type Effect = "raises" | "costs" | "nil";
/** Exchequer sign: positive raises money, negative costs it. */
export const effectOf = (m: number): Effect => (m > 0 ? "raises" : m < 0 ? "costs" : "nil");

export interface ScorecardSummary {
  year: string;
  index: number;
  /** The Treasury's printed total for the year. */
  total: number;
  sum: number;
  /** Total minus the sum of the printed lines: rounding. */
  difference: number;
  bound: number;
  raises: { count: number; m: number };
  costs: { count: number; m: number };
  nil: number;
  lines: number;
}

/** The headline year at a glance: what the measures raise, what they cost, and how the lines reconcile with the total. */
export function scorecardSummary(s: BudgetScorecard, year = s.headline_year): ScorecardSummary {
  const index = s.years.indexOf(year);
  const counted = countedLines(s);
  const at = (m: ScorecardMeasure) => m.values[index]!;
  const raising = counted.filter((m) => at(m) > 0);
  const costing = counted.filter((m) => at(m) < 0);
  const total = scorecardTotal(s).values[index]!;
  const sum = s.sum_of_lines[index]!;
  return {
    year,
    index,
    total,
    sum,
    difference: total - sum,
    bound: roundingBound(s, index),
    raises: { count: raising.length, m: raising.reduce((a, m) => a + at(m), 0) },
    costs: { count: costing.length, m: costing.reduce((a, m) => a + at(m), 0) },
    nil: counted.length - raising.length - costing.length,
    lines: s.measures.length,
  };
}

/** Scorecards newest first. */
export const byDateDesc = (a: Pick<BudgetScorecard, "date">, b: Pick<BudgetScorecard, "date">) => b.date.localeCompare(a.date);
