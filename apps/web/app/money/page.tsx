import type { Metadata } from "next";
import { getSeed } from "@/lib/data";
import { gbpBn } from "@/lib/format";
import { absolute, MAKER, OPEN_GRAPH, SITE_NAME } from "@/lib/site";
import { JsonLd } from "@/components/JsonLd";
import { MoneyLedger } from "@/components/Ledger";

/**
 * Money: where the year's public money came from and went, the sandbox that changes it, and each household's share.
 * These were the home page's first sections until 23 October 2026; old links to them (/#statement, /#scenario, /#you)
 * open here.
 */
function words() {
  const { statement } = getSeed();
  const total = (xs: { bn: number }[]) => xs.reduce((a, l) => a + l.bn, 0);
  const spent = total(statement.spending);
  const income = total(statement.receipts);
  const title = `Where ${gbpBn(spent)} of UK public money went, and where it came from, ${statement.meta.fiscal_year}`;
  const description = `Taxes and other income covered ${gbpBn(income)}; the other ${gbpBn(spent - income)} was borrowed. Every line has its official source. Move a tax or a spending line in the sandbox and see what it does to the borrowing, and see your household's share.`;
  return { title, description };
}

export function generateMetadata(): Metadata {
  const { title, description } = words();
  return {
    title: `${title} | LedgerGov.UK`,
    description,
    alternates: { canonical: "/money" },
    openGraph: { ...OPEN_GRAPH, title, description, type: "article", url: "/money" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function MoneyPage() {
  const seed = getSeed();
  const { title, description } = words();
  const { meta } = seed.statement;
  const [start] = meta.fiscal_year.split("-");
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: title,
          description,
          url: absolute("/money"),
          inLanguage: "en-GB",
          isAccessibleForFree: true,
          license: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
          creator: { "@type": "Organization", "@id": absolute("/#org"), name: SITE_NAME, url: absolute("/") },
          author: { "@type": "Person", name: MAKER.name, url: MAKER.url },
          temporalCoverage: `${start}-04-01/${Number(start) + 1}-03-31`,
          spatialCoverage: { "@type": "Place", name: "United Kingdom" },
          isBasedOn: seed.sources.map((s) => s.url),
          dateModified: seed.builtAt.slice(0, 10),
        }}
      />
      <MoneyLedger seed={seed} />
    </>
  );
}
