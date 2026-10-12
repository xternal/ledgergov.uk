import { OG } from "@/lib/og";
import { methodImage } from "@/lib/method-og";
import { NUMBERS_TITLE } from "@/lib/method-copy";

export const alt = "LedgerGov.UK's most read pages: one count per page per day, nothing about the reader, the totals public";
export const size = OG.size;
export const contentType = "image/png";

/** What the count is, not today's figures: the image is made once, when the site is built. */
export default async function Image() {
  return methodImage({
    title: NUMBERS_TITLE,
    figures: [
      { value: "1", label: "count per page per day" },
      { value: "0", label: "cookies, scripts or IP addresses" },
      { value: "30", label: "days of totals, public as JSON" },
    ],
    foot: "Which pages readers open most, over the last 7 and 30 days",
  });
}
