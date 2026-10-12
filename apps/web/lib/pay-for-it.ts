import "server-only";
import { EVERY_LINE, NOT_CUTTABLE, createModel, cuttableLines, decodePlan, payFor, pledgeOf, type PayPlan, type PayResult } from "@ledger/engine";
import { cardHeadline } from "@ledger/server/seo";
import { getSeed } from "./data";
import { getReckoner } from "./reckoner";
import { STATUS_LABEL } from "./copy";
import { AREA_LABEL, ownerOf, shortName, standingOf } from "./promises";
import { FIRST_PLEDGE, PAY_PATH, payOptions, type CutOption, type PayData, type PledgeView, type TaxOption } from "./pay-for-it-view";
import { PAY_FAQ, PAY_TITLE, payDescription } from "./pay-for-it-copy";
import { absolute, MAKER, SITE_NAME } from "./site";

/**
 * Pay for it's data, built once per build from the promise cards, the /tax
 * cards and the Statement (server-only). The page sends it to the browser,
 * where the engine works out each plan.
 */

/** "1p on the basic rate of income tax" → unit "p", on "on the basic rate of income tax". A card worded otherwise stops the build. */
const ONE_UNIT = /^1(p| point) (on .+)$/;

let cached: PayData | null = null;

export function getPayData(): PayData {
  if (cached) return cached;
  const seed = getSeed();
  const model = createModel(seed.statement, seed.levers);
  const reckoner = getReckoner();

  const pledges: PledgeView[] = seed.cards.flatMap((c) => {
    const pledge = pledgeOf(c, model);
    if (!pledge) return [];
    const p = c.current.parameters!;
    return [
      {
        ...pledge,
        headline: cardHeadline(c),
        quote: c.current.text.replace(/\s+/g, " ").trim(),
        who: c.actor.kind === "person" && c.party ? `${c.actor.name}, ${shortName(c.party)}` : c.actor.name,
        owner: shortName(ownerOf(c)),
        standing: standingOf(c) ?? null,
        status: STATUS_LABEL[c.file.status],
        made_on: c.file.made_on,
        costed_by: p.costed_by ?? null,
        cost_quality: p.cost_sources?.length ? "sourced" : "approx",
        cost_note: p.cost_note ?? null,
        cost_sources: (p.cost_sources ?? []).map((s) => ({ title: s.title, url: s.url })),
        funded_by: p.funded_by ?? null,
        area: AREA_LABEL[c.file.policy_area],
        href: `/promise/${c.id}`,
      },
    ];
  });
  if (!pledges.some((p) => p.id === FIRST_PLEDGE)) throw new Error(`pay for it: the first pledge "${FIRST_PLEDGE}" has no yearly cost`);

  // The /tax cards' per-unit changes, in the cards' order. Capital gains tax is left out: HMRC costs it only in steps that raise little or lose money.
  const taxes: TaxOption[] = reckoner.cards
    .filter((card) => !card.spec.stepped)
    .map((card) => {
      const c = card.headline;
      const m = ONE_UNIT.exec(card.spec.change);
      if (!m) throw new Error(`pay for it: cannot read the change on /tax card "${card.spec.slug}": "${card.spec.change}"`);
      return {
        lever_id: c.lever_id,
        label: card.spec.short,
        unit: m[1] === "p" ? "p" : "point",
        on: m[2]!,
        href: card.path,
        period: c.first.period,
        controlled_by: c.lever.controlled_by,
        provenance: { quality: c.quality, source_id: c.source_id, method_note: c.lever.method_note },
      } satisfies TaxOption;
    });

  const lines = cuttableLines(model);
  const cuts: CutOption[] = [
    {
      id: EVERY_LINE,
      label: "Every area of spending, by the same share",
      bn: lines.reduce((a, l) => a + l.bn, 0),
      // The lines' own provenance when they share it (PESA for every area today); otherwise their sum is an estimate.
      provenance:
        new Set(lines.map((l) => `${l.quality}/${l.source_id}`)).size === 1
          ? { quality: lines[0]!.quality, source_id: lines[0]!.source_id, method_note: "The areas of spending a cut can come from, added up: every line but debt interest and accounting adjustments." }
          : { quality: "approx", method_note: "The areas of spending a cut can come from, added up from lines with different sources." },
    },
    ...lines.map((l) => ({ id: l.id, label: l.label, bn: l.bn, provenance: { quality: l.quality, source_id: l.source_id, method_note: l.method_note } })),
  ];
  for (const id of NOT_CUTTABLE) if (!seed.statement.spending.some((l) => l.id === id)) throw new Error(`pay for it: the Statement has no line "${id}" to leave out of cuts`);

  const { macro } = seed.statement;
  const rateLever = model.rateLever;
  cached = {
    pledges,
    taxes,
    cuts,
    statement: seed.statement,
    levers: seed.levers,
    hmrcPublished: reckoner.edition.published,
    year: seed.statement.meta.fiscal_year,
    householdsP: macro.provenance.households_m!,
    // Bank Rate's level today and who sets it: the interest on new borrowing follows it.
    rate: rateLever ? { label: rateLever.label, controlled_by: rateLever.controlled_by, provenance: macro.provenance.bank_rate_pct! } : null,
    builtOn: seed.builtAt.slice(0, 10),
  };
  // Every pledge must be costable at least by borrowing: payFor throws otherwise, here at build rather than in a reader's browser.
  const opts = payOptions(cached, model);
  for (const p of pledges) payFor(opts, { pledge_id: p.id, tax: null, cut: null });
  return cached;
}

/** A shared plan from its link, worked out; null for anything that is not one. */
export function sharedPlan(pledgeId: string, segment: string): { plan: PayPlan; result: PayResult; data: PayData } | null {
  const data = getPayData();
  const opts = payOptions(data);
  const plan = decodePlan(opts, pledgeId, segment);
  return plan ? { plan, result: payFor(opts, plan), data } : null;
}

/** The page as a web application, with its breadcrumb and questions, for search engines and AI assistants. */
export function payJsonLd() {
  const url = absolute(PAY_PATH);
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: PAY_TITLE,
      description: payDescription,
      url,
      inLanguage: "en-GB",
      applicationCategory: "EducationalApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript to change the plan; the starting plan reads without it.",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
      creator: { "@type": "Organization", "@id": absolute("/#org"), name: SITE_NAME, url: absolute("/") },
      author: { "@type": "Person", name: MAKER.name, url: MAKER.url },
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: absolute("/") },
      about: [
        { "@type": "Thing", name: "UK public finances" },
        { "@type": "Thing", name: "Political promises" },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { name: SITE_NAME, path: "/" },
        { name: "Promises", path: "/promises" },
        { name: PAY_TITLE, path: PAY_PATH },
      ].map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absolute(c.path) })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: PAY_FAQ.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];
}
