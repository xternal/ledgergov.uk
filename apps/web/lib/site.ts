import { cardLastUpdated, type SeoContext } from "@ledger/server/seo";

/**
 * Site identity for metadata, structured data, the sitemap and llms.txt.
 * SITE_URL is set in production (docs/OPERATIONS.md); Vercel previews fall back
 * to their own production URL, local development to localhost.
 */
export const SITE_NAME = "LedgerGov.UK";
export const SITE_DESCRIPTION =
  "An open P&L of the UK state: where public money comes from, where it goes, and what every political promise would cost, with every number linked to its official source.";

/**
 * Open Graph fields every page shares. A page that sets its own openGraph
 * replaces the layout's whole object, so pages spread this in.
 */
export const OPEN_GRAPH = { siteName: SITE_NAME, locale: "en_GB" } as const;

/** An alpha (SITE_STAGE=alpha): a public early version, labelled on every page. */
export const isAlpha = () => process.env.SITE_STAGE === "alpha";

/** The maker, credited at the foot of every page. */
export const SOURCE_CODE = { url: "https://github.com/xternal/public-ledger", licence: "AGPL-3.0" } as const;
/** Applications and questions from would-be editors (Cloudflare Email Routing forwards it). */
export const EDITORS_EMAIL = "editors@ledgergov.uk";
/** When /editors last changed: the JobPosting date and the sitemap use it. */
export const EDITORS_PAGE_UPDATED = "2026-10-08";
export const MAKER = { name: "Pavel Guzhikov", url: "https://guzh.uk", coffee: "https://ko-fi.com/pavelg" } as const;

/**
 * The owner's other project (docs/DECISIONS.md, "Also by the author", 19 October 2026): a card above the footer on
 * every page (components/AlsoBy.tsx, in the root layout) and one line in llms.txt. Nothing else: no line above the
 * header, and never chosen or varied by page, promise, party or topic. Plain links with no query string, and
 * nothing counted.
 */
export const ALSO_BY = {
  label: "Also by the author",
  name: "Ruminator.xyz",
  url: "https://ruminator.xyz/",
  text: "Russia's regional and local press, read every day: what each kind of outlet reports, and how. Every claim is kept in its original Russian words and checked word for word against an archived copy of the article.",
  audience: "For journalists, analysts, researchers and diplomats who follow Russia from outside. By invitation, paid subscription.",
  cta: "Request access",
  access: "https://ruminator.xyz/request-access",
  /** The one line in llms.txt. */
  summary: "Russia's regional and local press, read every day; by invitation, paid subscription.",
} as const;

/** The last section of llms.txt: the owner's other project, in one line. */
export function alsoByLlms(): string[] {
  return [`## ${ALSO_BY.label}`, "", `- [${ALSO_BY.name}](${ALSO_BY.url}): ${ALSO_BY.summary}`];
}

export function siteUrl(): string {
  const fromEnv = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return (fromEnv || "http://localhost:3000").replace(/\/$/, "");
}

/** Today's date in UK time, YYYY-MM-DD. */
const ukToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/**
 * The last date a card changed: its newest version, timeline event, correction
 * or review up to today (future deadlines are not changes). The card's "Last
 * updated", its dateModified and its sitemap lastmod all use it.
 */
export function lastChanged(file: Parameters<typeof cardLastUpdated>[0], today = ukToday()): string | undefined {
  return cardLastUpdated(file, today);
}

/** What the SEO helpers (titles, structured data, Markdown) need: where the site is, and today. */
export const seoContext = (): SeoContext => ({ siteUrl: siteUrl(), today: ukToday() });

export function absolute(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
