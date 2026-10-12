import { z } from "zod";
import { Quality } from "./provenance";

/** A page a tax seed's figures come from: the URL, and the ETL edition the figures were checked against. */
export const TaxSource = z.object({
  title: z.string().min(1),
  url: z.url(),
  /** What it gives: "personal allowance, bands and rates", "employee National Insurance thresholds and rates". */
  gives: z.string().min(1),
  /** The committed ETL edition holding the same figures (data/build/observations/govuk_tax_rates/<vintage>.csv). */
  vintage: z.string().min(1).optional(),
});
export type TaxSource = z.infer<typeof TaxSource>;

/** Income tax and employee NI parameters for the Your share calculator (PRD F3). */
export const TaxSeed = z.object({
  meta: z
    .object({
      country: z.string(),
      tax_year: z.string(),
      geography: z.string(),
      quality: Quality,
      method_note: z.string().min(1),
      intended_sources: z.array(z.url()).optional(),
      /** Where each figure comes from; required unless the values are a training placeholder. */
      sources: z.array(TaxSource).optional(),
    })
    .superRefine((m, ctx) => {
      if (m.quality === "training" && !m.method_note.includes("TODO(source)"))
        ctx.addIssue({ code: "custom", message: "training values need a TODO(source) note" });
      // The ETL's tax.json lists its pages as intended_sources; hand-written seeds give sources with what each page gives.
      if (m.quality === "sourced" && !m.sources?.length && !m.intended_sources?.length)
        ctx.addIssue({ code: "custom", message: "sourced values need their sources (title and URL)" });
    }),
  income_tax: z.object({
    personal_allowance_gbp: z.number().nonnegative(),
    allowance_taper_threshold_gbp: z.number().positive(),
    allowance_taper_rate: z.number().min(0).max(1),
    basic_band_gbp: z.number().positive(),
    additional_threshold_gbp: z.number().positive(),
    basic_rate_lever: z.string(),
    higher_rate_pct: z.number(),
    additional_rate_pct: z.number(),
    /** Levers that move these parameters in the sandbox (M2). Optional so older bundles still parse. */
    higher_rate_lever: z.string().optional(),
    additional_rate_lever: z.string().optional(),
    personal_allowance_lever: z.string().optional(),
  }),
  employee_ni: z.object({
    primary_threshold_gbp: z.number().nonnegative(),
    upper_earnings_limit_gbp: z.number().positive(),
    main_rate_lever: z.string(),
    upper_rate_pct: z.number(),
  }),
  your_share_defaults: z.object({ salary_gbp: z.number().nonnegative() }),
});
export type TaxSeed = z.infer<typeof TaxSeed>;
