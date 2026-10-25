"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { PredictAnswers, PredictQuestion, PredictRound, ShareMethod } from "@ledger/schema";
import { closingDay, closingTime, percent, predictTitle, shareText } from "@/lib/predict-copy";
import { ShareBar } from "./ShareBar";
import { SpamCheck } from "./SpamCheck";

/** What the form needs from a question set (content/predict/*.yaml). */
export type ClientRound = Pick<PredictRound, "id" | "budget" | "budget_date" | "closes_at" | "questions">;

/** How everyone predicted, as /api/predict returns it (null below the site's minimum count). */
export interface CrowdView {
  total: number | null;
  threshold: number;
  questions: Record<string, Record<string, number>> | null;
}

type Result = { code: string; path: string; crowd: CrowdView; answers: PredictAnswers };

/** If the background check has not finished by then, offer to run it again. */
const CHECK_SLOW_MS = 20_000;
/** setTimeout's longest wait; the page re-checks on the next render anyway. */
const MAX_TIMER_MS = 2_147_483_647;

/** Count a press of a share button on our own server: how, never which predictions. */
export function countShare(method: ShareMethod) {
  fetch("/api/predict/shared", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method }), keepalive: true }).catch(
    () => undefined,
  );
}

/** True once the closing time has passed, and flips by itself while the page is open. */
function useClosed(closesAt: string, closedAtRender: boolean): boolean {
  const [closed, setClosed] = useState(closedAtRender);
  useEffect(() => {
    const ms = Date.parse(closesAt) - Date.now();
    if (ms <= 0) return setClosed(true);
    setClosed(false);
    const id = setTimeout(() => setClosed(true), Math.min(ms, MAX_TIMER_MS));
    return () => clearTimeout(id);
  }, [closesAt]);
  return closed;
}

/**
 * Predict the Budget (Day 9): the questions, the reader's predictions and,
 * once sent, how everyone else predicted, with a share button. No account and
 * no client analytics (rule 4): the server keeps a random code, the answers
 * and the hour, and counts aggregates only.
 */
export function PredictForm({ round, siteUrl, closedAtRender }: { round: ClientRound; siteUrl: string; closedAtRender: boolean }) {
  const closed = useClosed(round.closes_at, closedAtRender);
  const [answers, setAnswers] = useState<PredictAnswers>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [formError, setFormError] = useState("");
  const [sending, setSending] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  // The spam check starts when the reader first moves into the form, not on every page view.
  const [engaged, setEngaged] = useState(false);
  const [altcha, setAltcha] = useState<string | null>(null);
  const [checkRun, setCheckRun] = useState(0);
  const [checkSlow, setCheckSlow] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  const answered = round.questions.filter((q) => answers[q.id]).length;
  const total = round.questions.length;

  useEffect(() => {
    if (!engaged || altcha) return;
    setCheckSlow(false);
    const id = setTimeout(() => setCheckSlow(true), CHECK_SLOW_MS);
    return () => clearTimeout(id);
  }, [engaged, altcha, checkRun]);

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  const rerunCheck = () => {
    setAltcha(null);
    setCheckRun((n) => n + 1);
  };

  const choose = (q: string, o: string) => {
    setAnswers((a) => ({ ...a, [q]: o }));
    if (missing.includes(q)) setMissing((m) => m.filter((x) => x !== q));
  };

  const focusQuestion = (id: string) => {
    const el = formRef.current?.querySelector<HTMLInputElement>(`input[name="${CSS.escape(id)}"]`);
    el?.focus();
  };

  const send = useCallback(
    async (payload: string) => {
      setSending(true);
      setFormError("");
      try {
        const res = await fetch("/api/predict", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers, altcha: payload }) });
        const data = (await res.json().catch(() => ({}))) as Partial<Result> & { error?: string; message?: string; missing?: string[] };
        if (res.status === 201 && data.code && data.path && data.crowd) {
          setResult({ code: data.code, path: data.path, crowd: data.crowd, answers });
          return;
        }
        if (data.error === "invalid" && data.missing?.length) {
          setMissing(data.missing);
          focusQuestion(data.missing[0]!);
          return; // the check was not used up
        }
        setFormError(data.message ?? "Something went wrong and nothing was saved. Please try again in a minute.");
        rerunCheck();
      } catch {
        setFormError("We could not reach the server, so nothing was saved. Check your connection and try again.");
        rerunCheck();
      } finally {
        setSending(false);
      }
    },
    [answers],
  );

  // Pressed before the background check finished: send as soon as it does.
  useEffect(() => {
    if (waiting && altcha && !sending) {
      setWaiting(false);
      void send(altcha);
    }
  }, [waiting, altcha, sending, send]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (sending || closed) return;
    setEngaged(true);
    const gaps = round.questions.filter((q) => !answers[q.id]).map((q) => q.id);
    setMissing(gaps);
    if (gaps.length) {
      focusQuestion(gaps[0]!);
      return;
    }
    if (!altcha) return setWaiting(true);
    void send(altcha);
  };

  if (result) return <PredictResult round={round} result={result} siteUrl={siteUrl} resultRef={resultRef} />;
  if (closed) return <ClosedView round={round} />;

  return (
    <form ref={formRef} noValidate onSubmit={submit} onFocus={() => setEngaged(true)} className="grid gap-8" aria-describedby="predict-progress">
      <ol className="m-0 grid list-none gap-6 p-0">
        {round.questions.map((q, i) => (
          <li key={q.id}>
            <QuestionField q={q} index={i} total={total} value={answers[q.id]} missing={missing.includes(q.id)} onChoose={(o) => choose(q.id, o)} />
          </li>
        ))}
      </ol>

      {engaged && <SpamCheck key={checkRun} onPayload={setAltcha} />}
      <div className="sticky bottom-0 z-10 -mx-4 grid gap-2 border-t border-line bg-bg/95 px-4 py-4 backdrop-blur-md sm:mx-0 sm:rounded-panel sm:border sm:px-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="submit"
            disabled={sending || waiting}
            className="min-h-11 cursor-pointer rounded-control bg-ink px-5 text-[15px] font-semibold text-bg hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {sending || waiting ? "Sending…" : "Send my predictions"}
          </button>
          <span id="predict-progress" className="text-label text-muted" aria-live="polite">
            {answered} of {total} answered
            {missing.length > 0 && <span className="text-bad">, {missing.length === 1 ? "one question still needs an answer" : `${missing.length} questions still need an answer`}</span>}
          </span>
        </div>
        <p className="m-0 text-caption text-muted" aria-live="polite">
          {waiting && !altcha
            ? checkSlow
              ? "The check that you're not a bot is taking longer than usual."
              : "Checking you're not a bot, then sending…"
            : `Open until ${closingTime(round.closes_at)} on ${closingDay(round.closes_at)}.`}{" "}
          {waiting && !altcha && checkSlow ? (
            <button type="button" onClick={rerunCheck} className="cursor-pointer font-medium text-ink underline underline-offset-2">
              Try again
            </button>
          ) : (
            <a href="/privacy#predict">Privacy</a>
          )}
        </p>
        {formError && (
          <p role="alert" className="m-0 text-label text-bad">
            {formError}
          </p>
        )}
      </div>
    </form>
  );
}

/** One question: a group of radio buttons drawn as large pills, with why we ask behind a toggle. */
function QuestionField({
  q,
  index,
  total,
  value,
  missing,
  onChoose,
}: {
  q: PredictQuestion;
  index: number;
  total: number;
  value: string | undefined;
  missing: boolean;
  onChoose: (option: string) => void;
}) {
  const errId = `pq-${q.id}-err`;
  return (
    <fieldset
      className={`m-0 grid min-w-0 gap-3 rounded-panel border p-4 sm:p-5 ${missing ? "border-bad" : "border-line"}`}
      aria-describedby={missing ? errId : undefined}
    >
      <legend className="float-left grid w-full gap-1 p-0">
        <span className="flex flex-wrap gap-x-4 text-label font-medium text-muted">
          <span>
            {index + 1} of {total}
          </span>
          <span>{q.topic}</span>
        </span>
        <span className="text-[17px] font-semibold leading-snug text-ink">{q.text}</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {q.options.map((o) => {
          const checked = value === o.id;
          return (
            <label
              key={o.id}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-4 py-2 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
                checked ? "bg-ink text-bg" : "bg-bg text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] hover:shadow-[inset_0_0_0_1px_var(--ink)]"
              }`}
            >
              <input type="radio" className="sr-only" name={q.id} value={o.id} checked={checked} onChange={() => onChoose(o.id)} />
              <span aria-hidden className={`grid size-4 shrink-0 place-items-center rounded-full ${checked ? "bg-bg text-ink" : "shadow-[inset_0_0_0_1.5px_var(--line-strong)]"}`}>
                {checked && (
                  <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 6.2 5 8.5l4.5-5" />
                  </svg>
                )}
              </span>
              {o.label}
            </label>
          );
        })}
      </div>
      {missing && (
        <p id={errId} className="m-0 text-label text-bad">
          Choose an answer.
        </p>
      )}
      <details className="group text-label">
        <summary className="cursor-pointer font-medium text-accent">Why we ask, and what settles it</summary>
        <div className="mt-2 grid gap-2 text-muted">
          <p className="m-0">{q.why}</p>
          <p className="m-0">
            <span className="font-medium text-ink">Settled by:</span> {q.settled_by}
          </p>
          <p className="m-0 flex flex-wrap gap-x-4 gap-y-1">
            <span>Sources:</span>
            {q.sources.map((s) => (
              <a key={s.url} href={s.url}>
                {s.title}
              </a>
            ))}
          </p>
        </div>
      </details>
    </fieldset>
  );
}

/** How everyone predicted on one question: a bar per option with its share in words, the reader's pick marked. */
export function CrowdBars({ q, counts, pick }: { q: PredictQuestion; counts: Record<string, number>; pick?: string }) {
  // Shares of the answers to this question (every set answers every question; this also holds if an option is retired).
  const total = q.options.reduce((a, o) => a + (counts[o.id] ?? 0), 0);
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0" aria-label={`How everyone predicted: ${q.topic}`}>
      {q.options.map((o) => {
        const p = percent(counts[o.id] ?? 0, total);
        const mine = pick === o.id;
        return (
          <li key={o.id} className="grid gap-1">
            <span className="flex items-baseline justify-between gap-3 text-label">
              <span className={mine ? "font-semibold text-ink" : "text-muted"}>
                {o.label}
                {mine && (
                  <span className="ml-2 rounded-full bg-sunk px-2 py-0.5 text-caption font-semibold text-ink">
                    <span className="sr-only">: </span>your pick
                  </span>
                )}
              </span>
              <span className={`shrink-0 tabular-nums ${mine ? "font-semibold text-ink" : "text-muted"}`}>{p}%</span>
            </span>
            <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-sunk">
              <span className={`block h-full rounded-full ${mine ? "bg-rec" : "bg-spend"}`} style={{ width: `${p}%` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** After sending: the reader's picks, how everyone predicted, and the share button first. */
function PredictResult({ round, result, siteUrl, resultRef }: { round: ClientRound; result: Result; siteUrl: string; resultRef: React.RefObject<HTMLHeadingElement | null> }) {
  const url = `${siteUrl}${result.path}`;
  const { crowd } = result;
  return (
    <section aria-labelledby="predict-result-h" className="grid gap-8">
      <div className="grid gap-4 rounded-panel bg-sunk p-5 sm:p-6">
        <h2 id="predict-result-h" ref={resultRef} tabIndex={-1} className="m-0 text-title font-semibold">
          Your predictions are in
        </h2>
        <p className="m-0 text-muted">
          Share them and see who calls the {round.budget} best. After the Budget we check every answer against the Budget documents, and your link
          shows how you did.
        </p>
        <ShareBar url={url} title={predictTitle(round)} text={shareText(round)} label="Share my predictions" onShare={countShare} />
      </div>

      <div className="grid gap-2">
        <h3 className="m-0 text-body font-semibold">{crowd.total !== null ? `How ${crowd.total.toLocaleString("en-GB")} people predicted so far, you included` : "Your predictions"}</h3>
        {crowd.total === null && (
          <p className="m-0 text-label text-muted">
            We show how everyone predicted once {crowd.threshold} people have, so a small crowd reveals nobody. From {closingTime(round.closes_at)} on{" "}
            {closingDay(round.closes_at)}, when predictions close, the prediction page shows it to everyone.
          </p>
        )}
        <ol className="m-0 grid list-none border-t border-line p-0">
          {round.questions.map((q) => {
            const pick = q.options.find((o) => o.id === result.answers[q.id]);
            const counts = crowd.questions?.[q.id];
            return (
              <li key={q.id} className="grid gap-2 border-b border-line py-4">
                <span className="text-label text-muted">{q.topic}</span>
                <span className="text-sm">{q.text}</span>
                {counts && crowd.total !== null ? (
                  <CrowdBars q={q} counts={counts} pick={pick?.id} />
                ) : (
                  <span className="text-sm">
                    Your prediction: <b className="font-semibold">{pick?.label}</b>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <p className="m-0 flex flex-wrap gap-x-6 gap-y-1 text-label">
        <a href={result.path}>Your predictions on their own page</a>
        <a href="/budget">What the Budget could fund or break</a>
      </p>
    </section>
  );
}

/** After the statement starts: no more predictions; how everyone predicted, for everyone. */
function ClosedView({ round }: { round: ClientRound }) {
  const [crowd, setCrowd] = useState<CrowdView | null | "loading" | "error">("loading");
  useEffect(() => {
    let off = false;
    fetch("/api/predict/crowd")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { crowd: CrowdView | null }) => !off && setCrowd(d.crowd))
      .catch(() => !off && setCrowd("error"));
    return () => {
      off = true;
    };
  }, []);
  const ready = crowd && crowd !== "loading" && crowd !== "error" && crowd.total !== null && crowd.questions ? crowd : null;
  return (
    <section aria-labelledby="predict-closed-h" className="grid gap-6">
      <div className="grid gap-2 rounded-panel bg-sunk p-5">
        <h2 id="predict-closed-h" className="m-0 text-title font-semibold">
          Predictions are closed
        </h2>
        <p className="m-0 text-muted">
          They closed at {closingTime(round.closes_at)} on {closingDay(round.closes_at)}, when the Budget statement began. We are checking every answer
          against the Budget documents; each set of predictions will show how it did.
        </p>
      </div>
      <div className="grid gap-2" aria-live="polite">
        <h3 className="m-0 text-body font-semibold">{ready ? `How ${ready.total!.toLocaleString("en-GB")} readers predicted` : "How readers predicted"}</h3>
        {crowd === "loading" && <p className="m-0 text-label text-muted">Loading…</p>}
        {crowd === "error" && <p className="m-0 text-label text-muted">We could not load the totals just now. Please try again in a minute.</p>}
        {crowd !== "loading" && crowd !== "error" && !ready && (
          <p className="m-0 text-label text-muted">Too few people made predictions to show the totals without revealing anyone.</p>
        )}
        <ol className="m-0 grid list-none border-t border-line p-0">
          {round.questions.map((q) => (
            <li key={q.id} className="grid gap-2 border-b border-line py-4">
              <span className="text-label text-muted">{q.topic}</span>
              <span className="text-sm font-medium">{q.text}</span>
              {ready && <CrowdBars q={q} counts={ready.questions![q.id] ?? {}} />}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
