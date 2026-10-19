# Content

One YAML file per promise card (`promises/<id>.yaml`) and per actor (`actors/<id>.yaml`), in **OpenPromises format v1** (`format: openpromises/1`) since 12 October 2026: the open format of the [OpenPromises](https://github.com/xternal/openpromises) engine, described in its `docs/FORMAT.md`. Rules: `docs/PROMISE_STANDARD.md`. Checked by `pnpm validate` and by the engine (`pnpm exec openpromises validate`, docs/OPERATIONS.md §15).

The site reads each file back into its own shape (`packages/schema/src/v1.ts` → `packages/schema/src/content.ts`), so pages, feeds and the API use the old names. What changed in the files:

| In the file (v1) | Was | Note |
|---|---|---|
| `area` | `policy_area` | |
| `responsible` | `outcome_by` | who must deliver it now |
| `versions[].parameters.cost.range` / `.by` / `.note` / `.sources` | `how_much_bn_per_year`, `costed_by`, `cost_note`, `cost_sources` | plus `cost.quality`: sourced, approx or modelled |
| `versions[last].parameters.deadline` | `deadline` | on `x.deadline` when the version has no parameters |
| `links.contracts`, `links.lever.settings`, `links.lever.label` | `contracts`, `lever_settings`, `preset_label` | a contract may carry a `note` saying why it is linked |
| `x.submission_ref`, `x.credit`, `x.editor_check_required` | the same names at the top | |
| `headline`, `status_note`, `venue_label`, events' `text`, `who`, `when`, `funded_by`, `cost.note`, notes, reasons | the same names | text a reader sees is a language map: `en: …` |
| actors: `identifiers.parliament_member_id`, `identifiers.parliament_party_id`, `standing: in_power` | top-level ids, `standing: government` | |

Write new cards in v1. The easiest start is a published card of the same kind, or the skeleton triage writes for a reader's submission.

- **Append-only.** Never edit or remove an existing entry in `versions` or `events`. Rewording adds a version and a `reworded` event; a status change adds an event. CI compares every card with `main` and fails on any edit, unless the edit fixes our own mistake and a `corrections` entry records it (`docs/PROMISE_STANDARD.md` §9). The card shows every correction.
- **Verbatim quotes.** `versions[].text` is copied exactly from `source_url`, and `quote_checked_on` records when someone confirmed it there.
- **Evidence.** Every status event except `promised`, `deadline` and `deadline_missed` needs an `evidence_url`.
- **Headline.** Every card has a `headline`: a neutral 3–8 word summary of what is promised, written from the quote alone, with no judgement ("Create Great British Energy", "Cap bus fares at £2", not "Labour's broken energy pledge"). It names the card in page titles, search results, lists and the Markdown for AI assistants; the quote stays the record. Start with a verb where you can, keep numbers the quote gives, and stay under about 50 characters so the page title (`<headline> – <speaker> promise, <status> | LedgerGov.UK`) fits in search results. A headline is not history: improve it in any pull request.
- **Official pages.** An actor's `same_as` lists official pages an editor has checked are about them (a party's own website, a GOV.UK profile or organisation page). Search engines use them to tell who is who. Never guess a URL; the UK Parliament page comes from `parliament_member_id` automatically.
- **Parliament ids.** An actor who is or was an MP has `parliament_member_id`, and a party `parliament_party_id`, both from the UK Parliament Members API. The "Your MP" pages (`/mp/<constituency>`) use them to show an MP's own promises and their party's. One id, one actor.
- **Contracts.** `links.contracts` lists the public contracts behind delivery by OCID, linked by hand (`docs/PROMISE_STANDARD.md` §10). The nightly job fetches them into `data/build/contracts/`; to fetch now, run `pnpm contracts`.
- **One editor** approves every pull request that touches this folder, after AI Journalist, our automated reviewer, has checked it: since 17 October 2026 Pavel Guzhikov's approval is the only one needed (it was two editors before; approvals already recorded stay valid).
- **Publishing by checks** (since 13 October 2026, OpenPromises 0.6.0). A card with `origin: manual` or `llm_intake` is published once every check passes, even before an editor has approved it on the card. It then needs its quote matched by a machine: a stored-source span, or `pnpm exec openpromises check-quote <id> --html <saved page> --record`, which must find the words exactly (docs/OPERATIONS.md §15). A reader's submission (`origin: reader_submission`) still needs an editor's approval on the card before it is published. Pavel decided on 17 October 2026 that one is enough, and the OpenPromises engine's check asks for one too since the site moved to OpenPromises 0.10.0 (`editorial.approvals: 1` in `openpromises.config.ts`).
- **The label.** Each card says how far it has been verified: "Not yet verified by an editor", "Checked automatically by AI Journalist, not yet verified by an editor", "Verified by Pavel Guzhikov" or "Verified by Pavel Guzhikov and 1 independent editor", followed by ", checked by AI Journalist" when AI Journalist has reviewed the card too (since OpenPromises 0.7.0). It is counted from the approvals in `reviews`; editors are named only if the private editors list says `named: true`.

## Drafts (`drafts/<date>/`)

Automatic intake (`pnpm harvest`, run daily by `.github/workflows/harvest.yml`) writes one draft per source and speaker to `drafts/<date>/<date>-<source id>-<n>.yaml`, and the text of each source it quotes, byte for byte, to `drafts/<date>/sources/<source id>.txt`. A draft's `quote` is the speaker's most checkable commitment in that source; since 19 October 2026 the speaker's other commitments there follow under `also`, so one release about one Bill is one draft, not one per measure. They arrive in a draft pull request labelled `intake`, one per day. Schema: `packages/schema/src/drafts.ts`.

- **Not published.** The site never reads drafts. A draft is a suggestion: who said it is only as sure as `speaker.check` says, and every `suggested` field is unverified.
- **The quote is exact.** `quote` is exactly the characters at `source_span` in the stored source text, and so is each `also` entry's `quote` at its own `source_span`. `pnpm validate` re-checks every one and fails on any difference, so no invented quote can reach a card.
- **Resolve every draft before merge.** For each quote in it (the `quote` and each `also` entry): check it at `source.url`, then write a full card in `promises/`, in format v1 (the quote goes in `versions[0].text`, `origin: llm_intake`, `quote_checked_on` set when you checked it; fill the four parameters from the source, using `suggested` only as a pointer), or leave it out. Delete the draft once every quote in it is decided, and `drafts/<date>/` with its `sources/` folder when it is empty. Nothing in `drafts/` is ever merged: CI fails while any draft is left, so the pull request turns green only when every draft is resolved.
- **One editor**, as for every card. The pull request merges only when editors are done: an editor has approved it (one since 17 October 2026) and CI is green on its latest commit, which means no draft is left (`.github/workflows/intake-merge.yml`, which no longer reads the repository variable `INTAKE_APPROVALS`). A model never merges anything.
- **Your own transcript:** `pnpm harvest -- upload --url <page> --title "…" --date YYYY-MM-DD --venue speech --file transcript.txt [--speaker "Name"]` (or `--youtube <url>` for captions) writes drafts the same way.
