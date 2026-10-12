/**
 * Page views (/method/numbers): one number per page per day, kept in Upstash Redis, and nothing about the reader.
 * The proxy (apps/web/proxy.ts) adds one to today's count for a page a reader opens, after the page is on its way,
 * from the request's path alone. It reads the user agent and the fetch headers only to skip crawlers, link previews
 * and prefetches, and stores neither: not the IP address, country, device, browser, referrer or time of day. A
 * reader's own links (/s/<code>, /budget/predict/r/<code>) are never counted, so their codes never appear in the
 * public totals. The totals are public at /views.json and on /method/numbers. Without the Upstash variables (a
 * preview, a laptop) nothing is counted and the page says so.
 */

export const VIEWS_PATH = "/views.json";
export const NUMBERS_PATH = "/method/numbers";
/** How many days /views.json returns. */
export const VIEWS_DAYS = 30;
/** The windows /method/numbers shows (days), and how many pages each lists. */
export const NUMBERS_WINDOWS = [7, 30] as const;
export const NUMBERS_TOP = 30;
/** How long /views.json and /method/numbers keep an answer before asking the counter again. */
export const VIEWS_CACHE_SECONDS = 600;

/**
 * The site's reading pages; anything else (the API, admin, forms with tokens, files, scanners' guesses) is not counted.
 * /follow counts as the page that explains following; its confirm and manage pages are steps in a flow, not reads.
 * /pay-for-it counts; a reader's own plan (/pay-for-it/<pledge>/<plan>) does not, like /s/<code>.
 */
const PAGES = /^\/(?:(?:promises|promise|actor|people|mp|budget|tax|method)(?:\/[a-z0-9-]+){0,2}|editors|privacy|feeds|follow|pay-for-it)?$/;
/** A reader's own link to their predictions: never counted, so its code is never published. */
const READER_LINK = /^\/budget\/predict\/r(?:\/|$)/;
const LONGEST_PATH = 120;
export const isCountedPage = (path: string) => path.length <= LONGEST_PATH && PAGES.test(path) && !READER_LINK.test(path);

const NOT_A_READER =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|skype|discord|curl|wget|python|httpx|go-http|java\/|okhttp|axios|node-fetch|headless|lighthouse|pingdom|uptime|monitor|feed|rss|scan|archive|chatgpt|claude|perplexity|ledgergov|vercel/i;
/** A crawler, a link preview, an AI fetcher or a script; a request with no user agent is not counted either. */
export const isNotAReader = (userAgent: string | null) => !userAgent || NOT_A_READER.test(userAgent);

/**
 * Not a page being opened: a browser fetching ahead of a click, or a request for part of a page (the site links
 * with plain <a>, so every read is a whole-document request; browsers without Sec-Fetch-Dest still count).
 */
export function isNotARead(headers: Headers): boolean {
  if (/prefetch/i.test(headers.get("sec-purpose") ?? headers.get("purpose") ?? "")) return true;
  if (headers.has("next-router-prefetch") || headers.has("rsc")) return true;
  const dest = headers.get("sec-fetch-dest");
  return dest !== null && dest !== "document";
}

/** Whether a request adds one to its page's count today. */
export const counts = (method: string, path: string, headers: Headers) =>
  method === "GET" && isCountedPage(path) && !isNotAReader(headers.get("user-agent")) && !isNotARead(headers);

/** The day's counter, by UTC date: one hash per day, a field per page. The prefix keeps it apart in a shared database. */
export const dayKey = (date: Date) => `ledgergov:views:${date.toISOString().slice(0, 10)}`;

export interface ViewsDay {
  date: string;
  pages: Record<string, number>;
}
export interface ViewsFile {
  generated_at: string;
  days: ViewsDay[];
}

/** Pages by views over the newest `days` days, most read first. */
export function topPages(file: ViewsFile, days: number): { path: string; views: number }[] {
  const totals = new Map<string, number>();
  for (const d of [...file.days].sort((a, b) => b.date.localeCompare(a.date)).slice(0, days)) {
    for (const [path, n] of Object.entries(d.pages)) totals.set(path, (totals.get(path) ?? 0) + n);
  }
  return [...totals.entries()].map(([path, views]) => ({ path, views })).sort((a, b) => b.views - a.views || a.path.localeCompare(b.path));
}

/** All views over the newest `days` days. */
export const totalViews = (file: ViewsFile, days: number) => topPages(file, days).reduce((s, p) => s + p.views, 0);

/** The Upstash REST address and tokens, as the Vercel integration names them; null when the counter is not connected. */
export interface Counter {
  url: string;
  writeToken: string;
  readToken: string;
}
export function counterFromEnv(env: Record<string, string | undefined> = process.env): Counter | null {
  const url = env.KV_REST_API_URL;
  const writeToken = env.KV_REST_API_TOKEN;
  if (!url || !writeToken) return null;
  return { url, writeToken, readToken: env.KV_REST_API_READ_ONLY_TOKEN || writeToken };
}

type Fetch = typeof fetch;

async function pipeline(counter: Counter, commands: string[][], token: string, f: Fetch): Promise<{ result?: unknown }[]> {
  const r = await f(`${counter.url}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(commands) });
  if (!r.ok) throw new Error(`counter answered ${r.status}`);
  return (await r.json()) as { result?: unknown }[];
}

/** Adds one to today's count for a page: the path and the date are all that is sent. */
export async function countView(counter: Counter, path: string, now = new Date(), f: Fetch = fetch): Promise<void> {
  await pipeline(counter, [["HINCRBY", dayKey(now), path, "1"]], counter.writeToken, f);
}

const DAY_MS = 86_400_000;

/** The last VIEWS_DAYS days' totals, newest first; days with no views are left out. */
export async function readViews(counter: Counter, now = new Date(), f: Fetch = fetch): Promise<ViewsFile> {
  const dates = Array.from({ length: VIEWS_DAYS }, (_, i) => new Date(now.getTime() - i * DAY_MS));
  const answers = await pipeline(
    counter,
    dates.map((d) => ["HGETALL", dayKey(d)]),
    counter.readToken,
    f,
  );
  const file: ViewsFile = { generated_at: now.toISOString(), days: [] };
  answers.forEach((a, i) => {
    const flat = Array.isArray(a.result) ? (a.result as string[]) : [];
    const pages: Record<string, number> = {};
    for (let k = 0; k + 1 < flat.length; k += 2) pages[flat[k]!] = Number(flat[k + 1]);
    if (flat.length) file.days.push({ date: dates[i]!.toISOString().slice(0, 10), pages });
  });
  return file;
}
