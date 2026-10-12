import type { MetadataRoute } from "next";
import { constituencies, constituencyList } from "@ledger/server/mp";
import { getHouseholdSnapshots, getPeople, getScorecards, getSeed, getVintages } from "@/lib/data";
import { areaPath } from "@ledger/server/seo";
import { BUDGET_TOPICS, topicCards } from "@/lib/budget";
import { getReckoner } from "@/lib/reckoner";
import { RECKONER_PATH } from "@/lib/reckoner-copy";
import { absolute, EDITORS_PAGE_UPDATED, lastChanged } from "@/lib/site";
import { PRIVACY_UPDATED } from "@/lib/privacy-copy";
import { PREDICT_PATH } from "@/lib/predict-copy";

/**
 * Every public page: home, the promise ledger and its policy-area pages, the Budget pages, scorecards and household pages, people and long-term spending,
 * Your MP and its 650 constituency pages, the method pages, the privacy notice, each card and each actor, what each
 * tax change raises (/tax and one page per change, dated by the data build that last checked them), and Predict the
 * Budget (but no reader's own predictions). Dates come
 * from the content itself. Constituency pages are rendered on first visit and
 * refreshed daily; they carry no date here because an MP's votes change them
 * on any sitting day, and a made-up date would mislead crawlers.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const seed = getSeed();
  const built = seed.builtAt.slice(0, 10);
  const lastEvent = (id: string) => lastChanged(seed.cards.find((c) => c.id === id)!.file) ?? built;
  const latest = seed.cards.map((c) => lastEvent(c.id)).sort().at(-1) ?? built;
  // /people changes when one of its sources publishes a new edition.
  const peopleChanged = getPeople().sources.map((s) => s.published_on ?? built).sort().at(-1) ?? built;
  // The method pages change when a new data edition arrives (and with it, possibly new forecasts or scores).
  const newestEdition = getVintages().changelog.map((e) => e.first_loaded ?? e.published_on ?? "").sort().at(-1) || built;
  const areas = [...new Set(seed.cards.map((c) => c.file.policy_area))];
  const actorIds = [...new Set(seed.cards.flatMap((c) => [c.actor.id, c.party?.id].filter((x): x is string => !!x)))];
  return [
    { url: absolute("/"), lastModified: built, changeFrequency: "daily", priority: 1 },
    { url: absolute("/promises"), lastModified: latest, changeFrequency: "daily", priority: 0.9 },
    { url: absolute("/people"), lastModified: peopleChanged, changeFrequency: "monthly", priority: 0.8 },
    { url: absolute("/mp"), lastModified: constituencyList().fetched_on, changeFrequency: "monthly", priority: 0.8 },
    { url: absolute("/method"), lastModified: newestEdition, changeFrequency: "weekly", priority: 0.6 },
    { url: absolute("/method/backtest"), lastModified: built, changeFrequency: "monthly", priority: 0.6 },
    { url: absolute("/method/api"), lastModified: built, changeFrequency: "monthly", priority: 0.5 },
    // Its counts change every ten minutes; the page itself changes with the site.
    { url: absolute("/method/numbers"), lastModified: built, changeFrequency: "daily", priority: 0.3 },
    { url: absolute("/follow"), lastModified: built, changeFrequency: "monthly", priority: 0.4 },
    { url: absolute("/budget"), lastModified: latest, changeFrequency: "daily", priority: 0.8 },
    ...BUDGET_TOPICS.filter((t) => topicCards(seed.cards, t).length > 0).map((t) => ({ url: absolute(`/budget/${t.id}`), lastModified: latest, changeFrequency: "daily" as const, priority: 0.7 })),
    { url: absolute(RECKONER_PATH), lastModified: built, changeFrequency: "monthly", priority: 0.7 },
    ...getReckoner().cards.map((c) => ({ url: absolute(c.path), lastModified: built, changeFrequency: "monthly" as const, priority: 0.6 })),
    // A Budget scorecard changes only if the Treasury's table is read again: date it by the event.
    ...getScorecards().map((sc) => ({ url: absolute(`/budget/scorecard/${sc.id}`), lastModified: sc.date, changeFrequency: "yearly" as const, priority: 0.7 })),
    // Predict the Budget: the form only; each reader's predictions (/budget/predict/r/<code>) is a private-by-link page, never listed.
    { url: absolute(PREDICT_PATH), lastModified: built, changeFrequency: "daily", priority: 0.7 },
    // What a Budget does to households changes only when the job is run again: date it by that run.
    ...getHouseholdSnapshots().map((h) => ({ url: absolute(`/budget/household/${h.id}`), lastModified: h.computed_at.slice(0, 10), changeFrequency: "yearly" as const, priority: 0.7 })),
    { url: absolute("/editors"), lastModified: EDITORS_PAGE_UPDATED, changeFrequency: "monthly", priority: 0.4 },
    { url: absolute("/privacy"), lastModified: PRIVACY_UPDATED, changeFrequency: "yearly", priority: 0.3 },
    { url: absolute("/feeds"), lastModified: latest, changeFrequency: "daily", priority: 0.4 },
    ...areas.map((area) => ({
      url: absolute(areaPath(area)),
      lastModified: seed.cards.filter((c) => c.file.policy_area === area).map((c) => lastEvent(c.id)).sort().at(-1) ?? built,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...seed.cards.map((c) => ({ url: absolute(`/promise/${c.id}`), lastModified: lastEvent(c.id), changeFrequency: "weekly" as const, priority: 0.7 })),
    ...constituencies().map((c) => ({ url: absolute(`/mp/${c.slug}`), changeFrequency: "weekly" as const, priority: 0.5 })),
    ...actorIds.map((id) => ({
      url: absolute(`/actor/${id}`),
      lastModified: seed.cards.filter((c) => c.actor.id === id || c.party?.id === id).map((c) => lastEvent(c.id)).sort().at(-1) ?? built,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
