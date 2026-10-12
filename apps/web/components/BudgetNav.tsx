import { getHouseholdSnapshots, getScorecards } from "@/lib/data";
import { householdPath } from "@/lib/household";
import { scorecardPath } from "@/lib/scorecard";
import { NavLinks, type NavLink } from "./NavLinks";

/** The Budget pages, in reading order. Each highlights itself (aria-current="page"), so a reader always knows which one is open. */
export const BUDGET_PAGES: NavLink[] = [
  { href: "/budget", label: "Promises to watch" },
  { href: "/budget/how-it-works", label: "How a Budget works" },
  { href: "/budget/leaks", label: "Trailed before the Budget" },
  { href: "/budget/predict", label: "Predict the Budget" },
];

const SCORECARD_PREFIX = "/budget/scorecard/";
const HOUSEHOLD_PREFIX = "/budget/household/";

/**
 * The newest fiscal event's own pages, with the words /budget uses for them: the Treasury's table line by line, and what
 * it does to households (this Budget's once it is read, until then last year's).
 */
function eventPages(): NavLink[] {
  const scorecard = getScorecards()[0];
  const household = getHouseholdSnapshots()[0];
  return [
    ...(scorecard ? [{ href: scorecardPath(scorecard), label: "Line by line" }] : []),
    ...(household ? [{ href: householdPath(household), label: "Household by household" }] : []),
  ];
}

/**
 * min-w-0: inside a grid the menu scrolls sideways rather than widening the column to fit every link (phones).
 * An earlier event's scorecard or household page highlights the item for its kind of page, as a promise card highlights
 * "Promises".
 */
export function BudgetNav({ current }: { current: string }) {
  const links = [...BUDGET_PAGES, ...eventPages()];
  const sectionOf = (prefix: string) => links.find((l) => l.href.startsWith(prefix))?.href;
  const here =
    (current.startsWith(SCORECARD_PREFIX) && sectionOf(SCORECARD_PREFIX)) || (current.startsWith(HOUSEHOLD_PREFIX) && sectionOf(HOUSEHOLD_PREFIX)) || current;
  return (
    <div className="-mx-2.5 flex min-w-0 border-b border-line pb-2">
      <NavLinks links={links} current={here} label="Budget pages" />
    </div>
  );
}
