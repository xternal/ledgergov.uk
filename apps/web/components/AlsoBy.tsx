import { ALSO_BY } from "@/lib/site";

/**
 * The owner's other project, above the footer on every page (ALSO_BY in lib/site.ts; docs/DECISIONS.md "Also by the
 * author"). It takes no props, so it cannot differ between pages. Plain links: no query string, no referrer, nothing
 * counted, no image.
 */
export function AlsoBy() {
  return (
    <div className="mb-6 max-w-[72ch] border-t border-line pt-4 text-label">
      <p className="m-0 text-caption text-muted">{ALSO_BY.label}</p>
      <p className="m-0 mt-1 text-body font-semibold">
        <a href={ALSO_BY.url} rel="noopener noreferrer" target="_blank" className="text-ink">
          {ALSO_BY.name}
        </a>
      </p>
      <p className="m-0 mt-1 text-ink">{ALSO_BY.text}</p>
      <p className="m-0 mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-muted">
        <span>{ALSO_BY.audience}</span>
        <a href={ALSO_BY.access} rel="noopener noreferrer" target="_blank" className="whitespace-nowrap font-medium">
          {ALSO_BY.cta}
        </a>
      </p>
    </div>
  );
}
