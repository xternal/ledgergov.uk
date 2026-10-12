import type { Metadata } from "next";
import type { LeakFile } from "@ledger/schema";
import { getLeaks } from "@/lib/data";
import { BUDGET } from "@/lib/budget";
import { LEAKS_PATH, LEAK_STATUS, LEAK_STATUS_ORDER, LEAK_TRACKER_OPENS, leakCounts } from "@/lib/leaks";
import { todayIso } from "@/lib/promises";
import { SiteHeader } from "@/components/SiteHeader";
import { BudgetNav } from "@/components/BudgetNav";
import { LeakList, LeakStatusPill } from "@/components/LeakList";
import { JsonLd } from "@/components/JsonLd";
import { absolute, OPEN_GRAPH, SITE_NAME } from "@/lib/site";

/** Hourly, like /budget: the page turns from "before" to "what the Budget did" on the day without a deploy. */
export const revalidate = 3600;

/** "Wednesday 28 October 2026" */
const dayDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", { ...o, timeZone: "Europe/London" });
  return `${part({ weekday: "long" })} ${part({ day: "numeric" })} ${part({ month: "long" })} ${part({ year: "numeric" })}`;
};

const TITLE = `Trailed before the ${BUDGET.name}: what the press has reported`;
const DESCRIPTION = `Every tax and spending measure briefed to the press before the Budget on ${dayDate(BUDGET.date)}: the outlet, the date, a link to the original report, any estimated cost with its source, and, from Budget day, what the Budget actually did. A report is not a decision; each entry says whether it is only trailed or in the Budget documents.`;

export const metadata: Metadata = {
  title: `${TITLE} | LedgerGov.UK`,
  description: DESCRIPTION,
  alternates: { canonical: LEAKS_PATH },
  openGraph: { ...OPEN_GRAPH, title: TITLE, description: DESCRIPTION, type: "website", url: LEAKS_PATH },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

function structuredData(leaks: LeakFile[]) {
  const url = absolute(LEAKS_PATH);
  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: TITLE,
      description: DESCRIPTION,
      url,
      inLanguage: "en-GB",
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: absolute("/") },
      about: { "@type": "Event", name: BUDGET.name, startDate: BUDGET.date, organizer: { "@type": "GovernmentOrganization", name: "HM Treasury" } },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: leaks.length,
        itemListElement: leaks.map((l, n) => ({
          "@type": "ListItem",
          position: n + 1,
          url: `${url}#${l.id}`,
          item: {
            "@type": "Thing",
            name: l.headline,
            description: `${LEAK_STATUS[l.status].label}. ${l.summary}`,
            subjectOf: l.reported.map((r) => ({
              "@type": "NewsArticle",
              url: r.url,
              datePublished: r.date,
              publisher: { "@type": "Organization", name: r.outlet },
              ...(r.title ? { headline: r.title } : {}),
            })),
          },
        })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { name: SITE_NAME, path: "/" },
        { name: "Promise ledger", path: "/promises" },
        { name: BUDGET.name, path: "/budget" },
        { name: "Trailed before the Budget", path: LEAKS_PATH },
      ].map((it, n) => ({ "@type": "ListItem", position: n + 1, name: it.name, item: absolute(it.path) })),
    },
  ];
}

const h2 = "m-0 text-title font-semibold";
const figure = "m-0 text-[26px] font-semibold tracking-[var(--tracking-figure)]";

/**
 * /budget/leaks: every measure briefed to the press before the Budget, as a card with its source,
 * date and any estimated cost; from Budget day, what the Budget did. Entries are YAML files in
 * content/leaks, added by editors and approved by two (docs/EDITORS.md, "How to add a leak").
 */
export default function LeaksPage() {
  const leaks = getLeaks();
  const today = todayIso();
  const after = today >= BUDGET.date;
  const counts = leakCounts(leaks);
  const opens = dayDate(LEAK_TRACKER_OPENS).replace(/ \d{4}$/, "");
  const empty =
    today < LEAK_TRACKER_OPENS
      ? `Nothing here yet. The tracker fills from ${opens}: editors add each measure the press reports before the Budget, with the outlet, the date and a link to the original report.`
      : "No measures added yet. Editors add each measure the press reports before the Budget, with the outlet, the date and a link to the original report, after two of them have checked it.";
  const shown = LEAK_STATUS_ORDER.filter((s) => s === "trailed" || s === "announced" || counts[s] > 0 || (after && s === "not_in_budget"));

  return (
    <>
      <JsonLd data={structuredData(leaks)} />
      <SiteHeader current="/promises" />
      <main className="mx-auto grid max-w-[1000px] grid-cols-[minmax(0,1fr)] gap-12 px-4 pb-20 pt-10 sm:px-6">
        <header className="grid gap-4">
          <BudgetNav current={LEAKS_PATH} />
          <h1 className="m-0 max-w-[24ch] text-[clamp(30px,4.4vw,44px)] font-semibold leading-[1.06] tracking-[-0.035em]">
            {after ? "Trailed before the Budget, and what it did" : "Trailed before the Budget"}
          </h1>
          <p className="m-0 max-w-[68ch] text-lead text-muted">
            Before a Budget, measures are often briefed to the press. This page lists each one reported before the {BUDGET.name} on{" "}
            {dayDate(BUDGET.date)}: who reported it and when, with a link to the original report, an estimated cost only where a source gives one, and,
            from Budget day, what the Budget actually did.
          </p>
        </header>

        <section aria-labelledby="key-h" className="grid gap-4">
          <h2 id="key-h" className="m-0 text-label font-medium text-muted">
            A report is not a decision. Each entry says how far it is confirmed:
          </h2>
          <dl className="m-0 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {LEAK_STATUS_ORDER.map((s) => (
              <div key={s} className="grid content-start justify-items-start gap-1.5">
                <dt>
                  <LeakStatusPill status={s} />
                </dt>
                <dd className="m-0 text-sm text-muted">{LEAK_STATUS[s].help}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="list-h" className="grid gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 id="list-h" className={h2}>
              {leaks.length ? `${leaks.length} ${leaks.length === 1 ? "measure" : "measures"}, newest report first` : "The measures"}
            </h2>
          </div>
          {leaks.length > 0 && (
            <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 sm:grid-cols-4">
              {shown.map((s) => (
                <div key={s} className="grid gap-0.5">
                  <dt className="text-label text-muted">{LEAK_STATUS[s].label}</dt>
                  <dd className={figure}>{counts[s]}</dd>
                </div>
              ))}
            </dl>
          )}
          <LeakList leaks={leaks} empty={empty} />
        </section>

        <section aria-labelledby="how-h" className="grid max-w-[68ch] gap-3 border-t border-line pt-8">
          <h2 id="how-h" className={h2}>
            How this page works
          </h2>
          <p className="m-0 text-muted">
            Editors add a measure when a national outlet reports it as planned for the Budget. Each entry links the earliest report found and an
            archived copy, says in plain words what was reported, and gives a cost only when a source gives one, naming who made the figure. Two editors
            check every entry, by the same rules whoever is in government.
          </p>
          <p className="m-0 text-muted">
            The status moves only on evidence: to confirmed when a minister or the Treasury says it on the record, and on Budget day to in the Budget or
            not in the Budget, with a link to the page of the Budget documents that shows it.
          </p>
          <p className="m-0 text-muted">
            See <a href="/budget">the promises the Budget could fund or break</a>, <a href="/budget/how-it-works">how a Budget works and the
            Chancellor&apos;s headroom</a> and <a href="/method">how the numbers are made</a>.
          </p>
        </section>
      </main>
    </>
  );
}
