import { getLeaks } from "@/lib/data";
import { OG } from "@/lib/og";
import { figuresImage } from "@/lib/method-og";
import { BUDGET } from "@/lib/budget";
import { LEAK_STATUS, LEAK_TRACKER_OPENS, leakCounts } from "@/lib/leaks";
import { todayIso } from "@/lib/promises";

export const alt = "LedgerGov.UK: measures trailed in the press before the Budget, each with its source and status, kept apart from what the Budget documents contain";
export const size = OG.size;
export const contentType = "image/png";
/** Same as the page: hourly, so new entries and Budget day show without a deploy. */
export const revalidate = 3600;

/** "19 Oct": short enough for one line at the figure size. */
const dayMonth = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

export default async function Image() {
  const leaks = getLeaks();
  const counts = leakCounts(leaks);
  const after = todayIso() >= BUDGET.date;
  const withCost = leaks.filter((l) => l.estimated_cost).length;
  const figures = leaks.length
    ? [
        { value: String(counts.trailed + counts.confirmed), label: after ? "trailed or confirmed, not in the Budget documents" : "trailed or confirmed before the Budget" },
        ...(after ? [{ value: String(counts.announced), label: LEAK_STATUS.announced.label.toLowerCase() }] : []),
        { value: String(withCost), label: "with an estimated cost and its source" },
      ]
    : [
        { value: dayMonth(LEAK_TRACKER_OPENS), label: "the tracker fills from" },
        { value: dayMonth(BUDGET.date), label: "Budget day" },
      ];
  return figuresImage({
    kicker: BUDGET.name,
    title: after ? "What was trailed, and what the Budget did" : "Trailed before the Budget",
    figures,
    foot: "Every measure briefed to the press, with the outlet, the date and the original report",
  });
}
