import { z } from "zod";
import { FiscalYear, IsoDate } from "./provenance";
import { WinnerShares } from "./t1";

/**
 * "The Budget for your household" (/budget/household/<event>, docs/BUDGET_DAY.md): what a fiscal event's tax and
 * benefit measures do to household incomes, by income decile and for six example households, computed by
 * PolicyEngine UK from two complete policies we write ourselves ("route B", chosen 12 October 2026):
 *
 * - **pre**: every value a measure touches as it would have been without the event (thresholds already frozen
 *   to 2031 stay frozen, for instance);
 * - **post**: the same values as the event sets them.
 *
 * Two files:
 * - the **measures file**, content/budget/household/<event>.yaml (HouseholdMeasuresFile): what editors type on
 *   the night from the Budget document and HMRC's notes, each figure with its page; two editors review it;
 * - the **snapshot**, data/build/budget/household/<event>.json (HouseholdSnapshot): what the offline job
 *   (`pnpm household -- <event>`) got back from PolicyEngine. The page is built only from the snapshot.
 */

/** A value PolicyEngine reads as "no limit" (the two-child limit removed, a cap that does not exist). JSON has no Infinity. */
export const PE_UNLIMITED = 1e12;

const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lower-case words joined by hyphens");

/** A figure as the measures file gives it: a number in PolicyEngine's own unit, or "unlimited". */
export const ParameterValue = z.union([z.number().finite(), z.literal("unlimited")]);
export type ParameterValue = z.infer<typeof ParameterValue>;
export const parameterNumber = (v: ParameterValue) => (v === "unlimited" ? PE_UNLIMITED : v);

/** One value per fiscal year, keyed "2027-28". */
const YearValues = z.record(FiscalYear, ParameterValue);

/** A document the file cites, once; measures point at it by id with a page. */
export const HouseholdSource = z
  .object({
    id: Slug,
    title: z.string().min(1),
    publisher: z.string().min(1),
    /** The document itself (a PDF or a GOV.UK page); a page number is added as #page=N. */
    url: z.url(),
    published_on: IsoDate.optional(),
    licence: z.string().min(1).optional(),
  })
  .strict();
export type HouseholdSource = z.infer<typeof HouseholdSource>;

/** Where a figure comes from: a source by id and the page of the PDF (1 = the file's first page), or a section of a web page. */
export const SourceRef = z
  .object({
    source: Slug,
    page: z.number().int().positive().optional(),
    /** For a web page: the heading the figure sits under, or a table and line ("Table 4.1, line 46"). */
    where: z.string().min(1).optional(),
    note: z.string().min(1).optional(),
  })
  .strict()
  .refine((r) => r.page !== undefined || r.where !== undefined, "give a page or say where in the document");
export type SourceRef = z.infer<typeof SourceRef>;

/** One PolicyEngine parameter a measure sets, with its value in every year, before and after the event. */
export const HouseholdParameter = z
  .object({
    /** PolicyEngine UK's parameter path, e.g. gov.hmrc.income_tax.allowances.personal_allowance.amount. Checked against its metadata. */
    path: z.string().regex(/^gov\.[A-Za-z0-9_.[\]]+$/, "a PolicyEngine parameter path starting gov."),
    /** PolicyEngine's unit for it, copied from its metadata ("/1" for a rate as a fraction, "currency-GBP"…). Checked. */
    unit: z.string().min(1),
    /** What it is, in plain words with the period: "Personal allowance, £ a year". */
    label: z.string().min(1),
    /** Without the event: what would have applied in each year. */
    pre: YearValues,
    /** With the event. */
    post: YearValues,
    /** Where the "without" values come from when it is not the measure's own source (a previous Budget, the law, PolicyEngine). */
    pre_source: SourceRef.optional(),
    note: z.string().min(1).optional(),
  })
  .strict();
export type HouseholdParameter = z.infer<typeof HouseholdParameter>;

/** Why a measure is not in the model. Each reason is explained on the page in plain words. */
export const NotModelledReason = z.enum([
  /** PolicyEngine UK has no parameter for it (inheritance tax, corporation tax, business rates). */
  "no_parameter",
  /** A tax or benefit that does not exist yet, so the model has no rules for it. */
  "new_tax",
  /** PolicyEngine has the rules, but changing them through the public API moves nothing without extra code (their own analyses add it). */
  "needs_code",
  /** It falls on businesses, public services or the government's own accounts, not directly on household incomes. */
  "not_household_income",
]);
export type NotModelledReason = z.infer<typeof NotModelledReason>;

export const HouseholdMeasure = z
  .object({
    id: Slug,
    /** Plain words, as a reader would say it: "Keep income tax thresholds frozen until April 2031". */
    name: z.string().min(1),
    /** The line that announces it (Budget document, its table of policy decisions, or HMRC's note), with its page. */
    source: SourceRef,
    /** The day it takes effect. */
    effective: IsoDate,
    modelled: z.boolean(),
    parameters: z.array(HouseholdParameter).optional(),
    not_modelled: z.object({ reason: NotModelledReason, note: z.string().min(1) }).strict().optional(),
    /** The Treasury's line in its table of policy decisions, to link the scorecard page (/budget/scorecard/<event>#line-N). */
    scorecard_line: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
    note: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.modelled && !m.parameters?.length) ctx.addIssue({ code: "custom", message: "a modelled measure needs its parameters" });
    if (m.modelled && m.not_modelled) ctx.addIssue({ code: "custom", message: "a modelled measure has no not_modelled reason" });
    if (!m.modelled && !m.not_modelled) ctx.addIssue({ code: "custom", message: "say why it is not modelled (not_modelled.reason and note)" });
    if (!m.modelled && m.parameters?.length) ctx.addIssue({ code: "custom", message: "a measure that is not modelled sends no parameters" });
  });
export type HouseholdMeasure = z.infer<typeof HouseholdMeasure>;

/** One income decile in the Treasury's chart: % of net income (or £ a year), split as the chart splits it. */
const TreasuryBar = z
  .object({
    tax: z.number(),
    welfare: z.number(),
    /** Benefits in kind from public services (the NHS, schools): the Treasury counts them; PolicyEngine does not. */
    services: z.number(),
    /** What the chart marks as the overall effect: tax + welfare + services. */
    overall: z.number(),
  })
  .strict();
export type TreasuryBar = z.infer<typeof TreasuryBar>;

/**
 * The Treasury's own distributional chart ("Impact on households", published with every Budget under the Open
 * Government Licence). It covers a different year and every decision since an earlier event, and counts public
 * services; the page shows it beside ours and says why they differ.
 */
export const TreasuryChart = z
  .object({
    source: SourceRef,
    /** As printed: "Impact of decisions from Autumn Budget 2024 onwards on households in 2028-29…". */
    title: z.string().min(1),
    year: FiscalYear,
    /** Plain words: what decisions it counts. */
    covers: z.string().min(1),
    /** "table": the Treasury published the figures; "chart": read from the chart's drawing in the PDF (no table published), to about 0.01 points. */
    read_from: z.enum(["table", "chart"]),
    /** % of net income, deciles 1 (lowest income) to 10, then all households. */
    pct: z.object({ deciles: z.array(TreasuryBar).length(10), all: TreasuryBar }).strict(),
    /** £ a year, the same split, when the Treasury gives it. */
    gbp: z.object({ deciles: z.array(TreasuryBar).length(10), all: TreasuryBar, source: SourceRef }).strict().optional(),
    /** One line on why it differs from PolicyEngine's figures, shown under both. */
    differs: z.string().min(1),
  })
  .strict();
export type TreasuryChart = z.infer<typeof TreasuryChart>;

/**
 * kind "budget": the event this page is about. kind "rehearsal": an earlier event run through the same pipeline
 * to test it (Autumn Budget 2025, rehearsed in October 2026), labelled as such wherever it is shown.
 */
export const HouseholdKind = z.enum(["budget", "rehearsal"]);

export const HouseholdMeasuresFile = z
  .object({
    event: z.object({ id: Slug, name: z.string().min(1), date: IsoDate }).strict(),
    kind: HouseholdKind,
    /** Every year both policies set and the job asks PolicyEngine for (the API offers 2024-25 to 2030-31). */
    years: z.array(FiscalYear).min(1),
    /** The year the page leads with, and the one beside it. */
    headline_year: FiscalYear,
    side_year: FiscalYear,
    sources: z.array(HouseholdSource).min(1),
    measures: z.array(HouseholdMeasure).min(1),
    treasury: TreasuryChart.optional(),
    /** For a rehearsal: whose published figures it is checked against, in plain words with a link. */
    compared_with: z.object({ name: z.string().min(1), url: z.url(), note: z.string().min(1) }).strict().optional(),
    note: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    for (const issue of measuresFileIssues(f)) ctx.addIssue({ code: "custom", message: issue });
  });
export type HouseholdMeasuresFile = z.infer<typeof HouseholdMeasuresFile>;

/** The fiscal year after this one: "2026-27" → "2027-28". */
export const nextFiscalYear = (fy: string) => {
  const y = Number(fy.slice(0, 4)) + 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
};

/** Rules a schema cannot say alone: consecutive years, every value for every year, units that fit, sources that exist, no path set twice. */
export function measuresFileIssues(f: z.input<typeof HouseholdMeasuresFile>): string[] {
  const issues: string[] = [];
  const years = f.years;
  years.forEach((y, i) => {
    if (i > 0 && y !== nextFiscalYear(years[i - 1]!)) issues.push(`years must run one after another: ${years[i - 1]} then ${y}`);
  });
  for (const y of [f.headline_year, f.side_year]) if (!years.includes(y)) issues.push(`${y} is not one of the years`);
  const sourceIds = new Set(f.sources.map((s) => s.id));
  if (sourceIds.size !== f.sources.length) issues.push("two sources share an id");
  const refs: [string, z.input<typeof SourceRef> | undefined][] = [["treasury", f.treasury?.source], ["treasury.gbp", f.treasury?.gbp?.source]];
  const ids = new Set<string>();
  const paths = new Map<string, string>();
  for (const m of f.measures) {
    if (ids.has(m.id)) issues.push(`measure ${m.id} appears twice`);
    ids.add(m.id);
    refs.push([m.id, m.source]);
    for (const p of m.parameters ?? []) {
      refs.push([`${m.id} ${p.path}`, p.pre_source]);
      const other = paths.get(p.path);
      if (other) issues.push(`${p.path} is set by both ${other} and ${m.id}: one measure per parameter`);
      paths.set(p.path, m.id);
      for (const side of ["pre", "post"] as const) {
        const values = p[side];
        for (const y of years) if (!(y in values)) issues.push(`${m.id} ${p.path}: no ${side} value for ${y}`);
        for (const y of Object.keys(values)) if (!years.includes(y)) issues.push(`${m.id} ${p.path}: ${side} has ${y}, which is not one of the years`);
        for (const [y, v] of Object.entries(values)) {
          const why = unitIssue(p.unit, v);
          if (why) issues.push(`${m.id} ${p.path} ${side} ${y}: ${why}`);
        }
      }
    }
  }
  for (const [where, ref] of refs) if (ref && !sourceIds.has(ref.source)) issues.push(`${where}: unknown source "${ref.source}"`);
  return issues;
}

/** Catches the commonest typing slips: a rate typed as 20 instead of 0.20, a negative amount. */
export function unitIssue(unit: string, v: ParameterValue): string | null {
  if (v === "unlimited") return unit === "/1" ? `"unlimited" is not a rate` : null;
  if (unit === "/1" && (v < -1 || v > 1)) return `${v} is not a rate: PolicyEngine writes 20% as 0.2`;
  if (unit.startsWith("currency") && v < 0) return `${v}: an amount cannot be negative`;
  return null;
}

/** The link for a source reference: the document, at its page when there is one. */
export function sourceRefUrl(sources: readonly HouseholdSource[], ref: SourceRef): string {
  const s = sources.find((x) => x.id === ref.source);
  if (!s) throw new Error(`unknown source ${ref.source}`);
  return ref.page ? `${s.url}#page=${ref.page}` : s.url;
}

// ---------------------------------------------------------------------------------------------------------------
// The snapshot: what PolicyEngine returned, as the page shows it.
// ---------------------------------------------------------------------------------------------------------------

const Money = z.number();
const BeforeAfter = z.object({ baseline: z.number(), reform: z.number() }).strict();

/** One fiscal year of the comparison over the whole population (static: nobody changes behaviour). */
export const HouseholdYearResult = z
  .object({
    year: FiscalYear,
    /** Change in the government's balance, £bn a year: positive raises money. benefits_bn positive = more spent. */
    budget: z.object({ net_bn: z.number(), tax_bn: z.number(), benefits_bn: z.number() }).strict(),
    /** Deciles 1 (lowest income) to 10: average change in household net income, £ a year and %. */
    deciles: z.array(z.object({ decile: z.number().int().min(1).max(10), avg_change_gbp: Money, rel_change_pct: z.number() }).strict()).length(10),
    winners: z.object({ all: WinnerShares, by_decile: z.array(WinnerShares).length(10) }).strict(),
    poverty: z.object({ all: BeforeAfter, child: BeforeAfter, adult: BeforeAfter, senior: BeforeAfter }).strict(),
    inequality: z.object({ gini: BeforeAfter, top_10_pct_share: BeforeAfter, top_1_pct_share: BeforeAfter }).strict(),
  })
  .strict();
export type HouseholdYearResult = z.infer<typeof HouseholdYearResult>;

/** The six fixed example households (ARCHETYPES) in one year: income after tax and benefits without and with the event. */
export const HouseholdExampleYear = z
  .object({
    year: FiscalYear,
    rows: z
      .array(z.object({ id: z.string().min(1), label: z.string().min(1), pre_net_gbp: Money, post_net_gbp: Money, change_gbp: Money }).strict())
      .length(6),
  })
  .strict();
export type HouseholdExampleYear = z.infer<typeof HouseholdExampleYear>;

export const HouseholdCheck = z.object({ id: z.string().min(1), ok: z.boolean(), message: z.string().min(1) }).strict();
export type HouseholdCheck = z.infer<typeof HouseholdCheck>;

export const HouseholdSnapshot = z
  .object({
    id: Slug,
    name: z.string().min(1),
    date: IsoDate,
    kind: HouseholdKind,
    quality: z.literal("modelled"),
    /** The measures file it was computed from, and its SHA-256: a snapshot older than its file fails `pnpm validate`. */
    measures_file: z.string().min(1),
    measures_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    /** The whole measures file as it was, so the page needs nothing else. */
    input: HouseholdMeasuresFile,
    provider: z
      .object({
        name: z.literal("policyengine_api"),
        api: z.url(),
        /** policyengine.py bundle, e.g. "6.2.1". */
        bundle_version: z.string().min(1),
        /** policyengine-uk, e.g. "2.102.3": the same for every year and for the households, or the job refuses to write this file. */
        model_version: z.string().min(1),
        data_version: z.string().min(1),
        dataset: z.string().nullable(),
      })
      .strict(),
    /** PolicyEngine's ids for the two policies, so anyone can open them in its app. */
    policies: z.object({ pre: z.number().int().positive(), post: z.number().int().positive() }).strict(),
    /** When the job asked PolicyEngine (the last answer). */
    computed_at: z.iso.datetime(),
    results: z.array(HouseholdYearResult).min(1),
    households: z.array(HouseholdExampleYear).min(1),
    checks: z.array(HouseholdCheck).min(1),
  })
  .strict()
  .superRefine((s, ctx) => {
    for (const issue of snapshotIssues(s)) ctx.addIssue({ code: "custom", message: issue });
  });
export type HouseholdSnapshot = z.infer<typeof HouseholdSnapshot>;

export function snapshotIssues(s: z.input<typeof HouseholdSnapshot>): string[] {
  const issues: string[] = [];
  if (s.id !== s.input.event.id) issues.push(`id ${s.id} is not the measures file's event ${s.input.event.id}`);
  const years = s.input.years;
  const got = s.results.map((r) => r.year);
  if (got.join() !== years.join()) issues.push(`results for ${got.join(", ")}, expected ${years.join(", ")}`);
  for (const y of [s.input.headline_year, s.input.side_year])
    if (!s.households.some((h) => h.year === y)) issues.push(`no example households for ${y}`);
  for (const c of s.checks) if (!c.ok) issues.push(`check ${c.id} failed: ${c.message}`);
  return issues;
}

/** One year's results, or an error naming the year: the page asks only for years the snapshot was checked to have. */
export function householdYear(s: HouseholdSnapshot, year: string): HouseholdYearResult {
  const r = s.results.find((x) => x.year === year);
  if (!r) throw new Error(`${s.id}: no results for ${year}`);
  return r;
}

export function householdExamples(s: HouseholdSnapshot, year: string): HouseholdExampleYear {
  const h = s.households.find((x) => x.year === year);
  if (!h) throw new Error(`${s.id}: no example households for ${year}`);
  return h;
}

/** Newest event first; a rehearsal after every real event of the same date. */
export const householdByDateDesc = (a: Pick<HouseholdSnapshot, "date" | "kind">, b: Pick<HouseholdSnapshot, "date" | "kind">) =>
  b.date.localeCompare(a.date) || (a.kind === b.kind ? 0 : a.kind === "budget" ? -1 : 1);
