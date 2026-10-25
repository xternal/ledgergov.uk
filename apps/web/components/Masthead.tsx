"use client";

import { useScenario } from "@/lib/scenario";
import { gbpBn } from "@/lib/format";

/** The opening. `tracked` is the link to every promise, "125 promises tracked →" (OpenPromises decision 30). */
export function Hero({ tracked }: { tracked?: { text: string; href: string } }) {
  const { seed, baseResult } = useScenario();
  const { meta } = seed.statement;
  const { receipts_bn, spending_bn, borrowing_bn } = baseResult.totals;
  return (
    <div className="pb-6 pt-6 sm:pt-8">
      <p className="mb-4 text-label text-muted">
        Annual statement for {meta.fiscal_year}, based on the {meta.vintage_label}
      </p>
      <h1 className="max-w-[20ch] text-[clamp(32px,4.4vw,var(--text-display))] font-semibold leading-[1.06] tracking-[-0.035em]">
        Where {gbpBn(spending_bn)} of public money went, and where it came from
      </h1>
      <p className="mt-4 max-w-[58ch] text-lead text-muted">
        Taxes and other income covered {gbpBn(receipts_bn)}. The other{" "}
        <b className="font-semibold text-ink shadow-[inset_0_-3px_0_var(--debt-soft)]">{gbpBn(borrowing_bn)} was borrowed</b>, so every
        new promise either takes money from somewhere else or adds to that line.
      </p>
      {tracked && (
        <p className="mt-5 text-lead">
          <a href={tracked.href} className="font-semibold">
            {tracked.text} →
          </a>
        </p>
      )}
    </div>
  );
}
