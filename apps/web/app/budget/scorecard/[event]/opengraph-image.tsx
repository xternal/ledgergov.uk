import { effectOf } from "@ledger/schema";
import { getScorecards } from "@/lib/data";
import { OG } from "@/lib/og";
import { figuresImage } from "@/lib/method-og";
import { gbpMShort, scorecardCopy } from "@/lib/scorecard";

export const alt = "LedgerGov.UK: a Budget's measures from the Treasury's own table, with what they raise and what they cost in the last year it costs";
export const size = OG.size;
export const contentType = "image/png";

export function generateStaticParams() {
  return getScorecards().map((s) => ({ event: s.id }));
}

/** The substance: what the measures raise and cost in the headline year, and the net, all from the Treasury's table. */
export default async function Image({ params }: { params: Promise<{ event: string }> }) {
  const { event } = await params;
  const s = getScorecards().find((x) => x.id === event)!;
  const { summary } = scorecardCopy(s);
  const net = effectOf(summary.total);
  return figuresImage({
    kicker: s.name,
    title: "Every measure, and what it raises or costs",
    figures: [
      { value: gbpMShort(summary.raises.m), label: `raised by ${summary.raises.count} measures in ${summary.year}` },
      { value: gbpMShort(summary.costs.m), label: `cost by ${summary.costs.count} measures in ${summary.year}` },
      { value: gbpMShort(summary.total), label: net === "nil" ? "no net effect" : `${net === "raises" ? "raised" : "cost"}, net` },
    ],
    foot: `HM Treasury, Table ${s.table.number}: all ${summary.lines} lines, each linked to its page`,
  });
}
