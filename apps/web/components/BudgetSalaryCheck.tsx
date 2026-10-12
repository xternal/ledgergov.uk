"use client";

import { useId, useMemo, useState } from "react";
import type { CalculatorRates, HouseholdCalculator, TaxSeed } from "@ledger/schema";
import { taxOn } from "@ledger/engine";

/**
 * "Your income tax and National Insurance": a salary typed here is worked out in the browser, without and with a
 * Budget, and is never sent or stored (invariant 7). No analytics on this component. The rates come from the
 * snapshot (the measures file overlaid on the newest sourced tax seed), so they match the modelled measures.
 */

/** taxOn reads a tax seed; the snapshot gives the same figures flat. */
function asSeed(r: CalculatorRates): TaxSeed {
  return {
    meta: { country: "UK", tax_year: "", geography: "", quality: "sourced", method_note: "From the Budget household snapshot." },
    income_tax: {
      personal_allowance_gbp: r.personal_allowance_gbp,
      allowance_taper_threshold_gbp: r.allowance_taper_threshold_gbp,
      allowance_taper_rate: r.allowance_taper_rate,
      basic_band_gbp: r.basic_band_gbp,
      additional_threshold_gbp: r.additional_threshold_gbp,
      basic_rate_lever: "",
      higher_rate_pct: r.higher_rate_pct,
      additional_rate_pct: r.additional_rate_pct,
    },
    employee_ni: { primary_threshold_gbp: r.ni_primary_threshold_gbp, upper_earnings_limit_gbp: r.ni_upper_earnings_limit_gbp, main_rate_lever: "", upper_rate_pct: r.ni_upper_rate_pct },
    your_share_defaults: { salary_gbp: 0 },
  };
}

const paid = (r: CalculatorRates, salary: number) => taxOn(asSeed(r), salary, { basicRatePct: r.basic_rate_pct, niMainRatePct: r.ni_main_rate_pct });
const same = (a: CalculatorRates, b: CalculatorRates) => (Object.keys(a) as (keyof CalculatorRates)[]).every((k) => a[k] === b[k]);
const pounds = (x: number) => `£${Math.round(x).toLocaleString("en-GB")}`;
const MAX_SALARY = 10_000_000;

export function BudgetSalaryCheck({ calculator, defaultYear, eventName }: { calculator: HouseholdCalculator; defaultYear: string; eventName: string }) {
  const id = useId();
  const changed = calculator.years.filter((y) => !same(y.pre, y.post));
  const [text, setText] = useState("");
  const [year, setYear] = useState(changed.some((y) => y.year === defaultYear) ? defaultYear : (changed[0]?.year ?? defaultYear));
  const salary = Math.min(MAX_SALARY, Number(text.replace(/[^\d.]/g, "")) || 0);
  const rates = calculator.years.find((y) => y.year === year) ?? calculator.years[0]!;
  const result = useMemo(() => {
    if (!salary) return null;
    const before = paid(rates.pre, salary);
    const after = paid(rates.post, salary);
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
