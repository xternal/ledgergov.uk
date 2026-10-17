# Leaks

One YAML file per measure briefed to the press before a Budget (`<id>.yaml`, named after its `id`), shown at [/budget/leaks](https://ledgergov.uk/budget/leaks). Empty until editors start on Monday 19 October 2026; an empty folder is an empty tracker.

How to add one, with a template and the review checklist: [docs/EDITORS.md, "How to add a leak"](../../docs/EDITORS.md#how-to-add-a-leak). The schema and its checks: `packages/schema/src/leaks.ts`; `pnpm validate` runs them.

- **Status moves only on evidence**: `trailed` (press only) → `confirmed` (said on the record) → `announced` (in the Budget documents) or `not_in_budget`.
- **A cost only with its source** and who made it; a total over several years is never a yearly figure.
- **An editor** approves every pull request that touches this folder, as for cards (one since 17 October 2026). Entries quote the press, so nothing here goes live before that.
- Unlike promise cards, entries are not append-only: a mistake is fixed in place, and the git history keeps the record.
