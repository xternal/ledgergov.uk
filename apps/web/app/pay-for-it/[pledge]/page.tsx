import { notFound, redirect } from "next/navigation";
import { ALL_BORROWED } from "@ledger/engine";
import { getPayData } from "@/lib/pay-for-it";
import { PAY_PATH } from "@/lib/pay-for-it-view";

type Props = { params: Promise<{ pledge: string }> };

export function generateStaticParams() {
  return getPayData().pledges.map((p) => ({ pledge: p.id }));
}
export const dynamicParams = false;

/** A plan's link cut short after the pledge: open that pledge, with nothing chosen yet (all borrowed). */
export default async function PledgeOnly({ params }: Props) {
  const { pledge } = await params;
  if (!getPayData().pledges.some((p) => p.id === pledge)) notFound();
  redirect(`${PAY_PATH}/${pledge}/${ALL_BORROWED}`);
}
