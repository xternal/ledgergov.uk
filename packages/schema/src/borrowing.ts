import { z } from "zod";
import { IsoDate, FiscalYear, Source } from "./provenance";
import { PeopleProvenance } from "./people";

/**
 * data/build/borrowing.json, written by etl/borrowing.py: borrowing so far this financial year,
 * month by month (ONS), against the OBR's monthly path for the year. Every figure is one ONS
 * release and one OBR edition. The OBR publishes its path as one line with no range
 * (`range: "point"`), so none is drawn; outturn is a point by nature (invariant 2).
 */

const Month = z.string().regex(/^\d{4}-\d{2}$/, "expected a month like 2026-08");
const Bn = z.number();

export const BorrowingProvenance = PeopleProvenance;
export type BorrowingProvenance = z.infer<typeof BorrowingProvenance>;

/** A total with its provenance: { bn, quality, source_id, vintage, method_note }. */
export const BorrowingFigure = z.intersection(z.object({ bn: Bn }), BorrowingProvenance);
export type BorrowingFigure = z.infer<typeof BorrowingFigure>;

const Path = z.object({ values: z.array(Bn), cumulative: z.array(Bn), provenance: BorrowingProvenance });

/** The ONS release the figures come from, as its release calendar states it. */
export const BorrowingRelease = z.object({
  title: z.string().min(1),
  url: z.url(),
  calendar_url: z.url(),
  released_at: z.iso.datetime().nullable(),
  next_on: IsoDate.nullable(),
  next_at: z.iso.datetime().nullable(),
});
export type BorrowingRelease = z.infer<typeof BorrowingRelease>;

export const BorrowingBundle = z
  .object({
    fiscal_year: FiscalYear,
    /** The twelve months of the year, April to March. */
    months: z.array(Month).length(12),
    /** The newest month ONS has published. */
    through: Month,
    outturn: Path,
    last_year: Path.extend({ fiscal_year: FiscalYear }).nullable(),
    profile: Path.extend({
      edition: z.string().min(1),
      published_on: IsoDate.nullable(),
      range: z.literal("point"),
      year_bn: Bn,
    }).nullable(),
    so_far: z.object({
      outturn: BorrowingFigure,
      last_year: BorrowingFigure.optional(),
      profile: BorrowingFigure.optional(),
      difference: BorrowingFigure.optional(),
    }),
    year_forecast: z.intersection(z.object({ bn: Bn, edition: z.string().min(1) }), BorrowingProvenance).nullable(),
    release: BorrowingRelease.nullable(),
    sources: z.array(Source).min(1),
  })
  .superRefine((b, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    const n = b.months.indexOf(b.through) + 1;
    if (n === 0) issue(["through"], "not a month of the year");
    if (b.outturn.values.length !== n) issue(["outturn", "values"], "one value per month so far");
    for (const [key, path] of [["outturn", b.outturn], ["last_year", b.last_year], ["profile", b.profile]] as const) {
      if (!path) continue;
      if (key !== "outturn" && path.values.length !== 12) issue([key, "values"], "one value per month of the year");
      if (path.cumulative.length !== path.values.length) issue([key, "cumulative"], "one running total per value");
      let total = 0;
      path.values.forEach((v, i) => {
        total += v;
        if (Math.abs(total - path.cumulative[i]!) > 0.002) issue([key, "cumulative", i], "running total does not add up");
      });
    }
    if (Math.abs(b.so_far.outturn.bn - (b.outturn.cumulative.at(-1) ?? NaN)) > 0.002) issue(["so_far", "outturn"], "not the running total");
    if (!!b.profile !== !!b.so_far.profile || !!b.profile !== !!b.so_far.difference) issue(["so_far"], "a comparison needs the OBR's path, and the path a comparison");
    const ids = new Set(b.sources.map((s) => s.id));
    const cited = [b.outturn.provenance, b.last_year?.provenance, b.profile?.provenance, b.year_forecast, ...Object.values(b.so_far)];
    for (const p of cited) if (p && !ids.has(p.source_id)) issue(["sources"], `cites ${p.source_id}, which it does not list`);
  });
export type BorrowingBundle = z.infer<typeof BorrowingBundle>;
