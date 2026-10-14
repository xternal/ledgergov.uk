import { describe, expect, it } from "vitest";
import { counterFromEnv, counts, countView, dayKey, isCountedPage, isNotAReader, isNotARead, readViews, topPages, totalViews, VIEWS_DAYS, type ViewsFile } from "../src/views";

const BROWSER = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const navigation = (extra: Record<string, string> = {}) => new Headers({ "user-agent": BROWSER, "sec-fetch-dest": "document", ...extra });
const counter = { url: "https://example.upstash.io", writeToken: "write", readToken: "read" };

describe("which requests count", () => {
  it("counts the site's reading pages", () => {
    for (const path of [
      "/",
      "/promises",
      "/promises/area/health",
      "/promise/uk-nine-reservoirs-2050",
      "/actor/keir-starmer",
      "/mp/leeds-west-and-pudsey",
      "/budget",
      "/budget/capital-gains-tax",
      "/budget/scorecard/autumn-budget-2025",
      "/budget/predict",
      "/tax/basic-rate",
      "/method/numbers",
      "/people",
      "/privacy",
      "/editors",
      "/feeds",
      "/follow",
      "/pay-for-it",
      "/borrowing",
      "/receipt",
      "/receipt/35k",
    ])
      expect(isCountedPage(path), path).toBe(true);
  });

  it("never counts a reader's own link, so its code is never published", () => {
    expect(isCountedPage("/budget/predict/r/abcdefgh23")).toBe(false);
    expect(isCountedPage("/budget/predict/r")).toBe(false);
    expect(isCountedPage("/s/abc123")).toBe(false);
    // A receipt address other than the four examples could hold a typed salary.
    expect(isCountedPage("/receipt/52300")).toBe(false);
    expect(isCountedPage("/receipt/36k")).toBe(false);
    expect(isCountedPage("/pay-for-it/uk-bus-cap-2-2026/borrow")).toBe(false);
    expect(isCountedPage("/pay-for-it/uk-bus-cap-2-2026/tax-income_tax_basic-100")).toBe(false);
  });

  it("skips the API, admin, forms, files and scanners' guesses", () => {
    for (const path of [
      "/api/v1/promises",
      "/admin",
      "/alpha",
      "/follow/confirm",
      "/follow/manage",
      "/submission/delete",
      "/md/promise/x.md",
      "/views.json",
      "/favicon.ico",
      "/feeds/all.xml",
      "/wp-login.php",
      "/.env",
      "/promise/UPPER",
      `/promise/${"a".repeat(200)}`,
    ])
      expect(isCountedPage(path), path).toBe(false);
  });

  it("skips crawlers, link previews, AI fetchers, scripts and requests with no user agent", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
      "WhatsApp/2.23.20.0",
      "facebookexternalhit/1.1",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)",
      "Claude-User/1.0",
      "curl/8.4.0",
      "python-httpx/0.27.0",
      "LedgerGovUKBot/1.0",
    ])
      expect(isNotAReader(ua), ua).toBe(true);
    expect(isNotAReader(null)).toBe(true);
    expect(isNotAReader(BROWSER)).toBe(false);
  });

  it("skips prefetches and requests for part of a page, and counts browsers that send no fetch headers", () => {
    expect(isNotARead(navigation({ "sec-purpose": "prefetch" }))).toBe(true);
    expect(isNotARead(navigation({ purpose: "prefetch" }))).toBe(true);
    expect(isNotARead(navigation({ "next-router-prefetch": "1" }))).toBe(true);
    expect(isNotARead(navigation({ rsc: "1" }))).toBe(true);
    expect(isNotARead(navigation({ "sec-fetch-dest": "image" }))).toBe(true);
    expect(isNotARead(navigation())).toBe(false);
    expect(isNotARead(new Headers({ "user-agent": BROWSER }))).toBe(false);
  });

  it("counts only a reader's GET of a page", () => {
    expect(counts("GET", "/promises", navigation())).toBe(true);
    expect(counts("HEAD", "/promises", navigation())).toBe(false);
    expect(counts("POST", "/promises", navigation())).toBe(false);
    expect(counts("GET", "/api/v1", navigation())).toBe(false);
  });
});

describe("what is stored and read", () => {
  it("sends only the day and the path, never anything about the reader", async () => {
    const sent: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      return new Response(JSON.stringify([{ result: 1 }]));
    }) as unknown as typeof fetch;
    await countView(counter, "/promises", new Date("2026-10-13T09:30:00Z"), f);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe("https://example.upstash.io/pipeline");
    expect(JSON.parse(String(sent[0]!.init.body))).toEqual([["HINCRBY", "ledgergov:views:2026-10-13", "/promises", "1"]]);
    expect((sent[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer write");
  });

  it("keys each day by its UTC date, apart from other sites", () => {
    expect(dayKey(new Date("2026-10-25T23:30:00Z"))).toBe("ledgergov:views:2026-10-25");
  });

  it("reads the last 30 days with the read-only token and leaves out days with no views", async () => {
    let body: string[][] = [];
    let auth = "";
    const f = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      auth = (init.headers as Record<string, string>).Authorization!;
      return new Response(JSON.stringify(body.map((_, i) => ({ result: i === 0 ? ["/", "5", "/promises", "2"] : i === 1 ? ["/", "1"] : [] }))));
    }) as unknown as typeof fetch;
    const file = await readViews(counter, new Date("2026-10-13T12:00:00Z"), f);
    expect(body).toHaveLength(VIEWS_DAYS);
    expect(body[0]).toEqual(["HGETALL", "ledgergov:views:2026-10-13"]);
    expect(auth).toBe("Bearer read");
    expect(file.days).toEqual([
      { date: "2026-10-13", pages: { "/": 5, "/promises": 2 } },
      { date: "2026-10-12", pages: { "/": 1 } },
    ]);
  });

  it("throws when the counter answers with an error, so callers can say it is unavailable", async () => {
    const f = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    await expect(readViews(counter, new Date(), f)).rejects.toThrow("500");
  });

  it("is off without the Upstash variables, and falls back to the write token for reading", () => {
    expect(counterFromEnv({})).toBeNull();
    expect(counterFromEnv({ KV_REST_API_URL: "https://x.upstash.io" })).toBeNull();
    expect(counterFromEnv({ KV_REST_API_URL: "https://x.upstash.io", KV_REST_API_TOKEN: "w" })).toEqual({ url: "https://x.upstash.io", writeToken: "w", readToken: "w" });
    expect(counterFromEnv({ KV_REST_API_URL: "https://x.upstash.io", KV_REST_API_TOKEN: "w", KV_REST_API_READ_ONLY_TOKEN: "r" })?.readToken).toBe("r");
  });
});

describe("the most read pages", () => {
  const file: ViewsFile = {
    generated_at: "2026-10-13T12:00:00Z",
    days: [
      { date: "2026-10-01", pages: { "/tax": 100 } },
      { date: "2026-10-13", pages: { "/": 5, "/promises": 2 } },
      { date: "2026-10-12", pages: { "/promises": 4, "/budget": 2 } },
    ],
  };

  it("adds up the newest days, most read first, ties by address", () => {
    expect(topPages(file, 2)).toEqual([
      { path: "/promises", views: 6 },
      { path: "/", views: 5 },
      { path: "/budget", views: 2 },
    ]);
    expect(topPages(file, 30)[0]).toEqual({ path: "/tax", views: 100 });
    expect(totalViews(file, 2)).toBe(13);
  });

  it("counts calendar days back from the file's date, not the newest days that had views", () => {
    // 1 October is 12 days before 13 October: outside the last 7 or 12 days, inside the last 13.
    expect(topPages(file, 7)).toEqual([
      { path: "/promises", views: 6 },
      { path: "/", views: 5 },
      { path: "/budget", views: 2 },
    ]);
    expect(totalViews(file, 12)).toBe(13);
    expect(totalViews(file, 13)).toBe(113);
  });
});
