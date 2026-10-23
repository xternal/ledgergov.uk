# The weekly desk: LedgerGov.UK

Every Sunday at 20:00 UK time the weekly ledger desk, a scheduled task on Pavel's Mac, works through each of his ledgers in turn, one at a time. For LedgerGov.UK it reads this file on `main` and follows it. Pavel decided it on 20 October 2026 (docs/DECISIONS.md, "One weekly desk for every ledger"). To change what it does here, change this file by pull request.

It does three things: new promises (the editor's desk, `docs/desk/ROUTINE.md`), a check on the promises already on the site, and a check that the site's jobs and pull requests are healthy. The nightly jobs already add `deadline_missed` events (`pnpm deadlines`) and score the forecasts against outturn (`etl.backtest`), so the desk does not repeat them.

## Rules that never bend

The rules in `docs/desk/ROUTINE.md` apply to every step here, and also:

1. **Never merge, approve or turn on auto-merge**, and never add the `merge-when-green` label. Pavel merges.
2. **Only a document moves a status** (`docs/PROMISE_STANDARD.md` §3). Never set `delivered`, `failed` or `quietly_dropped`: list them for an editor instead.
3. **History is append-only.** Add events at the end of `events`; never edit or remove an existing entry (`content/README.md`).
4. **A source that refuses is reported, never worked around**: no proxies, no browser user agent, no CAPTCHA.
5. **Silence when there is nothing to say.** A step that finds nothing adds nothing to the hand-back: no "nothing found" lines.
6. **Say each thing once.** Keep what steps 2 and 3 report in `~/dev/weekly-desk-state/ledgergov.uk.tsv`, outside every repository: one line per item, a key such as `pr:123`, `run:<workflow name>`, `issue:45`, `link:<url>` or `card:<id>`, a tab, and the date it was first reported. Report an item only when its key is not in the file yet, or once more, marked "still open since <date>", when it is still open four weeks after that date. Remove the keys that no longer apply: a pull request merged or closed, a job that passes again, a link that works, a card an editor has decided.

## 0. Where you work

The coordinator gives you the main checkout's path. Never work in it: other sessions may have work there.

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.4/bin:$PATH"
git -C <main checkout> fetch origin --prune
git -C <main checkout> worktree remove --force ../wt-desk-run   # only if a leftover one exists
git -C <main checkout> worktree add --detach ../wt-desk-run origin/main
cd <main checkout>/../wt-desk-run
pnpm install --frozen-lockfile
git checkout -- pnpm-workspace.yaml
```

Switch branches inside this worktree as each step needs. At the end, stop any server you started and remove the worktree (`git worktree remove --force`).

## 1. New promises: the editor's desk

Follow `docs/desk/ROUTINE.md` from step 1 to step 8, reading its section "On Pavel's Mac". Its report goes in your hand-back. Pavel decided on 13 October 2026 that the desk sorts what the daily intake found and does not search for more promises beyond its step 6.

## 2. The promises already on the site

### 2a. Deadlines missed a month ago

An editor confirms `quietly_dropped`, or records what happened, 30 days after the nightly `deadline_missed` event (`docs/PROMISE_STANDARD.md` §3). Find the cards whose `deadline_missed` event is 30 or more days old and whose status is not `delivered`, `failed`, `quietly_dropped` or `unscoreable`. For each, the oldest first and at most 10, look for what happened after the deadline:

- GOV.UK: `curl -s "https://www.gov.uk/api/search.json?q=<key words>&filter_public_timestamp=from:<deadline>&count=20&fields=title,link,public_timestamp,format"`;
- legislation.gov.uk for an Act or a statutory instrument;
- Parliament's written statements: `https://questions-statements-api.parliament.uk/api/writtenstatements/statements?searchTerm=<key words>&madeWhenFrom=<deadline>`.

Change no card. Give Pavel one line per card in the hand-back: the card's link (`https://ledgergov.uk/promise/<id>`), what you found with its link (or "no document found"), and the status you would propose with the reason.

### 2b. Evidence on open cards

Pick at most 10 cards whose status is not final: first those whose deadline fell in the past 7 days or falls in the next 30, then those whose last event is oldest. For each, search the same three places for a document dated after the card's last event that shows a higher step of the ladder (§3 table: `in_plan`, `legislated`, `funded`, `delivering`).

- Save the document with `curl -sL <url> -o /tmp/<slug>.html`. The sentence that shows the step must be in the saved text word for word (`grep -F`); otherwise leave it.
- Append one event at the end of the card's `events`, in the card's own format (see `content/promises/uk-abolish-non-dom-2024.yaml`): `date` the document's date, `type` the step, `text.en` one neutral line naming the document and what it shows, `evidence_url` the document.
- Move `status` up to that step when it is higher than the current one, never above `delivering`. A document that shows `delivered`, `failed` or an official abandonment goes in the pull request body for an editor, with the link and the sentence; add no event for it.
- The actor saying it again in the same terms adds nothing. In different terms, it is a rewording (§4): a new version and a `reworded` event, its quote checked `exact` with `pnpm exec openpromises check-quote <id> --html /tmp/<slug>.html --record`, as in ROUTINE.md step 4.

Do this on a new branch `desk/<today>-evidence` from `origin/main`. Then `pnpm validate -- --base origin/main` and `pnpm test`, one after the other, must pass. Push, and open a pull request titled `Weekly desk <today>: evidence on N cards`, **without** the `intake` label, so it waits for Pavel: merging it publishes the events. Its body lists, per card, the event, the status change, the document and the sentence, then the cards for an editor (2a and the final steps). After pushing, wait for the checks (`gh pr checks <n> --watch`) and fix any that fail. No evidence and nothing for an editor: no branch, no pull request.

### 2c. Broken links

List every `source_url` and `evidence_url` in `content/promises/` and every URL in `content/actors/`. Check each with `curl -s -o /dev/null -w '%{http_code}' -L --max-time 20 <url>`, one at a time, leaving out `*.parliament.uk` web pages (they refuse curl). Report only `404` and `410`, with the card or actor and, if one exists, the newest Wayback copy (`https://archive.org/wayback/available?url=<url>`). Change nothing: an editor fixes a link with a correction (§9).

## 3. The site's health

Read these with `gh` and report only what needs Pavel:

- **Jobs that keep failing:** `gh run list --limit 200 --json workflowName,conclusion,createdAt,url,event,headBranch` for the past 7 days. Name each workflow whose latest scheduled run failed (link to the run and the failing step), and say whether an earlier run that week passed.
- **Pull requests waiting more than 7 days:** `gh pr list --state open --json number,title,createdAt,isDraft,labels,url`. For each, what it waits for (a review, a fix, a merge). The nightly data job's pull requests start no CI because a bot opened them (docs/OPERATIONS.md): say so when one is waiting.
- **Issues opened by jobs:** `gh issue list --state open --json number,title,createdAt,url`, for uptime or failure issues opened or updated this week.

Fix nothing here yourself: a fix goes to Pavel as a proposal.

## 4. Hand back to the coordinator

Return exactly one of these.

If no pull request was opened or added to, nothing failed and nothing needs Pavel, return the single word `Quiet.`

Otherwise:

```text
LEDGER: LedgerGov.UK
PULL REQUESTS: one line each: link, what it holds (N cards, N events), what Pavel checks, then `gh pr merge <n> --repo xternal/ledgergov.uk --merge` for those that are his to merge (intake pull requests merge themselves once he approves: say "approve" for those)
FOR AN EDITOR: the cards from 2a and 2b, one line each
BROKEN LINKS: one line each
HEALTH: one line each, only what needs Pavel
FAILED: what failed in this run and why, one line each
```

Leave out any heading with nothing under it.
