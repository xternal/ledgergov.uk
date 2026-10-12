import { OG } from "@/lib/og";
import { getPayData } from "@/lib/pay-for-it";
import { PAY_INDEX_ALT, payIndexImage } from "@/lib/pay-for-it-og";

export const alt = PAY_INDEX_ALT;
export const size = OG.size;
export const contentType = "image/png";

export default async function Image() {
  return payIndexImage(getPayData());
}
