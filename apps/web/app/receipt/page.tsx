import type { Metadata } from "next";
import { RECEIPT_EXAMPLES } from "@ledger/engine";
import { getSeed } from "@/lib/data";
import { getReceiptContext, lightPalette, receiptExamples } from "@/lib/receipt";
import {
  RECEIPT_LINE,
  RECEIPT_PATH,
  RECEIPT_TITLE,
  exampleTitle,
  receiptDescription,
  receiptExamplePath,
  receiptFaq,
  receiptMethod,
} from "@/lib/receipt-copy";
import { grouped, poundsPence } from "@/lib/format";
import { SiteHeader } from "@/components/SiteHeader";
import { JsonLd } from "@/components/JsonLd";
import { TaxReceipt } from "@/components/TaxReceipt";
import { SourcesProvider } from "@/components/ui";
import { absolute, OPEN_GRAPH, SITE_NAME } from "@/lib/site";

const TITLE = `${RECEIPT_TITLE}: what your income tax and National Insurance pay for`;

export function generateMetadata(): Metadata {
  const description = receiptDescription(getReceiptContext());
  return {
    title: `${TITLE} | ${SITE_NAME}`,
    description,
    alternates: { canonical: RECEIPT_PATH },
    openGraph: { ...OPEN_GRAPH, title: TITLE, description, type: "website", url: RECEIPT_PATH },
    twitter: { card: "summary_large_image", title: TITLE, description },
  };
}

const h2 = "m-0 text-title font-semibold";
const h3 = "m-0 text-body font-semibold text-ink";

/**
 * /receipt: "Your tax receipt". The reader's salary is worked out in their browser (components/TaxReceipt.tsx); this
 * page is static and takes no salary. Its own address, the example pages and the share cards carry none either.
 *
 * Why /receipt and not /tax/receipt: it is the "Your share" calculator's own page (the menu highlights Your share), and
 * the shortest address to share. /tax is HMRC's estimates of what a tax change raises, under Scenario.
 */
export default function ReceiptPage() {
  const seed = getSeed();
  const ctx = getReceiptContext();
  const examples = receiptExamples();
  const method = receiptMethod(ctx);
  const faq = receiptFaq(ctx);
  const url = absolute(RECEIPT_PATH);
  const description = receiptDescription(ctx);
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": url,
      url,
      name: RECEIPT_TITLE,
      headline: TITLE,
      description,
      inLanguage: "en-GB",
      isPartOf: { "@type": "WebSite", "@id": absolute("/#website"), name: SITE_NAME, url: absolute("/") },
      dateModified: seed.builtAt.slice(0, 10),
      about: { "@type": "Thing", name: `UK income tax and National Insurance, ${ctx.taxYear}` },
      mainEntity: {
        "@type": "ItemList",
        name: "Example receipts",
        numberOfItems: examples.length,
        itemListElement: examples.map(({ example }, i) => ({ "@type": "ListItem", position: i + 1, name: exampleTitle(example.salary, ctx.taxYear), url: absolute(receiptExamplePath(example.slug)) })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { name: SITE_NAME, path: "/" },
        { name: "Your share", path: "/#you" },
        { name: RECEIPT_TITLE, path: RECEIPT_PATH },
      ].map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absolute(c.path) })),
    },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ];

  return (
    <SourcesProvider sources={seed.sources}>
      <JsonLd data={structuredData} />
      <SiteHeader current="/#you" />
      <main className="mx-auto grid max-w-[1100px] grid-cols-[minmax(0,1fr)] gap-14 px-4 pb-20 pt-10 sm:px-6">
        <header className="grid max-w-[68ch] gap-4">
          <a href="/#you" className="justify-self-start text-label font-medium">
            Your share of the bill
          </a>
          <h1 className="m-0 text-[clamp(30px,4.4vw,44px)] font-semibold leading-[1.06] tracking-[-0.035em]">{RECEIPT_TITLE}</h1>
          <p className="m-0 text-lead">{RECEIPT_LINE}</p>
          <p className="m-0 text-body text-muted">
            Enter a salary to see what your income tax and National Insurance pay for in {ctx.taxYear}, line by line, and how much the state borrowed on top.
            It is an illustration: taxes go into one pot, so this is the average split, not where your own pounds went.
          </p>
        </header>

        <TaxReceipt
          ctx={ctx}
          palette={lightPalette()}
          initialSalary={seed.tax.your_share_defaults.salary_gbp}
          examples={RECEIPT_EXAMPLES.map((e) => e.salary)}
          pageUrl={url}
        />

        <section aria-labelledby="examples-h" className="grid gap-4 border-t border-line pt-8">
          <h2 id="examples-h" className={h2}>
            Example receipts
          </h2>
          <p className="m-0 max-w-[68ch] text-muted">
            Receipts for a few round salaries, each with its own page to link to. They are the site&apos;s examples, so sharing one says nothing about you.
          </p>
          <ul className="m-0 grid list-none gap-0 border-t border-line p-0 sm:grid-cols-2 sm:gap-x-10">
            {examples.map(({ example, receipt }) => (
              <li key={example.slug} className="flex items-baseline justify-between gap-4 border-b border-line py-3">
                <a href={receiptExamplePath(example.slug)} className="font-medium">
                  £{grouped(example.salary)} a year
                </a>
                <span className="text-label text-muted">
                  pays {poundsPence(receipt.tax_pence)}, plus {poundsPence(receipt.borrowed_pence)} borrowed
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="how-h" className="grid gap-6 border-t border-line pt-8">
          <h2 id="how-h" className={h2}>
            How this is worked out
          </h2>
          <div className="grid gap-x-10 gap-y-6 text-sm md:grid-cols-2">
            {method.map(({ title, text }) => (
              <div key={title} className="grid max-w-[60ch] gap-1.5">
                <h3 className={h3}>{title}</h3>
                <p className="m-0 text-muted">{text}</p>
              </div>
            ))}
          </div>
          <p className="m-0 text-muted">
            Every line links to its part of <a href="/#statement">the Statement</a>. See <a href="/method">how the numbers are made</a> and{" "}
            <a href="/tax">what a change to each tax would raise</a>.
          </p>
        </section>

        <section aria-labelledby="faq-h" className="grid gap-5 border-t border-line pt-8">
          <h2 id="faq-h" className={h2}>
            Questions
          </h2>
          <div className="grid gap-x-10 gap-y-6 text-sm md:grid-cols-2">
            {faq.map(({ q, a }) => (
              <div key={q} className="grid max-w-[60ch] gap-1.5">
                <h3 className={h3}>{q}</h3>
                <p className="m-0 text-muted">{a}</p>
              </div>
            ))}
          </div>
          <p className="m-0 text-label text-muted">
            More in the <a href="/privacy">privacy notice</a>.
          </p>
        </section>
      </main>
    </SourcesProvider>
  );
}
