import "server-only";
import { Quality, type Lever, type Source } from "@ledger/schema";
import { createModel, largestPerUnit, reckonerChanges, relativeBand, type ReckonerChange, type ReckonerObservation } from "@ledger/engine";
import { parseCsv } from "@ledger/server/api";
import { readBuildText } from "@ledger/schema/forecasts";
import { getSeed, getVintages } from "./data";
import { leverValueText } from "./levers";
import { MINUS, gbpBn, grouped, longDate } from "./format";
import { RECKONER_CARDS, RECKONER_PATH, reckonerPath, type ReckonerCardSpec } from "./reckoner-copy";
import { absolute, MAKER, SITE_NAME } from "./site";

/**
 * The ready-reckoner cards (/tax), built from the sandbox's levers and the
 * HMRC observations behind them (packages/engine/src/reckoner.ts checks that
 * the two agree). Read once per build; the pages are static.
 */

/** The source the cards quote: HMRC, Direct effects of illustrative tax changes. */
export const RECKONER_SOURCE_ID = "hmrc_reckoner";

export interface CardChange extends ReckonerChange {
  lever: Lever;
  /** "Higher rate": which lever, on a card with more than one. */
  label: string;
  /** HMRC's own row, word for word: "Change basic rate by 1p". */
  row: string | null;
  /** The sandbox with this change made. */
  sandboxHref: string;
}

export interface ReckonerCard {
  spec: ReckonerCardSpec;
  path: string;
  /** Every change on the card: one for a per-unit lever, HMRC's steps for each stepped one. */
  changes: CardChange[];
  /** The change the card's headline and its line in lists use: the first lever's first change. */
  headline: CardChange;
}

export interface ReckonerEdition {
  source: Source;
  /** The edition as the build labels it, e.g. "HMRC-DE-2025-06". */
  vintage: string;
  /** "24 Jun 2025" */
  published: string;
  /** The first and last years HMRC costs, e.g. "2026-27" and "2028-29". */
  firstYear: string;
  lastYear: string;
  /** The editorial band either side of HMRC's figure, as a share (0.1), when every card uses the same one. */
  band: number | null;
}

export interface Reckoner {
  edition: ReckonerEdition;
  cards: ReckonerCard[];
  /** The one-unit change that raises the most, in the first and in the last year. */
  largest: { first: ReckonerCard | undefined; last: ReckonerCard | undefined };
}

const HMRC_ROW = /^HMRC row '(.+?)' \[/;

function observations(vintage: string): ReckonerObservation[] {
  const path = `data/build/observations/${RECKONER_SOURCE_ID}/${vintage}.csv`;
  const text = readBuildText(path);
  if (!text) throw new Error(`reckoner: ${path} is missing`);
  return parseCsv(text).map((r) => ({
    series_id: r.series_id!,
    period: r.period!,
    value: Number(r.value),
    source_id: r.source_id!,
    vintage: r.vintage!,
    quality: Quality.parse(r.quality),
    method_note: r.method_note,
  }));
}

let cached: Reckoner | null = null;

export function getReckoner(): Reckoner {
  if (cached) return cached;
  const seed = getSeed();
  const source = seed.sources.find((s) => s.id === RECKONER_SOURCE_ID);
  if (!source?.published_on) throw new Error(`reckoner: source "${RECKONER_SOURCE_ID}" has no publication date`);
  const inManifest = getVintages().manifest.sources.find((s) => s.id === RECKONER_SOURCE_ID);
  const vintage = inManifest?.freshness?.vintage ?? inManifest?.vintages.at(-1);
  if (!vintage) throw new Error(`reckoner: the manifest names no edition of "${RECKONER_SOURCE_ID}"`);
  const rows = observations(vintage);
  const model = createModel(seed.statement, seed.levers);

  const cards = RECKONER_CARDS.map((spec): ReckonerCard => {
    const changes = spec.levers.flatMap(({ label, ...change }) =>
      reckonerChanges(model, change, rows, seed.baseYear).map((c) => ({
        ...c,
        lever: model.leverById.get(c.lever_id)!,
        label,
        row: HMRC_ROW.exec(rows.find((r) => r.series_id === c.series_id && r.period === c.first.period)?.method_note ?? "")?.[1] ?? null,
        sandboxHref: `/?s=${c.scenario}#scenario`,
      })),
    );
    return { spec, path: reckonerPath(spec.slug), changes, headline: changes[0]! };
  });

  const all = cards.flatMap((c) => c.changes);
  // The index and the questions name one first and one last year, so every change must share them.
  const years = new Set(all.map((c) => `${c.first.period}/${c.last.period}`));
  if (years.size !== 1) throw new Error(`reckoner: the cards cover different years (${[...years].join(", ")})`);
  const bands = new Set(all.flatMap((c) => [relativeBand(c.first.range), relativeBand(c.last.range)]).map((b) => (b === null ? "none" : b.toFixed(6))));
  const band = bands.size === 1 && !bands.has("none") ? Number([...bands][0]) : null;
  const cardOf = (c: CardChange | undefined) => cards.find((card) => c && card.changes.includes(c));
  cached = {
    edition: {
      source,
      vintage,
      published: longDate(source.published_on),
      firstYear: cards[0]!.headline.first.period,
      lastYear: cards[0]!.headline.last.period,
      band,
    },
    cards,
    largest: { first: cardOf(largestPerUnit(all, "first")), last: cardOf(largestPerUnit(all, "last")) },
  };
  return cached;
}

export const findCard = (slug: string) => getReckoner().cards.find((c) => c.spec.slug === slug) ?? null;

// ---------------------------------------------------------------- words

const MILLIONS_PER_BN = 1000;
/** £bn to two decimal places: £10m steps. */
const HUNDREDTHS = 100;
const twoDp = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
const oneDpFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const oneDp = (x: number) => oneDpFormat.format(x);

/**
 * HMRC's figure exactly as HMRC rounds it (to £5m): "£6.9bn", "£5.35bn",
 * "£145m", "£3,565m". Never rounded further, so a quote matches the source.
 */
export function hmrcFigure(bn: number): string {
  const a = Math.abs(bn);
  const sign = bn < 0 ? MINUS : "";
  const m = Math.round(a * MILLIONS_PER_BN);
  const exactInBn = a >= 1 && Math.abs(a * HUNDREDTHS - Math.round(a * HUNDREDTHS)) < 1e-6;
  return exactInBn ? `${sign}£${twoDp.format(a)}bn` : `${sign}£${grouped(m)}m`;
}

/**
 * A range in the same unit as its centre: "£6.2bn to £7.6bn" around £6.9bn,
 * "−£187m to −£153m" around −£170m. Each end as a separate string, so a page
 * can keep each one on a single line.
 */
export function rangeEnds([low, central, high]: [number, number, number]): [string, string] {
  if (Math.abs(central) >= 1) return [gbpBn(low), gbpBn(high)];
  // Under £10m a whole-million range would round onto its own centre ("−£6m to −£5m" around −£5m): keep one decimal.
  const dp = Math.abs(central) * MILLIONS_PER_BN < 10 ? oneDp : grouped;
  const m = (x: number) => `${x < 0 ? MINUS : ""}£${dp(Math.abs(x) * MILLIONS_PER_BN)}m`;
  return [m(low), m(high)];
}

/** "£6.2bn to £7.6bn" */
export const rangeLike = (r: [number, number, number]) => rangeEnds(r).join(" to ");

/** "raises £6.9bn", "loses £15m"; with `would`: "raise £6.9bn", "lose £15m". */
export function effectWords(bn: number, would = false): string {
  if (bn === 0) return would ? "make no difference" : "makes no difference";
  const verb = bn > 0 ? "raise" : "lose";
  return `${would ? verb : `${verb}s`} ${hmrcFigure(Math.abs(bn))}`;
}

/** "raise £6.9bn in 2026-27 and £8.2bn in 2028-29"; the verb is repeated only when it changes. */
export function twoYears(c: Pick<ReckonerChange, "first" | "last">, would = false): string {
  const [a, b] = [c.first.range[1], c.last.range[1]];
  const second = Math.sign(a) === Math.sign(b) && b !== 0 ? hmrcFigure(Math.abs(b)) : effectWords(b, would);
  return `${effectWords(a, would)} in ${c.first.period} and ${second} in ${c.last.period}`;
}

/** "20% to 21%" */
export const fromTo = (c: CardChange) => `${leverValueText(c.lever, c.from)} to ${leverValueText(c.lever, c.to)}`;

/** "+1 point", "+10 points" */
export const pointsText = (by: number) => `+${by} ${by === 1 ? "point" : "points"}`;

/** Sentence case for a change that starts a line: "A rise in capital gains tax". */
export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "What 1p on the basic rate of income tax raises" */
export const cardTitle = (card: ReckonerCard) => `What ${card.spec.change} raises`;

/** Today's rate, or the rate after the card's first change, for the copy's `about` line. */
export function rateText(card: ReckonerCard) {
  return (leverId: string, when: "now" | "after") => {
    const c = card.changes.find((x) => x.lever_id === leverId);
    if (!c) throw new Error(`reckoner: card ${card.spec.slug} has no lever "${leverId}"`);
    return leverValueText(c.lever, when === "now" ? c.from : c.to);
  };
}

/** "a 1-point rise in the higher rate" for stepped cards; the card's own words otherwise. */
const quotedChange = (card: ReckonerCard, c: CardChange) => (card.spec.stepped ? `${c.label.toLowerCase()}, ${fromTo(c)}` : `${card.spec.change} (${fromTo(c)})`);

/**
 * The sentence to quote, attributed to HMRC with the edition. A stepped card
 * quotes each lever's smallest step: HMRC says its figures cannot be scaled.
 */
export function quoteText(card: ReckonerCard, edition: ReckonerEdition): string {
  const smallest = card.spec.levers.map((l) => card.changes.find((c) => c.lever_id === l.lever_id)!);
  const claim = card.spec.stepped
    ? `HMRC estimates that raising ${card.spec.short.toLowerCase()} by ${pointsText(smallest[0]!.by).slice(1)} would ${smallest.map((c) => `${twoYears(c, true)} at the ${quotedChange(card, c)}`).join(", and ")}.`
    : `HMRC estimates that ${quotedChange(card, card.headline)} would ${twoYears(card.headline, true)}.`;
  return `${claim} Source: HMRC, ${sourceName(edition)}, edition published ${edition.published}. ${absolute(card.path)}`;
}

/** "Direct effects of illustrative tax changes", without the publisher prefix the source title carries. */
export const sourceName = (edition: ReckonerEdition) => edition.source.title.replace(/^HMRC:\s*/, "");

/** "10%" */
export const bandText = (band: number | null) => (band === null ? "a band" : `${Math.round(band * 100)}%`);

/** The search and share description for a card: the quote without the link, then where it comes from. */
export function cardDescription(card: ReckonerCard, edition: ReckonerEdition): string {
  const claim = quoteText(card, edition).split(" Source: ")[0];
  return `${claim} HMRC's latest figures (published ${edition.published}), with the range, HMRC's caveat and a link to try it in the sandbox.`;
}

// ---------------------------------------------------------------- structured data

const OGL = "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";

/** A fiscal year as dates: "2026-27" → 1 April 2026 to 31 March 2027. */
const fiscalStart = (fy: string) => `${fy.slice(0, 4)}-04-01`;
const fiscalEnd = (fy: string) => `${Number(fy.slice(0, 4)) + 1}-03-31`;

const hmrcDataset = (edition: ReckonerEdition) => ({
  "@type": "Dataset",
  name: `HMRC: ${sourceName(edition)}`,
  url: edition.source.url,
  publisher: { "@type": "GovernmentOrganization", name: "HM Revenue and Customs" },
  datePublished: edition.source.published_on,
  version: edition.vintage,
  license: OGL,
});

const crumbs = (items: { name: string; path: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absolute(it.path) })),
});

/** A card as a Dataset (the figures, their years and the HMRC edition they come from) with its breadcrumb. */
export function cardJsonLd(card: ReckonerCard, edition: ReckonerEdition, indexTitle: string) {
  const c = card.headline;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: cardTitle(card),
      description: cardDescription(card, edition),
      url: absolute(card.path),
      inLanguage: "en-GB",
      isAccessibleForFree: true,
      license: OGL,
      creator: { "@type": "Organization", "@id": absolute("/#org"), name: SITE_NAME, url: absolute("/") },
      author: { "@type": "Person", name: MAKER.name, url: MAKER.url },
      temporalCoverage: `${fiscalStart(c.first.period)}/${fiscalEnd(c.last.period)}`,
      spatialCoverage: { "@type": "Place", name: "United Kingdom" },
      variableMeasured: card.changes.map((x) => `Change in tax receipts, £ billion a year: ${x.label.toLowerCase()} ${fromTo(x)}`),
      isBasedOn: hmrcDataset(edition),
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: absolute("/") },
    },
    crumbs([
      { name: SITE_NAME, path: "/" },
      { name: indexTitle, path: RECKONER_PATH },
      { name: cardTitle(card), path: card.path },
    ]),
  ];
}

/** The index as a CollectionPage listing every card, with its breadcrumb and questions. */
export function indexJsonLd(r: Reckoner, title: string, description: string, path: string, faq: { q: string; a: string }[]) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: title,
      description,
      url: absolute(path),
      inLanguage: "en-GB",
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: absolute("/") },
      isBasedOn: hmrcDataset(r.edition),
      mainEntity: {
        "@type": "ItemList",
        itemListElement: r.cards.map((card, i) => ({ "@type": "ListItem", position: i + 1, name: cardTitle(card), url: absolute(card.path) })),
      },
    },
    crumbs([
      { name: SITE_NAME, path: "/" },
      { name: title, path },
    ]),
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ];
}
