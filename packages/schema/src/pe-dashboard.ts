import { z } from "zod";
import { FiscalYear } from "./provenance";

/**
 * PolicyEngine's own population results for a fiscal event, from the CSVs behind its Budget dashboard
 * (e.g. https://www.policyengine.org/uk/autumn-budget-2026). Since 6 November 2026 we no longer compute population
 * results ourselves: PolicyEngine asked us to stop using its API's economy endpoints and offered these instead, to
 * be credited and linked to the dashboard (docs/MODEL.md). Fetched once by `pnpm household -- dashboard <event> <url>`
 * into data/build/budget/policyengine/<event>.json and shown on "The Budget for your household" as PolicyEngine's
 * estimate, for the measures PolicyEngine modelled, which are not always the measures we list.
 */
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const PolicyEngineDashboardDecile = z
  .object({
    decile: z.number().int().min(1).max(10),
    /** Average change in household net income, % (0.42 is 0.42%). */
    rel_change_pct: z.number(),
    /** Average change in household net income, £ a year. */
    avg_change_gbp: z.number(),
  })
  .strict();

export const PolicyEngineDashboardYear = z
  .object({
    year: FiscalYear,
    /** Effect on the public finances, £bn a year: positive raises money, negative costs it. */
    net_bn: z.number(),
    /** Average change for all households, £ a year. */
    all_avg_change_gbp: z.number(),
    deciles: z.array(PolicyEngineDashboardDecile).length(10),
  })
  .strict();

export const PolicyEngineDashboard = z
  .object({
    /** Our event id: the measures file and snapshot it sits beside. */
    event: z.string().min(1),
    /** The dashboard's own title, as PolicyEngine names it. */
    title: z.string().min(1),
    /** The dashboard page: the credit links here. */
    url: z.url(),
    release: z.string().min(1),
    revision: z.number().int().nonnegative(),
    /** When PolicyEngine last updated the dashboard's data (its manifest). */
    updated_at: z.iso.datetime({ offset: true }),
    /** When we fetched it. */
    retrieved_at: z.iso.datetime(),
    /** The approved run of all its measures together, as its manifest names it. */
    run: z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
        artifact: z.string().min(1),
        artifact_sha256: Sha256,
        approved_at: z.iso.datetime({ offset: true }),
      })
      .strict(),
    model: z.object({ policyengine: z.string().min(1), policyengine_uk: z.string().min(1), dataset: z.string().min(1) }).strict(),
    /** The measures PolicyEngine modelled, in its words. */
    measures: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) }).strict()).min(1),
    /** Every CSV read, with its SHA-256 as fetched, so a change on PolicyEngine's side shows up as a diff. */
    files: z.array(z.object({ name: z.string().min(1), url: z.url(), sha256: Sha256 }).strict()).min(1),
    /** The years with every figure; a year with a blank cell in PolicyEngine's CSVs is left out, and the blank listed in `gaps`. */
    years: z.array(PolicyEngineDashboardYear).min(1),
    gaps: z.array(z.string().min(1)),
  })
  .strict();
export type PolicyEngineDashboard = z.infer<typeof PolicyEngineDashboard>;
