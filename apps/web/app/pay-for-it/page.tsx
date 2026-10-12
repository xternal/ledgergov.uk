import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { PayPage } from "@/components/PayPage";
import { getSeed } from "@/lib/data";
import { getPayData, payJsonLd } from "@/lib/pay-for-it";
import { FIRST_PLEDGE, PAY_PATH } from "@/lib/pay-for-it-view";
import { PAY_SEO_TITLE, PAY_SHARE_TITLE, payDescription } from "@/lib/pay-for-it-copy";
import { OPEN_GRAPH, SITE_NAME, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: `${PAY_SEO_TITLE} | ${SITE_NAME}`,
  description: payDescription,
  alternates: { canonical: PAY_PATH },
  openGraph: { ...OPEN_GRAPH, title: PAY_SHARE_TITLE, description: payDescription, type: "website", url: PAY_PATH },
  twitter: { card: "summary_large_image", title: PAY_SHARE_TITLE, description: payDescription },
};

/**
 * /pay-for-it: pick a costed pledge (the £2 bus cap first) and pay for it with
 * a tax, a cut or borrowing. Static: the plan is worked out in the browser.
 */
export default function PayForItPage() {
  return (
    <>
      <JsonLd data={payJsonLd()} />
      <PayPage data={getPayData()} initial={{ pledge_id: FIRST_PLEDGE, tax: null, cut: null }} shared={false} siteUrl={siteUrl()} sources={getSeed().sources} />
    </>
  );
}
