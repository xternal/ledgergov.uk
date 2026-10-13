# Budget day: Autumn Budget 2026

The plan for **Wednesday 28 October 2026**, the day of the Autumn Budget (date: [House of Commons Library](https://commonslibrary.parliament.uk/research-briefings/cbp-12226/)). Clocks go back on 25 October, so every time here is GMT. The aim: by the next morning, every card the Budget touched shows what it did, with a link to the page that says so, approved by two editors.

[ledgergov.uk/budget](https://ledgergov.uk/budget) does the rest by itself: it lists the government's promises the Budget can still move, and from the day it leads with "What the Budget did", built from every event dated 28 October. It re-renders hourly, so a merged change appears within the hour.

## Timetable

| When (GMT) | What | Who |
|---|---|---|
| Before the day | Read this page and every card listed on [/budget](https://ledgergov.uk/budget) (26 on 10 October); check the follow emails work | Editors |
| About 12:30 | The Chancellor's statement, after Prime Minister's Questions (time from press reports) | Watch, don't edit yet |
| Straight after | The Budget documents on GOV.UK and the OBR's forecast are published | — |
| Within 2 hours of publication | The scorecard: read the Treasury's table of policy decisions into [/budget/scorecard](#the-scorecard-the-treasurys-table-of-measures) and open its pull request (runbook below) | Owner |
| Afternoon | Read the documents against the checklist below; note each card's page and table | Editors, AI Journalist |
| 13:00 to 23:00 | The Budget for your household: the measures typed with their pages, one run through PolicyEngine, two editors' review ([runbook below](#the-budget-for-your-household)); live by 07:00 on Thursday, in full or as the fallback | Editors, owner |
| By 20:00 | One pull request with an entry for every card the Budget touched, each with its evidence link | Drafted by AI Journalist, opened by the owner |
| Evening or next morning | Two editors review and approve; the owner merges | Editors, owner |
| Within an hour of merge | `/budget`, the cards and the feeds update; follow emails go out | Automatic |

### Who does what (decided 12 October 2026)

Scheduled tasks on Pavel's Mac do the typing and the runs; people do the checking. Each task opens a pull request that does not merge by itself, and reports with the exact merge command. The Mac must be awake with the Claude app open.

| When (GMT) | Scheduled task | What it does | Who checks |
|---|---|---|---|
| Wed 21 Oct, 09:15 BST | `ledgergov-ons-borrowing-2026-10-21` | Checks the morning's data pull request brought ONS's September public finances, and that /borrowing's figures match the ONS bulletin | Pavel merges the data pull request if they match |
| Tue 27 Oct, 10:00 | `budget-2026-household-prep` | Re-tests PolicyEngine if its API moved, refreshes the household templates, starts the 2026 measures file on its branch, rehearses the "no model" fallback offline | Nothing to check unless it reports a change |
| Wed 28 Oct, 14:00 | `budget-day-2026-scorecard` | Reads the Treasury's total from the PDF page as a picture, separately from the parser, then runs the scorecard (runbook below) | Pavel retypes the total from the PDF and checks three lines, then merges |
| Wed 28 Oct, 14:30 | `budget-2026-household-run` | Types every tax and benefit measure with its page, runs PolicyEngine (again every 10 minutes while it is down), opens the pull request; from 19:30 re-checks every rate against HMRC's notes | Pavel and Goodwill Stranger check every value against its page, then merge |
| Wed 28 Oct, 17:00 | `budget-day-2026-drafts` | Drafts the card changes, with rates from the Budget document or HMRC's notes when OOTLAR is not out | Two editors approve, as for every card |
| Thu 29 Oct, 05:00 | `budget-2026-household-fallback` | If the household pull request is not merged, turns it into the fallback: the households and the Treasury's chart if PolicyEngine answered (deciles follow); if it cannot be reached at all, the page without the model (the measures, the salary check and the Treasury's chart; the rest follows) | Pavel and Goodwill Stranger, a short review before 07:00 |
| Thu 29 Oct, 09:00 | `budget-2026-household-refill` | If the household page went out without the model or with its deciles held, runs PolicyEngine again and opens the full page's pull request | Pavel and Goodwill Stranger check the results, then merge |

Each task checks that nothing else is building before it builds, so the three on Wednesday afternoon take turns.

## The documents to read

Published on GOV.UK straight after the statement (the Treasury's Budget page links them all) and on obr.uk:

1. **The Budget document** (the "Red Book"). Its table of policy decisions (Table 4.1 in Budget 2025, 5.1 in Autumn Budget 2024) lists every new measure with its cost or yield for each year: this is the official yearly figure a card's cost should use. The scorecard page shows every line of it with a link to its page, so it is the quickest way to find a measure's line and page number.
2. **Policy costings**: how each of those figures was worked out.
3. **The OBR's Economic and fiscal outlook** (EFO) and its supplementary tables: borrowing, debt, and the OBR's view of the measures. Use it for defence and anything the OBR comments on.
4. **Overview of tax legislation and rates** (OOTLAR): the tax rates and thresholds that will apply. Use it for the tax pledges when it is out; in 2025 it came out on 28 November, two days after the Budget (in 2024 the same day). On the night, take rates and thresholds from the Budget document and HMRC's **tax information and impact notes** (TIINs, on GOV.UK from the evening: 19:34 GMT in 2025).
5. **Departmental budget tables**: what each department gets, for promises funded from a department's budget.

Cite the exact page: add `#page=NN` to a PDF link, or link the HTML section.

## What would move each watched card

| Card | Status now | What to look for | What it means for the card |
|---|---|---|---|
| [5% of GDP on national security by 2035](https://ledgergov.uk/promise/uk-nato-5pc-2035-2025) | In plan | Defence spending path in the Budget and the EFO; any new money towards 3.5% core defence | Money allocated on the path: a `funded` event. A new official figure: a cost correction |
| [Cap bus fares at £2](https://ledgergov.uk/promise/uk-bus-cap-2-2026) | In plan | The £400m (England) in DfT's budget for 2026-27 and 2027-28 | Confirmed in Budget documents: `funded` |
| [Cut manufacturers' electricity bills](https://ledgergov.uk/promise/uk-bics-electricity-2026) | In plan | The Exchequer's share of the scheme (due to be scored at this Budget) | Scored: `funded`, and the yearly cost if it changes |
| [No tax rises for working people](https://ledgergov.uk/promise/uk-no-tax-rise-working-people-2024) | In plan | Main rates of income tax, employee National Insurance and VAT in the Budget document or HMRC's notes (OOTLAR once it is out) | A rise in one of those rates: `failed` (reads **Not met**) with evidence. Frozen thresholds don't change a rate: say so in the status note and let two editors decide |
| [Cap corporation tax at 25%](https://ledgergov.uk/promise/uk-corp-tax-cap-25-2024) | Legislated | The main rate in the Budget document or HMRC's notes (OOTLAR once it is out) | Main rate above 25%: `failed` |
| [Fund 10 major hospital projects and maintenance](https://ledgergov.uk/promise/uk-nhs-capital-1-5bn-2026) | In plan | Estates Safety Fund or NHS capital lines | Money confirmed by year: `funded`, and a yearly cost if one is now published |
| [Free unlimited bus travel for disabled people](https://ledgergov.uk/promise/uk-disabled-bus-pass-2026) | Promised | The £60m in DWP or DfT budgets, and whether it is yearly | Confirmed: `funded`; a yearly figure: cost correction |
| [Mental health strategy before Christmas](https://ledgergov.uk/promise/uk-mental-health-strategy-2026) | Promised | Money for mental health tied to the strategy | Money alone doesn't move it; note it. The strategy presented to Parliament: `in_plan` |
| [Mayors control the 16-19 budget](https://ledgergov.uk/promise/uk-mayors-16-19-budget-2026) | Promised | The devolution white paper, expected alongside the Budget | Published and naming it: `in_plan` |
| [SEND inclusion standards](https://ledgergov.uk/promise/uk-send-inclusion-standards-2026) | Promised | SEND funding or the standards themselves | Funding: note it. Standards published: `delivered` |
| [Meet the fiscal rules, with a buffer](https://ledgergov.uk/promise/uk-fiscal-rules-2026) | Promised, due today | The OBR's assessment of each fiscal rule in the EFO, and the headroom against them | The OBR judges the rules met: `delivered`, with the headroom in £bn in the status note (the pledge also promised "a buffer": if the headroom is very small, say so and let two editors decide). A rule judged missed: `failed` (reads **Not met**) |
| [Launch the Your First Home equity loan scheme](https://ledgergov.uk/promise/uk-your-first-home-2026) | Promised, due today | The scheme in the Budget document and policy costings: cost, price caps, start date | Confirmed with money and a start date: `funded`, and its official yearly cost as a correction. Confirmed without money: `in_plan`. Not in the Budget: leave it; the deadline job records the missed date |
| [Cut business rates 20% for pubs and venues](https://ledgergov.uk/promise/uk-pubs-business-rates-cut-2026) | Promised | The pubs and live music relief in the policy decisions table, its cost, and the exclusion for the largest venues | In the table with a cost: `funded`, and a cost correction if the official figure differs from £0.1bn |
| [Restore the Union Learning Fund, £15m a year](https://ledgergov.uk/promise/uk-union-learning-fund-2026) | Promised | The £15m a year in the policy decisions table or departmental lines, and the DWP savings said to pay for it | Confirmed with money: `funded`; a different yearly figure: cost correction. Record how it is paid for in the status note |
| [Give every mayor a share of income tax](https://ledgergov.uk/promise/uk-mayors-income-tax-2026) | Promised | The roadmap to fiscal devolution the Chancellor said he would set out at the Budget | A published roadmap naming income tax shares from April 2028: `in_plan`. A mention without a plan: note it |
| [Adjust the State Pension triple lock from 2030](https://ledgergov.uk/promise/uk-triple-lock-2030-2026) | Promised | Anything on the post-2030 link or a bill to legislate it | The April 2027 rise under today's triple lock is not this promise: note it only. A bill or a published legislative plan for the new link: `in_plan` |
| [£1bn for innovation clusters over four years](https://ledgergov.uk/promise/uk-ukri-innovation-clusters-2026) | Promised | The £1bn through UKRI in the departmental budget tables (DSIT and UKRI), with its years | Allocated by year: `funded`, and the yearly figure as a cost correction (one year, never the four-year total as yearly) |
| [Hand the Local Innovation Partnerships Fund to mayors](https://ledgergov.uk/promise/uk-lipf-mayors-2028) | Promised | The fiscal devolution roadmap, and the fund in mayors' settlements | A published plan naming the fund's transfer in 2028: `in_plan` |
| [Curriculum proposals](https://ledgergov.uk/promise/uk-curriculum-proposals-2026), [nude-images law](https://ledgergov.uk/promise/uk-child-nude-images-law-2026), [landlord register](https://ledgergov.uk/promise/uk-landlord-register-2026), [socio-economic duty](https://ledgergov.uk/promise/uk-socio-economic-duty-2026), Awaab's Law ([more hazards](https://ledgergov.uk/promise/uk-awaabs-law-hazards-2026), [all hazards in 2027](https://ledgergov.uk/promise/uk-awaabs-law-all-hazards-2027), [private renters](https://ledgergov.uk/promise/uk-awaabs-law-private-renters-2026)), [ADHD and autism assessments regulated by the CQC](https://ledgergov.uk/promise/uk-adhd-autism-cqc-2026) | — | Unlikely in a Budget; check quickly. Awaab's Law moves when its regulations are made (phase 2 due 30 November), not at the Budget | Move only if a document names them. Money for councils' compliance costs: note it in the status note |

**Two cards fall due on Budget day** (the fiscal rules and Your First Home). The nightly deadline job appends a `deadline_missed` event to any card still open after its deadline, so merge their Budget-day entries that evening if the documents settle them. If one is still being checked, that event is correct and the Budget-day entry follows it.

**New promises in the speech** ("we will…") become new cards like any other: the quote word for word from Hansard (as soon as it is published), status Promised, and the Budget's own costing if it gives one. The daily intake picks up the Hansard transcript by itself; editors resolve its drafts as usual.

**The opposition's costed pledges** on `/budget` don't move with the Budget. If an opposition party responds with a new pledge, it is a new card, by the same rules.

## Ready-made entries

Cards are in OpenPromises format v1 (since 12 October 2026): text a reader sees is a language map (`text:` then `en: …`), and a version's cost sits under `parameters.cost` (`range`, `by`, `note`, `sources`, `quality`). A status change is three edits to the card: append the event, change `status`, and update `status_note` (it describes the present, so it is edited, not corrected).

```yaml
# 1. Append to events (never edit an existing one)
  - date: "2026-10-28"
    type: funded
    text:
      en: Autumn Budget 2026 allocates £0.4bn in 2027-28 for the £2 fare cap in England
    evidence_url: https://assets.publishing.service.gov.uk/…/Budget_2026.pdf#page=NN
```

```yaml
# 2. The current status
status: funded
# 3. One or two sentences on where it stands now, with what the Budget did
status_note:
  en: >-
    The Autumn Budget 2026 confirmed £0.4bn for 2027-28 (Budget document, table N). The cap runs from
    1 January to 31 December 2027.
```

A new official yearly cost is a correction to the version, recorded as in [PROMISE_STANDARD.md §9](PROMISE_STANDARD.md):

```yaml
corrections:
  - date: "2026-10-28"
    path: versions[0].parameters.cost.range
    was: null
    now: [0.36, 0.4, 0.44]
    reason:
      en: >-
        The Autumn Budget 2026 published the official yearly cost: £0.4bn in 2027-28 (table N). Low–high is an
        editorial ±10% because the source gives a central figure only.
    source_url: https://assets.publishing.service.gov.uk/…/Budget_2026.pdf#page=NN
```

Set the version's `cost.by` to the new figure's maker (here `{ kind: official, name: HM Treasury }`), with `cost.quality: sourced` and the source in `cost.sources`. If the card had a cost from another maker, record that change as a correction too, in the same pull request:

```yaml
  - date: "2026-10-28"
    path: versions[0].parameters.cost.by
    was: { kind: party, name: Labour Party }
    now: { kind: official, name: HM Treasury }
    reason:
      en: The central figure is now the Budget's official costing.
    source_url: https://assets.publishing.service.gov.uk/…/Budget_2026.pdf#page=NN
```

A change to a card's current cost appears in `/feeds/all.xml` and `/feeds/updates.xml` once the pull request is merged.

A broken pledge reads **Not met**, never "broken": the label states the fact, the evidence link carries the rest.

## The scorecard: the Treasury's table of measures

`/budget/scorecard/<event>` shows every line of the Budget's table of policy decisions: what each measure raises or costs in the last year the Treasury costs (2030-31 at Budget 2025), every year in a full table, the Treasury's totals, and a link to the PDF page of every line. It is built only from `data/build/budget/<event>.json`, which `etl/budget_costings.py` reads from the PDF as printed. `/budget` links the newest scorecard, the sitemap and `llms.txt` list them all. Figures are the Treasury's, in £ million, with its sign: positive raises money, negative costs money.

It is data, not a card: the two-editor rule for cards does not apply, but one reviewer other than the person who ran it checks the total and three lines against the PDF before merging (step 7). On 28 October 2026 the scheduled task `budget-day-2026-scorecard` runs it and Pavel is the reviewer.

**Dry run, 12 October 2026, on Budget 2025 (26 November 2025):** 16 minutes from finding the documents to the page served with every check green, of which about 9 minutes were lost to a crash of the machine (several agents building at once) and 7 were work. The parser read the 88-line Table 4.1 first time, a table it had not seen (it was built on Autumn Budget 2024 and Spring Statement 2025); every figure matched the Treasury's spreadsheet. The one manual fix: the Treasury's PDF and spreadsheet word line 56 differently and mark line 78 Spend in one and Tax in the other, so the copy check stopped the build until those two were checked in the PDF and accepted (step 5). Allow two hours on the day for a person doing it for the first time, with review, merge and deploy.

### Before the day

- On the machine that will run it: `pdftotext -v` prints a version (if not: `brew install poppler`), and `etl/.venv` exists (`docs/OPERATIONS.md`). Pull `main`.
- Read the dry run's table once: `etl/tests/fixtures/budget_costings/autumn-budget-2025/` and the page `/budget/scorecard/autumn-budget-2025`.

### On 28 October (times GMT)

1. **Find the documents** (about 12:45, as soon as GOV.UK has them). The Treasury's Budget page links the **Budget document** (its own page, `…/budget-2026-document` if it follows last year; take the PDF marked "(web)", not "(print)") and **Supporting documents for Budget 2026** (with "Table 4.1 Budget 2026 Policy Decisions" as a spreadsheet, if the Treasury publishes it again). To list a page's files:

   ```bash
   curl -s https://www.gov.uk/api/content/government/publications/budget-2026-document | python3 -c "import json,sys; [print(a.get('url'), '|', a.get('title')) for a in json.load(sys.stdin)['details']['attachments']]"
   ```

   No spreadsheet? Use the Budget document's HTML page (`https://www.gov.uk/government/publications/budget-2026-document/budget-2026-html` or as listed) as the copy. Neither? Leave `copy_url` out: the other checks still run.

2. **Type the total from the PDF.** Open the PDF at the policy decisions table (search "policy decisions (£ million)"), go to its foot, and type the six figures of "Total policy decisions" in £ million with their signs, as printed (`-4,125m` is `-4125`). This is the one number a person types: the parser must read the same.

3. **Add the event** to `EVENTS` in `etl/budget_costings.py`, below the last one:

   ```python
   Event(
       id="autumn-budget-2026",
       name="Autumn Budget 2026",
       date="2026-10-28",
       page_url="https://www.gov.uk/government/publications/budget-2026-document",
       document_url="https://assets.publishing.service.gov.uk/media/<…>/<…>_Web_Accessible.pdf",
       document_title="Budget 2026 (HC <number on the cover>)",
       printed_total=(…, …, …, …, …, …),
       copy_url="https://assets.publishing.service.gov.uk/media/<…>/Table_4.1_-_Budget_2026_Policy_Decisions.xlsx",
   ),
   ```

4. **Read the table:**

   ```bash
   git checkout main && git pull && git checkout -b budget-2026-scorecard
   etl/.venv/bin/python -m etl.budget_costings record autumn-budget-2026
   ```

   It downloads the PDF and the copy, keeps the table's words in `etl/tests/fixtures/budget_costings/autumn-budget-2026/`, and writes `data/build/budget/autumn-budget-2026.json` only if every check passes. Each check prints `ok` or `FAIL`.

5. **If a check fails**, the message says which line and page. Nothing is written until all pass.
   - `total` differs: re-read the PDF's total row. If what you typed is right, the parser misread the table: do not publish; see the last bullet.
   - `reconcile` out of bounds, or `lines` not 1 to N: a line was lost or misread. Compare the line it names with the PDF.
   - `copy`, a **figure** differs: stop and look at both in the PDF; a figure difference is never accepted. If the PDF is as read and the spreadsheet is wrong, leave `copy_url` out, say so in the pull request, and tell the reviewer.
   - `copy`, **name** or **head** differs (as at Budget 2025): open the PDF at that line. If the page shows what was read, add it to the event, then build again without downloading:

     ```python
     accepted=(("56:name", "The spreadsheet words this line differently from the printed table; the figures are the same."),),
     ```

     ```bash
     etl/.venv/bin/python -m etl.budget_costings --only autumn-budget-2026
     ```

   - `cannot read the table` (a `ParseError`): the table's layout changed (a new column, a second table for tax, figures in £ billion). The message names the page. Fixing the parser is a code change that needs a test; if it cannot be done within an hour, publish the cards first and the scorecard the next day. Nothing else depends on it.

6. **Check it**, one command at a time (the machine has 16 GB; never two builds at once):

   ```bash
   etl/.venv/bin/python -m pytest etl/tests -q --offline
   pnpm validate -- --base origin/main
   pnpm typecheck
   for p in packages/schema packages/engine packages/server; do (cd $p && pnpm exec vitest run --maxWorkers=3); done
   pnpm build
   (cd apps/web && ./node_modules/.bin/next start -p 3202) & sleep 5
   curl -s -A LinkedInBot http://localhost:3202/budget/scorecard/autumn-budget-2026 | grep -oE '<title>[^<]*|og:(title|description|image)" content="[^"]*'
   lsof -ti tcp:3202 | xargs kill   # next start hands over to a next-server process: stop it by its port
   ```

   The tests pick the new event up by themselves: its total must equal the one you typed, every check must pass, and the committed JSON must be what the recorded table gives. On the page, check the first line, the last line and the largest against the PDF, and that each page number opens the right page.

7. **Publish.** Commit the event, the fixture folder and the JSON (`git add etl/budget_costings.py etl/tests/fixtures/budget_costings/autumn-budget-2026 data/build/budget/autumn-budget-2026.json`), push, open the pull request. The reviewer types the total from the PDF again themselves and checks three lines, then merges. After the deploy, `curl -A LinkedInBot https://ledgergov.uk/budget/scorecard/autumn-budget-2026` must return the title, description and image, and `/budget` must link it ("Line by line: …").

8. **Use it for the cards.** Each card's Budget-day evidence link can be the scorecard's line (`/budget/scorecard/autumn-budget-2026#line-N`) for finding it, but the card cites the PDF page itself (`…pdf#page=NN`), which the scorecard gives for every line.

### Formats that could break it on the day

- **The table's number and title** change between events (5.1, 3.1, 4.1): the parser looks for any "Table N … policy decisions" followed by year headings, so a new number is fine; a title without the words "policy decisions" is not.
- **A table split in two** (tax and spending as separate tables), **figures in £ billion**, or **no line numbers** would stop the parse with an error, not a wrong page.
- **The spreadsheet may differ from the PDF** in wording or tax/spend marks (step 5), and the "Head" column may be missing (Spring Statement 2025 had none: then there is no tax/spending mark per line).
- **Totals do not add up exactly**: the Treasury rounds each line to £5m and adds before rounding, so the lines differ from the printed total by up to a few tens of millions (Budget 2025: up to £30m in a year). The page shows both and the gap.
- **A corrected PDF** later in the day usually has a new address: update `document_url` and `printed_total` if needed, and run `record` again.

## The Budget for your household

`/budget/household/<event>` shows what the Budget's tax and benefit measures do to households: by income tenth, who gains and who loses, six example households before and after, a salary check readers run in their own browser, the measures left out and why, and the Treasury's own chart beside ours. It is built only from `data/build/budget/household/<event>.json`, which one command writes on the night from the measures editors type into `content/budget/household/<event>.yaml`. Readers never call PolicyEngine; the job does, once. How it works and what the live test found: `docs/MODEL.md`, T1, "The Budget for your household". `/budget` links the newest one by itself; until the night it links the rehearsal on Autumn Budget 2025.

It is data, like the scorecard, but it is our estimate, so **two editors** review the measures file in the pull request, as for cards: every value against its page.

### Before the day

- **Now to 21 October (content freeze):** the code, the templates and the rehearsal are merged.
- **When PolicyEngine's API moves to a new bundle** (6.3.x is certified; check `curl -s https://api.policyengine.org/v2/tax-benefit-models/by-country/uk`), run the live test again and compare with `docs/MODEL.md` (dates still read on 1 January? deciles still unadjusted for size?): `pnpm pe:probe` (four economy runs; `-- --households` for none). Commit the new fixtures folder.
- **Tuesday 27 October:** refresh the templates from PolicyEngine's current law (one call): `pnpm household -- templates`. Read the diff: a "without" value that moved is PolicyEngine catching up with the law, or a forecast change.
- **Tuesday 27 October:** rehearse the "no model" fallback once, offline, on last year's Budget, and put it back: `pnpm household -- build autumn-budget-2025 --no-model`, `pnpm validate`, then `git checkout data/build/budget/household/autumn-budget-2025.json`. Nothing is committed.
- **Tuesday 27 October:** on a branch `budget-2026-household`, start `content/budget/household/autumn-budget-2026.yaml` from the rehearsal's head (event `autumn-budget-2026`, name, date `2026-10-28`, `kind: budget`, years `2026-27` to `2030-31`, `headline_year: 2027-28`, `side_year: 2026-27`, the sources with `TODO` URLs). It stays on the branch: a `TODO` fails `pnpm validate`.
- On the machine that will run it: `pdftocairo -v` prints a version (poppler, for the Treasury's chart), `etl/.venv` exists, and `pnpm install --frozen-lockfile` has run.
- Rota: the owner runs the job; editor A types the measures, editor B the Treasury's chart and the second review; one of them is up at 05:00 GMT on Thursday for the fallback decision. In 2026 the scheduled tasks do the owner's and editor A's work and the chart ("Who does what" above); Pavel and Goodwill Stranger review.

### On the night (Wednesday 28 October into Thursday 29 October, GMT)

| When (GMT) | What | Who |
|---|---|---|
| 12:30 | The statement | Watch |
| About 12:45 | The Budget document (its table of policy decisions and the chapters that describe each measure) and "Supporting documents for Budget 2026" (with "Impact on households") on GOV.UK | — |
| 13:00 to 16:00 | Editor A: every tax and benefit measure into the measures file, from `_templates.yaml`, each figure with its page (step 2). Editor B: the Treasury's chart (step 3) | Editors A and B |
| 16:00 | `check` clean (step 4); first commit pushed | Owner |
| 16:30 | The run: about five economy runs, 3 to 5 minutes, up to 20 when PolicyEngine is busy (step 5) | Owner |
| 17:00 | Checks, pull request (step 6) | Owner |
| From about 19:30 | HMRC's tax information and impact notes: check every rate and threshold in the file against them; any change means a new run (step 5 again) | Editor A |
| 20:00 to 23:00 | Two editors review and approve; the owner merges; the deploy follows within minutes | Editors, owner |
| After the deploy | `curl -A LinkedInBot https://ledgergov.uk/budget/household/autumn-budget-2026` returns the title, description and image; `/budget` links it | Owner |
| 05:00 Thursday | Not approved yet, or the run failed? Start the fallback (below) | Owner, one editor |
| **07:00 Thursday** | **The page is live: in full, or as the fallback** | — |

### Steps

1. **Branch and pull.** `git checkout budget-2026-household && git pull origin main`.
2. **Type the measures.** For each tax or benefit measure in the policy decisions table, copy its block from `content/budget/household/_templates.yaml` into the file under `measures:`. Then:
   - `source`: the Budget document and the PDF page of the measure (`page: NN`), or HMRC's note; `scorecard_line`: its line in the policy decisions table;
   - `effective`: the day it starts;
   - `post`: the Budget's value for each year it changes, **in PolicyEngine's unit**: a rate of 22% is `0.22`, National Insurance thresholds are £ a week (£12,570 a year is `241.73`), fuel duty is £ a litre averaged over the fiscal year, `unlimited` for no limit;
   - `pre`: leave the template's value unless the Budget document says what would otherwise have happened (then set it and say where in `pre_source`); a value is the one for the whole fiscal year;
   - delete the parameters the measure does not touch.
   `modelled: true` means "goes into PolicyEngine's estimate": keep it, with the parameters, even while PolicyEngine is down. The salary check takes the Budget's income tax and employee National Insurance rates and thresholds from these parameters and nowhere else (no tax seed to fill for this page), and the "no model" fallback publishes them.
   A measure with no template, no PolicyEngine parameter, or that is a new tax: `modelled: false` with a `not_modelled` reason (`no_parameter`, `new_tax`, `needs_code`, `not_household_income`) and a plain note, often with the Treasury's own costing. Inheritance tax, corporation tax, business rates and 0% VAT on household electricity have ready-made blocks.
3. **The Treasury's chart.** In "Impact on households", find the decile chart as a percentage of net income (Figure 1.A in 2025) and, if there is one, in £ a year (1.B). If the Treasury publishes a table, type it with `read_from: table`. If not:
   ```bash
   curl -sLo /tmp/ioh.pdf "<Impact on households PDF URL>"
   python3 scripts/treasury_chart.py /tmp/ioh.pdf <page> <lowest axis label> <highest> <number of ticks>
   python3 scripts/treasury_chart.py /tmp/ioh.pdf <page> <lowest> <highest> <ticks> --order <tax>,<welfare>,<services>
   ```
   The first prints each colour's figures; match the colours to the legend, then the second prints the YAML block. Set `read_from: chart`, the title as printed, `year`, `covers` (what decisions it counts) and `differs`, the one line the page shows under both charts.
4. **Check, offline:** `pnpm household -- check autumn-budget-2026`. It lists every value that departs from PolicyEngine's current law: each needs its reason (PolicyEngine behind the law, or the Budget changing it). Commit and push the file.
5. **Run:** `pnpm household -- autumn-budget-2026`. It checks again, asks PolicyEngine, keeps every answer in `packages/server/test/fixtures/t1/household/autumn-budget-2026.json`, and writes the snapshot only if every check passes:
   ```
   ok    policies: the recorded policies (…) are exactly what the measures file sets
   ok    years: an answer for every year, 2026-27 to 2030-31
   ok    one_model: every answer from policyengine-uk …
   ```
   A change to the file after a run means running it again: an edit to a value needs `pnpm household -- autumn-budget-2026` (live); an edit to words only, `pnpm household -- build autumn-budget-2026` (offline, from the recording). `pnpm validate` fails while the snapshot is older than its file.
6. **Check it all,** one command at a time (16 GB machine; never two builds at once):
   ```bash
   pnpm validate -- --base origin/main
   pnpm typecheck
   for p in packages/schema packages/engine packages/server; do (cd $p && pnpm exec vitest run --maxWorkers=3); done
   pnpm build
   (cd apps/web && ./node_modules/.bin/next start -p 3204) & sleep 5
   curl -s -A LinkedInBot http://localhost:3204/budget/household/autumn-budget-2026 | grep -oE '<title>[^<]*|og:(title|description|image)" content="[^"]*'
   lsof -ti tcp:3204 | xargs kill   # next start leaves a next-server process: stop it by its port
   ```
   On the page: the deciles look like the Budget (who should gain gains), the six households move the way the measures say, every measure links to its page.
7. **Publish.** `git add content/budget/household/autumn-budget-2026.yaml packages/server/test/fixtures/t1/household/autumn-budget-2026.json data/build/budget/household/autumn-budget-2026.json`, commit, push, open the pull request. Two editors check every value against its page, the Treasury figures against the PDF, and the page on the preview; then merge.

### When something fails

| Message | What it means | What to do |
|---|---|---|
| `check`: PolicyEngine has no parameter … | A typing slip in the path, or a lever PolicyEngine lacks | Copy the path from the template; if there is none, mark the measure not modelled |
| `check`: … is not a rate: PolicyEngine writes 20% as 0.2 | A rate typed as a percentage | Divide by 100 |
| `check`: no pre (or post) value for 2029-30 | A year left out | Every parameter needs every year |
| `check`: a TODO is left in the file | A placeholder | Fill it or delete it |
| `record`: the measures do not fit the model PolicyEngine runs today | PolicyEngine updated its model since the templates | `pnpm household -- templates`, then fix the named paths |
| `record`: PolicyEngine offers 2024 … 2030; it cannot run 2031-32 | Years beyond 2030-31 | Drop them from `years` |
| `record`: PolicyEngine http_5xx, timeout or network | The API is down or busy (no uptime promise; its busiest night) | Wait 10 minutes and run again: finished years come back from its cache at once. Keep trying until 05:00, then the fallback: the households only if PolicyEngine answers them, else the page without the model. If nothing has come back by 22:00, also commit `pnpm household -- build autumn-budget-2026 --no-model` to the branch, so two editors can review that page on the preview the same evening; a run that succeeds later replaces it |
| `record`: still computing … after 20 minutes | Its queue is long | As above |
| `build`: FAIL policies | The file changed after the recording | Run again (step 5) |
| `build`: FAIL one_model | PolicyEngine updated during the run: two models in one comparison | Run again; every year is computed again on the new model |
| `build`: FAIL years, economy or households | An answer missing or not in the expected shape | Run again once; if it repeats, the fallback, and tell the lead |
| `validate`: … changed after this snapshot was computed | The file was edited after the run | Step 5 again (or, with no model, `build … --no-model` again) |
| `build`: FAIL calculator | The salary check's rates differ from the measures file's (a code fault, never a typing slip) | Stop and tell the lead; do not publish |
| `validate`: data/seed/uk_tax_2027-28.json: … the one place for the Budget's rates | A post-Budget tax seed was filled with figures the measures file does not have | Make the seed match the measures file, or delete it: this page does not need it |

### The fallback rule

If our deciles are not reviewed by two editors by **07:00 GMT on Thursday 29 October**, publish what is ready and add the rest when it is. Being right matters more than being first. At 05:00 the owner (in 2026 the scheduled task `budget-2026-household-fallback`) takes one of three paths:

| At 05:00 | What the page shows | Its share image | Then |
|---|---|---|---|
| The full run is approved | Everything (step 7) | Our deciles | — |
| PolicyEngine answered, at least for the example households, but the deciles are not reviewed | `hold: [deciles]`: the households, the salary check, the measures and the Treasury's chart; the summary, deciles and gains and losses "follow once two editors have checked it" | The six households | The deciles, once reviewed |
| PolicyEngine cannot be reached at all | No model: the salary check, every measure with its page and the Treasury's chart; the summary, deciles, gains and losses and households "follow once PolicyEngine answers" | The Treasury's chart (or, with none, the salary check on three salaries) | Everything else, once PolicyEngine answers |

**PolicyEngine answered: hold the deciles.**

1. At 05:00, if the full run is not approved (or failed): add `hold: [deciles]` to the measures file.
2. If the recording has the households (`record` got that far), rebuild offline: `pnpm household -- build autumn-budget-2026`. If it has none, ask for the households only (two calls, no population runs): `pnpm household -- record autumn-budget-2026 --households-only`, then `build`. If that fails with http_5xx, timeout or network twice, 10 minutes apart, take the "no model" path below instead (remove the `hold` line first).
3. The page then shows the summary, the deciles and gains and losses as "follows once two editors have checked it", and everything else in full; its share image shows the six households. Two editors check the six households and the Treasury's figures (a short review), and it merges.
4. When the deciles are reviewed: remove `hold`, run `pnpm household -- autumn-budget-2026` (or `build`, if the full recording is the reviewed one), open the pull request, two editors, merge.

**PolicyEngine cannot be reached at all: publish without the model.** The salary check, the measures and the Treasury's chart need no model, so the page still goes up by 07:00. Nothing in the measures file changes, so the normal run later uses the same file.

1. Check the file offline (the committed copy of PolicyEngine's parameters; no network):

   ```bash
   pnpm household -- check autumn-budget-2026
   ```

2. Build without the model. It ignores any recording and writes the snapshot only if both checks pass:

   ```bash
   pnpm household -- build autumn-budget-2026 --no-model
   ```

   ```
   ok    model: no model answers: built without PolicyEngine. N of M measures go into its estimate once it answers; …
   ok    calculator: the salary check's rates are the measures file's for every rate and threshold both have …
   ```

3. Check it all (step 6, one command at a time). On the page: the "Not yet in full" box; the salary check on £25,000, £45,000 and £120,000 against HMRC's notes; every measure links its page; the Treasury's chart; "To follow" lists the four parts; no empty chart. `curl -A LinkedInBot` returns the title, description and image (the Treasury's chart).
4. Publish: `git add content/budget/household/autumn-budget-2026.yaml data/build/budget/household/autumn-budget-2026.json` (no recording), commit, push, open the pull request "The Budget for your household: without the model until PolicyEngine answers". Two editors check every value against its page and the Treasury's figures against the PDF, then merge before 07:00.
5. Every 30 minutes from 07:00, see whether PolicyEngine answers: `curl -s -o /dev/null -w "%{http_code}\n" https://api.policyengine.org/uk/metadata` (200 is up). When it does, on a new branch from `main`, run the normal job, with no change to the file: `pnpm household -- autumn-budget-2026`. It replaces the snapshot whole (nothing of the no-model one is kept); once merged, the page fills in with no other change. Then step 6, step 7 with the recording, two editors review the results, merge. If they cannot review the deciles straight away, hold them as above.

If even the measures cannot be reviewed by 07:00, there is no household page that morning: the scorecard, `/budget` and the cards carry it, and the page follows when two editors have checked it.

## The leak tracker and the headroom

- **[/budget/leaks](https://ledgergov.uk/budget/leaks)** fills from Monday 19 October ([EDITORS.md, "How to add a leak"](EDITORS.md#how-to-add-a-leak)). On the evening of the Budget, in the same pull request as the cards or its own, every entry gets what the Budget did: `announced` or `not_in_budget`, a `budget:` block with the page of the Budget documents that shows it, and the official cost if the Treasury's table gives one. Two editors approve, as always. Until then the page says plainly which entries are only trailed.
- **[/budget/how-it-works](https://ledgergov.uk/budget/how-it-works)** shows the OBR's headroom against each fiscal rule from the "Performance against the Government's fiscal targets" table of each EFO that assessed them. Nothing to type: the nightly data run finds the new EFO, reads that table from its last chapter workbook and opens the data pull request; once merged, the page and its share image show the new assessment beside the old ones. If the OBR publishes on GOV.UK only, or the table moves, the build warns ("newer than the newest recorded assessment") and the page says the assessment is being added: run `pnpm etl` from a normal connection ([OPERATIONS.md, "11. OBR data by hand"](OPERATIONS.md#11-obr-data-by-hand)). Use the same table for the fiscal rules card above.

## Rules that matter most on the day

- **Only documents move cards.** The speech, briefings and press coverage are leads; the Budget documents, the OBR and legislation are evidence.
- **One standard.** Every card the Budget touches is updated the same evening, whatever the party.
- **Two editors** approve the pull request before it merges, as always. If only one editor is free, it waits until the morning: being right matters more than being first.
- **No guesses.** If a document gives a total for several years and no yearly split, the card says so, as now.
