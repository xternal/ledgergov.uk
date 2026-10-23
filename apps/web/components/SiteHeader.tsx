import { NavLinks } from "./NavLinks";
import { FamilySwitcher } from "./FamilySwitcher";
import { CONTRIBUTE_HREF, SITE_LINKS, menuItemFor } from "./siteLinks";
import { LogoMark } from "@/lib/brand";

/**
 * The one header, on every page: the logo with the family switcher, the five-page menu with the page's item
 * highlighted (its sub-pages too), and Contribute. One row, 48px, so the page starts high on the screen. Server-safe.
 * `current` is the page's own menu item; old values ("/#statement", "/budget") are mapped by menuItemFor.
 */
export function SiteHeader({ current, note }: { current?: string; note?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex h-12 max-w-[1200px] items-center gap-3 px-4 sm:gap-5 sm:px-6">
        <div className="flex shrink-0 items-center">
          <a href="/" className="flex items-center gap-2 whitespace-nowrap text-[15px] font-semibold tracking-[-0.01em] text-ink no-underline">
            <LogoMark />
            LedgerGov.UK
          </a>
          <FamilySwitcher />
        </div>
        <NavLinks links={SITE_LINKS} current={menuItemFor(current)} label="Site" />
        {note && <span className="hidden whitespace-nowrap text-caption text-muted lg:inline">{note}</span>}
        <a
          href={CONTRIBUTE_HREF}
          aria-current={current === CONTRIBUTE_HREF ? "page" : undefined}
          className="hidden shrink-0 rounded-full px-3 py-1 text-label font-medium text-ink no-underline shadow-[inset_0_0_0_1px_var(--ink)] hover:bg-sunk aria-[current=page]:bg-sunk sm:inline-block"
        >
          Contribute
        </a>
      </div>
    </header>
  );
}
