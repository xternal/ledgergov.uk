import type { CalculatorRates, HouseholdCalculator, TaxSeed } from "@ledger/schema";
import { taxOn } from "@ledger/engine";

/**
 * The salary check of "The Budget for your household": income tax and employees' National Insurance on a salary,
 * without and with a Budget, from the snapshot's rates (the measures file over a sourced tax seed). Used in the
 * reader's browser by BudgetSalaryCheck, where a salary typed is never sent or stored (invariant 7), and on the
 * server for the share image's example salaries. No model: the Budget's own rates, applied.
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

/** Income tax and employee National Insurance on a salary at these rates. */
export const taxPaid = (r: CalculatorRates, salary: number) => taxOn(asSeed(r), salary, { basicRatePct: r.basic_rate_pct, niMainRatePct: r.ni_main_rate_pct });

const sameRates = (a: CalculatorRates, b: CalculatorRates) => (Object.keys(a) as (keyof CalculatorRates)[]).every((k) => a[k] === b[k]);

/** The years in which the event changes a rate or threshold of income tax or employees' National Insurance. */
export const ratesChangedYears = (calc: HouseholdCalculator) => calc.years.filter((y) => !sameRates(y.pre, y.post));

/** The year the salary check opens on: the headline year if the event changes it, else the first year it changes anything. */
export function salaryCheckYear(calc: HouseholdCalculator, head: string): string {
  const changed = ratesChangedYears(calc);
  return changed.some((y) => y.year === head) ? head : (changed[0]?.year ?? head);
}

/** Change in take-home pay from income tax and National Insurance in a year, on each salary: positive is better off. */
export function salaryExamples(calc: HouseholdCalculator, year: string, salaries: readonly number[]) {
  const rates = calc.years.find((y) => y.year === year) ?? calc.years[0]!;
  return salaries.map((salary) => {
    const before = taxPaid(rates.pre, salary).total;
    const after = taxPaid(rates.post, salary).total;
    return { salary_gbp: salary, before_gbp: before, after_gbp: after, change_gbp: before - after };
  });
}
