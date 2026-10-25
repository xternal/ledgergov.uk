import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { FAMILY, THIS_SITE } from "@/components/siteLinks";
import { SITE_NAME } from "@/lib/site";

const NOT_FOUND_TITLE = "This page isn't here";
const NOT_FOUND_DESCRIPTION = "Page not found on LedgerGov.UK. The link may be old or mistyped: start from the home page or the promises.";

/**
 * The family 404 (Pavel, 23 October 2026): every unknown address and every notFound() on the site. Next.js answers it
 * with status 404; it is never indexed and has no canonical or sitemap entry. The family list is FAMILY, the same as
 * the switcher on the logo, in the same order, so the two cannot drift. Server-rendered, no JavaScript of its own; the
 * root layout adds the footer (Made by, Buy me a matcha).
 */
export const metadata: Metadata = {
  title: `Page not found | ${SITE_NAME}`,
  description: NOT_FOUND_DESCRIPTION,
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid max-w-[1200px] grid-cols-[minmax(0,1fr)] gap-10 px-4 pb-20 pt-10 sm:px-6">
        <div className="grid max-w-[62ch] gap-3">
          <h1 className="m-0 text-[clamp(30px,4.4vw,44px)] font-semibold leading-[1.06] tracking-[-0.035em]">{NOT_FOUND_TITLE}</h1>
          <p className="m-0 text-lead text-muted">The link may be old or mistyped.</p>
          <p className="m-0 flex flex-wrap gap-x-6 gap-y-2 text-body font-medium">
            <a href="/">LedgerGov.UK home page</a>
            <a href="/promises">Promises</a>
          </p>
        </div>

        <section aria-labelledby="family-h" className="grid gap-4 border-t border-line pt-8">
          <div className="grid max-w-[62ch] gap-1">
            <h2 id="family-h" className="m-0 text-title font-semibold">
              The family
            </h2>
            <p className="m-0 text-muted">Public money and promises, one ledger per country or place, on the same open engine.</p>
          </div>
          <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {FAMILY.map((s) => {
              const here = s.name === THIS_SITE;
              return (
                <li key={s.name}>
                  <a
                    href={here ? "/" : s.href}
                    aria-current={here ? "page" : undefined}
                    className={`grid h-full gap-1 rounded-panel p-4 text-ink no-underline shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-sunk ${here ? "bg-sunk" : ""}`}
                  >
                    <span className="text-body font-semibold">
                      {s.name}
                      {here && <span className="ml-2 text-caption font-normal text-muted">You are here</span>}
                    </span>
                    <span className="break-words text-caption text-muted">{s.href.replace(/^https:\/\//, "")}</span>
                    <span className="text-label">{s.about}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </>
  );
}
