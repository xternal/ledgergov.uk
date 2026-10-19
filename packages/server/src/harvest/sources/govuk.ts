import type { SourceDoc } from "../types";
import { cleanPersonName, errorMessage, getJson, prose, squash, ukDate, type FetchLike } from "./util";

/**
 * GOV.UK press releases published on one UK day. We keep releases that name a
 * minister or official in their metadata, or that quote someone in the body;
 * the rest (inspection reports, notices) rarely carry a promise. Policy papers
 * and consultation outcomes are read too, further down.
 */

export const GOVUK = "https://www.gov.uk";
export const DEFAULT_GOVUK_LIMIT = 40;

interface SearchResult {
  title?: string | null;
  link?: string | null;
  public_timestamp?: string | null;
  organisations?: ({ title?: string | null } | string)[] | null;
  people?: ({ title?: string | null } | string)[] | null;
}

interface ContentItem {
  title?: string | null;
  details?: { body?: string | { content_type?: string; content?: string }[] | null } | null;
}

type Errors = { sourceId: string; message: string }[];

export function govukSearchUrl(date: string): string {
  return (
    `${GOVUK}/api/search.json?filter_content_store_document_type=press_release` +
    `&filter_public_timestamp=from:${date},to:${date}&order=-public_timestamp&count=100` +
    `&fields=title,link,public_timestamp,organisations,people,description`
  );
}

export function govukId(link: string): string {
  const last = link.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() ?? "";
  return `govuk-${last.slice(0, 60)}`;
}

function titleOf(x: { title?: string | null } | string): string {
  return squash(typeof x === "string" ? x : x?.title);
}

/** Plain names from GOV.UK `people` ("The Rt Hon Yvette Cooper MP" → "Yvette Cooper"). */
export function peopleNames(people: SearchResult["people"]): string[] {
  const out: string[] = [];
  for (const p of people ?? []) {
    const name = cleanPersonName(titleOf(p));
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

function bodyHtml(item: ContentItem): string {
  const body = item.details?.body;
  if (typeof body === "string") return body;
  if (Array.isArray(body)) return body.find((b) => b.content_type === "text/html")?.content ?? body[0]?.content ?? "";
  return "";
}

const QUOTE_MARK = /["“”]/;

/**
 * True when the body quotes someone: "said"/"says" within a short distance of
 * a quotation mark, or "said:" introducing a block quote or a new paragraph.
 */
export function quotesSomeone(html: string, text: string): boolean {
  if (/\b(?:said|says)\s*:?\s*(?:<\/p>\s*)?<blockquote/i.test(html)) return true;
  if (/\b(?:said|says):\s*\n/i.test(text)) return true;
  const near = 80;
  for (let m = /\b(?:said|says)\b/gi, hit = m.exec(text); hit; hit = m.exec(text)) {
    const around = text.slice(Math.max(0, hit.index - near), hit.index + hit[0].length + near);
    if (QUOTE_MARK.test(around)) return true;
  }
  return false;
}

export async function fetchGovukDay(date: string, doFetch: FetchLike, limit = DEFAULT_GOVUK_LIMIT): Promise<{ docs: SourceDoc[]; errors: Errors }> {
  const errors: Errors = [];
  const search = await getJson<{ results?: SearchResult[] }>(doFetch, govukSearchUrl(date));
  if (!search || !Array.isArray(search.results)) throw new Error("GOV.UK search: unexpected answer");
  const onDay = search.results
    .filter((r): r is SearchResult & { link: string; public_timestamp: string } => typeof r.link === "string" && r.link.startsWith("/") && typeof r.public_timestamp === "string")
    .filter((r) => !Number.isNaN(Date.parse(r.public_timestamp)) && ukDate(r.public_timestamp) === date)
    .sort((a, b) => Date.parse(b.public_timestamp) - Date.parse(a.public_timestamp));

  const docs: SourceDoc[] = [];
  const seen = new Set<string>();
  for (const r of onDay) {
    if (docs.length >= limit) break;
    const id = govukId(r.link);
    if (seen.has(id)) continue;
    seen.add(id);
    let item: ContentItem;
    try {
      item = await getJson<ContentItem>(doFetch, `${GOVUK}/api/content${r.link}`);
    } catch (e) {
      errors.push({ sourceId: id, message: errorMessage(e) });
      continue;
    }
    const html = bodyHtml(item);
    const body = prose(html);
    const people = peopleNames(r.people);
    if (!body || (!people.length && !quotesSomeone(html, body))) continue;
    const title = squash(r.title) || squash(item.title) || id;
    const org = (r.organisations ?? []).map(titleOf).find(Boolean);
    docs.push({
      id,
      kind: "govuk_press_release",
      url: `${GOVUK}${r.link}`,
      title,
      date,
      venue: "press_release",
      venueLabel: org ? `Press release (${org})` : "Press release",
      text: `${title}\n${body}`,
      segments: [],
      people,
    });
  }
  return { docs, errors };
}

// ---------------------------------------------------------------- policy papers and consultation outcomes

/**
 * GOV.UK policy papers and consultation outcomes published on one UK day
 * (since 19 October 2026). The weekly desk used to read these a week late
 * (docs/desk/ROUTINE.md, step 6); the daily intake now reads them the next
 * morning. A publication's words are in its HTML attachments, each its own
 * page on GOV.UK, so each new HTML attachment becomes one source and quotes
 * are checked against it like any other. PDFs are not read: there is no page
 * to check a quote against. Only text first published that day is read, so a
 * paper updated today with an older document is not read again.
 */

export const DEFAULT_GOVUK_PAPER_LIMIT = 10;
/** At most this many HTML documents from one publication (a strategy and its annexes). */
const MAX_PARTS = 3;

export type PaperKind = "policy_paper" | "consultation_outcome";

interface Attachment {
  attachment_type?: string | null;
  id?: string | number | null;
  title?: string | null;
  url?: string | null;
}

interface Publication {
  title?: string | null;
  document_type?: string | null;
  details?: { attachments?: Attachment[] | null; final_outcome_attachments?: (string | number)[] | null } | null;
}

interface HtmlPublication {
  title?: string | null;
  first_published_at?: string | null;
  details?: { body?: string | null } | null;
}

export function govukPapersSearchUrl(date: string): string {
  return (
    `${GOVUK}/api/search.json?filter_content_store_document_type=policy_paper&filter_content_store_document_type=consultation_outcome` +
    `&filter_public_timestamp=from:${date},to:${date}&order=-public_timestamp&count=100` +
    `&fields=title,link,public_timestamp,organisations,content_store_document_type`
  );
}

/** "govuk-paper-<slug>" for a policy paper's HTML page, "govuk-outcome-<slug>" for a consultation outcome's. */
export function govukPaperId(kind: PaperKind, url: string): string {
  const last = (url.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  return `govuk-${kind === "policy_paper" ? "paper" : "outcome"}-${last.slice(0, 60)}`;
}

/** Another version of the same words: Easy Read, British Sign Language, Welsh, large print, an annex. */
const ALTERNATE = /\b(?:easy read|british sign language|BSL|large print|braille|audio|cymraeg)\b|\(welsh\)|^welsh\b|^annex\b/i;

/** The HTML attachments that hold a publication's own words: for a consultation outcome, only the outcome's. */
export function paperParts(kind: PaperKind, pub: Publication): { url: string; title: string }[] {
  const outcome = new Set((pub.details?.final_outcome_attachments ?? []).map(String));
  const out: { url: string; title: string }[] = [];
  for (const a of pub.details?.attachments ?? []) {
    if (a.attachment_type !== "html" || typeof a.url !== "string" || !a.url.startsWith("/")) continue;
    if (kind === "consultation_outcome" && !outcome.has(String(a.id))) continue;
    const title = squash(a.title);
    if (ALTERNATE.test(title)) continue;
    out.push({ url: a.url, title });
  }
  return out.slice(0, MAX_PARTS);
}

export async function fetchGovukPapersDay(date: string, doFetch: FetchLike, limit = DEFAULT_GOVUK_PAPER_LIMIT): Promise<{ docs: SourceDoc[]; errors: Errors }> {
  const errors: Errors = [];
  const search = await getJson<{ results?: (SearchResult & { content_store_document_type?: string | null })[] }>(doFetch, govukPapersSearchUrl(date));
  if (!search || !Array.isArray(search.results)) throw new Error("GOV.UK search: unexpected answer");
  const onDay = search.results
    .filter((r): r is SearchResult & { link: string; public_timestamp: string; content_store_document_type: PaperKind } =>
      typeof r.link === "string" && r.link.startsWith("/") && typeof r.public_timestamp === "string" && (r.content_store_document_type === "policy_paper" || r.content_store_document_type === "consultation_outcome"),
    )
    .filter((r) => !Number.isNaN(Date.parse(r.public_timestamp)) && ukDate(r.public_timestamp) === date)
    .sort((a, b) => Date.parse(b.public_timestamp) - Date.parse(a.public_timestamp));

  const docs: SourceDoc[] = [];
  const seen = new Set<string>();
  for (const r of onDay) {
    if (docs.length >= limit) break;
    const kind = r.content_store_document_type;
    let pub: Publication;
    try {
      pub = await getJson<Publication>(doFetch, `${GOVUK}/api/content${r.link}`);
    } catch (e) {
      errors.push({ sourceId: govukPaperId(kind, r.link), message: errorMessage(e) });
      continue;
    }
    const org = (r.organisations ?? []).map(titleOf).find(Boolean);
    const label = `${kind === "policy_paper" ? "Policy paper" : "Consultation outcome"}${org ? ` (${org})` : ""}`;
    for (const part of paperParts(kind, pub)) {
      if (docs.length >= limit) break;
      let id = govukPaperId(kind, part.url);
      for (let n = 2; seen.has(id); n++) id = `${govukPaperId(kind, part.url)}-${n}`;
      let page: HtmlPublication;
      try {
        page = await getJson<HtmlPublication>(doFetch, `${GOVUK}/api/content${part.url}`);
      } catch (e) {
        errors.push({ sourceId: id, message: errorMessage(e) });
        continue;
      }
      // New words only: a page first published on another day was read then, or predates the intake.
      if (typeof page.first_published_at !== "string" || Number.isNaN(Date.parse(page.first_published_at)) || ukDate(page.first_published_at) !== date) continue;
      const body = prose(page.details?.body ?? "");
      if (!body) continue;
      seen.add(id);
      const title = squash(page.title) || part.title || squash(pub.title) || id;
      docs.push({ id, kind: kind === "policy_paper" ? "govuk_policy_paper" : "govuk_consultation_outcome", url: `${GOVUK}${part.url}`, title, date, venue: "press_release", venueLabel: label, text: `${title}\n${body}`, segments: [], people: [] });
    }
  }
  return { docs, errors };
}
