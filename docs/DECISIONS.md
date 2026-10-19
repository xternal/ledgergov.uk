# Decisions

The owner's decisions for LedgerGov.UK, newest first, in his words where he gave them, with what was done and what was deliberately not.

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
