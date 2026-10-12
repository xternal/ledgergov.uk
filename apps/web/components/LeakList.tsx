import type { LeakFile, LeakStatus } from "@ledger/schema";
import { AREA_LABEL } from "@/lib/promises";
import { longDate } from "@/lib/format";
import { LEAK_STATUS, leakCostBy, leakCostText } from "@/lib/leaks";

/**
 * Trailed is dashed and grey: a report, not a decision. Confirmed has a solid outline; in the
 * Budget is filled. Not in the Budget is grey again. No red or green: a status states a fact.
 */
const PILL: Record<LeakStatus, string> = {
  trailed: "text-muted border border-dashed border-line-strong",
  confirmed: "text-rec border border-rec",
  announced: "bg-rec text-bg border border-rec",
  not_in_budget: "bg-sunk text-muted border border-line",
};

export function LeakStatusPill({ status }: { status: LeakStatus }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-semibold ${PILL[status]}`}>{LEAK_STATUS[status].label}</span>;
}

const dt = "text-caption font-medium text-muted";
const dd = "m-0 text-sm";

/** One measure: what was reported, by whom and when, its estimated cost if a source gives one, and later what the Budget did. */
function LeakCard({ l }: { l: LeakFile }) {
  const [first, ...more] = l.reported;
  return (
    <article id={l.id} aria-labelledby={`${l.id}-h`} className="grid scroll-mt-20 gap-3 px-1 py-5">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-muted">
        <LeakStatusPill status={l.status} />
        <span>{AREA_LABEL[l.area]}</span>
      </span>
      <h3 id={`${l.id}-h`} className="m-0 text-[17px] font-semibold leading-snug">
        {l.headline}
      </h3>
      <p className="m-0 max-w-[68ch] text-sm">{l.summary}</p>
      <dl className="m-0 grid max-w-[68ch] gap-2.5">
        <div className="grid gap-0.5">
          <dt className={dt}>First reported</dt>
          <dd className={dd}>
            {first!.outlet}, {longDate(first!.date)}
            {first!.title ? <>: &ldquo;{first!.title}&rdquo;</> : null}. <a href={first!.url}>Original report</a>
            {first!.archived_url ? (
              <>
                {", "}
                <a href={first!.archived_url}>archived copy</a>
              </>
            ) : null}
          </dd>
        </div>
        {more.length > 0 && (
          <div className="grid gap-0.5">
            <dt className={dt}>Also reported</dt>
            <dd className={dd}>
              {more.map((r, i) => (
                <span key={r.url}>
                  {i > 0 && "; "}
                  <a href={r.url}>
                    {r.outlet}, {longDate(r.date)}
                  </a>
                </span>
              ))}
            </dd>
          </div>
        )}
        <div className="grid gap-0.5">
          <dt className={dt}>Estimated cost</dt>
          <dd className={dd}>
            {l.estimated_cost ? (
              <>
                {leakCostText(l.estimated_cost)}. {leakCostBy(l.estimated_cost)} (<a href={l.estimated_cost.source_url}>source</a>)
                {l.estimated_cost.note ? <span className="block text-caption text-muted">{l.estimated_cost.note}</span> : null}
              </>
            ) : (
              <span className="text-muted">None given in the reports</span>
            )}
          </dd>
        </div>
        {l.confirmed && (
          <div className="grid gap-0.5">
            <dt className={dt}>Confirmed</dt>
            <dd className={dd}>
              {l.confirmed.by}, {longDate(l.confirmed.date)}
              {l.confirmed.text ? `: ${l.confirmed.text}` : ""}. <a href={l.confirmed.url}>Where it was said</a>
            </dd>
          </div>
        )}
        {l.budget && (
          <div className="grid gap-0.5 border-l-2 border-rec pl-3">
            <dt className={dt}>What the Budget did ({longDate(l.budget.date)})</dt>
            <dd className={dd}>
              {l.budget.text} <a href={l.budget.evidence_url}>Budget document</a>
              {l.budget.cost ? (
                <span className="block text-caption text-muted">
                  {leakCostText(l.budget.cost)}. {leakCostBy(l.budget.cost)} (<a href={l.budget.cost.source_url}>source</a>)
                </span>
              ) : null}
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
}

/** Every entry, newest report first; or what to expect while the tracker is empty. */
export function LeakList({ leaks, empty }: { leaks: LeakFile[]; empty: string }) {
  if (!leaks.length) return <p className="m-0 max-w-[68ch] border-y border-line py-6 text-muted">{empty}</p>;
  return (
    <ul className="m-0 grid list-none border-t border-line p-0">
      {leaks.map((l) => (
        <li key={l.id} className="border-b border-line">
          <LeakCard l={l} />
        </li>
      ))}
    </ul>
  );
}
