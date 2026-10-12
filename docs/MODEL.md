# Model layer

An ensemble of open models in tiers. Each tier is optional and labelled in the UI. The user always sees which tier produced a number.

## T0 — Arithmetic (v0, client-side TypeScript)

**Static costing.** For lever `L` moved by `d` units: `Δ_target = d × per_unit_bn` (a Range). Tax levers change receipts; spending levers change spending. Point measures (bus cap) add a fixed cost with optional funding offsets.

Source of `per_unit_bn`:
- Tax rates: HMRC *Direct effects of illustrative tax changes*. Use the year-one and steady-state figures. Correction (M1): HMRC's figures are not static. Most include taxpayers' own behavioural response; IHT, VED and Child Benefit do not; none include economy-wide effects. The M1 build uses the June 2025 edition (the January 2026 edition was postponed by HMRC on 6 Jul 2026). https://www.gov.uk/government/statistics/direct-effects-of-illustrative-tax-changes
- Bank Rate → debt interest: OBR EFO ready reckoner (sensitivity of debt interest to a 1pp rise in Bank Rate and gilt yields). Year one is smaller than year five because only short-dated debt, reserves (QE) and T-bills reprice immediately.
- % of GDP targets: `d × nominal GDP / 100`.

**Stepped levers.** Where the source says its costings cannot be scaled, a lever carries `steps` instead of `per_unit_bn`: the source's own changes, each with its own Range for year one (`y1`) and the last year it costs (`y5`). Capital gains tax works this way: HMRC costs rises of 1, 5 and 10 points in each rate and says the figures "are also non-linear and so cannot be scaled up" (big rises raise less, or lose money, because people sell fewer assets). The engine uses HMRC's figure for the step a value stands on and nothing else: no interpolation, no scaling, nothing beyond the last step. A value between steps (from an old link) counts as the step below it; the sandbox shows these levers as a set of choices, not a slider.

**Ready-reckoner cards** (`/tax`, added 12 Oct 2026): one page per tax change people quote before a Budget (1p on the basic and higher rates of income tax, 1p on employees' National Insurance, 1 point on VAT and on corporation tax, and capital gains tax at HMRC's own steps), to quote and link to. Each shows the lever's own year-one and last-year ranges, with the years, the edition and HMRC's row label read from the observations behind them (`data/build/observations/hmrc_reckoner/<vintage>.csv`). `reckonerChanges` (`packages/engine/src/reckoner.ts`) stops the build if a lever and its observation disagree, so a new HMRC edition moves the cards and the sandbox together. The words are in `apps/web/lib/reckoner-copy.ts`.

"Static" here means no economy-wide (macro) effects; HMRC costings may include taxpayers' own responses. Restrict slider ranges to the band where the source says linearity holds (typically a few pp), and label results "static, before behaviour".

Ranges: v0 uses ±10–25% around central based on the source's own stated uncertainty, or a documented editorial default. Never a point.

**Borrowing.** `ΔPSNB = Δspending − Δreceipts`.

**Debt path** (to end of OBR forecast horizon). The baseline is OBR's own PSND % GDP path (sourced); the scenario adds our cumulative extra borrowing on top:
```
GDP_t        = GDP_{t-1} × (1 + g_nominal)            # v1: OBR nominal GDP path
extra_t      = extra_{t-1} × (1 + i_t) + ΔPSNB_t      # extra debt carries interest
debt%_t      = OBR_PSND%_t + extra_t / GDP_t × 100
```
v0 uses Bank Rate for `i_t`; v1 should use the effective interest rate on the gilt stock (DMO/OBR), which is lower and slower to move.

**Macro rules of thumb** (wide on purpose; values are from model memory and carry `quality: training` until an economist signs them off against OBR/BoE published elasticities):
- GDP year one: `(m_s × Δspending_non_interest − m_t × Δtax) / GDP`, with `m_s ∈ [0.4, 1.0]`, `m_t ∈ [0.2, 0.6]`.
- CPI one-off from VAT: `[0.4, 0.8]pp` per 1pp VAT (pass-through partial).
- Mortgage translation: annuity payment at `Bank Rate + spread` on a reference loan; show as monthly £.

**Per household / per taxpayer:** divide by ONS households (≈28.6m) or HMRC income-tax payers. Always say which.

## T1 — Microsimulation (v1, Python service)

`policyengine-uk` (open source, OpenFisca-derived; https://github.com/PolicyEngine/policyengine-uk). Use for tax-benefit levers to get:
- revenue cost with the model's own static estimate (compare with T0, show both: this is the ensemble);
- distribution by income decile, region, household type;
- "people like me" results for the Your share page.

Contract: `GET /api/t1?s=<scenario code>` → `T1Response` (`packages/schema/src/t1.ts`). Cache by scenario code and year. The UI shows T0 instantly and fills T1 when ready.

**Where it runs (decided in M5, 7 Oct 2026):** PolicyEngine's public API (`api.policyengine.org`), behind a `T1Provider` interface in `packages/server/src/model/`. Why not a self-hosted `services/model` yet:
- UK population microdata (the enhanced Family Resources Survey) sits in a private repository that needs PolicyEngine's approval; the public API runs on it for us.
- No container host to run and pay for; PolicyEngine maintains the model and data.
- PolicyEngine's packages are AGPL-3.0; calling the API keeps that code out of our deployment.

Costs: a dependency on a free public service (be a good citizen: compute only when a reader asks, cache, rate-limit), about a minute for a new scenario, and model or data versions that change over time (every result records them). If microdata access is granted, a self-hosted provider can replace the API without changing the contract.

**Ranges:** PolicyEngine gives single estimates; T1 shows them with the project's editorial ±10% (invariant 2) and says so.

**Example households ("people like me"):** six fixed households (`ARCHETYPES`), computed with `/uk/calculate` under current law and the reform (`packages/server/src/model/households.ts`). Their spending is ONS's average for the closest household type in *Family spending in the UK* (`data/seed/archetype_spending.json`, built by `python -m etl.archetype_spending`, which records the table, row and quality of every value), so VAT and fuel duty reach them. PolicyEngine charges VAT at the standard rate on half of spending and scales it up to national VAT receipts (÷0.38): a 1-point rise costs a household about 1.3% of its spending on the twelve COICOP groups. Its net income takes off all fuel duty paid but only a change in VAT. A change to these inputs or to the reform mapping bumps `T1_CACHE_VERSION` (`service.ts`), so cached results computed with the old inputs are worked out again.

### The Budget for your household (route B, chosen 12 October 2026)

On Budget night an editor types the event's tax and benefit measures into `content/budget/household/<event>.yaml`: for every PolicyEngine parameter a measure touches, its value in each year **without** the event and **with** it, each with its source page. `pnpm household -- <event>` (`scripts/household.ts`, `packages/server/src/model/budget.ts`) turns the file into two complete policies, sends them to PolicyEngine once, asks for each year's comparison (`/uk/economy/{post}/over/{pre}`) and the six example households under both, checks that one model answered everything, and writes `data/build/budget/household/<event>.json`, which `/budget/household/<event>` is built from. Readers never trigger a call. Runbook: `docs/BUDGET_DAY.md`, "The Budget for your household". Ready-made measures for the likely levers: `content/budget/household/_templates.yaml` (`pnpm household -- templates`).

**Without the model** (decided 12 October 2026): if PolicyEngine cannot be reached at all on the night, `pnpm household -- build <event> --no-model` writes a snapshot from the measures file alone, with `"model": "none"`, `"quality": "sourced"`, no provider or policies and no results or households. The page then shows what needs no model: every measure with its page, the Treasury's chart and the salary check (the Budget's own income tax and employee National Insurance rates, applied in the reader's browser), and says the summary, deciles, gains and losses and households follow once PolicyEngine answers. The schema refuses anything in between: a snapshot either holds PolicyEngine's answers for everything not held back, with the checks that show one model gave them all, or holds none. The normal run later replaces it whole from the same file.

**The salary check's rates** come from the measures file and nowhere else: each income tax and employee National Insurance parameter it sets (`CALCULATOR_PARAMETERS`, `packages/schema/src/household.ts`) overlays the sourced tax seed for the event's first year (`data/seed/uk_tax_2026-27.json` for Autumn Budget 2026; never a later, post-Budget seed). The job and `pnpm validate` check that every rate both have is equal, and that a post-Budget seed for the Your share calculator (`uk_tax_2027-28.json`, from its template), if anyone fills it, says what the measures file says.

Why two complete policies rather than a change over current law: PolicyEngine's current law may or may not have the event in it by the night, and may update midway; setting every affected value outright, both sides, makes the comparison the same whatever its current law says.

#### Live test of the API, 12 October 2026 (bundle 6.2.1, policyengine-uk 2.102.3, data policyengine-uk-data 1.56.16)

`pnpm pe:probe` (`scripts/pe-probe.ts`); every answer is a fixture in `packages/server/test/fixtures/t1/probe/2026-10-12/`, and `test/t1-probe.test.ts` pins each finding. It cost four economy runs.

1. **Dates: PolicyEngine reads every parameter on 1 January of the simulation year.** A basic-rate rise to 21% dated 2027-04-06 changed nothing in 2027-28, for the households and for the population (£0.00bn), and arrived in 2028-29; dated 2027-01-01 it raised £6.91bn in 2027-28. Dated 2027-05-01 it behaved like 6 April. So the job dates each fiscal year's value from 1 January to 31 December of the year the fiscal year starts in (`yearPeriod`: 2027-28 is `2027-01-01.2027-12-31`), never the real start date; the last year is open-ended. Side effect: PolicyEngine's own April changes (benefit rates from 6 April 2026, for instance) reach the API's 2026-27 only for parameters we set; everything else in 2026-27 runs on the April 2025 values. Levels lag a year, changes from the measures do not. PolicyEngine certified bundle 6.3.1 the same day with a "UK Budget reform contract" for dated reforms: run the probe again when the API moves to it (whole-calendar-year periods hold either way).
2. **A value set year by year holds each year's own value.** A personal allowance of £13,000 in 2027 only returned to £12,570 in 2028; £14,000 set open-ended from 2029 carried on into 2030. A freeze is stated by giving the frozen value for every year.
3. **Two custom policies work.** `/uk/economy/{post}/over/{pre}` with thresholds frozen (post) over thresholds uprated from April 2028 (pre), 2028-29: £3.67bn a year, against PolicyEngine's own £3.74bn for the same measure in December 2025.
4. **`/budget-window` returns budget totals only** (tax, benefits and net, by year, and their sum), no deciles or households. It shares the yearly cache (its 2028-29 figure is the yearly run's to the pound). The job asks year by year instead.
5. **Versions.** `/v2/tax-benefit-models/by-country/uk` gives the bundle (6.2.1) and the years offered (2024 to 2030, so 2030-31 is the last fiscal year); `/uk/metadata` gives the model the household calculator runs (2.102.3); every economy answer names its model, data and bundle. The job refuses to write a snapshot unless all of them agree, before and after the run, so a PolicyEngine update during the night cannot mix two models into one comparison.
6. **Speed.** One new year took 23 to 70 seconds; five years asked together about 2½ minutes; a household calculation a second or two.
7. **Deciles are not adjusted for household size.** Since policyengine.py 5.0.0 (27 July 2026) the API ranks households by household net income, unadjusted, each tenth holding a tenth of people. The Treasury's charts and PolicyEngine's own December 2025 analysis rank by income adjusted for household size. A large family on a modest income therefore sits higher here: the two-child limit's gains land mostly in deciles 4 to 6, not 1 and 2. No query parameter selects the adjusted ranking. The page says so wherever it shows deciles.

#### Rehearsal: Autumn Budget 2025, 12 October 2026

`content/budget/household/autumn-budget-2025.yaml`: nine measures modelled (two-child limit, fuel duty, the income tax and National Insurance threshold freeze, employers' threshold, dividends, savings and property income rates, the salary sacrifice cap, the council tax surcharge) and four listed as not modelled (rail fares, student loan threshold, inheritance tax thresholds, the electric vehicle mileage charge). Five economy runs, plus three for a like-for-like copy with PolicyEngine's own inputs (`test/fixtures/t1/household/autumn-budget-2025-parity.yaml`), tested in `test/t1-household-rehearsal.test.ts`.

Our result, % change in household net income by decile (1 = lowest), static:

| Year | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | Net, £bn |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-27 | +0.69 | +0.30 | +0.27 | +0.57 | +0.41 | +0.32 | +0.18 | +0.11 | −0.01 | −0.05 | −3.66 |
| 2027-28 | +0.25 | +0.18 | +0.17 | +0.53 | +0.36 | +0.16 | +0.04 | −0.05 | −0.22 | −0.21 | −1.00 |
| 2028-29 | −0.04 | −0.06 | −0.10 | +0.45 | +0.06 | −0.12 | −0.23 | −0.40 | −0.55 | −0.42 | +3.48 |

Against PolicyEngine's published analysis (`uk-autumn-budget-dashboard`, `public/data/distributional_impact.csv`, December 2025):

- **Revenue agrees where the inputs are the same.** With PolicyEngine's own inputs, the income tax measures raise £6.52bn in 2028-29 against its £6.47bn (within 1%), and the two-child limit costs £2.79bn, £3.14bn and £3.45bn in 2026-27 to 2028-29 against its £2.95bn, £3.14bn and £3.42bn (within 6%).
- **Fuel duty is smaller:** £2.04bn in 2026-27 against its £3.52bn. PolicyEngine has changed its fuel duty modelling since December (its changelog: yearly averages instead of each year's first rate, and the OBR's November 2025 RPI forecasts); ours is nearer the Treasury's own costing (£2.37bn, Table 4.1 line 3).
- **Deciles differ, mostly by definition.** PolicyEngine published +1.66% and +2.23% for deciles 1 and 2 in 2026-27; we get +0.69% and +0.30%, with decile 4 gaining most. Same Universal Credit money, ranked differently: see finding 7 above. Smaller causes: newer survey data (FRS 2024-25 against 2023-24) and model (2.102.3 against about 2.65).
- **Our own run differs from the like-for-like one as intended:** dividends from April 2026 and savings and property income from April 2027, as the Budget dates them (PolicyEngine's baseline started each a year later: +£0.99bn in 2026-27 and +£1.6bn more in 2027-28); the National Insurance thresholds, employers' threshold and council tax surcharge added (from 2028-29); thresholds without the Budget follow the law (CPI, rounded up to £10 and £100) rather than CPIH; rail fares (£0.15bn a year) and the student loan freeze (£0.3bn) left out, as they need code beyond parameters.

Against the Treasury's "Impact on households" (Figure 1.A, 2028-29, read from the chart's drawing as no table is published): tax and welfare together run from +2.09% in decile 1 to −1.60% in decile 10, and +7.24% to −0.87% with public services. Both show the top tenth losing most in 2028-29. They differ below that because the Treasury's chart counts every decision since Autumn Budget 2024 (the Universal Credit rises of April 2026 and more), adds the value of public services, and adjusts deciles for household size; ours counts this Budget's modelled measures only, in cash. The page shows both, with that one-line reason.

## T2 — Macro (v2)

Options, in order of preference:
1. A small open semi-structural model (IS curve, Phillips curve, Taylor rule with Bank of England reaction) calibrated to published OBR/BoE elasticities. Purpose: show direction and ranges for GDP, CPI and Bank Rate over 1–3 years.
2. Reproduce OBR's published policy costings and scorecards where they exist (for announced measures) as an "official" tier next to ours.
3. Partnerships (NIESR NiGEM is commercial; consider academic access).

10-year horizon is shown as **scenarios** (low/central/high growth and rates), never as a forecast.

## T3 — Demography and long-term (v2)

Do not build projections. Use:
- ONS national population projections (principal + high/low fertility, migration, life expectancy variants).
- OBR *Fiscal risks and sustainability* long-term projections (age-related spending: state pension, health, social care) and their age-cost profiles.

Levers here are assumptions, not policies: fertility, net migration, life expectancy, state pension age. Output: old-age dependency ratio, age-related spending % GDP to 2075 as a fan.

Built in M6 as `/people` (`etl/people.py` → `data/build/people.json`). Each switch picks a published ONS variant; a mix the ONS does not publish is reported, never computed. Two numbers are worked out from published ones and marked `approx`: people of working age per person over pension age (ONS counts), and age-related spending in an OBR scenario (OBR baseline plus the scenario's published change). Neither body publishes a state pension age variant, so that lever shows its owner (government) and the assumptions used, with no switch.

## Ensemble display

When two tiers disagree (T0 static vs T1 microsim), show both side by side with a one-line explanation of why. Disagreement is information.

## Backtest (built in M7, 8 Oct 2026)

Every forward number the site shows that a later official outturn can score is stored as a `Forecast` record (`data/build/forecasts/<maker>/<edition>.json`, schema `packages/schema/src/forecasts.ts`), append-only: `pnpm validate --base` rejects a changed or removed record. `python -m etl.backtest` (also `pnpm backtest`) records new ones and scores every record whose period has an outturn in `data/build/backtest.json`. The nightly data job runs it after the build; CI re-runs it and fails if the committed files differ. Page: `/method/backtest`; data: `/api/v1/forecasts`.

**Scoring.** A hit when `low ≤ outturn ≤ high`, edges included. Otherwise a miss above or below, sized from the nearer edge of the range (in the forecast's unit and as a share of the central value); the error from the central value is kept too. Outturn: ONS public sector finances first, then the OBR's outturn (databank, later EFOs); HMT PESA outturn for spending by function; ONS mid-year estimates for births and deaths. Scores are worked out again on every run, so a revised outturn moves them; the table names the edition it used. The hit rate counts ranged forecasts only.

**What is recorded (decided 8 Oct 2026).**
- *OBR fiscal aggregates* the Statement and the debt path show for forecast years: receipts, total spending, borrowing, debt interest, debt (£bn and % of GDP). The OBR publishes single numbers in these tables, so they are recorded as points (`low = central = high`) and never given a range we made up; a point only "hits" by matching exactly, so the page shows how far off it was instead and leaves points out of the hit rate. The 13 receipt lines are left out: the OBR and the ONS draw some lines differently (business rates, non-tax income), so a gap would measure a definition, not a forecast.
- *Our split of spending by function* for forecast years (each function keeps its share of the latest PESA outturn year): our own forecasts, quality `approx`, points. Scored against PESA outturn, so the score tests our split and the OBR total together.
- *ONS births and deaths* on `/people`, with the range the page shades: lowest to highest published variant (special cases left out). Variants are other assumptions, not a probability range, and the page says so.
- *Context:* earlier official forecasts for periods the site already shows as outturn are recorded once, labelled `recorded_as: context` and as the OBR's or the ONS's: the March 2026 EFO for 2025-26, and the ONS principal projection for the year to mid-2025 (its first projected year, where every variant gives the same number to within a few dozen people, so it is recorded as a point). They give the page honest content from day one and are never counted as ours.

**What is left out, and why.** Promise-card costs and sandbox or share-page results are costings of what-ifs (what a measure would cost, what a change would do, on official costings, with no economy-wide effects). No official outturn measures a what-if, so there is no fair score: the debt path under a scenario is conditional on the scenario happening, alone. A costing could one day be scored against an official outturn cost of the measure itself (for example a department's spend on a delivered grant); that needs a source per measure and is not built. `/people`'s dependency ratio, workers per pensioner and long-term spending are not recorded yet: the ETL holds no outturn that measures them (ONS population by age would score the first two), and the 2075 spending paths are scenarios, not forecasts.

## Prototype engine reference

`prototype/template.html` → functions `compute()` and `debtPath()` contain a working T0 implementation (≈80 lines). Port to `packages/engine` with types and tests.
