import { OG } from "@/lib/og";
import { sharedPlan } from "@/lib/pay-for-it";
import { planAlt } from "@/lib/pay-for-it-view";
import { planImage, plainPayImage } from "@/lib/pay-for-it-og";

export const contentType = "image/png";

export function generateStaticParams() {
  return [];
}

/** One image per plan, with alt text that says what it shows: the pledge, who pays and the change in borrowing. */
export function generateImageMetadata({ params }: { params: { pledge: string; plan: string } }) {
  const s = sharedPlan(params.pledge, params.plan);
  return [{ id: "card", size: OG.size, contentType, alt: s ? planAlt(s.data, s.result) : "LedgerGov.UK, Pay for it" }];
}

export default async function Image({ params }: { params: Promise<{ pledge: string; plan: string }> }) {
  const { pledge, plan } = await params;
  const s = sharedPlan(pledge, plan);
  return s ? planImage(s.data, s.result) : plainPayImage();
}
