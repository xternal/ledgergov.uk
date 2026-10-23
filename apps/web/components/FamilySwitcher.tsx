import { FAMILY, FAMILY_MAKER as MAKER, THIS_SITE } from "./siteLinks";

/**
 * The family of sites, behind a small button beside the logo: every ledger on the same open engine, and the maker's
 * site. A <details> element, so it opens without JavaScript and keeps its place for keyboard and screen readers.
 */
export function FamilySwitcher() {
  return (
    <details className="group relative">
      <summary
        aria-label="The other sites of the family"
        className="flex size-8 cursor-pointer list-none items-center justify-center rounded-md text-muted hover:bg-sunk hover:text-ink [&::-webkit-details-marker]:hidden"
      >
        <svg aria-hidden viewBox="0 0 14 14" className="size-3.5 transition-transform group-open:rotate-180">
          <path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="absolute left-0 top-10 z-30 grid w-[min(320px,calc(100vw-32px))] gap-1 rounded-panel bg-bg p-2 shadow-[0_0_0_1px_var(--line-strong),0_12px_32px_rgba(0,0,0,0.14)]">
        <p className="m-0 px-2.5 pb-1 pt-1.5 text-caption text-muted">Public money and promises, one ledger per country or place, on the same open engine.</p>
        <ul className="m-0 grid list-none gap-0.5 p-0">
          {FAMILY.map((s) => {
            const here = s.name === THIS_SITE;
            return (
              <li key={s.name}>
                <a
                  href={s.href}
                  aria-current={here ? "page" : undefined}
                  className={`grid rounded-md px-2.5 py-2 no-underline ${here ? "bg-sunk text-ink" : "text-ink hover:bg-sunk"}`}
                >
                  <span className="text-sm font-semibold">
                    {s.name}
                    {here && <span className="ml-2 text-caption font-normal text-muted">you are here</span>}
                  </span>
                  <span className="text-caption text-muted">{s.about}</span>
                </a>
              </li>
            );
          })}
        </ul>
        <a href={MAKER.url} className="rounded-md px-2.5 py-2 text-caption text-muted no-underline hover:bg-sunk hover:text-ink">
          Made by {MAKER.name}, guzh.uk
        </a>
      </div>
    </details>
  );
}
