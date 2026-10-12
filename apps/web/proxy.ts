import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { API_HEADERS } from "@ledger/server/api";
import { alphaGate } from "@ledger/server/alpha";
import { getDb, loadConfig } from "@ledger/server";
import { ADMIN_HEADERS, adminGateLimited } from "@ledger/server/triage";
import { counterFromEnv, counts, countView } from "@ledger/server/views";

/**
 * Next 16 proxy (formerly middleware), Node.js runtime.
 * - Alpha with a password (SITE_STAGE=alpha and ALPHA_PASSWORD set): every page
 *   needs the testers' password (a cookie set at /alpha) and is marked noindex.
 *   Without a password the alpha is public, indexed like any page.
 * - The editors' triage keeps its interim basic auth: 404 when ADMIN_USER or
 *   ADMIN_PASSWORD is unset, 401 without the right credentials, and 429 for a
 *   connection with too many failed sign-ins today (counted in the database's
 *   IP-free salted buckets); noindex and no-store. Pages and routes check
 *   again themselves (defence in depth). Before launch, put Cloudflare Access
 *   or Vercel Authentication in front.
 * - The public API (/api/v1) answers CORS preflight here: its routes are static
 *   files, which only serve GET and HEAD.
 * - Page views (@ledger/server/views): a reader opening one of the site's pages
 *   adds one to today's count for that path in Upstash Redis, after the page is
 *   on its way. Only the path and the date are stored; crawlers, link previews,
 *   prefetches and a reader's own links are skipped. A slow or failing counter
 *   never delays or breaks a page; without the Upstash variables nothing counts.
 */
const isAdmin = (path: string) => path === "/admin" || path.startsWith("/admin/") || path.startsWith("/api/admin/");

/** The shared database (one per process, see getDb), opened only when an editor's sign-in needs counting. */
const adminDb = () => getDb(loadConfig());

/** The page counter (production only: the Upstash variables are set there). */
const counter = counterFromEnv();

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const gated = alphaGate(request);
  if (gated) return gated;
  const path = request.nextUrl.pathname;
  if (request.method === "OPTIONS" && (path === "/api/v1" || path.startsWith("/api/v1/"))) {
    return new NextResponse(null, { status: 204, headers: { ...API_HEADERS, "access-control-allow-headers": "*", "access-control-max-age": "86400" } });
  }
  if (isAdmin(path)) {
    const denied = await adminGateLimited(request, adminDb);
    if (denied) return denied;
  }
  if (counter && counts(request.method, path, request.headers)) event.waitUntil(countView(counter, path).catch(() => undefined));
  const res = NextResponse.next();
  if (isAdmin(path)) for (const [k, v] of Object.entries(ADMIN_HEADERS)) res.headers.set(k, v);
  if (process.env.SITE_STAGE === "alpha" && process.env.ALPHA_PASSWORD) res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  // Everything except built assets; the alpha gate and the admin check decide per path.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
