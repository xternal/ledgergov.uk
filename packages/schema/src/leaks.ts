import { z } from "zod";
import { PolicyArea } from "./content";
import { IsoDate, Range } from "./provenance";

/**
 * The pre-Budget leak tracker (/budget/leaks): one YAML file per measure briefed to the press
 * before a Budget, in content/leaks/<id>.yaml. Site-only (a Budget page), so it lives here, not in
 * OpenPromises. Editors add entries by pull request; an editor approves, as for cards (one since 17 October 2026)
 * (docs/EDITORS.md, "How to add a leak").
 *
 * A status says how far a measure is confirmed, and pages keep the levels visibly apart:
 *   trailed        reported in the press, not confirmed by the government
 *   confirmed      a minister or the Treasury said it on the record before the Budget
 *   announced      in the Budget documents
 *   not_in_budget  the Budget documents do not include it
 */

export const LEAK_STATUSES = ["trailed", "confirmed", "announced", "not_in_budget"] as const;
export const LeakStatus = z.enum(LEAK_STATUSES);
export type LeakStatus = z.infer<typeof LeakStatus>;

/** Where the Budget documents and official statements are published: a Budget outcome must link one of these. */
export const OFFICIAL_HOSTS = ["gov.uk", "obr.uk", "parliament.uk", "legislation.gov.uk"] as const;
export const isOfficialUrl = (url: string) => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return OFFICIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
};

/** A headline for the measure: what was reported, neutral, 3–10 words, under 80 characters, no closing full stop. */
export const LeakHeadline = z
  .string()
  .trim()
  .max(80, "a headline is short: 3–10 words, under 80 characters")
  .refine((h) => !/[.!?]$/.test(h), "a headline has no closing full stop")
  .refine((h) => {
    const n = h.split(/\s+/).filter(Boolean).length;
    return n >= 3 && n <= 10;
  }, "a headline is 3–10 words");

/** One press report of the measure. The first in the list is the earliest found: the original report. */
export const LeakReport = z.object({
  /** "The Times", "BBC News", "Financial Times". */
  outlet: z.string().trim().min(1),
  /** The day it was published (online), as the outlet dates it. */
  date: IsoDate,
  url: z.url(),
  /** A copy in the Internet Archive (web.archive.org), so the link survives paywalls and edits. */
  archived_url: z.url().optional(),
  /** The report's own headline, as published. */
  title: z.string().trim().min(1).optional(),
});
export type LeakReport = z.infer<typeof LeakReport>;

/**
 * An estimated cost, only when a source gives one. £bn; positive costs the public finances money,
 * negative raises it. A single published figure is [x, x, x]. A total over several years is never
 * shown as a yearly figure.
 */
export const LeakCost = z.object({
  range: Range,
  basis: z.enum(["per_year", "total"]),
  /** The year the figure is for ("2029-30"), or the years a total covers ("2026-27 to 2029-30"). */
  period: z.string().trim().min(1),
  /** Who made the figure: official (OBR, Treasury, HMRC), independent (IFS, think tanks), or press (the report's own figure, or unnamed sources in it). */
  by: z.object({ kind: z.enum(["official", "independent", "press"]), name: z.string().trim().min(1) }),
  source_url: z.url(),
  note: z.string().trim().min(1).optional(),
});
export type LeakCost = z.infer<typeof LeakCost>;

export const LeakFile = z
  .object({
    id: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/, "an id: lower-case letters, digits and hyphens"),
    headline: LeakHeadline,
    area: PolicyArea,
    /** What was reported, in our own words: one or two plain sentences, saying who briefed it if the report does ("Treasury sources"). */
    summary: z.string().trim().min(20),
    reported: z.array(LeakReport).min(1),
    estimated_cost: LeakCost.optional(),
    status: LeakStatus,
    /** For `confirmed`: who said it on the record, when, and where. */
    confirmed: z.object({ date: IsoDate, by: z.string().trim().min(1), url: z.url(), text: z.string().trim().min(1).optional() }).optional(),
    /** From Budget day: what the Budget actually did, with the page of the Budget documents that shows it. */
    budget: z
      .object({
        date: IsoDate,
        text: z.string().trim().min(1),
        evidence_url: z.url(),
        cost: LeakCost.optional(),
      })
      .optional(),
  })
  .strict()
  .superRefine((l, ctx) => {
    const dates = l.reported.map((r) => r.date);
    if (dates.join() !== [...dates].sort().join()) ctx.addIssue({ code: "custom", path: ["reported"], message: "list the reports earliest first: the first is the original" });
    const first = dates[0]!;
    if (l.status === "trailed" && (l.confirmed || l.budget))
      ctx.addIssue({ code: "custom", path: ["status"], message: "a trailed measure has no confirmation or Budget outcome yet: change the status" });
    if (l.status === "confirmed") {
      if (!l.confirmed) ctx.addIssue({ code: "custom", path: ["confirmed"], message: "a confirmed measure says who confirmed it, when and where" });
      if (l.budget) ctx.addIssue({ code: "custom", path: ["status"], message: "a measure with a Budget outcome is announced or not_in_budget" });
    }
    if ((l.status === "announced" || l.status === "not_in_budget") && !l.budget)
      ctx.addIssue({ code: "custom", path: ["budget"], message: `status ${l.status} needs what the Budget did, with its evidence` });
    if (l.budget) {
      if (!isOfficialUrl(l.budget.evidence_url))
        ctx.addIssue({ code: "custom", path: ["budget", "evidence_url"], message: `the evidence is a Budget document: a link on ${OFFICIAL_HOSTS.join(", ")}` });
      if (l.budget.date < first) ctx.addIssue({ code: "custom", path: ["budget", "date"], message: "the Budget comes after the first report" });
      if (l.budget.cost && l.budget.cost.by.kind !== "official")
        ctx.addIssue({ code: "custom", path: ["budget", "cost", "by", "kind"], message: "the Budget's own costing is official" });
    }
    if (l.confirmed && l.confirmed.date < first) ctx.addIssue({ code: "custom", path: ["confirmed", "date"], message: "confirmation comes after the first report; if the government said it first, it is not a leak" });
  });
export type LeakFile = z.infer<typeof LeakFile>;

/** Problems that do not stop a merge but an editor should see: a report with no archived copy. */
export function leakWarnings(l: LeakFile): string[] {
  return l.reported.filter((r) => !r.archived_url).map((r) => `${r.outlet} (${r.date}) has no archived_url; archive it at web.archive.org/save`);
}

/** Newest first by the original report, then by headline: the order /budget/leaks lists them in. */
export const byFirstReport = (a: LeakFile, b: LeakFile) => b.reported[0]!.date.localeCompare(a.reported[0]!.date) || a.headline.localeCompare(b.headline);
