import { forecastGap, homeTiles, logbook, LADDER, type CardView, type LogEntry, type Seed, type Status } from "@ledger/schema";
import type { PeopleBundle } from "@ledger/schema";
import type { HomeData, LogLine, PopulationCard, Tile } from "@/components/HomeFirstScreen";
import { pctGdp, per100, span, spendingSpan } from "./people-view";
import { EVENT_LABEL } from "./copy";
import { longDate } from "./format";

/** "21 Oct" */
const day = (iso: string) => longDate(iso).split(" ").slice(0, 2).join(" ");
const who = (c: CardView) => c.actor.name.replace(/^(Sir|Dame) /, "");
const headline = (c: CardView) => c.file.headline ?? c.current.text;
/** The statuses in the order the bar and the counts show them: the ladder, then the endings off it. */
const ORDER: Status[] = [...LADDER, "failed", "quietly_dropped", "unscoreable"];

function logLine(e: LogEntry): LogLine {
  const base = { date: day(e.date), text: e.text, href: e.href };
  if (e.kind === "new") return { ...base, label: "New", tone: "new" };
  if (e.kind === "checked") return { ...base, label: "Checked", tone: "good" };
  if (e.kind === "corrected") return { ...base, label: "Corrected", tone: "neutral" };
  const step = e.step!;
  return { ...base, label: EVENT_LABEL[step], tone: step === "delivered" ? "good" : step === "failed" || step === "deadline_missed" ? "bad" : "moved" };
}

/** The Population card's figures, from the same series and words as the population page (/people). */
function populationCard(people: PeopleBundle): PopulationCard {
  const o = span(people.charts.oadr);
  const s = spendingSpan(people);
  // One scale for both bars: 0 to 60 people per 100, which holds every published variant.
  const pct = (x: number) => Math.min(100, Math.max(0, (x / 60) * 100));
  return {
    oadr: {
      firstYear: o.firstYear,
      first: per100(o.first),
      lastYear: o.lastYear,
      last: per100(o.last),
      low: per100(o.range[0]),
      high: per100(o.range[2]),
      firstPct: pct(o.first),
      lastPct: pct(o.last),
      lowPct: pct(o.range[0]),
      highPct: pct(o.range[2]),
    },
    spending: { firstYear: s.firstYear, first: pctGdp(s.first), lastYear: s.lastYear, last: pctGdp(s.last) },
  };
}

/** Everything the home page's first screen shows besides the statement's figures, from the cards, for `today`. */
export function homeData(seed: Seed, today: string, people?: PeopleBundle): HomeData {
  const cards = seed.cards;
  const t = homeTiles(cards, today);
  const tiles: Tile[] = [];
  if (t.delivered) tiles.push({ kind: "delivered", headline: headline(t.delivered.card), href: `/promise/${t.delivered.card.id}`, line: `${who(t.delivered.card)}, ${longDate(t.delivered.date)}` });
  if (t.notMet) tiles.push({ kind: "notMet", headline: headline(t.notMet.card), href: `/promise/${t.notMet.card.id}`, line: `${who(t.notMet.card)}, ${longDate(t.notMet.date)}` });
  if (t.dueNext) tiles.push({ kind: "dueNext", headline: headline(t.dueNext.card), href: `/promise/${t.dueNext.card.id}`, line: `${who(t.dueNext.card)}, due ${longDate(t.dueNext.date)}` });
  if (t.forecast) {
    const g = forecastGap(t.forecast.card.current.parameters ?? undefined)!;
    const at = (x: number) => Math.min(100, Math.max(0, (x / g.max) * 100));
    tiles.push({
      kind: "forecast",
      headline: headline(t.forecast.card),
      href: `/promise/${t.forecast.card.id}`,
      line: who(t.forecast.card),
      scale: { target: at(g.metric.target), forecast: at(g.baseline.value), ceiling: g.ceiling, text: `Target ${g.short(g.metric.target)}, ${g.baseline.by.name} forecast ${g.short(g.baseline.value)} before the promise` },
    });
  }
  const named = [...new Set(cards.flatMap((c) => c.verification?.named ?? []))];
  return {
    population: people ? populationCard(people) : undefined,
    total: cards.length,
    people: seed.actors.length,
    counts: ORDER.map((status) => ({ status, count: cards.filter((c) => c.file.status === status).length })).filter((c) => c.count > 0),
    tiles,
    log: logbook(cards, today, 6, named.length ? named : undefined).map(logLine),
  };
}
