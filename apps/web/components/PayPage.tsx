import type { PayPlan } from "@ledger/engine";
import type { Source } from "@ledger/schema";
import type { PayData } from "@/lib/pay-for-it-view";
import { PAY_COPY as C, PAY_FAQ, PAY_TITLE, payHowItWorks } from "@/lib/pay-for-it-copy";
import { SiteHeader } from "./SiteHeader";
import { PayForIt } from "./PayForIt";
import { SourcesProvider } from "./ui";

/**
 * The Pay for it page around the tool: the menu (Promises highlighted: every
 * pledge here is a promise card), the heading, the tool, then how it works and
 * questions in plain text for readers, search engines and AI assistants. The
 * same for /pay-for-it and a shared plan's own link.
 */
export function PayPage({ data, initial, shared, siteUrl, sources }: { data: PayData; initial: PayPlan; shared: boolean; siteUrl: string; sources: Source[] }) {
  const taxYear = data.taxes[0]?.period ?? data.year;
  return (
    <SourcesProvider sources={sources}>
      <SiteHeader current="/promises" />
      <main className="mx-auto grid max-w-[1200px] grid-cols-[minmax(0,1fr)] gap-12 px-4 pb-20 pt-10 sm:px-6">
        <header className="grid max-w-[68ch] gap-4">
          <nav aria-label="Breadcrumb" className="text-label">
            <a href="/promises" className="font-medium no-underline">
              Promises
            </a>
            <span aria-hidden className="px-1.5 text-muted">
              ›
            </span>
            <span aria-current="page" className="text-muted">
              {PAY_TITLE}
            </span>
          </nav>
          <h1 className="m-0 text-[clamp(32px,4.6vw,48px)] font-semibold leading-[1.04] tracking-[-0.035em]">{PAY_TITLE}</h1>
          <p className="m-0 text-lead text-muted">{C.lead}</p>
          {shared && <p className="m-0 rounded-control bg-sunk px-3.5 py-2.5 text-label">{C.shared}</p>}
        </header>

        <PayForIt data={data} initial={initial} siteUrl={siteUrl} />

        <section aria-labelledby="pay-how-h" className="grid gap-6 border-t border-line pt-8">
          <h2 id="pay-how-h" className="m-0 text-title font-semibold">
            How it works
          </h2>
          <div className="grid gap-x-10 gap-y-6 text-sm md:grid-cols-2">
            {payHowItWorks({ year: data.year, taxYear, hmrcPublished: data.hmrcPublished }).map(({ h, p }) => (
              <div key={h} className="grid max-w-[60ch] gap-1.5">
                <h3 className="m-0 text-body font-semibold text-ink">{h}</h3>
                <p className="m-0 text-muted">{p}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="pay-faq-h" className="grid gap-6 border-t border-line pt-8">
          <h2 id="pay-faq-h" className="m-0 text-title font-semibold">
            Questions
          </h2>
          <div className="grid gap-x-10 gap-y-6 text-sm md:grid-cols-2">
            {PAY_FAQ.map(({ q, a }) => (
              <div key={q} className="grid max-w-[60ch] gap-1.5">
                <h3 className="m-0 text-body font-semibold text-ink">{q}</h3>
                <p className="m-0 text-muted">{a}</p>
              </div>
            ))}
          </div>
          <p className="m-0 text-muted">
            Every pledge is a <a href="/promises">promise card</a>; try several changes together in <a href="/#scenario">the sandbox</a>, see{" "}
            <a href="/tax">what each tax change raises</a>, and <a href="/method">how the numbers are made</a>.
          </p>
        </section>
      </main>
    </SourcesProvider>
  );
}
