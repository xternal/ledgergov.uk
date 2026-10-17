# Predict the Budget

Readers predict what a Budget will contain, see how everyone else predicted, and share their picks. After the Budget, editors record what the documents say and every set of predictions is scored. First used for the Autumn Budget on 28 October 2026 (Day 9; scoring is Day 13).

| What | Where |
|---|---|
| The form | [/budget/predict](https://ledgergov.uk/budget/predict), linked from [/budget](https://ledgergov.uk/budget) |
| A reader's predictions, to share | `/budget/predict/r/<code>`: noindex, its own share image of their picks |
| The questions | `content/predict/<set id>.yaml`, one file per Budget; schema in `packages/schema/src/predict.ts` |
| Storage and rules | `packages/server/src/predict/`, table `prediction` (migration `007_predictions`) |
| API | `POST /api/predict`, `GET /api/predict/crowd`, `POST /api/predict/shared` |

## The questions

Editors change them in a pull request, like a card, and an editor approves the wording before launch (one approval since 17 October 2026; the launch set was approved by two). `pnpm validate` and the build check every file: 8 to 10 questions, unique ids, 2 to 5 options each, sources, the document that settles it, and the closing time in UTC on Budget day.

Each question:

- asks what the Budget **will** do, never what it should, in plain words with no judgement, and is about the government's decisions, never a party (the one standard, CLAUDE.md invariant 6);
- has answers that cover every outcome without overlapping, so one line in one document settles it (`settled_by` names the document and table);
- says why it is asked (`why`), with dated sources (`sources`).

Ids are stored with readers' predictions. **Once predictions open, never change an id or what an option means**; fixing a typo is fine. A new Budget gets a new file with a new set id; the page always asks the set with the latest `closes_at`, and older sets stay so their share links keep working.

## Closing

`closes_at` in the YAML is the one setting (12:30 GMT on 28 October 2026, when the statement is expected to start). The server refuses predictions from that moment (410), the form closes itself in the browser at the exact time, and the page re-renders within five minutes to say predictions are closed. If the statement time moves, change `closes_at` and deploy before the old time.

## What is kept

A random 10-character code (the share link), the set id, the answers (`{ question id: option id }`) and the hour they were made. No name, email, IP address, user agent or cookie. Rows are deleted 13 months after they are made, by the daily maintenance job (`runMaintenance`). Spam controls are the site's own: the ALTCHA proof of work and a limit of 30 sets per connection per day, counted in the salted daily buckets that store no IP. The privacy notice (`/privacy#predict`) says the same.

How everyone predicted is shown only once at least `FOLLOWER_COUNT_THRESHOLD` sets exist (50 by default, the same minimum as follower counts), and before then not even the total. Before predictions close, a reader sees the totals only after sending their own (in the answer to `POST /api/predict`), so the crowd does not steer anyone; from the close, `/budget/predict` shows them to everyone.

Usage counts (server-side, daily, no ids): `prediction_made` by set, `prediction_blocked` by reason, `prediction_shared` by method (native share sheet, copy link, WhatsApp, Telegram, X, LinkedIn, Facebook, email).

## Sharing

After sending, the reader sees their link with a Share button: on phones (any browser with the Web Share API) it opens the system share sheet; elsewhere it copies the link. Under it are plain links to WhatsApp, Telegram, X, LinkedIn, Facebook and email; no third-party script loads until the reader picks one. The shared page shows their picks and the call to make your own; its 1200×630 image reads "My Budget predictions" with every pick, the Budget's date and when predictions close.

## After the Budget: scoring (Day 13)

1. Editors read the documents named in each question's `settled_by` (docs/BUDGET_DAY.md lists them) and fill in `answer` (an option id) and `evidence_url` (the exact page, `#page=NN` for a PDF) for every question, in one pull request. An editor approves it, as for a card. The schema refuses an answer that is not one of the options, or an answer without its evidence.
2. `scorePrediction(round, answers)` in `packages/schema/src/predict.ts` already gives `{ right, settled }`: one point per question whose answer matches, counting only settled questions, so a partly settled set gives a partial score.
3. To build on Day 13: show the answer and evidence under each question on `/budget/predict`; show "7 out of 10" on each `/budget/predict/r/<code>` page and in its share image; and how the crowd did per question (`crowd()` counts already exist). The share pages re-render hourly, so scores appear without a deploy once the answers are merged.
4. Before the rows are deleted (13 months), copy the totals per option into the YAML or a data file if they should be kept for good; totals are not personal data.
