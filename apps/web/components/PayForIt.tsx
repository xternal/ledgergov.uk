"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ALL, EVERY_LINE, PAY_SHARES, type PayPlan, type PayResult } from "@ledger/engine";
import { COSTED_BY_LABEL, type Provenance } from "@ledger/schema";
import { CONTROLLED_BY_LABEL, QUALITY_LABEL } from "@/lib/copy";
import { fixed, gbp, gbpBn, grouped, perHousehold, shareOf } from "@/lib/format";
import { track } from "@/lib/analytics";
import { PAY_COPY as C, borrowWho } from "@/lib/pay-for-it-copy";
import {
  borrowingHeadline,
  costRange,
  cutFits,
  fitState,
  payOptions,
  pctText,
  planDescription,
  planOf,
  planPath,
  planTitle,
  rateAfter,
  resultOf,
  sentenceCase,
  shareWords,
  signedGbp,
  signedRange,
  stateOf,
  taxFits,
  unitsText,
  type PayData,
  type PayState,
  type PledgeView,
} from "@/lib/pay-for-it-view";
import { ShareBar } from "./ShareBar";
import { QualityBadge, Segmented, WithProvenance } from "./ui";

type Route = "pledge" | "tax" | "cut" | "borrow";

const shareLabel = (n: number) => (n === 0 ? C.none : n === ALL ? C.all : `${n}%`);

/** £bn to one decimal place with thousands grouped, so the Statement's sum reads across: "£1,231.3bn". */
const totalBn = (x: number) => {
  const [whole, tenth] = x.toFixed(1).split(".");
  return `£${grouped(Number(whole))}.${tenth}bn`;
};

const GROUPS: { standing: PledgeView["standing"]; label: string }[] = [
  { standing: "government", label: C.inGovernment },
  { standing: "opposition", label: C.inOpposition },
  { standing: "public_body", label: C.publicBody },
  // A card whose owner has no standing yet still appears: every costed pledge is on offer (invariant 6).
  { standing: null, label: C.otherOwners },
];

/**
 * Pay for it: pick a pledge, pay for it with a tax, a cut and borrowing, and
 * see the change in borrowing and the Statement at once. Every plan is worked
 * out in the browser by the engine; the address bar always holds the plan's
 * own link (/pay-for-it/<pledge>/<plan>), which reproduces it.
 */
export function PayForIt({ data, initial, siteUrl }: { data: PayData; initial: PayPlan; siteUrl: string }) {
  const opts = useMemo(() => payOptions(data), [data]);
  const [state, setState] = useState<PayState>(() => stateOf(initial, data));
  const touched = useRef(false);
  const result = useMemo(() => resultOf(opts, state), [opts, state]);
  const pledge = data.pledges.find((p) => p.id === state.pledgeId)!;
  const path = planPath(planOf(state));

  // Once the reader changes anything, the address bar holds the plan's own link (no new history entry per click).
  useEffect(() => {
    if (touched.current) window.history.replaceState(null, "", path);
  }, [path]);

  const update = (next: PayState, route: Route) => {
    touched.current = true;
    setState(fitState(opts, next));
    track(route === "pledge" ? "pay_for_it_pledge_picked" : "pay_for_it_route_changed", route === "pledge" ? { promise_id: next.pledgeId } : { route });
  };

  const taxOk = (lever: string, share: number) => taxFits(opts, pledge, lever, share);
  const cutOk = (line: string, share: number) => cutFits(opts, pledge, line, share);
  const firstTaxForAll = data.taxes.find((t) => taxOk(t.lever_id, ALL))?.lever_id;
  const lineForAll = cutOk(state.cutLine, ALL) ? state.cutLine : cutOk(EVERY_LINE, ALL) ? EVERY_LINE : undefined;
  const allBy = (route: "tax" | "cut" | "borrow") =>
    route === "tax" ? result.shares.tax === ALL : route === "cut" ? result.shares.cut === ALL : result.shares.borrow === ALL;

  const quick = (route: "tax" | "cut" | "borrow") => {
    if (route === "tax") update({ ...state, taxLever: taxOk(state.taxLever, ALL) ? state.taxLever : firstTaxForAll!, taxShare: ALL, cutShare: 0 }, "tax");
    else if (route === "cut") update({ ...state, cutLine: lineForAll!, cutShare: ALL, taxShare: 0 }, "cut");
    else update({ ...state, taxShare: 0, cutShare: 0 }, "borrow");
  };

  const d = result.d_borrowing_bn;
  const tax = data.taxes.find((t) => t.lever_id === state.taxLever)!;
  const cut = data.cuts.find((c) => c.id === state.cutLine)!;
  const spendingBn = result.before.spending_bn;
  const government = CONTROLLED_BY_LABEL.government;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-10 lg:col-start-1 lg:row-start-1">
        {/* The pledge */}
        <section aria-labelledby="pledge-h" className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <h2 id="pledge-h" className="m-0 text-title font-semibold">
            <label htmlFor="pledge">{C.pickLabel}</label>
          </h2>
          <p className="m-0 -mt-2 text-label text-muted">{C.pickHelp}</p>
          <select
            id="pledge"
            value={state.pledgeId}
            onChange={(e) => update({ ...state, pledgeId: e.target.value }, "pledge")}
            className="min-h-11 w-full cursor-pointer rounded-control bg-surface px-3 text-[15px] text-ink shadow-[var(--shadow-control)]"
          >
            {GROUPS.map((g) => {
              const ps = data.pledges.filter((p) => p.standing === g.standing).sort((a, b) => b.cost_bn[1] - a.cost_bn[1]);
              return ps.length ? (
                <optgroup key={g.label} label={g.label}>
                  {ps.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.headline} ({p.owner}), {gbpBn(p.cost_bn[1])} a year
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
          <PledgeCard pledge={pledge} data={data} spendingBn={spendingBn} />
        </section>

        {/* How to pay */}
        <section aria-labelledby="how-h" className="grid grid-cols-[minmax(0,1fr)] gap-5">
          <h2 id="how-h" className="m-0 text-title font-semibold">
            {C.howTitle}
          </h2>
          <div className="grid gap-2">
            <span className="text-label text-muted">{C.quick}</span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["tax", C.quickTax, !firstTaxForAll],
                  ["cut", C.quickCut, !lineForAll],
                  ["borrow", C.quickBorrow, false],
                ] as const
              ).map(([route, label, disabled]) => (
                <button
                  key={route}
                  type="button"
                  aria-pressed={allBy(route)}
                  disabled={disabled}
                  onClick={() => quick(route)}
                  className="inline-flex min-h-10 cursor-pointer items-center rounded-full bg-bg px-4 text-label font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] hover:shadow-[inset_0_0_0_1px_var(--ink)] disabled:cursor-not-allowed disabled:text-faint aria-pressed:bg-ink aria-pressed:text-bg aria-pressed:shadow-none"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {/* The one live region: the result in a line, next to the controls, so a phone shows it without scrolling. */}
          <p aria-live="polite" className="m-0 rounded-control bg-sunk px-3.5 py-2.5 text-sm">
            <b className={`font-semibold ${d[1] > 0.0005 ? "text-debt-ink" : ""}`}>{borrowingHeadline(d)}</b>
            <span className="text-muted">, range {signedRange(d)}.</span>
          </p>

          <Route id="route-tax" title={C.taxTitle} tone="rec">
            <div className="flex flex-wrap items-center gap-3">
              <label className="grid w-full min-w-0 gap-1 text-caption text-muted sm:w-auto">
                {C.taxWhich}
                <select
                  value={state.taxLever}
                  onChange={(e) => update({ ...state, taxLever: e.target.value }, "tax")}
                  className="min-h-10 w-full cursor-pointer rounded-control bg-surface px-2.5 text-sm text-ink shadow-[var(--shadow-control)] sm:w-auto sm:max-w-full"
                >
                  {data.taxes.map((t) => (
                    <option key={t.lever_id} value={t.lever_id} disabled={!taxOk(t.lever_id, state.taxShare)}>
                      {t.label}
                      {taxOk(t.lever_id, state.taxShare) ? "" : ` (${C.tooBigTax})`}
                    </option>
                  ))}
                </select>
              </label>
              <ShareChoice
                label={`${C.share}: ${C.taxTitle.toLowerCase()}`}
                value={state.taxShare}
                ok={(n) => taxOk(state.taxLever, n)}
                why={C.tooBigTax}
                onChange={(n) => update({ ...state, taxShare: n, cutShare: Math.min(state.cutShare, ALL - n) }, "tax")}
              />
            </div>
            {result.tax ? (
              <p className="m-0 text-sm">
                <b className="font-semibold">+{unitsText(tax, result.tax.units)}</b> {tax.on} ({`${fixed(result.tax.from, 0)}%`} to {rateAfter(result.tax.from, result.tax.units)})
                raises <b className="font-semibold">{gbpBn(result.tax.raises_bn[1])}</b>{" "}
                <span className="text-muted">
                  (range {costRange(result.tax.raises_bn)}) in {tax.period}. HMRC: {unitsText(tax, 1)} raises {gbpBn(result.tax.per_unit_bn[1])}.{" "}
                  <a href={tax.href}>What it raises</a>
                </span>
              </p>
            ) : (
              <p className="m-0 text-sm text-muted">{C.noTax}</p>
            )}
            <Facts p={tax.provenance} source={C.sourceHmrc}>
              {CONTROLLED_BY_LABEL[tax.controlled_by]}.
            </Facts>
          </Route>

          <Route id="route-cut" title={C.cutTitle} tone="spend">
            <div className="flex flex-wrap items-center gap-3">
              <label className="grid w-full min-w-0 gap-1 text-caption text-muted sm:w-auto">
                {C.cutWhich}
                <select
                  value={state.cutLine}
                  onChange={(e) => update({ ...state, cutLine: e.target.value }, "cut")}
                  className="min-h-10 w-full cursor-pointer rounded-control bg-surface px-2.5 text-sm text-ink shadow-[var(--shadow-control)] sm:w-auto sm:max-w-full"
                >
                  {data.cuts.map((c) => (
                    <option key={c.id} value={c.id} disabled={!cutOk(c.id, state.cutShare)}>
                      {c.label}
                      {cutOk(c.id, state.cutShare) ? "" : ` (${C.tooBigCut})`}
                    </option>
                  ))}
                </select>
              </label>
              <ShareChoice
                label={`${C.share}: ${C.cutTitle.toLowerCase()}`}
                value={state.cutShare}
                ok={(n) => cutOk(state.cutLine, n)}
                why={C.tooBigCut}
                onChange={(n) => update({ ...state, cutShare: n, taxShare: Math.min(state.taxShare, ALL - n) }, "cut")}
              />
            </div>
            {result.cut ? (
              <p className="m-0 text-sm">
                <b className="font-semibold">{signedGbp(-result.cut.amount_bn)}</b> from {cut.id === EVERY_LINE ? C.everyArea.toLowerCase() : cut.label.toLowerCase()}:{" "}
                <b className="font-semibold">{pctText(result.cut.pct_of_line)}</b>{" "}
                <span className="text-muted">
                  of {gbpBn(cut.bn)} in {data.year}.
                </span>
              </p>
            ) : (
              <p className="m-0 text-sm text-muted">{C.noCut}</p>
            )}
            <Facts p={cut.provenance} source={C.sourceStatement}>
              {government}.
            </Facts>
          </Route>

          <Route id="route-borrow" title={C.borrowTitle} tone="debt">
            <p className="m-0 text-sm">
              {result.shares.borrow > 0 ? (
                <>
                  <b className="font-semibold">{sentenceCase(shareWords[result.shares.borrow]!)}</b> {C.borrowRest}{" "}
                  <b className="font-semibold">{gbpBn(result.borrowed_bn)}</b> <span className="text-muted">a year, in the centre.</span>
                </>
              ) : (
                <span className="text-muted">{C.borrowNone}</span>
              )}
            </p>
            <Facts p={data.rate?.provenance ?? null} source={C.sourceRate}>
              {borrowWho(government, data.rate ? { label: data.rate.label, by: CONTROLLED_BY_LABEL[data.rate.controlled_by] } : null)}
            </Facts>
          </Route>
        </section>
      </div>

      {/* Beside the choices on wide screens, and kept in view while they change; after them on phones, before sharing. */}
      <aside aria-labelledby="till-h" className="grid gap-6 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <Till data={data} result={result} pledge={pledge} />
      </aside>

      <section aria-labelledby="share-h" className="grid min-w-0 gap-3 border-t border-line pt-6 lg:col-start-1 lg:row-start-2">
        <h2 id="share-h" className="m-0 text-title font-semibold">
          {C.shareTitle}
        </h2>
        <p className="m-0 -mt-1 text-label text-muted">{C.shareHelp}</p>
        <ShareBar
          url={`${siteUrl}${path}`}
          title={planTitle(data, result)}
          text={`${C.shareText} ${planDescription(data, result)}`}
          onShare={(method) => track("pay_for_it_shared", { method })}
        />
      </section>
    </div>
  );
}

/** One way of paying: a colour key matching the till's bar, a title, then its controls and who decides it. */
function Route({ id, title, tone, children }: { id: string; title: string; tone: "rec" | "spend" | "debt"; children: ReactNode }) {
  const key = tone === "rec" ? "bg-rec" : tone === "spend" ? "bg-spend" : "hatch";
  return (
    <div role="group" aria-labelledby={id} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-t border-line pt-4">
      <h3 id={id} className="m-0 flex items-center gap-2 text-body font-semibold">
        <i aria-hidden className={`inline-block size-2.5 rounded-[2px] ${key}`} />
        {title}
      </h3>
      {children}
    </div>
  );
}

/**
 * Under each route: where its figure comes from (quality, method and source on hover or focus) and who decides it
 * (invariant 3). The tip sits at the start of its own line, so it opens rightwards and stays on a phone's screen.
 */
function Facts({ p, source, children }: { p: Provenance | null; source: string; children: ReactNode }) {
  return (
    <div className="grid justify-items-start gap-1 text-caption">
      {p && (
        <WithProvenance p={p}>
          <QualityBadge quality={p.quality}>{`${QUALITY_LABEL[p.quality]}: ${source}`}</QualityBadge>
        </WithProvenance>
      )}
      <p className="m-0 font-medium text-muted">{children}</p>
    </div>
  );
}

function ShareChoice({ label, value, ok, why, onChange }: { label: string; value: number; ok: (n: number) => boolean; why: string; onChange: (n: number) => void }) {
  return (
    <div className="grid gap-1">
      <span className="text-caption text-muted">{C.share}</span>
      <Segmented
        label={label}
        value={String(value)}
        options={PAY_SHARES.map((n) => ({ value: String(n), label: shareLabel(n), disabled: !ok(n), why }))}
        onChange={(v) => onChange(Number(v))}
      />
    </div>
  );
}

function PledgeCard({ pledge, data, spendingBn }: { pledge: PledgeView; data: PayData; spendingBn: number }) {
  const households = data.statement.macro.households_m;
  return (
    <article aria-label={pledge.headline} className="grid gap-4 rounded-panel bg-surface p-5 shadow-[inset_0_0_0_1px_var(--line)]">
      <div className="grid gap-1.5">
        <p className="m-0 text-body font-semibold">{pledge.headline}</p>
        <p className="m-0 line-clamp-3 text-sm text-muted">“{pledge.quote}”</p>
        <p className="m-0 text-caption text-muted">
          {pledge.who}. {C.status}: {pledge.status.toLowerCase()}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-8">
        <dl className="m-0 grid content-start gap-0.5">
          <dt className="text-caption text-muted">{C.costs}</dt>
          <dd className="m-0 text-[28px] font-semibold leading-none tracking-[var(--tracking-figure)]">{gbpBn(pledge.cost_bn[1])}</dd>
          <dd className="m-0 text-caption text-muted">range {costRange(pledge.cost_bn)}</dd>
          <dd className="m-0">
            <QualityBadge quality={pledge.cost_quality} />
          </dd>
        </dl>
        <div className="grid content-start gap-1 text-caption text-muted">
          {pledge.costed_by && (
            <p className="m-0">
              {C.centralBy}: <span className="font-medium text-ink">{pledge.costed_by.name}</span> ({COSTED_BY_LABEL[pledge.costed_by.kind]})
            </p>
          )}
          <p className="m-0">
            about {gbp(perHousehold(pledge.cost_bn[1], households))} {C.perHousehold}, {fixed(shareOf(pledge.cost_bn[1], spendingBn), 2)}% {C.ofSpending}
          </p>
          <WithProvenance p={data.householdsP}>
            <QualityBadge quality={data.householdsP.quality}>{`${QUALITY_LABEL[data.householdsP.quality]}: ${C.sourceHouseholds}`}</QualityBadge>
          </WithProvenance>
        </div>
      </div>
      <div className="grid gap-0.5 text-sm">
        <span className="text-caption text-muted">{C.announced}</span>
        <span>{pledge.funded_by ?? <span className="font-medium">{C.notStated}</span>}</span>
      </div>
      <details className="group border-t border-line pt-3 text-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium">
          {C.aboutCost}
          <span aria-hidden className="text-muted transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        <div className="mt-3 grid gap-2">
          {pledge.cost_note && <p className="m-0 leading-relaxed text-muted">{pledge.cost_note}</p>}
          {pledge.cost_sources.length > 0 && (
            <ul className="m-0 grid list-none gap-1 p-0 text-label">
              {pledge.cost_sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
      <a href={pledge.href} className="justify-self-start text-label font-medium">
        {C.readCard}
      </a>
    </article>
  );
}

/** The result: who pays what (a bar and its table), the change in borrowing, and the Statement before and after. */
function Till({ data, result, pledge }: { data: PayData; result: PayResult; pledge: PledgeView }) {
  const d = result.d_borrowing_bn;
  const tax = result.tax && data.taxes.find((t) => t.lever_id === result.tax!.lever_id)!;
  const cut = result.cut && data.cuts.find((c) => c.id === result.cut!.line_id)!;
  const { before, after } = result;
  const rows: { label: string; detail: string; value: string; range?: string }[] = [
    { label: C.tillPledge, detail: pledge.headline, value: gbpBn(pledge.cost_bn[1]), range: costRange(pledge.cost_bn) },
    ...(result.tax && tax ? [{ label: C.tillTax, detail: `${unitsText(tax, result.tax.units)} ${tax.on}`, value: gbpBn(result.tax.raises_bn[1]), range: costRange(result.tax.raises_bn) }] : []),
    ...(result.cut && cut ? [{ label: C.tillCut, detail: cut.id === EVERY_LINE ? C.everyArea : cut.label, value: gbpBn(result.cut.amount_bn) }] : []),
    { label: C.tillBorrow, detail: sentenceCase(shareWords[result.shares.borrow]!), value: result.borrowed_bn > 0 ? gbpBn(result.borrowed_bn) : signedGbp(0) },
  ];
  const statement: { label: string; b: number; a: number; range?: string }[] = [
    { label: C.income, b: before.receipts_bn, a: after.receipts_bn },
    { label: C.borrowing, b: before.borrowing_bn, a: after.borrowing_bn, range: signedRange(d) },
    { label: C.spending, b: before.spending_bn, a: after.spending_bn },
  ];
  const bar = [
    { share: result.shares.tax, className: "bg-rec" },
    { share: result.shares.cut, className: "bg-spend" },
    { share: result.shares.borrow, className: "hatch" },
  ].filter((s) => s.share > 0);

  return (
    <section className="grid gap-5 rounded-panel bg-surface p-5 shadow-[inset_0_0_0_1px_var(--line)]">
      <div className="grid gap-1">
        <h2 id="till-h" className="m-0 text-label font-medium text-muted">
          {C.tillTitle}
        </h2>
        <p className={`m-0 text-[24px] font-semibold leading-tight tracking-[var(--tracking-figure)] ${d[1] > 0.0005 ? "text-debt-ink" : ""}`}>{borrowingHeadline(d)}</p>
        <p className="m-0 text-label text-muted">range {signedRange(d)} a year</p>
      </div>

      {/* Who pays, as a bar; the table below says the same in words and figures. */}
      <div aria-hidden className="flex h-3 overflow-hidden rounded-full bg-sunk">
        {bar.map((s, i) => (
          <i key={i} className={`block h-full ${s.className}`} style={{ width: `${s.share}%` }} />
        ))}
      </div>

      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Who pays for the pledge, a year</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-line align-top">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                <span className="block text-caption text-muted">{r.label}</span>
                <span className="block">{r.detail}</span>
              </th>
              <td className="whitespace-nowrap py-2 text-right">
                <span className="block font-semibold">{r.value}</span>
                {r.range && <span className="block text-caption text-muted">{r.range}</span>}
              </td>
            </tr>
          ))}
          <tr className="align-top">
            <th scope="row" className="py-2 pr-3 text-left font-semibold">
              {C.tillChange}
            </th>
            <td className="whitespace-nowrap py-2 text-right">
              <span className="block font-semibold">{signedGbp(d[1])}</span>
              <span className="block text-caption text-muted">{signedRange(d)}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="grid gap-2">
        <h3 className="m-0 text-body font-semibold">{C.statementTitle}</h3>
        <table className="w-full border-collapse text-[13px]">
          <caption className="sr-only">
            The Statement for {data.year}, £ billion a year, before and after the plan. Income plus borrowing equals spending in both.
          </caption>
          <thead>
            <tr className="border-b border-line text-left text-caption text-muted">
              <th scope="col" className="py-1.5 pr-2 font-medium">
                <WithProvenance p={data.statement.borrowing_provenance}>
                  <span>{data.year}</span>
                </WithProvenance>
              </th>
              <th scope="col" className="py-1.5 pr-2 text-right font-medium">
                {C.before}
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                {C.after}
              </th>
            </tr>
          </thead>
          <tbody>
            {statement.map((s) => (
              <tr key={s.label} className="border-b border-line align-top">
                <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                  {s.label}
                  {s.range && <span className="block text-caption text-muted">change {s.range}</span>}
                </th>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right text-muted">{totalBn(s.b)}</td>
                <td className="whitespace-nowrap py-1.5 text-right font-medium">{totalBn(s.a)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="m-0 text-caption text-muted">
          <span aria-hidden className="text-good">✓ </span>
          {totalBn(after.receipts_bn)} + {totalBn(after.borrowing_bn)} = {totalBn(after.spending_bn)}: income plus borrowing equals spending. Rounded to the nearest
          hundred million.
        </p>
      </div>
      <p className="m-0 text-caption text-muted">{C.notAForecast}</p>
    </section>
  );
}
