# Decisions

The owner's decisions for LedgerGov.UK, newest first, in his words where he gave them, with what was done and what was deliberately not.

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
