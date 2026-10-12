import type { NotModelledReason } from "@ledger/schema";

/**
 * Ready-made measures for the levers a Budget is likely to pull (docs/BUDGET_DAY.md, "The Budget for your
 * household"). `pnpm household -- templates` reads PolicyEngine's metadata once and writes
 * content/budget/household/_templates.yaml from this list: every parameter's path, unit, label and its
 * "without the Budget" value for each year, so on the night an editor copies a block, sets the source, the
 * date and the new values, and leaves the rest.
 *
 * "Without the Budget" is the value in force on 6 April of each year in PolicyEngine's current law, which
 * already has every earlier decision (thresholds frozen to April 2031, the two-child limit removed). Years
 * after the last uprating PolicyEngine knows are its own forecasts (OBR inflation): replace them with the
 * statutory uprating once it is announced. Where PolicyEngine's current law is behind the law, `pre` below
 * overrides it, with the source.
 */
export interface TemplateParameter {
  path: string;
  /** Plain words with the period: "Personal allowance, £ a year". */
  label: string;
  /** Values that replace PolicyEngine's current law for the years given (the others keep its value), with where they come from. */
  pre?: { values: Record<string, number | "unlimited">; source: string; page?: number; where?: string; note: string };
  note?: string;
}

export interface MeasureTemplate {
  id: string;
  /** The lever, as the page or an editor would name it. */
  name: string;
  parameters?: TemplateParameter[];
  not_modelled?: { reason: NotModelledReason; note: string };
  note?: string;
}

/** HMRC's schedule of fuel duty rates in force (the committed ETL edition: data/build/observations/govuk_tax_rates/). */
export const FUEL_DUTY_SOURCE = {
  id: "hmrc-fuel-duty-2026-27",
  title: "HMRC, Amended Fuel Duty rates: 2026 to 2027 (22 May 2026)",
  publisher: "HM Revenue and Customs",
  url: "https://www.gov.uk/government/publications/amended-fuel-duty-rates-for-2026-to-2027/amended-fuel-duty-rates-2026-to-2027",
  published_on: "2026-05-22",
  licence: "Open Government Licence v3.0",
};

/** Budget 2025 (HC 1492), the source of the threshold overrides: the thresholds it froze to April 2031. */
export const BUDGET_2025_SOURCE = {
  id: "budget-2025",
  title: "Budget 2025 (HC 1492)",
  publisher: "HM Treasury",
  url: "https://assets.publishing.service.gov.uk/media/6929b353345e31ab14ecf735/E03444720_Budget_2025_Web_Accessible.pdf",
  published_on: "2025-11-26",
  licence: "Open Government Licence v3.0",
};

const FROZEN_TO_2031 = (value: number) => ({
  values: { "2026-27": value, "2027-28": value, "2028-29": value, "2029-30": value, "2030-31": value },
  source: BUDGET_2025_SOURCE.id,
  page: 97,
  where: "Table 4.1, line 46",
  note: "Budget 2025 kept the personal tax thresholds and the equivalent National Insurance thresholds at their current levels until April 2031. PolicyEngine UK 2.102.3 still uprates this one from 2028-29, so the template states the law.",
});

export const MEASURE_TEMPLATES: MeasureTemplate[] = [
  // Income tax
  {
    id: "income-tax-basic-rate",
    name: "Income tax: basic rate",
    parameters: [{ path: "gov.hmrc.income_tax.rates.uk[0].rate", label: "Basic rate of income tax (England, Wales and Northern Ireland), as a fraction" }],
    note: "Scotland sets its own rates and bands (gov.hmrc.income_tax.rates.scotland.rates[…]); add them only if the Budget changes them.",
  },
  {
    id: "income-tax-higher-rate",
    name: "Income tax: higher rate",
    parameters: [{ path: "gov.hmrc.income_tax.rates.uk[1].rate", label: "Higher rate of income tax, as a fraction" }],
  },
  {
    id: "income-tax-additional-rate",
    name: "Income tax: additional rate",
    parameters: [
      { path: "gov.hmrc.income_tax.rates.uk[2].rate", label: "Additional rate of income tax, as a fraction" },
      {
        path: "gov.hmrc.income_tax.rates.uk[3].rate",
        label: "PolicyEngine's placeholder band above £10 million, as a fraction",
        note: "Set it to the same value as the additional rate, or income above £10 million keeps the old rate.",
      },
    ],
  },
  {
    id: "income-tax-personal-allowance",
    name: "Income tax: personal allowance",
    parameters: [
      { path: "gov.hmrc.income_tax.allowances.personal_allowance.amount", label: "Personal allowance, £ a year" },
      { path: "gov.hmrc.income_tax.allowances.personal_allowance.maximum_ANI", label: "Income above which the allowance is withdrawn (£1 for every £2), £ a year" },
    ],
  },
  {
    id: "income-tax-thresholds",
    name: "Income tax: higher and additional rate thresholds",
    parameters: [
      {
        path: "gov.hmrc.income_tax.rates.uk[1].threshold",
        label: "Basic rate band: taxable income (after the personal allowance) at which the higher rate starts, £ a year",
        note: "The higher rate threshold readers know (£50,270) is this plus the personal allowance.",
      },
      { path: "gov.hmrc.income_tax.rates.uk[2].threshold", label: "Taxable income at which the additional rate starts, £ a year" },
    ],
  },
  {
    id: "income-tax-dividends",
    name: "Income tax on dividends",
    parameters: [
      { path: "gov.hmrc.income_tax.rates.dividends[0].rate", label: "Dividend ordinary rate, as a fraction" },
      { path: "gov.hmrc.income_tax.rates.dividends[1].rate", label: "Dividend upper rate, as a fraction" },
      { path: "gov.hmrc.income_tax.rates.dividends[2].rate", label: "Dividend additional rate, as a fraction" },
      { path: "gov.hmrc.income_tax.allowances.dividend_allowance", label: "Dividend allowance, £ a year" },
    ],
  },
  {
    id: "income-tax-savings",
    name: "Income tax on savings income",
    parameters: [
      { path: "gov.hmrc.income_tax.rates.savings.basic", label: "Savings basic rate, as a fraction" },
      { path: "gov.hmrc.income_tax.rates.savings.higher", label: "Savings higher rate, as a fraction" },
      { path: "gov.hmrc.income_tax.rates.savings.additional", label: "Savings additional rate, as a fraction" },
      { path: "gov.hmrc.income_tax.allowances.personal_savings_allowance.basic", label: "Personal savings allowance for basic rate taxpayers, £ a year" },
      { path: "gov.hmrc.income_tax.allowances.personal_savings_allowance.higher", label: "Personal savings allowance for higher rate taxpayers, £ a year" },
    ],
  },
  {
    id: "income-tax-property",
    name: "Income tax on property income",
    parameters: [
      { path: "gov.hmrc.income_tax.rates.property.basic", label: "Property basic rate, as a fraction" },
      { path: "gov.hmrc.income_tax.rates.property.higher", label: "Property higher rate, as a fraction" },
      { path: "gov.hmrc.income_tax.rates.property.additional", label: "Property additional rate, as a fraction" },
    ],
  },
  {
    id: "high-income-child-benefit-charge",
    name: "High income child benefit charge",
    parameters: [
      { path: "gov.hmrc.income_tax.charges.CB_HITC.phase_out_start", label: "Income at which the charge starts, £ a year" },
      { path: "gov.hmrc.income_tax.charges.CB_HITC.phase_out_end", label: "Income at which all Child Benefit is repaid, £ a year" },
    ],
  },
  // National Insurance
  {
    id: "ni-employee-rates",
    name: "National Insurance: employees' rates",
    parameters: [
      { path: "gov.hmrc.national_insurance.class_1.rates.employee.main", label: "Employee main rate (Class 1), as a fraction" },
      { path: "gov.hmrc.national_insurance.class_1.rates.employee.additional", label: "Employee rate above the upper earnings limit, as a fraction" },
    ],
  },
  {
    id: "ni-employee-thresholds",
    name: "National Insurance: employees' thresholds",
    parameters: [
      { path: "gov.hmrc.national_insurance.class_1.thresholds.primary_threshold", label: "Primary threshold, £ a week", pre: FROZEN_TO_2031(241.73) },
      { path: "gov.hmrc.national_insurance.class_1.thresholds.upper_earnings_limit", label: "Upper earnings limit, £ a week", pre: FROZEN_TO_2031(966.73) },
    ],
    note: "PolicyEngine works in £ a week: £12,570 a year is 241.73, £50,270 is 966.73.",
  },
  {
    id: "ni-employer",
    name: "National Insurance: employers",
    parameters: [
      { path: "gov.hmrc.national_insurance.class_1.rates.employer", label: "Employer rate (Class 1 secondary), as a fraction" },
      { path: "gov.hmrc.national_insurance.class_1.thresholds.secondary_threshold", label: "Secondary threshold, £ a week" },
    ],
    note: "PolicyEngine passes employers' National Insurance on to employees' pay, so a change shows up in household incomes; the Treasury counts it as a tax on business.",
  },
  {
    id: "ni-self-employed",
    name: "National Insurance: the self-employed (Class 4)",
    parameters: [
      { path: "gov.hmrc.national_insurance.class_4.rates.main", label: "Class 4 main rate, as a fraction" },
      { path: "gov.hmrc.national_insurance.class_4.rates.additional", label: "Class 4 rate above the upper profits limit, as a fraction" },
      { path: "gov.hmrc.national_insurance.class_4.thresholds.lower_profits_limit", label: "Lower profits limit, £ a year", pre: FROZEN_TO_2031(12_570) },
      { path: "gov.hmrc.national_insurance.class_4.thresholds.upper_profits_limit", label: "Upper profits limit, £ a year", pre: FROZEN_TO_2031(50_270) },
    ],
  },
  {
    id: "salary-sacrifice-cap",
    name: "National Insurance on pension contributions made by salary sacrifice",
    parameters: [
      {
        path: "gov.hmrc.national_insurance.salary_sacrifice_pension_cap",
        label: "Salary-sacrificed pension contributions free of National Insurance, £ a year (\"unlimited\" for no cap)",
      },
    ],
  },
  // VAT and duties
  {
    id: "vat-standard-rate",
    name: "VAT: standard rate",
    parameters: [{ path: "gov.hmrc.vat.standard_rate", label: "Standard rate of VAT, as a fraction" }],
    note: "PolicyEngine charges it on half of each household's spending, scaled up to national VAT receipts (docs/MODEL.md T1).",
  },
  {
    id: "vat-reduced-rate",
    name: "VAT: reduced rate (all reduced-rate goods)",
    parameters: [{ path: "gov.hmrc.vat.reduced_rate", label: "Reduced rate of VAT, as a fraction" }],
    note: "PolicyEngine charges the reduced rate on a fixed 2.5% of every household's spending, not on any one bill: use it only for a change to the reduced rate as a whole.",
  },
  {
    id: "vat-household-electricity",
    name: "VAT: 0% on household electricity",
    not_modelled: {
      reason: "needs_code",
      note: "PolicyEngine's public model charges VAT on shares of total spending, not on electricity bills, so it cannot target electricity. The page shows the Treasury's own figure for it instead.",
    },
  },
  {
    id: "fuel-duty",
    name: "Fuel duty on petrol and diesel",
    parameters: [
      {
        path: "gov.hmrc.fuel_duty.petrol_and_diesel",
        label: "Main rate of fuel duty, £ a litre, averaged over the fiscal year",
        pre: {
          values: { "2026-27": 0.5387 },
          source: FUEL_DUTY_SOURCE.id,
          where: "Rates from 1 January and 1 March 2027",
          note: "52.95p to 31 December 2026, 55.95p in January and February 2027, 57.95p from 1 March 2027: 53.87p over April 2026 to March 2027. HMRC says the government will confirm the rates at Budget 2026. Later years are PolicyEngine 2.102.3's, from the schedule before HMRC's amendment: replace them with 57.95p plus the RPI rises the OBR assumes without the Budget.",
        },
        note: "PolicyEngine holds one rate a year: give each fiscal year's average by month (52.95p for 9 months, 55.95p for 2 and 57.95p for 1 is 0.5387).",
      },
    ],
  },
  {
    id: "capital-gains-tax",
    name: "Capital gains tax",
    parameters: [
      { path: "gov.hmrc.cgt.basic_rate", label: "Rate on gains within the basic rate band, as a fraction" },
      { path: "gov.hmrc.cgt.higher_rate", label: "Rate on gains above it (higher rate), as a fraction" },
      { path: "gov.hmrc.cgt.additional_rate", label: "Rate for additional rate taxpayers, as a fraction" },
      { path: "gov.hmrc.cgt.annual_exempt_amount", label: "Annual exempt amount, £ a year" },
    ],
  },
  {
    id: "stamp-duty",
    name: "Stamp duty land tax on homes (England and Northern Ireland)",
    parameters: [
      { path: "gov.hmrc.stamp_duty.residential.purchase.main.subsequent[1].threshold", label: "Price at which the 2% band starts, £" },
      { path: "gov.hmrc.stamp_duty.residential.purchase.main.subsequent[1].rate", label: "Rate on the second band, as a fraction" },
      { path: "gov.hmrc.stamp_duty.residential.purchase.main.subsequent[2].threshold", label: "Price at which the 5% band starts, £" },
      { path: "gov.hmrc.stamp_duty.residential.purchase.main.subsequent[2].rate", label: "Rate on the third band, as a fraction" },
      { path: "gov.hmrc.stamp_duty.residential.purchase.main.subsequent[3].rate", label: "Rate above £925,000, as a fraction" },
      { path: "gov.hmrc.stamp_duty.residential.purchase.main.subsequent[4].rate", label: "Rate above £1.5 million, as a fraction" },
      { path: "gov.hmrc.stamp_duty.residential.purchase.main.first.max", label: "Highest price first-time buyers' relief applies to, £" },
    ],
    note: "Stamp duty falls on households that buy a home that year, so averages by decile are small even for a large change.",
  },
  {
    id: "council-tax-high-value-surcharge",
    name: "Council tax surcharge on homes worth over £2 million (England)",
    parameters: [
      { path: "gov.hmrc.council_tax.high_value_surcharge.amount[1].amount", label: "Surcharge for homes worth £2m to £2.5m, £ a year" },
      { path: "gov.hmrc.council_tax.high_value_surcharge.amount[2].amount", label: "Surcharge for homes worth £2.5m to £3.5m, £ a year" },
      { path: "gov.hmrc.council_tax.high_value_surcharge.amount[3].amount", label: "Surcharge for homes worth £3.5m to £5m, £ a year" },
      { path: "gov.hmrc.council_tax.high_value_surcharge.amount[4].amount", label: "Surcharge for homes worth over £5m, £ a year" },
    ],
  },
  // Benefits
  {
    id: "universal-credit-standard-allowance",
    name: "Universal Credit: standard allowance",
    parameters: [
      { path: "gov.dwp.universal_credit.standard_allowance.amount.SINGLE_YOUNG", label: "Single, under 25, £ a month" },
      { path: "gov.dwp.universal_credit.standard_allowance.amount.SINGLE_OLD", label: "Single, 25 or over, £ a month" },
      { path: "gov.dwp.universal_credit.standard_allowance.amount.COUPLE_YOUNG", label: "Couple, both under 25, £ a month" },
      { path: "gov.dwp.universal_credit.standard_allowance.amount.COUPLE_OLD", label: "Couple, either 25 or over, £ a month" },
    ],
  },
  {
    id: "universal-credit-children",
    name: "Universal Credit: child element and the two-child limit",
    parameters: [
      { path: "gov.dwp.universal_credit.elements.child.amount", label: "Child element, £ a month" },
      { path: "gov.dwp.universal_credit.elements.child.first.higher_amount", label: "Higher child element for a first child born before April 2017, £ a month" },
      { path: "gov.dwp.universal_credit.elements.child.limit.child_count", label: "Children the child element is paid for (\"unlimited\" for no limit)" },
    ],
  },
  {
    id: "universal-credit-taper",
    name: "Universal Credit: taper and work allowances",
    parameters: [
      { path: "gov.dwp.universal_credit.means_test.reduction_rate", label: "Taper: Universal Credit withdrawn per £1 of earnings, as a fraction" },
      { path: "gov.dwp.universal_credit.means_test.work_allowance.with_housing", label: "Work allowance with housing costs, £ a month" },
      { path: "gov.dwp.universal_credit.means_test.work_allowance.without_housing", label: "Work allowance without housing costs, £ a month" },
    ],
  },
  {
    id: "child-benefit",
    name: "Child Benefit",
    parameters: [
      { path: "gov.hmrc.child_benefit.amount.eldest", label: "Eldest or only child, £ a week" },
      { path: "gov.hmrc.child_benefit.amount.additional", label: "Each other child, £ a week" },
    ],
  },
  {
    id: "state-pension",
    name: "State Pension: a rise beyond the triple lock",
    parameters: [
      {
        path: "gov.contrib.cec.state_pension_increase",
        label: "Change to every State Pension payment, as a fraction (0.01 = 1% more)",
        note: "PolicyEngine pays each pensioner their reported pension uprated by the triple lock, so changing the weekly amounts moves nothing (docs/MODEL.md T1). A rise of X% more than the triple lock gives is X/100 here.",
      },
    ],
  },
  {
    id: "winter-fuel-payment",
    name: "Winter Fuel Payment: income test",
    parameters: [
      { path: "gov.dwp.winter_fuel_payment.eligibility.taxable_income_test.maximum_taxable_income", label: "Highest taxable income that keeps the payment, £ a year" },
    ],
  },
  // Not modelled: listed on the page with the reason.
  {
    id: "inheritance-tax",
    name: "Inheritance tax",
    not_modelled: { reason: "no_parameter", note: "PolicyEngine UK does not model inheritance tax: the survey it runs on does not record estates or bequests." },
  },
  {
    id: "corporation-tax",
    name: "Corporation tax",
    not_modelled: { reason: "no_parameter", note: "Corporation tax is paid by companies. PolicyEngine UK has no corporation tax, so any effect on wages, prices or share income is left out." },
  },
  {
    id: "business-rates",
    name: "Business rates",
    not_modelled: { reason: "no_parameter", note: "Business rates are paid by businesses on their premises. PolicyEngine UK holds only their total yield, not the rules." },
  },
  {
    id: "new-tax",
    name: "A new tax",
    not_modelled: { reason: "new_tax", note: "A tax that does not exist yet has no rules in the model. It is listed with the Treasury's own costing." },
  },
];
