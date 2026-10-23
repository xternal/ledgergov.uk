# Decisions

The owner's decisions for LedgerGov.UK, newest first, in his words where he gave them, with what was done and what was deliberately not.

## A short menu, a Money page, and a first screen of cards (23 Oct 2026)

Pavel, looking at the menu: "it is soooo big.. too big?", then "maybe we should rethink first screen? have a glance of Main Thing we have here: key number(s), promises block, play sandbox ledger with gov money. i want a person to understand both The Scale of our Data and the Easiness he now has", "and a logbook of last changes/additions/check down is a good idea", "we can have a switcher somewhere to easy-go on sister sites and guzh.uk and ruminator.xyz". From the sketches (https://claude.ai/artifact/CoD6wVe8TE26xAqCF4HPpW) he chose option A, "but i'd some more widget cards there and give Header less vertical pixels", then "Build option A as redrawn".

**Done:**

- **The menu** has six pages: Money · Population · Promises · People · Your MP · Method (`components/siteLinks.ts`). Pavel: "'People' = /actor (a-la Managers 🙂), 'Population' = current_people_link". People are the people, parties and bodies whose promises the ledger tracks, and their pages highlight it. Population is the population and long-term spending page, beside Money. Four of the eight old items were sections of the home page. Contribute is a button beside the menu. The header is one row, 48px. Pages that still pass an old item (`/#statement`, `/#scenario`, `/#you`, `/budget`) are highlighted under Money (`menuItemFor`). The same pattern goes to every site of the family: five pages at most (LedgerGov.UK has six), Method last.
- **The family switcher** beside the logo (`components/FamilySwitcher.tsx`, a `<details>` that opens without JavaScript): LedgerGov.UK, BoroughBook.UK, USLedger.org, RussiaLedger.com, UkraineLedger.com and Ruminator.xyz, each with one line, and guzh.uk. This is a second place that names Ruminator.xyz, besides the "Also by the author" card below; Pavel asked for it.
- **The Money page** (`/money`): the statement, the sandbox and "your share", which were the home page's first sections. Old links to them (`/#statement`, `/#scenario`, `/#you`, with a scenario's `?s=`) open there.
- **The first screen** (`components/HomeFirstScreen.tsx`):
  - a one-line headline;
  - the year's figures (the KPI strip);
  - the promises at a glance;
  - one sandbox lever (the basic rate, from the model, carried into the full sandbox);
  - four promises to watch: the latest delivered, the latest not met, the one due next, and the latest with a forecast at the time;
  - the way to your MP;
  - the logbook of what was added, moved, corrected or checked.

  The tiles and the logbook are picked by fixed rules from the cards (`packages/schema/src/home.ts`), never by hand. A card counts as added on its first review, and an editor is named only when they chose to be. The engine's spotlight (OpenPromises decision 30) follows the first screen.

**Deliberately not done:** no change to the other sites yet. LedgerGov.UK goes first, so the pattern is judged on real pages before it spreads.

## One weekly desk for every ledger (20 Oct 2026)

Pavel asked whether one routine every Sunday should do the background work for all his ledgers: new promises, a check on the promises already published, new emergencies, and any other data to check, add or confirm. He took the recommendation: "go, follow your recos".

**Done:** one scheduled task on Pavel's Mac, the weekly ledger desk, every Sunday at 20:00 UK time from 25 October 2026. It works through LedgerGov.UK, RussiaLedger.com, BoroughBook.UK, UkraineLedger.com and USLedger.org one at a time, each by its own `docs/desk/WEEKLY.md`, and sends one report, or nothing when there is nothing new. For this site that is the editor's desk (`docs/desk/ROUTINE.md`, moved from the Monday cloud routine, now paused), plus four new checks: evidence on open cards, the cards whose deadline was missed a month ago (an editor confirms them, PROMISE_STANDARD §3), broken links, and the health of the site's jobs and pull requests.

**Why on the Mac, not in the cloud:** one task for every ledger has to run where every ledger's sources can be read. RussiaLedger.com needs archive copies (every connection from the cloud to web.archive.org was reset on 19 October 2026), and BoroughBook.UK reads the council's site and the parties' pages in the app's browser. If the Mac is off at 20:00, the task runs when the app next opens.

**Deliberately not done:** no search for promises beyond the desk (Pavel's decision of 13 October 2026 stands: finding is not the bottleneck). The AI Journalist backtest stays monthly, because a week gives too few drafts to measure. The nightly `deadline_missed` events and the forecast backtest stay nightly.

## The actor page as one story, with official portraits (20 Oct 2026)

Pavel chose the layout: "i like everything in C and the timeline of B! mix it" (the "Chosen" artboard on https://claude.ai/artifact/2rAuASPyGcT6ZYs1cLSys7), after his four answers recorded below ("1 ye to parliament portarait or any other official photo available ; 2 yes ; 3 yes ; 4 yes to sketches"). OpenPromises decision 34 built the timeline, the key promises and the promises by month for every site (0.14.0, released 20 October 2026, approved by Pavel).

**Done:** every actor's page in that layout (docs/OPERATIONS.md §15), the site on OpenPromises 0.14.0, and UK Parliament's official portraits with their credits for every MP on the ledger (§18).

**Deliberately not done:** no photo for anyone without an official portrait under an open licence. Zack Polanski is not an MP, and the licence of London City Hall's photo is not stated. No portrait in the share images yet.

**Then, Pavel: "no photo https://ledgergov.uk/actor/rishi-sunak":** Rishi Sunak's page shows Parliament's official portrait of 2017 (CC BY 3.0, "©House of Commons" as Parliament's list still credits him), marked "Official portrait, 2017". Parliament no longer serves a full-size portrait of him and has no newer one, but the 2017 picture is still the thumbnail its Members API gives for him; the file is the copy of Parliament's original on Wikimedia Commons (docs/OPERATIONS.md §18). Decided: an older official portrait counts when Parliament itself published it under an open licence and has none newer.
## Key figures: their accounts, their names and their speeches (20 Oct 2026)

Pavel: "why https://ledgergov.uk/actor/andy-burnham doesn't have https://www.instagram.com/andy.burnham/ or https://www.facebook.com/BurnhamGM ? I want key figures to have social links (Sir Kier Starmer (add Sir), Rishi Sunak, Andy Burnham, Badenoch)", then "yes" to filing a leader's speech promises under the leader.

**Done:**

- Official accounts (content/README.md "Official pages"): when Parliament's contact record lists none, a person's own official website counts, and so does an account an editor names once it has been opened and says it is theirs. Andy Burnham, Sir Keir Starmer, Rishi Sunak and Kemi Badenoch now have their websites and accounts; Kemi Badenoch and Zack Polanski are new on the ledger.
- Names: a person's name is the one UK Parliament displays, without its "Mr" or "Ms" for namesakes, so "Sir Keir Starmer" and "Dame Angela Eagle".
- Who said it (content/README.md): a promise goes under the person who said it, a party's own document under the party. Two cards moved, each saying so in its status note: Kemi Badenoch's 2025 conference pledge to abolish stamp duty (from the Conservative Party) and Zack Polanski's 2026 conference pledge of a windfall tax on bank profits (from the Green Party).

**Then, Pavel: "3 - yes":** the two Conservative cards from Julia Lopez's Commons statement of 9 September 2026 "for the Conservatives" moved to her (`uk-con-cheap-power-plan-2026`, `uk-con-zev-mandate-abolition-2026`), with her actor file (Shadow Minister (Business, Innovation, Science and Trade) since 31 August 2026, her website and X from Parliament's contact record).

**Deliberately not changed:** the Liberal Democrat £15,000 allowance card stays under the party, because its quote is the party's news release, not the leader's speech.

## Every area on every actor's page, and the actor page as a special project (20 Oct 2026)

Pavel's complaint about the Prime Minister's page: it showed what he promised on pints, VAT and bus fares, but nothing on energy, AI or the long-term future, and a reader could not tell "promised nothing" from "not recorded". OpenPromises decision 33 (0.12.0) answers it with `areaCoverage()`. The same day, seven cards from his speeches since 20 July 2026 were added (#135).

**Done:**

- Every actor's page has a "Promises by area" table after its track record: every area the site lists, with the actor's published promises in it and where they stand, and "None recorded" for an empty area, with a line saying that means not on the ledger yet (docs/OPERATIONS.md §15). The same list for every actor (invariant 6).
- The site moved to OpenPromises 0.12.0, and the same evening to 0.13.0 (its stylesheet's dark mode is dark brown; the site uses its own styles, so nothing it serves changes; `pnpm parity:check`).

**Decided, to be built after sketches** (Pavel, about 20:30 BST: "1 ye to parliament portarait or any other official photo available ; 2 yes ; 3 yes ; 4 yes to sketches"):

1. An official photo for every person who has one: UK Parliament's official portrait, or another official photo, with its credit, once its licence is confirmed. The same rule for everyone; parties and public bodies have none.
2. "Key promises" on an actor's page are chosen by the home page's rule (the engine's `spotlight()`: the latest changes and the open promises due next), never by hand.
3. The timeline of an actor's promises and the key-promises rule are built in OpenPromises first, so BoroughBook.UK and RussiaLedger.com get them too.
4. Two or three layouts are sketched for Pavel to choose from before anything is built.

## The repository is named after the site (20 Oct 2026)

Pavel, about 17:55 BST: "can we rename the repo public-ledger to ledgergov.uk please?" The GitHub repository `xternal/public-ledger` became `xternal/ledgergov.uk` at about 18:00 BST, in line with naming products by their domain (OpenPromises decision 25). GitHub redirects the old address for web links, the API, `git clone`, `fetch` and `push`, as long as no new repository takes the old name.

**Done:**

- Links and defaults that name the repository now use the new name: the source-code link (`SOURCE_CODE` in `apps/web/lib/site.ts`), the links to the promise standard and the method on the card, area, API and household pages and in the Markdown for AI assistants, `SECURITY.md`, the ETL's user agent, the `GITHUB_REPOSITORY` default in `packages/server/src/config.ts`, the setup scripts and the commands in `docs/`.

**Deliberately not changed:**

- Code names: the workspace package `public-ledger`, the Vercel project `public-ledger` and its `*.vercel.app` addresses, the bot's git name `public-ledger-bot`, the engine setting `legacy: "public-ledger"` (the name of this site's old card format in OpenPromises), and the salt of the alpha password cookie (changing it would sign everyone out).
- History: card reviews, notes, run files and earlier entries here that cite `xternal/public-ledger#<number>` keep those words; the links redirect.

## OpenPromises releases install at once, with a provenance check (19 Oct 2026)

Pavel's reply, about 16:09 BST: «решение 32 как предложено» ("decision 32 as proposed"), OpenPromises decision 32. The sites install the engine's packages as soon as a release is published, instead of a day later; in exchange CI checks where each package came from.

**Done:**

- `pnpm-workspace.yaml` gains one line, `minimumReleaseAgeExclude: ["@openpromises/*"]`, and nothing else. Every other package still waits pnpm's 1,440 minutes.
- CI's app job, the one that runs `pnpm exec openpromises validate`, checks the packages right after installing, before any of their code runs: `npm audit signatures` at the root and again in `apps/web` (the only place `@openpromises/react` is reached), then `pnpm openpromises:provenance`. That script (`scripts/openpromises-provenance.ts`, copied from RussiaLedger.com's) checks every `@openpromises/*` package in `pnpm-lock.yaml`: it was built by `.github/workflows/release.yml` in github.com/xternal/openpromises from `refs/tags/v<version>`, its attestation's subject sha512 equals the registry's `dist.integrity`, and the lockfile pins that same tarball. RussiaLedger.com's reads its root `node_modules/@openpromises`; this workspace keeps the packages in three places (the root, `packages/schema`, `apps/web`), so it reads the lockfile, which is what CI and Vercel install. `packages/server/test/openpromises-provenance.test.ts` has RussiaLedger.com's tests and checks the workspace file.
- The site moved from OpenPromises 0.6.0 to 0.10.0 the same day, in the same pull request: `editorial.approvals: 1` (Pavel, 17 Oct 2026; OpenPromises decision 27, which 0.7.0 accepts), and the label "Verified by Pavel Guzhikov, checked by AI Journalist" where AI Journalist has checked the card too.
- docs/OPERATIONS.md §15 says how to adopt a release, and CLAUDE.md no longer waits a day.

**Deliberately not done:**

- No other package skips the wait, and the wait is not shortened.
- No version range: the packages stay pinned to one exact version and move together, in a pull request of their own.

## AI Journalist backtest fixes (19 Oct 2026)

Pavel's words, on 19 October 2026 at 15:59 BST: «чини бэктест как рекомендовано» ("fix the backtest as recommended"). It acts on the OpenPromises session's backtest of AI Journalist over the three sites' git history, run the same day.

**What the backtest found for this site.** Of the drafts the daily intake opened, 39% became published cards (198 drafts, 76 published). It was 23% before the intake was tightened on 12 October 2026 (only commitments someone can check become drafts), and 50% once the weekly desk sorted the drafts. Recall cannot be measured: nobody knows how many promises the intake never proposed. The desk's run files give the main reasons for dropping a draft: a process step inside government (23 drafts) and a one-off grant (5). Three more findings: one GOV.UK release on 14 October gave seven drafts for one Bill (two cards, five duplicates); intake/2026-10-10 and intake/2026-10-11 were never merged and are in no desk run file; and intake/2026-10-18 landed four hours after Monday's desk run.

**Changed:**

- **One draft per source and speaker.** Before any draft is written, the harvester folds the candidates of one source by one speaker, or with overlapping quotes, into one draft (`packages/server/src/harvest/fold.ts`). Its `quote` is the most checkable (a deadline first, then a figure); the others follow under a new optional `also` list in the draft format (`packages/schema/src/drafts.ts`), each checked word for word at its own span by `pnpm validate`. Nothing is dropped: the desk can still make several cards from one draft. This was simpler than matching quotes across drafts, since the 14 October quotes did not overlap. The prompt also says that the measures of one Bill or scheme are one commitment. Test: `packages/server/test/harvest-fold.test.ts` replays the model's seven 14 October proposals against the stored release and gets one draft holding all seven.
- **Process steps and grants dropped at extraction.** The prompt gives the model two more labels, `process` and `grant`, with the desk's own definitions from `docs/desk/ROUTINE.md`, and fixed rules (`packages/server/src/harvest/rules.ts`) drop the common cases the model still calls commitments. The rules read the quote only, so every speaker and party is treated the same. Test: `packages/server/test/harvest-rules.test.ts` runs them on the desk's 28 real dropped quotes (they catch 24, all five grants among them; four are left to the model, because a fixed rule for them would also catch real commitments) and on all 130 quotes of the 125 cards on `main` today (they drop none). Run over all 151 drafts of the intake days from 8 to 18 October, they drop only those 24.
- **No orphan intake branches.** The desk now sweeps every open intake branch, whatever its date: a branch is open while it still holds drafts and `main` has no run file for its day. A branch whose pull request an editor closed by hand gets its run file from the desk, recording the editor's reasons. `pnpm harvest -- stale` names every open branch more than seven days old; the intake workflow runs it daily as a warning that never fails the run (`old-branches` job in `.github/workflows/harvest.yml`), and the desk puts its output in its report. Test: `packages/server/test/harvest-stale.test.ts`, on the branches as they stood today.
- **Policy papers and consultation outcomes in the daily intake.** The daily harvest reads GOV.UK documents of both kinds the morning after they appear (`fetchGovukPapersDay` in `packages/server/src/harvest/sources/govuk.ts`): each HTML document first published that day, up to ten a day and three per publication, without Easy Read, sign language, Welsh or annex versions, and never PDFs. A department speaks for itself in its own paper, as in its press releases, and the same word-for-word check keeps or drops every quote. The desk's step 6 becomes a check for what the intake missed. Test: `packages/server/test/harvest-sources.test.ts`, on GOV.UK's recorded answers for 16 October 2026.
- `docs/desk/ROUTINE.md`, `docs/OPERATIONS.md` §10 and `content/README.md` say all of this. Run files now count quotes as `candidates` and draft files as `drafts`.

**Deliberately not done:**

- The two old branches are not triaged here. Their pull requests (#75 and #86) were closed on 12 October with comments turning each draft down; the next desk run records those reasons in run files.
- No reminder issue: a warning on the daily run and a line in the desk's report, so nothing new needs a token or permission.
- No change to the OpenPromises engine, its version or `openpromises.config.ts`. The intake is this site's own code.
- Recall is still unmeasured.

## Promises close to the way in (19 Oct 2026)

Pavel's reply, about 14:54 BST: «UX как рекомендовано» ("UX as recommended"), OpenPromises decision 30. He asked for promises to stand out nearer the entrance of each of his sites, with one approach for all, so readers see they are worth opening. LedgerGov.UK's home page showed them fifth.

**Done (OpenPromises 0.10.0):**

- The engine's `PromiseSpotlight` is second on the home page, after the site's own opening and before the headline figures and the budget statement, which stays the main product (`components/Ledger.tsx`; rendered on the server by `app/page.tsx`). It shows how many promises are tracked and where they stand, the three latest changes and the three open promises due next, each a link to its card ending "Open the promise →", then "All promises →".
- The engine picks the cards by its rule (`spotlight()`), never by hand, from the cards /promises lists (`packages/schema/src/spotlight.ts` reads them in format v1 with `openpromises.config.ts`). The page is built for its build day, like /promises.
- The opening ends with "N promises tracked →", in the engine's words, linking to /promises.
- Every row of the site's own promise list ends "Open the promise →", as the engine's `PromiseList` does since 0.10.0; it is hidden from screen readers, since the whole row is already the link. "Promises" stays in the menu.
- The site's look, not the engine's stylesheet (whose dark mode is navy): white, hairlines, one typeface, numbers first, rows and status pills as on the site's own list (`.op-spotlight` in `app/globals.css`). On wide screens the latest changes and the promises due next sit side by side, so the statement stays near the top. Where a party stands reads as on the site's lists ("in government", "in opposition", "public body"), set through `standing.*` in the configuration's `messages`.
- No numbers written into components: the count, the statuses, costs and deadlines all come from the cards.

**Deliberately not done:**

- The "Promise ledger" section further down stays as it was (party filter, track record, the contribute form).
- No featured or hand-picked promise, and nothing placed or varied by party (invariant 6).
- No before-and-after count of visits: decision 30 asks that of RussiaLedger.com, which has its own page counter.

## Also by the author (Pavel, 19 Oct 2026, about 14:50 BST): «Ruminator как рекомендовано»

Pavel's reply ("Ruminator as recommended") to a recommendation on where his other project, Ruminator.xyz, is mentioned on each of his sites. For LedgerGov.UK it recommended a card above the footer and a line in llms.txt, and nothing more.

**Added:**

- A small "Also by the author" card above the footer on every page (`components/AlsoBy.tsx`, rendered once by the root layout `app/layout.tsx`). It takes no props, so it is the same on every page. It is white, in the site's one typeface, under a hairline rule, with no images and no brand colours. The copy reads: "Ruminator.xyz" (linking to https://ruminator.xyz/), "Russia's regional and local press, read every day: what each kind of outlet reports, and how. Every claim is kept in its original Russian words and checked word for word against an archived copy of the article.", "For journalists, analysts, researchers and diplomats who follow Russia from outside. By invitation, paid subscription." and "Request access" (linking to https://ruminator.xyz/request-access).
- An "Also by the author" section at the end of `/llms.txt` with one line: "- [Ruminator.xyz](https://ruminator.xyz/): Russia's regional and local press, read every day; by invitation, paid subscription."
- The name, the copy and both addresses live in one constant, `ALSO_BY` in `apps/web/lib/site.ts`. `packages/server/test/also-by.test.ts` checks the card's copy and links, that it is rendered only by the root layout, and the llms.txt line.

**Deliberately not done:**

- No line above the header.
- No placement or variation on any page about Russia, defence or NATO, or on any particular promise, party or person: the card is never chosen per page. One standard for everyone (invariant 6).
- No Ruminator figures, no images or logos, and no query strings or campaign tags in the links. Links carry `rel="noopener noreferrer"` (and `target="_blank"`, as the site's other outside links do). Nothing is counted or tracked (invariant 7).
