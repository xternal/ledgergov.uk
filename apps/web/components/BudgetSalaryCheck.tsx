"use client";

import { useId, useMemo, useState } from "react";
import type { HouseholdCalculator } from "@ledger/schema";
import { ratesChangedYears, salaryCheckYear, taxPaid } from "@/lib/salary-check";

/**
 * "Your income tax and National Insurance": a salary typed here is worked out in the browser, without and with a
 * Budget, and is never sent or stored (invariant 7). No analytics on this component. The rates come from the
 * snapshot (the measures file overlaid on a sourced tax seed), so they match the measures; it needs no model, so it
 * works the same whether or not PolicyEngine has answered.
 */

const pounds = (x: number) => `£${Math.round(x).toLocaleString("en-GB")}`;
const MAX_SALARY = 10_000_000;

export function BudgetSalaryCheck({ calculator, defaultYear, eventName }: { calculator: HouseholdCalculator; defaultYear: string; eventName: string }) {
  const id = useId();
  const changed = ratesChangedYears(calculator);
  const [text, setText] = useState("");
  const [year, setYear] = useState(salaryCheckYear(calculator, defaultYear));
  const salary = Math.min(MAX_SALARY, Number(text.replace(/[^\d.]/g, "")) || 0);
  const rates = calculator.years.find((y) => y.year === year) ?? calculator.years[0]!;
  const result = useMemo(() => {
    if (!salary) return null;
    const before = taxPaid(rates.pre, salary);
    const after = taxPaid(rates.post, salary);
    return { before, after, diff: after.total - before.total };
  }, [rates, salary]);

  if (!changed.length)
    return (
      <p className="m-0 max-w-[70ch] text-muted">
        The {eventName} changes no rate or threshold of income tax or employees&apos; National Insurance in these years, so your own bill on a
        salary is the same with it as without it.
      </p>
    );

  return (
    <div className="grid max-w-[640px] gap-4 rounded-control border border-line bg-sunk/60 px-4 py-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="grid gap-1 text-label font-medium" htmlFor={`${id}-salary`}>
          Your salary before tax, £ a year
          <input
            id={`${id}-salary`}
            inputMode="numeric"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-44 rounded-control border border-line-strong bg-bg px-3 py-2 text-body font-normal tabular-nums text-ink"
          />
        </label>
        {changed.length > 1 && (
          <label className="grid gap-1 text-label font-medium" htmlFor={`${id}-year`}>
            Year
            <select id={`${id}-year`} value={year} onChange={(e) => setYear(e.target.value)} className="rounded-control border border-line-strong bg-bg px-3 py-2 text-body font-normal text-ink">
              {changed.map((y) => (
                <option key={y.year} value={y.year}>
                  {y.year}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div aria-live="polite" className="grid gap-1">
        {result ? (
          <>
            <p className="m-0 text-[22px] font-semibold tabular-nums tracking-figure">
              {Math.abs(result.diff) < 0.5 ? "No change" : `${pounds(Math.abs(result.diff))} a year ${result.diff > 0 ? "more" : "less"} in tax`}
            </p>
            <p className="m-0 text-label tabular-nums text-muted">
              In {rates.year}, income tax and National Insurance: {pounds(result.before.total)} without the {eventName}, {pounds(result.after.total)} with it.
            </p>
          </>
        ) : (
          <p className="m-0 text-label text-muted">Type a salary to see your income tax and National Insurance in {year}, without and with the {eventName}.</p>
        )}
      </div>
      <p className="m-0 text-caption text-muted">
        Worked out in your browser: what you type is never sent or stored. For an employee in {calculator.geography}, on a salary alone, at the rates
        the {eventName} sets; not tax advice.
      </p>
    </div>
  );
}
