"use client";

import { useEffect, type ReactNode } from "react";
import type { Seed } from "@ledger/schema";
import { ScenarioProvider } from "@/lib/scenario";
import { T1Provider } from "@/lib/t1";
import { Hero } from "./Masthead";
import { KpiStrip } from "./KpiStrip";
import { StatementSection } from "./Statement";
import { YourShare } from "./YourShare";
import { PromisesSection } from "./Promises";
import { Footer, Method } from "./Method";
import { Faq } from "./Faq";
import { SiteHeader } from "./SiteHeader";
import { HomeFirstScreen, type HomeData } from "./HomeFirstScreen";

/** The home page's old sections, now on the Money page. Links to them (feeds, emails, shared links) still arrive here. */
const MOVED = ["#statement", "#scenario", "#you"];

/**
 * The home page: the first screen shows the year's figures, the promises, one sandbox lever, four promises to watch and
 * the logbook; promises come next (OpenPromises decision 30: `spotlight`, the engine's PromiseSpotlight, rendered on the
 * server and passed in), then the promise ledger with the contribution form, the method and the questions. The
 * statement, the full sandbox and "your share" are the Money page (MoneyLedger).
 */
export function Ledger({ seed, home, spotlight }: { seed: Seed; home: HomeData; spotlight?: ReactNode }) {
  // An old link to a section that moved (ledgergov.uk/#scenario?s=…) opens it on the Money page, with its scenario.
  useEffect(() => {
    if (MOVED.includes(window.location.hash)) window.location.replace(`/money${window.location.search}${window.location.hash}`);
  }, []);
  const { meta } = seed.statement;
  return (
    <ScenarioProvider seed={seed}>
      <T1Provider>
        <SiteHeader note={`${meta.country}, ${meta.fiscal_year}`} />
        <main id="top" className="mx-auto max-w-[1200px] px-4 pb-20 sm:px-6">
          <HomeFirstScreen data={home} />
          {spotlight && <div className="pb-8">{spotlight}</div>}
          <PromisesSection />
          <Method />
          <Faq />
          <Footer />
        </main>
      </T1Provider>
    </ScenarioProvider>
  );
}

/**
 * The Money page (/money): where the year's public money came from and went, the sandbox that changes it, and each
 * household's share. These were the home page's first sections until 23 October 2026.
 */
export function MoneyLedger({ seed }: { seed: Seed }) {
  const { meta } = seed.statement;
  return (
    <ScenarioProvider seed={seed}>
      <T1Provider>
        <SiteHeader current="/money" note={`${meta.country}, ${meta.fiscal_year}`} />
        <main id="top" className="mx-auto max-w-[1200px] px-4 pb-20 sm:px-6">
          <Hero />
          <KpiStrip />
          <StatementSection />
          <YourShare />
          <Footer />
        </main>
      </T1Provider>
    </ScenarioProvider>
  );
}
