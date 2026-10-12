import { notFound } from "next/navigation";
import { RECEIPT_EXAMPLES } from "@ledger/engine";
import { OG } from "@/lib/og";
import { exampleReceipt, getReceiptContext } from "@/lib/receipt";
import { RECEIPT_EXAMPLE_ALT, receiptExampleImage } from "@/lib/receipt-og";

export const alt = RECEIPT_EXAMPLE_ALT;
export const size = OG.size;
export const contentType = "image/png";

/** Only the site's fixed examples exist; any other address is a 404 (never a salary read from the address). */
export function generateStaticParams() {
  return RECEIPT_EXAMPLES.map((e) => ({ example: e.slug }));
}
export const dynamicParams = false;

export default async function Image({ params }: { params: Promise<{ example: string }> }) {
  const found = exampleReceipt((await params).example);
  if (!found) notFound();
  return receiptExampleImage(getReceiptContext(), found.example.salary, found.receipt);
}
