import { OG } from "@/lib/og";
import { getReceiptContext } from "@/lib/receipt";
import { RECEIPT_PAGE_ALT, receiptPageImage } from "@/lib/receipt-og";

export const alt = RECEIPT_PAGE_ALT;
export const size = OG.size;
export const contentType = "image/png";

export default async function Image() {
  return receiptPageImage(getReceiptContext());
}
