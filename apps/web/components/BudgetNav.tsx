import { NavLinks, type NavLink } from "./NavLinks";

/** The Budget pages, in reading order. Each highlights itself (aria-current="page"), so a reader always knows which one is open. */
export const BUDGET_PAGES: NavLink[] = [
  { href: "/budget", label: "Promises to watch" },
  { href: "/budget/how-it-works", label: "How a Budget works" },
  { href: "/budget/leaks", label: "Trailed before the Budget" },
  { href: "/budget/predict", label: "Predict the Budget" },
];

/** min-w-0: inside a grid the menu scrolls sideways rather than widening the column to fit every link (phones). */
export function BudgetNav({ current }: { current: string }) {
  return (
    <div className="-mx-2.5 flex min-w-0 border-b border-line pb-2">
      <NavLinks links={BUDGET_PAGES} current={current} label="Budget pages" />
    </div>
  );
}
