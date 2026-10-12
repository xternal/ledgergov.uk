import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RECEIPT_EXAMPLES } from "@ledger/engine";
import { getSeed } from "@/lib/data";
import { exampleReceipt, getReceiptContext } from "@/lib/receipt";
import { RECEIPT_PATH, RECEIPT_TITLE, borrowedText, exampleSentence, exampleTitle, illustrationText, receiptExamplePath } from "@/lib/receipt-copy";
import { grouped, poundsPence } from "@/lib/format";
import { SiteHeader } from "@/components/SiteHeader";
import { JsonLd } from "@/components/JsonLd";
import { ReceiptPaper, ReceiptTable, Sourced } from "@/components/ReceiptPaper";
import { ShareBar } from "@/components/ShareBar";
import { SourcesProvider } from "@/components/ui";
import { absolute, OPEN_GRAPH, SITE_NAME } from "@/lib/site";

type Props = { params: Promise<{ example: string }> };

/**
 * /receipt/25k, /35k, /50k, /100k: the site's own example receipts, pre-rendered, each with its own share card, so a
 * shared link shows a receipt without carrying anyone's salary. Only these exist: any other address is a 404, and the
 * address is never read as a number.
 */
export function generateStaticParams() {
  return RECEIPT_EXAMPLES.map((e) => ({ example: e.slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = exampleReceipt((await params).example);
  if (!found) return {};
  const ctx = getReceiptContext();
  const title = exampleTitle(found.example.salary, ctx.taxYear);
  const description = exampleSentence(ctx, found.example.salary, found.receipt);
  const path = receiptExamplePath(found.example.slug);
  return {
    title: `${title} | ${SITE_NAME}`,
    description,
    alternates: { canonical: path },
    openGraph: { ...OPEN_GRAPH, title, description, type: "article", url: path, section: RECEIPT_TITLE },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ExampleReceiptPage({ params }: Props) {
  const found = exampleReceipt((await params).example);
  if (!found) notFound();
  const { example, receipt } = found;
  const seed = getSeed();
  const ctx = getReceiptContext();
  const title = exampleTitle(example.salary, ctx.taxYear);
  const path = receiptExamplePath(example.slug);
  const url = absolute(path);
  const others = RECEIPT_EXAMPLES.filter((e) => e.slug !== example.slug);
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": url,
      url,
      name: title,
      description: exampleSentence(ctx, example.salary, receipt),
      inLanguage: "en-GB",
      isPartOf: { "@type": "WebSite", "@id": absolute("/#website"), name: SITE_NAME, url: absolute("/") },
      dateModified: seed.builtAt.slice(0, 10),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { name: SITE_NAME, path: "/" },
        { name: RECEIPT_TITLE, path: RECEIPT_PATH },
        { name: `£${grouped(example.salary)} a year`, path },
      ].map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absolute(c.path) })),
    },
  ];

  return (
    <SourcesProvider sources={seed.sources}>
      <JsonLd data={structuredData} />
      <SiteHeader current="/#you" />
      <main className="mx-auto grid max-w-[1100px] grid-cols-[minmax(0,1fr)] gap-12 px-4 pb-20 pt-10 sm:px-6">
        <header className="grid max-w-[68ch] gap-4">
          <a href={RECEIPT_PATH} className="justify-self-start text-label font-medium">
            {RECEIPT_TITLE}
          </a>
          <h1 className="m-0 text-[clamp(30px,4.4vw,44px)] font-semibold leading-[1.06] tracking-[-0.035em]">{title}</h1>
          <p className="m-0 text-lead text-muted">{exampleSentence(ctx, example.salary, receipt)}</p>
          <p className="m-0 text-label text-muted">
            One of the site&apos;s example receipts. {illustrationText}
          </p>
        </header>

        {/* Phones: the figures, the receipt, then sharing. Wider screens: figures and sharing on the left, the receipt on the right. */}
        <div className="grid items-start gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,460px)] md:grid-rows-[auto_1fr] md:gap-x-12">
          <div className="grid content-start gap-6 md:col-start-1 md:row-start-1">
            <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-5">
              <div className="grid gap-0.5">
                <dt className="text-label text-muted">You pay a year</dt>
                <dd className="m-0 text-[26px] font-semibold tracking-[var(--tracking-figure)]">
                  <Sourced quality={ctx.taxQuality} text={`Income tax plus National Insurance on £${grouped(example.salary)}, at ${ctx.taxYear} rates.`} sources={ctx.taxSources} align="start">
                    {poundsPence(receipt.tax_pence)}
                  </Sourced>
                </dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-label text-muted">Borrowed on top</dt>
                <dd className="m-0 text-[26px] font-semibold tracking-[var(--tracking-figure)] text-debt-ink">
                  <Sourced quality={ctx.borrowing.quality} text={borrowedText(ctx)} sources={[ctx.borrowing.source]}>
                    {poundsPence(receipt.borrowed_pence)}
                  </Sourced>
                </dd>
              </div>
            </dl>
            <p className="m-0">
              <a href={RECEIPT_PATH} className="inline-flex min-h-11 items-center rounded-control bg-ink px-5 text-[15px] font-semibold text-bg no-underline hover:opacity-90">
                Work out your own receipt
              </a>
            </p>
            <p className="m-0 text-label text-muted">Your salary stays on your device: the calculator never sends it.</p>
          </div>

          <div className="grid gap-4 md:col-start-2 md:row-span-2 md:row-start-1">
            <div className="rounded-panel bg-sunk px-3 py-6 sm:px-6">
              <ReceiptPaper ctx={ctx} receipt={receipt} heading={`Tax receipt on £${grouped(example.salary)}`} headingId="receipt-h" />
            </div>
            <ReceiptTable ctx={ctx} receipt={receipt} id="receipt-table" />
          </div>

          <div className="grid content-start gap-8 md:col-start-1 md:row-start-2">
            <div className="grid gap-2">
              <h2 className="m-0 text-body font-semibold">Share this example</h2>
              <ShareBar url={url} title={`${title} | LedgerGov.UK`} text={exampleSentence(ctx, example.salary, receipt)} label="Share this example" />
            </div>
            <nav aria-label="Other example receipts" className="grid gap-1.5">
              <span className="text-label text-muted">Other examples</span>
              <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
                {others.map((e) => (
                  <li key={e.slug}>
                    <a href={receiptExamplePath(e.slug)}>£{grouped(e.salary)} a year</a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </main>
    </SourcesProvider>
  );
}
