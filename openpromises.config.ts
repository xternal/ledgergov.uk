import { z } from "zod";
import { defineConfig } from "@openpromises/core";

/**
 * LedgerGov.UK on the OpenPromises engine (step 1 of the move, docs/MIGRATING.md
 * in github.com/xternal/openpromises). Started from OpenPromises 0.3.0's
 * tools/dry-run/ledgergov.config.ts with fixtures/public-ledger/openpromises.config.ts
 * inlined. CI's check reads it; the site reads its cards through packages/schema,
 * with the engine's verification label (packages/schema/src/verification.ts). `legacy: "public-ledger"` stays for good
 * (decision 15): it reads cards without a `format:` line as this site's format, and
 * lets editors fill in the cost quality labels once after the conversion.
 */
export default defineConfig({
  site: {
    name: "LedgerGov.UK",
    url: "https://ledgergov.uk",
    description: { en: "What UK governments and parties promise: the exact words, the cost a year, and a timeline that moves only on evidence." },
  },
  content: "content",
  timezone: "Europe/London",
  locales: { default: "en", all: ["en"] },
  // Every cost names who made its central figure, and every card who must deliver it (PROMISE_STANDARD §2 and §11).
  money: { currency: "GBP", unit: "bn", period: "year", qualities: ["sourced", "approx", "modelled"], costedBy: "required" },
  actors: {
    kinds: ["person", "party", "government"],
    standing: "manual",
    responsible: ["government"],
    responsibleRequired: true,
    ids: { parliament_member_id: "https://members.parliament.uk/member/{id}", parliament_party_id: "UK Parliament Members API party id" },
  },
  venues: ["manifesto", "speech", "debate", "tv", "interview", "press_release", "parliament", "social"],
  areas: {
    kind: "enum",
    values: ["taxes", "social_protection", "health", "education", "economic_affairs", "defence", "public_order", "general_services", "housing_env", "culture"],
    // Labels and published area URLs (packages/server/src/seo/cards.ts AREA_SLUG): never change a slug.
    labels: {
      taxes: { en: "Taxes" },
      social_protection: { en: "Social protection" },
      health: { en: "Health" },
      education: { en: "Education" },
      economic_affairs: { en: "Transport & economy" },
      defence: { en: "Defence" },
      public_order: { en: "Police, courts, prisons" },
      general_services: { en: "Running government" },
      housing_env: { en: "Housing & environment" },
      culture: { en: "Culture & sport" },
    },
    slugs: {
      taxes: "taxes",
      social_protection: "social-protection",
      health: "health",
      education: "education",
      economic_affairs: "transport-and-economy",
      defence: "defence",
      public_order: "police-courts-and-prisons",
      general_services: "running-government",
      housing_env: "housing-and-environment",
      culture: "culture-and-sport",
    },
  },
  ladder: "national",
  // The automated reviewer was called "Junior Editor" until 8 October 2026.
  // Publish by checks (OpenPromises decision 22, since 0.6.0): a card is published once its checks pass; editors'
  // approvals become its verification label (decision 23), except on a reader's submission or a card that does not say
  // its origin, which still waits for editors' approvals. Pavel decided on 17 October 2026 that one approval, his, is
  // enough, after AI Journalist's check (OpenPromises decision 27), but the engine (0.6.0, and 0.7.0 as prepared)
  // still refuses fewer than 2 ("publishing needs two editors (principle 4)"). Until then the engine's check asks
  // for two approvals only on a reader's submission or a card without an origin; everything else (the site's own
  // APPROVALS_NEEDED, the intake merge) already needs one. Approvals already recorded stay valid.
  // packages/schema/src/verification.ts SITE_EDITORIAL mirrors these settings.
  // TODO(openpromises-0.7.0): set `approvals: 1` here and in SITE_EDITORIAL when adopting OpenPromises 0.7.0
  // (decision 27), which accepts one approval.
  editorial: { approvals: 2, partyConflict: true, publish: "checked", renamed: { "Junior Editor": "AI Journalist" } },
  quotes: {
    archive: "optional",
    require: "editor",
    // The terms each quote may be reused on, by where it comes from (packages/server/src/api/envelope.ts quoteLicence).
    licences: [
      { hosts: ["parliament.uk"], name: "Open Parliament Licence v3.0" },
      { hosts: ["gov.uk", "gov.scot", "gov.wales"], name: "Open Government Licence v3.0" },
    ],
    otherLicence: "Quoted for reporting; rights stay with the publisher",
  },
  modules: ["contracts", "lever", "corrections", "reviews"],
  // Feed entry ids as the site's feeds already publish them (tag:ledgergov.uk,2026:promise/<id>/event/<n>).
  publish: {
    tag: "ledgergov.uk,2026",
    feeds: "atom",
    licence: { name: "Creative Commons Attribution 4.0 (CC BY 4.0)", url: "https://creativecommons.org/licenses/by/4.0/" },
  },
  messages: {
    en: {
      "card.area": "Policy area",
      "card.timeline": "Timeline",
      "card.corrections": "Corrections",
      "card.corrected_on": "{date}, {target}",
      "nav.promises": "Promise ledger",
      "feed.actor": "{site}: {who}",
      "feed.all": "{site}: every change",
      "feed.area": "{site}: {area}",
      "feed.sub.all":
        "New timeline events, rewordings, replies and cost changes on every tracked UK political promise, changes to the contracts behind them, and new editions of the headline figures, newest first.",
      "md.quote_checked": "checked word for word on {date}",
      "md.licence":
        "{site}'s own writing (headlines, status notes, cost notes, summaries) is licensed under {licence}: reuse it, crediting {site} with a link to the card. Official figures are under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) unless their source says otherwise; quotes from Parliament under the [Open Parliament Licence v3.0](https://www.parliament.uk/site-information/copyright-parliament/open-parliament-licence/); other quotes are short extracts whose rights stay with the speaker. How the numbers and statuses are made: https://ledgergov.uk/method.",
    },
  },
  // Fields this site keeps beyond format v1 (packages/schema/src/content.ts). Who must deliver and who brought it
  // about are format fields (responsible, brought_about_by), mapped from outcome_by and brought_about_by.
  x: {
    card: z.strictObject({
      submission_ref: z.string().optional(),
      credit: z.string().optional(),
      editor_check_required: z.boolean().optional(),
    }),
  },
  legacy: "public-ledger",
});
