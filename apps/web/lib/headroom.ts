import type { FiscalAssessment, FiscalRule, FiscalTargetsBundle, LatestForecast, Observation } from "@ledger/schema";
import { assessed } from "@ledger/schema";

/**
 * /budget/how-it-works: the fiscal rules as the government sets them, and the OBR's headroom
 * against each. The rules' words are quoted from the Charter for Budget Responsibility; every
 * figure comes from data/build/fiscal_targets.json (the OBR's own tables), never from here.
 */

export const HOW_IT_WORKS_PATH = "/budget/how-it-works";

/** Where each statement on the page comes from. */
export const RULE_SOURCES = {
  charter: {
    title: "HM Treasury: Charter for Budget Responsibility, Autumn 2025 (laid February 2026), paragraphs 3.6 to 3.8",
    url: "https://assets.publishing.service.gov.uk/media/699c2194d2b9c6ec5b6fbb7d/260220_-_Updated_Charter_-_February_2026.pdf#page=9",
    page: "https://www.gov.uk/government/publications/draft-charter-for-budget-responsibility-autumn-2025",
  },
  charterBudget: {
    title: "Charter for Budget Responsibility, Autumn 2025, paragraphs 3.13 to 3.17",
    url: "https://assets.publishing.service.gov.uk/media/699c2194d2b9c6ec5b6fbb7d/260220_-_Updated_Charter_-_February_2026.pdf#page=10",
  },
  budget2025: {
    title: "HM Treasury: Budget 2025 (26 November 2025)",
    url: "https://www.gov.uk/government/publications/budget-2025-document/budget-2025-html",
  },
  /** The OBR's description of what the welfare cap leaves out. */
  welfareScope: {
    title: "OBR, Economic and fiscal outlook, November 2025, paragraph 7.4",
    url: "https://obr.uk/efo/economic-and-fiscal-outlook-november-2025/",
  },
} as const;

export interface RuleText {
  /** The government's own name for the rule (Budget 2025). */
  name: string;
  /** The Charter's paragraph. */
  clause: string;
  /** The Charter's words, exactly. */
  charter: string;
  /** What the rule asks, in plain words. */
  plain: string;
  /** What "headroom" means for this rule. */
  headroom: string;
}

/** The three targets the OBR assesses, in the Charter's order. */
export const RULE_ORDER: FiscalRule[] = ["current_budget", "psnfl", "welfare_cap"];

export const RULES: Record<FiscalRule, RuleText> = {
  current_budget: {
    name: "Stability rule",
    clause: "3.6",
    charter:
      "the current budget must be in surplus in 2029-30, until 2029-30 becomes the third year of the forecast period. From that point, the current budget must then remain in balance or in surplus from the third year of the rolling forecast periods",
    plain:
      "Day-to-day spending, including the wear and tear on public buildings and equipment, is paid for by taxes and other income rather than by borrowing. Borrowing to invest, in roads or hospitals for example, does not count against it.",
    headroom: "how far income is forecast to exceed day-to-day spending in the target year",
  },
  psnfl: {
    name: "Investment rule",
    clause: "3.7",
    charter:
      "a target to ensure debt, defined as Public Sector Net Financial Liabilities (PSNFL), is falling as a share of the economy by 2029-30, until 2029-30 becomes the third year of the forecast period. Debt should then fall by the third year of the rolling forecast period",
    plain:
      "Debt falls as a share of the economy. The debt it counts is everything the public sector owes minus the financial assets it holds, such as loans it has made and shares it owns.",
    headroom: "how much more the public sector could owe in the target year, in pounds, and still see its debt fall as a share of the economy",
  },
  welfare_cap: {
    name: "Welfare cap",
    clause: "3.8",
    charter: "a target to ensure that expenditure on welfare is contained within a predetermined cap and margin set by the Treasury",
    plain:
      "Spending on welfare stays within a limit the Treasury sets, plus a margin. The state pension and payments closely tied to the ups and downs of the economy are outside it.",
    headroom: "how far forecast spending within the cap is below the cap plus its margin",
  },
};

export interface HeadroomPoint {
  vintage: string;
  edition: string;
  url: string;
  table: string;
  margin: Observation;
  pctGdp?: Observation;
  probability?: Observation;
  preMeasures?: Observation;
  spending?: Observation;
}

export interface RuleHeadroom {
  rule: FiscalRule;
  targetYear: string;
  points: HeadroomPoint[];
}

export interface NotAssessed {
  vintage: string;
  edition: string;
  url: string;
  status: LatestForecast["status"];
  /** The forecast's current budget in the target year: negative is a surplus. */
  currentBudget?: Observation;
  /** Net financial liabilities as a share of GDP, the year before the target year and in it. */
  psnflBefore?: Observation;
  psnflTarget?: Observation;
}

export interface HeadroomView {
  rules: RuleHeadroom[];
  latest: FiscalAssessment;
  /** The newest forecast, if it is newer than the newest assessment. */
  since: NotAssessed | null;
  /** Lowest and highest headroom, and zero: one scale for every rule. */
  domain: [number, number];
}

function point(a: FiscalAssessment, rule: FiscalRule): HeadroomPoint | null {
  const margin = assessed(a, rule, "margin");
  if (!margin) return null;
  return {
    vintage: a.vintage,
    edition: a.edition,
    url: a.url,
    table: a.table,
    margin,
    pctGdp: assessed(a, rule, "margin_pct_gdp"),
    probability: assessed(a, rule, "probability"),
    preMeasures: assessed(a, rule, "margin_pre_measures"),
    spending: assessed(a, rule, "spending"),
  };
}

export function headroomView(b: FiscalTargetsBundle): HeadroomView {
  const rules = RULE_ORDER.map((rule) => {
    const points = b.assessments.map((a) => point(a, rule)).filter((p): p is HeadroomPoint => p !== null);
    return { rule, targetYear: points.at(-1)?.margin.period ?? "", points };
  }).filter((r) => r.points.length > 0);
  const values = rules.flatMap((r) => r.points.map((p) => p.margin.value));
  const latest = b.assessments.at(-1)!;
  const lf = b.latest_forecast;
  const target = rules[0]?.targetYear;
  const pick = (series: string, period: string | undefined) => lf?.observations.find((o) => o.series_id === series && o.period === period);
  const before = target ? `${Number(target.slice(0, 4)) - 1}-${target.slice(2, 4)}` : undefined;
  return {
    rules,
    latest,
    since: lf
      ? {
          vintage: lf.vintage,
          edition: lf.edition,
          url: lf.url,
          status: lf.status,
          currentBudget: pick("fiscal.current_budget_deficit", target),
          psnflBefore: pick("fiscal.psnfl_pct_gdp", before),
          psnflTarget: pick("fiscal.psnfl_pct_gdp", target),
        }
      : null,
    domain: [Math.min(0, ...values), Math.max(0, ...values)],
  };
}

/** The newest assessment's headroom against one rule. */
export const latestPoint = (v: HeadroomView, rule: FiscalRule) => v.rules.find((r) => r.rule === rule)?.points.find((p) => p.vintage === v.latest.vintage);
