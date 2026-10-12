import { z } from "zod";
import { Observation, Source } from "./provenance";

/**
 * data/build/fiscal_targets.json, written by etl/fiscal_targets.py: the OBR's headroom against
 * each fiscal rule at every forecast that assessed them (each EFO's own "Performance against the
 * Government's fiscal targets" table), and the newest forecast's own figures for the same measures
 * when it made no assessment. Every value is an Observation as published; nothing is worked out.
 */

/** The rules the OBR assesses, by the measure each uses (series fiscal_targets.<rule>.*). */
export const FISCAL_RULES = ["current_budget", "psnfl", "welfare_cap"] as const;
export const FiscalRule = z.enum(FISCAL_RULES);
export type FiscalRule = z.infer<typeof FiscalRule>;

const EfoVintage = z.string().regex(/^EFO-\d{4}-\d{2}$/, "expected an EFO edition like EFO-2025-11");

export const FiscalAssessment = z
  .object({
    vintage: EfoVintage,
    /** "November 2025" */
    edition: z.string().min(1),
    url: z.url(),
    /** The table the figures were read from: "Table 7.1". */
    table: z.string().regex(/^Table \d+\.\d+$/),
    table_title: z.string().min(1),
    observations: z.array(Observation).min(1),
  })
  .superRefine((a, ctx) => {
    a.observations.forEach((o, i) => {
      if (o.vintage !== a.vintage) ctx.addIssue({ code: "custom", path: ["observations", i, "vintage"], message: `should be ${a.vintage}` });
      if (!/^fiscal_targets\.(current_budget|psnfl|welfare_cap)\.[a-z_]+$/.test(o.series_id))
        ctx.addIssue({ code: "custom", path: ["observations", i, "series_id"], message: "not a fiscal_targets.<rule>.<measure> series" });
      if (o.kind !== "forecast") ctx.addIssue({ code: "custom", path: ["observations", i, "kind"], message: "an assessment is a forecast" });
    });
    for (const rule of ["current_budget", "psnfl"] as const) {
      if (!a.observations.some((o) => o.series_id === `fiscal_targets.${rule}.margin`))
        ctx.addIssue({ code: "custom", path: ["observations"], message: `no margin against ${rule}` });
    }
  });
export type FiscalAssessment = z.infer<typeof FiscalAssessment>;

/** The newest EFO when it is newer than the newest assessment: confirmed as making none, or not yet read. */
export const LatestForecast = z.object({
  vintage: EfoVintage,
  edition: z.string().min(1),
  url: z.url(),
  status: z.enum(["not_assessed", "pending"]),
  /** fiscal.current_budget_deficit in the target year; fiscal.psnfl_pct_gdp in the year before and the target year. */
  observations: z.array(Observation),
});
export type LatestForecast = z.infer<typeof LatestForecast>;

export const FiscalTargetsBundle = z
  .object({
    assessments: z.array(FiscalAssessment).min(1),
    latest_forecast: LatestForecast.nullable(),
    sources: z.array(Source).min(1),
  })
  .superRefine((b, ctx) => {
    const ids = new Set(b.sources.map((s) => s.id));
    const all = [...b.assessments.flatMap((a) => a.observations), ...(b.latest_forecast?.observations ?? [])];
    for (const o of all) {
      if (o.source_id && !ids.has(o.source_id)) ctx.addIssue({ code: "custom", path: ["sources"], message: `${o.series_id} cites ${o.source_id}, which is not listed` });
    }
    const order = b.assessments.map((a) => a.vintage);
    if (order.join() !== [...order].sort().join()) ctx.addIssue({ code: "custom", path: ["assessments"], message: "assessments should run oldest first" });
    const newest = order.at(-1)!;
    if (b.latest_forecast && b.latest_forecast.vintage <= newest)
      ctx.addIssue({ code: "custom", path: ["latest_forecast"], message: `should be newer than the newest assessment (${newest})` });
  });
export type FiscalTargetsBundle = z.infer<typeof FiscalTargetsBundle>;

/** One published value from an assessment, or undefined if that table did not give it. */
export const assessed = (a: FiscalAssessment, rule: FiscalRule, measure: string): Observation | undefined =>
  a.observations.find((o) => o.series_id === `fiscal_targets.${rule}.${measure}`);
