import type { NavLink } from "./NavLinks";

/**
 * The site menu, the same on every page, so a word always goes to the same place. Only pages of their own: the
 * statement, the sandbox and "your share" are the Money page; contributing is the button beside the menu. The same
 * pattern runs on every site of the family: five pages at most, Method last. People are the people, parties and
 * bodies whose promises the ledger tracks (/actor); the population and long-term spending page (/people) sits under
 * Money, with a card of its own on the home page (Pavel, 23 Oct 2026).
 */
export const SITE_LINKS: NavLink[] = [
  { href: "/money", label: "Money" },
  { href: "/promises", label: "Promises" },
  { href: "/actor", label: "People" },
  { href: "/mp", label: "Your MP" },
  { href: "/method", label: "Method" },
];

/** Where "Contribute" goes: the form on the home page. */
export const CONTRIBUTE_HREF = "/#contribute";

/**
 * Which menu item a page belongs to, from the `current` it passes. Pages written before the Money page passed the home
 * page's old sections ("/#statement", "/#scenario", "/#you") or "/budget": they are all under Money now, and so is
 * the population page. "/#contribute"
 * belongs to the Contribute button, not to a menu item.
 */
export function menuItemFor(current: string | undefined): string | undefined {
  if (!current || current === CONTRIBUTE_HREF) return undefined;
  if (["/#statement", "/#scenario", "/#you", "/budget", "/borrowing", "/tax", "/receipt", "/people"].some((p) => current === p || current.startsWith(`${p}/`))) return "/money";
  return SITE_LINKS.find((l) => current === l.href || current.startsWith(`${l.href}/`))?.href ?? current;
}

/** The family of sites, for the switcher on the logo: public money and promises, one ledger per country or place. */
export const FAMILY: { name: string; href: string; about: string }[] = [
  { name: "LedgerGov.UK", href: "https://ledgergov.uk", about: "UK public money and promises" },
  { name: "BoroughBook.UK", href: "https://boroughbook.uk", about: "London council money and pledges" },
  { name: "USLedger.org", href: "https://usledger.org", about: "US federal money and promises" },
  { name: "RussiaLedger.com", href: "https://russialedger.com", about: "Russia's budget, regions and promises" },
  { name: "UkraineLedger.com", href: "https://ukraineledger.com", about: "Ukraine's political promises" },
  { name: "Ruminator.xyz", href: "https://ruminator.xyz", about: "Russia's regional press, read every day" },
];
export const THIS_SITE = "LedgerGov.UK";
/** Who makes the family (the same as MAKER in lib/site, which the header cannot import: it is server code). */
export const FAMILY_MAKER = { name: "Pavel Guzhikov", url: "https://guzh.uk" } as const;
