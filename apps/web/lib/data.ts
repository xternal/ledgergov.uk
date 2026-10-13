import "server-only";
import { loadSeed } from "@ledger/schema/seed";
import { readEditors, withVerification } from "@ledger/schema/verification";
import { loadPeople } from "@ledger/schema/people";
import { loadBorrowing } from "@ledger/schema/borrowing";
import { loadForecasts, readBuildText, type ForecastData } from "@ledger/schema/forecasts";
import { loadScorecards } from "@ledger/schema/budget";
import { loadHouseholdSnapshots } from "@ledger/schema/household";
import { loadFiscalTargets } from "@ledger/schema/fiscal-targets";
import { loadLeaks } from "@ledger/schema/leaks";
import type { BorrowingBundle, BudgetScorecard, FiscalTargetsBundle, HouseholdSnapshot, LeakFile, PeopleBundle, Seed } from "@ledger/schema";
import { buildRuns, vintageChangelog, type BuildRun, type Manifest, type VintageEntry } from "@ledger/server/api";

/**
 * Seed data, parsed and cross-checked through the Zod schemas at build time.
 * A bad seed file fails the build rather than rendering wrong numbers. Each card
 * carries its verification label when the build has the private editors list
 * (docs/OPERATIONS.md §15), and the earlier wording when it has not.
 */
let cached: Seed | null = null;

export function getSeed(): Seed {
  cached ??= withVerification(loadSeed(), readEditors());
  return cached;
}

let people: PeopleBundle | null = null;

/** /people: ONS population projections and OBR long-term spending (data/build/people.json), validated on first use. */
export function getPeople(): PeopleBundle {
  people ??= loadPeople();
  return people;
}

let borrowing: BorrowingBundle | null = null;

/** /borrowing: borrowing so far this year against the OBR's monthly path (data/build/borrowing.json), validated on first use. */
export function getBorrowing(): BorrowingBundle {
  borrowing ??= loadBorrowing();
  return borrowing;
}

let fiscalTargets: FiscalTargetsBundle | null = null;

/** /budget/how-it-works: the OBR's headroom against each fiscal rule (data/build/fiscal_targets.json), validated on first use. */
export function getFiscalTargets(): FiscalTargetsBundle {
  fiscalTargets ??= loadFiscalTargets();
  return fiscalTargets;
}

/** /budget/leaks: measures briefed to the press before the Budget (content/leaks/*.yaml), newest first; a bad file throws. */
export function getLeaks(): LeakFile[] {
  return loadLeaks();
}

let forecasts: ForecastData | null = null;

/** Forecast records and their scores against outturn (M7): data/build/forecasts and backtest.json, validated on first use. */
export function getForecasts(): ForecastData {
  forecasts ??= loadForecasts();
  return forecasts;
}

let scorecards: BudgetScorecard[] | null = null;

/** The Treasury's tables of policy decisions, one per fiscal event, newest first (data/build/budget), validated on first use. */
export function getScorecards(): BudgetScorecard[] {
  scorecards ??= loadScorecards();
  return scorecards;
}

let households: HouseholdSnapshot[] | null = null;

/**
 * "The Budget for your household": one snapshot per fiscal event, newest first (data/build/budget/household), each
 * checked against the measures file it was computed from (content/budget/household), validated on first use.
 */
export function getHouseholdSnapshots(): HouseholdSnapshot[] {
  households ??= loadHouseholdSnapshots();
  return households;
}

let vintages: { manifest: Manifest; changelog: VintageEntry[]; runs: BuildRun[] } | null = null;

/** The data build's manifest, every edition it holds (newest first) and the run log, for /method and the API. */
export function getVintages() {
  if (!vintages) {
    const manifest = JSON.parse(readBuildText("data/build/manifest.json")) as Manifest;
    vintages = {
      manifest,
      changelog: vintageChangelog(manifest, readBuildText("data/build/history/artifacts.csv")),
      runs: buildRuns(readBuildText("data/build/history/runs.csv")),
    };
  }
  return vintages;
}
