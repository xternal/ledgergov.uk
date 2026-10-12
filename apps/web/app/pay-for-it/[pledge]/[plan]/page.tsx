import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PayPage } from "@/components/PayPage";
import { getSeed } from "@/lib/data";
import { sharedPlan } from "@/lib/pay-for-it";
import { planDescription, planPath, planTitle } from "@/lib/pay-for-it-view";
import { OPEN_GRAPH, SITE_NAME, siteUrl } from "@/lib/site";

type Props = { params: Promise<{ pledge: string; plan: string }> };

/**
 * A plan's own link (/pay-for-it/<pledge>/<plan>): the plan is in the address
 * (lever or line ids and shares, nothing personal), so the page needs no
 * database. Each is rendered on its first visit and kept until the next deploy;
 * none at build time.
 */
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pledge, plan } = await params;
  const s = sharedPlan(pledge, plan);
  if (!s) return { title: `Plan not found | ${SITE_NAME}`, robots: { index: false } };
  const title = planTitle(s.data, s.result);
  const description = planDescription(s.data, s.result);
  const path = planPath(s.plan);
  return {
    title: `${title} | ${SITE_NAME}`,
    description,
    alternates: { canonical: path },
    // A reader's own sum, not a page for search: previews yes, indexing no (as /s/<code> and shared predictions).
    openGraph: { ...OPEN_GRAPH, title, description, type: "article", url: path },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: false },
  };
}

export default async function SharedPlanPage({ params }: Props) {
  const { pledge, plan } = await params;
  const s = sharedPlan(pledge, plan);
  if (!s) notFound();
  return <PayPage data={s.data} initial={s.plan} shared siteUrl={siteUrl()} sources={getSeed().sources} />;
}
