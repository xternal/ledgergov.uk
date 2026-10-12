import type { Metadata } from "next";
import { NUMBERS_PATH, NUMBERS_TOP, NUMBERS_WINDOWS, topPages, totalViews, VIEWS_PATH } from "@ledger/server/views";
import { SiteHeader } from "@/components/SiteHeader";
import { MethodNav } from "@/components/MethodNav";
import { JsonLd } from "@/components/JsonLd";
import { NUMBERS_DESCRIPTION, NUMBERS_TITLE } from "@/lib/method-copy";
import { getViews, pageLabel } from "@/lib/numbers";
import { grouped } from "@/lib/format";
import { absolute, OPEN_GRAPH, SITE_NAME } from "@/lib/site";

/** Asks the counter again at most every ten minutes (VIEWS_CACHE_SECONDS). */
export const revalidate = 600;

export const metadata: Metadata = {
  title: `${NUMBERS_TITLE} | LedgerGov.UK`,
  description: NUMBERS_DESCRIPTION,
  alternates: { canonical: NUMBERS_PATH },
  openGraph: { ...OPEN_GRAPH, title: NUMBERS_TITLE, description: NUMBERS_DESCRIPTION, type: "article", url: NUMBERS_PATH },
  twitter: { card: "summary_large_image", title: NUMBERS_TITLE, description: NUMBERS_DESCRIPTION },
};

const h2 = "m-0 text-title font-semibold";
const views = (n: number) => `${grouped(n)} ${n === 1 ? "view" : "views"}`;

/**
 * /method/numbers: which pages readers open most, over the last 7 and 30 days, from the site's own count (one number
 * per page per day, nothing about the reader; @ledger/server/views). The daily totals are public at /views.json.
 */
export default async function NumbersPage() {
  const state = await getViews();
  const file = state.kind === "ready" ? state.file : null;
  const longest = Math.max(...NUMBERS_WINDOWS);
  const total = file ? totalViews(file, longest) : 0;
  const pages = file ? topPages(file, longest).length : 0;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${SITE_NAME}: page views per page per day`,
    description: NUMBERS_DESCRIPTION,
    url: absolute(NUMBERS_PATH),
    inLanguage: "en-GB",
    isAccessibleForFree: true,
    creator: { "@type": "Organization", "@id": absolute("/#org"), name: SITE_NAME, url: absolute("/") },
    distribution: [{ "@type": "DataDownload", name: VIEWS_PATH, encodingFormat: "application/json", contentUrl: absolute(VIEWS_PATH) }],
  };

  return (
    <>
      <JsonLd data={structuredData} />
      <SiteHeader current="/method" />
      <main className="mx-auto grid max-w-[1200px] grid-cols-[minmax(0,1fr)] gap-10 px-4 pb-20 pt-8 sm:px-6">
        <MethodNav current="/method/numbers" />
        <div className="grid max-w-[70ch] gap-3">
          <h1 className="m-0 text-[clamp(30px,4.4vw,44px)] font-semibold leading-[1.06] tracking-[-0.035em]">{NUMBERS_TITLE}</h1>
          {file && total > 0 ? (
            <p className="m-0 text-lead text-muted">
              <b className="font-semibold text-ink">{views(total)}</b> in the last {longest} days, across {grouped(pages)} pages. We count one number per page
              per day, and nothing about who read it.
            </p>
          ) : (
            <p className="m-0 text-lead text-muted">
              {state.kind === "unavailable"
                ? "The count cannot be read just now. Try again in a few minutes."
                : state.kind === "not_connected"
                  ? "Counting has not started here: this copy of the site has no counter connected."
                  : "Counting has just started: the first readers' visits will show here within ten minutes."}
            </p>
          )}
          <p className="m-0 text-muted">
            The daily totals are public: <a href={VIEWS_PATH}>{VIEWS_PATH}</a>, the last 30 days by page, updated every ten minutes.
          </p>
        </div>

        {file && total > 0 && (
          <div className="grid gap-10 border-t border-line pt-10 lg:grid-cols-2">
            {NUMBERS_WINDOWS.map((days) => {
              const top = topPages(file, days).slice(0, NUMBERS_TOP);
              const id = `last-${days}`;
              return (
                <section key={days} aria-labelledby={`${id}-h`} className="grid content-start gap-4">
                  <h2 id={`${id}-h`} className={h2}>
                    Last {days} days
                  </h2>
                  <table className="w-full border-collapse text-sm">
                    <caption className="sr-only">
                      The {top.length} most read pages over the last {days} days, with how many times each was opened
                    </caption>
                    <thead>
                      <tr className="border-b border-line text-left text-label text-muted">
                        <th scope="col" className="w-8 py-2 pr-2 font-medium">
                          #
                        </th>
                        <th scope="col" className="py-2 pr-4 font-medium">
                          Page
                        </th>
                        <th scope="col" className="py-2 text-right font-medium">
                          Views
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {top.map((p, i) => (
                        <tr key={p.path} className="border-b border-line align-top">
                          <td className="py-2 pr-2 tabular-nums text-muted">{i + 1}</td>
                          <td className="py-2 pr-4">
                            <a href={p.path} className="font-medium">
                              {pageLabel(p.path)}
                            </a>
                            <span className="block break-all text-caption text-muted">{p.path}</span>
                          </td>
                          <td className="py-2 text-right tabular-nums">{grouped(p.views)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              );
            })}
          </div>
        )}

        <section aria-labelledby="how-h" className="grid max-w-[70ch] gap-4 border-t border-line pt-10">
          <h2 id="how-h" className={h2}>
            How it is counted
          </h2>
          <ul className="m-0 grid list-disc gap-2 pl-5">
            <li>
              Each time a reader opens one of the site&apos;s pages, that page&apos;s count for the day goes up by one. Days run midnight to midnight UTC;
              today&apos;s is still counting.
            </li>
            <li>
              Search engines and other crawlers, link previews, AI fetchers and pages a browser loads ahead of a click are not counted. Nor are a
              reader&apos;s own links, such as their Budget predictions, so their codes never appear here.
            </li>
            <li>
              The count keeps the page&apos;s address and the date, nothing else: no IP address, cookie, device, browser, country, referrer or time of day.
              It runs on our server, so there is no analytics script in your browser.
            </li>
            <li>
              The counts are kept by Upstash, which never sees anything about you. See the <a href="/privacy#services">privacy notice</a>.
            </li>
          </ul>
        </section>
      </main>
    </>
  );
}
