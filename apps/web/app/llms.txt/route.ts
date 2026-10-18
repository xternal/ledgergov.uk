import { backtestSummary, PolicyArea } from "@ledger/schema";
import { areaPath, cardHeadline } from "@ledger/server/seo";
import { constituencies, RECENT_VOTES } from "@ledger/server/mp";
import { getBorrowing, getFiscalTargets, getForecasts, getHouseholdSnapshots, getLeaks, getPeople, getScorecards, getSeed } from "@/lib/data";
import { borrowingSentence } from "@/lib/borrowing-copy";
import { endpoints } from "@/lib/api";
import { backtestLead } from "@/lib/method-copy";
import { STATUS_LABEL } from "@/lib/copy";
import { FAQ } from "@/lib/faq";
import { gbpBn, grouped, poundsPence } from "@/lib/format";
import { pctGdp, per100, ratio, span, spendingSpan } from "@/lib/people-view";
import { AREA_LABEL, costText } from "@/lib/promises";
import { absolute, SITE_DESCRIPTION, SITE_NAME, SOURCE_CODE } from "@/lib/site";
import { MP_DESCRIPTION } from "@/lib/mp-copy";
import { PRIVACY_SUMMARY } from "@/lib/privacy-copy";
import { BUDGET, BUDGET_TOPICS, topicCards } from "@/lib/budget";
import { capitalise, fromTo, getReckoner, pointsText, rangeLike, sourceName, twoYears } from "@/lib/reckoner";
import { RECKONER_PATH, RECKONER_TITLE } from "@/lib/reckoner-copy";
import { scorecardCopy, scorecardPath } from "@/lib/scorecard";
import { currentRound } from "@/lib/predict";
import { PREDICT_PATH, predictDescription, predictTitle } from "@/lib/predict-copy";
import { householdCopy, householdPath } from "@/lib/household";
import { HOW_IT_WORKS_PATH, RULES, headroomView, latestPoint } from "@/lib/headroom";
import { LEAKS_PATH, LEAK_STATUS, leakCounts } from "@/lib/leaks";
import { getReceiptContext, receiptExamples } from "@/lib/receipt";
import { RECEIPT_PATH, RECEIPT_TITLE, illustrationText, receiptDescription, receiptExamplePath } from "@/lib/receipt-copy";
import { getPayData } from "@/lib/pay-for-it";
import { FIRST_PLEDGE, PAY_PATH, planPath } from "@/lib/pay-for-it-view";
import { PAY_TITLE } from "@/lib/pay-for-it-copy";

export const dynamic = "force-static";

/** /budget/how-it-works in one line: the rules and the OBR's latest headroom, from its own table. */
function budgetHeadroomLine() {
  const v = headroomView(getFiscalTargets());
  const s = latestPoint(v, "current_budget")!;
  const i = latestPoint(v, "psnfl")!;
  const since = v.since?.status === "not_assessed" ? ` The OBR's ${v.since.edition} forecast made no assessment (since February 2026 the rules are assessed once a year, at the Budget).` : "";
  return `- [How a Budget works, and the Chancellor's headroom](${absolute(HOW_IT_WORKS_PATH)}): what a Budget is, the fiscal rules in the government's own words (the ${RULES.current_budget.name.toLowerCase()}, the ${RULES.psnfl.name.toLowerCase()} and the ${RULES.welfare_cap.name.toLowerCase()}, from the Charter for Budget Responsibility), and the OBR's headroom against each at every forecast that assessed them. Latest: ${v.latest.edition}, ${v.latest.table}: ${gbpBn(s.margin.value)} against the ${RULES.current_budget.name.toLowerCase()} and ${gbpBn(i.margin.value)} against the ${RULES.psnfl.name.toLowerCase()} in ${s.margin.period}.${since}`;
}

/** /budget/leaks in one line. */
function budgetLeaksLine() {
  const leaks = getLeaks();
  const c = leakCounts(leaks);
  const now = leaks.length ? ` ${leaks.length} so far: ${c.trailed} ${LEAK_STATUS.trailed.label.toLowerCase()}, ${c.confirmed} confirmed, ${c.announced} ${LEAK_STATUS.announced.label.toLowerCase()}.` : " Empty until editors start adding reports.";
  return `- [Trailed before the Budget](${absolute(LEAKS_PATH)}): every measure briefed to the press before the ${BUDGET.name}, with the outlet, the date, a link to the original report, an estimated cost only where a source gives one, and from Budget day what the Budget did. Each says whether it is only trailed (reported, not confirmed), confirmed on the record, or in the Budget documents.${now}`;
}

/** /pay-for-it in one line: what it does and what it is built from. */
function payLine() {
  const d = getPayData();
  const parties = new Set(d.pledges.map((p) => p.owner)).size;
  return `- [${PAY_TITLE}](${absolute(PAY_PATH)}): pick one of ${d.pledges.length} costed promises (from ${parties} parties and bodies, every one with a yearly cost to the public purse, starting with the £2 bus fare cap) and pay for it with a tax rise, a spending cut or borrowing, or a mix. A tax uses HMRC's figure for what 1p or 1 point raises in ${d.taxes[0]?.period ?? d.year} (edition published ${d.hmrcPublished}, as on the tax cards); a cut comes from one area of spending in the ${d.year} Statement or every area by the same share (not debt interest); borrowing pays the rest. It shows the change in borrowing as a range, the Statement before and after (income plus borrowing equals spending), and who decides each choice. Each plan has its own link, /pay-for-it/<promise id>/<plan>, for example ${absolute(planPath({ pledge_id: FIRST_PLEDGE, tax: { lever_id: d.taxes[0]!.lever_id, share: 100 }, cut: null }))}. A what-if, not a forecast.`;
}

/** A plain-text summary for AI assistants (llmstxt.org), built from the same data as the site. */
export function GET() {
  const seed = getSeed();
  const s = seed.statement;
  const receipts = s.receipts.reduce((a, l) => a + l.bn, 0);
  const spending = s.spending.reduce((a, l) => a + l.bn, 0);
  const people = getPeople();
  const oadr = span(people.charts.oadr);
  const workers = span(people.charts.workers);
  const age = spendingSpan(people);
  const { forecasts } = getForecasts();
  const shown = forecasts.filter((f) => f.recorded_as === "shown");
  const context = backtestSummary(forecasts.filter((f) => f.recorded_as === "context"));
  const firstRecorded = shown.map((f) => f.recorded_on).sort()[0] ?? null;
  const reckoner = getReckoner();
  const areas = PolicyArea.options.filter((a) => seed.cards.some((c) => c.file.policy_area === a));
  const borrowing = getBorrowing();
  const receipt = getReceiptContext();
  const lines = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    `In ${s.meta.fiscal_year} (${s.meta.vintage_label}) the UK state spent ${gbpBn(spending)}. Taxes and other income covered ${gbpBn(receipts)}; ${gbpBn(s.borrowing_bn)} was borrowed. Figures are official outturn or forecasts, each linked to its source. Model results are ranges (low, central, high), never single numbers, and are not forecasts.`,
    "",
    "## Pages",
    "",
    `- [Annual statement and sandbox](${absolute("/")}): where the money came from and went, and what changing a tax or spending lever would do, as a range.`,
    `- [Promise ledger](${absolute("/promises")}): every tracked UK political promise with its cost, who pays, status and evidence. One standard for every party.`,
    `- [Every promise in full](${absolute("/llms-full.txt")}): all ${seed.cards.length} promise cards as Markdown in one file (quote, speaker, party, date, status and status note, cost range, who pays, timeline with evidence links, contracts, corrections, sources), with the method in short and the licences. Each card alone is at ${absolute("/promise/<id>.md")}.`,
    `- Promises by policy area: ${areas.map((a) => `[${AREA_LABEL[a]}](${absolute(areaPath(a))})`).join(", ")}. Each lists the cards in that area and how they stand.`,
    `- [People and long-term spending](${absolute("/people")}): ONS population projections (principal and variants) and OBR long-term spending projections. In the ONS principal projection there are ${per100(oadr.last)} people over pension age for every 100 of working age in ${oadr.lastYear} (${per100(oadr.first)} in ${oadr.firstYear}; variants ${per100(oadr.range[0])} to ${per100(oadr.range[2])}), and ${ratio(workers.last)} people of working age per person over pension age. In the OBR baseline, age-related spending goes from ${pctGdp(age.first)} of GDP in ${age.firstYear} to ${pctGdp(age.last)} in ${age.lastYear} (OBR scenarios ${pctGdp(age.range[0])} to ${pctGdp(age.range[2])}). Assumption switches pick published variants only.`,
    `- [Borrowing so far this year](${absolute("/borrowing")}): ${borrowingSentence(borrowing)} Month by month from the ONS public sector finances${borrowing.profile ? `, against the OBR's monthly path for its ${borrowing.profile.edition} forecast (one line; the OBR publishes no range for it)` : ""}${borrowing.release ? `. Latest release: ${borrowing.release.title}${borrowing.release.next_on ? `; next due ${borrowing.release.next_on}` : ""}` : ""}.`,
    `- [Your MP](${absolute("/mp")}): ${MP_DESCRIPTION} Each of the ${constituencies().length} constituencies has a page at ${absolute("/mp/<constituency>")}, for example ${absolute("/mp/manchester-central")}: the sitting MP (from the UK Parliament Members API), any promises we track in their name, a summary of their party's, and their last ${RECENT_VOTES} recorded Commons votes (Commons Votes API), with votes on bills our cards cite highlighted. Data checked daily.`,
    `- [How the numbers are made](${absolute("/method")}): sources, quality labels, why results are ranges, who checks the cards, and a changelog of every data edition.`,
    `- [Forecasts against what happened](${absolute("/method/backtest")}): every forecast the site shows is recorded and scored against the official outturn. ${backtestLead(backtestSummary(shown), firstRecorded)} Earlier official forecasts checked for context: ${context.scored}.`,
    `- [Open data API](${absolute("/method/api")}): the same data as JSON or CSV, free, no key.`,
    `- [Most read pages](${absolute("/method/numbers")}): which pages readers open most over the last 7 and 30 days, counted on the server as one number per page per day with nothing about the reader; the daily totals are public at ${absolute("/views.json")}.`,
    `- [${BUDGET.name}](${absolute("/budget")}): the Budget on ${BUDGET.date} can fund, change or break the government's promises. The page lists the government's promises it could still move (those needing money, largest first, and tax pledges), the opposition's costed pledges for comparison, and, from Budget day, what the Budget did to each card with links to the evidence.`,
    ...BUDGET_TOPICS.filter((t) => topicCards(seed.cards, t).length > 0).map((t) => `- [${t.heading}](${absolute(`/budget/${t.id}`)}): ${t.description}`),
    `- [${RECEIPT_TITLE}](${absolute(RECEIPT_PATH)}): ${receiptDescription(receipt)} ${illustrationText} Example receipts for fixed salaries: ${receiptExamples()
      .map(({ example, receipt: r }) => `[£${grouped(example.salary)}](${absolute(receiptExamplePath(example.slug))}) pays ${poundsPence(r.tax_pence)} plus ${poundsPence(r.borrowed_pence)} borrowed on top`)
      .join("; ")}.`,
    payLine(),
    `- [${RECKONER_TITLE}](${absolute(RECKONER_PATH)}): what one change to each main tax would raise a year, HMRC's figures from ${sourceName(reckoner.edition)} (edition published ${reckoner.edition.published}), one page each with the year, a range, HMRC's caveat and a link that makes the change in the sandbox. Listed below under "${RECKONER_TITLE}".`,
    ...getScorecards().map((sc) => `- [${scorecardCopy(sc).title}](${absolute(scorecardPath(sc))}): ${scorecardCopy(sc).description} Figures are the Treasury's, in £ million, positive where a measure raises money and negative where it costs.`),
    `- [${predictTitle(currentRound())}](${absolute(PREDICT_PATH)}): ${predictDescription(currentRound())} Each question is settled by a named Budget document; editors record the answers after the Budget and every set of predictions is scored.`,
    ...getHouseholdSnapshots().map(
      (h) =>
        h.provider
          ? `- [${householdCopy(h).title}](${absolute(householdPath(h))}): ${householdCopy(h).description} Income tenths rank households by income after tax and benefits, not adjusted for household size. Static estimate (nobody changes behaviour), shown with a ±10% range; computed once with PolicyEngine UK ${h.provider.model_version}${h.kind === "rehearsal" ? "; a rehearsal on last year's Budget" : ""}.`
          : `- [${householdCopy(h).title}](${absolute(householdPath(h))}): ${householdCopy(h).description} No model answers yet: the measures, the salary check and the Treasury's chart are complete; the estimate by income tenth and for example households will be computed once with PolicyEngine UK${h.kind === "rehearsal" ? "; a rehearsal on last year's Budget" : ""}.`,
    ),
    budgetHeadroomLine(),
    budgetLeaksLine(),
    `- [Coming up](${absolute("/promises#coming-up")}): open promises due in the next 12 months, nearest deadline first. Readers can follow a deadline window (this month, next 3 months, next 12 months) by email, Telegram or feed.`,
    `- [Privacy notice](${absolute("/privacy")}): ${PRIVACY_SUMMARY}`,
    `- [Become an editor](${absolute("/editors")}): volunteer editors check promise cards against their sources, after AI Journalist, our automated reviewer; one editor's approval verifies a card (today Pavel Guzhikov's). About two hours a week, remote, no coding; any party or none, declared.`,
    `- [Source code](${SOURCE_CODE.url}): the site, the data pipeline and every promise file, open source under ${SOURCE_CODE.licence}. Every edit to a promise card is a public commit.`,
    `- [Atom feed of every change](${absolute("/feeds/all.xml")}): promise changes, contract changes and new editions of the headline figures.`,
    `- [Atom feed of updates to the figures](${absolute("/feeds/updates.xml")}): contracts behind promises that move or are linked, and new OBR forecasts or ONS releases that change the Statement.`,
    `- [Atom feed of promises due in the next 3 months](${absolute("/feeds/deadlines/next-3-months.xml")}): outcomes when they fall due, and a monthly list of what is coming due.`,
    "",
    "## Open data API",
    "",
    "Read-only, JSON by default; add .csv for a spreadsheet. Every number carries unit, quality, source_id and vintage (edition); every response carries its licence (Open Government Licence v3.0; Open Parliament Licence for quotes from Parliament). Open CORS for GET. No reader data.",
    "",
    ...endpoints().map((e) => `- [${e.path}](${absolute(e.example)})${e.csv ? ` ([CSV](${absolute(`${e.example}.csv`)}))` : ""}: ${e.about}`),
    "",
    `## ${RECKONER_TITLE}`,
    "",
    `HMRC's estimates, for a change made at the start of ${reckoner.edition.firstYear}, on its own. Each includes taxpayers' own response where HMRC models it, but no wider economic effects. The range is the site's editorial band around HMRC's single figure.`,
    "",
    ...reckoner.cards.flatMap((card) =>
      card.changes.map(
        (c) =>
          `- [${capitalise(card.spec.change)}${card.spec.stepped ? `: ${c.label.toLowerCase()} ${pointsText(c.by)}` : ""}](${absolute(card.path)}), ${fromTo(c)}: would ${twoYears(c, true)} (ranges ${rangeLike(c.first.range)} and ${rangeLike(c.last.range)}). ${card.spec.caveat}`,
      ),
    ),
    "",
    "## Promises",
    "",
    ...seed.cards.map(
      (c) =>
        `- [${cardHeadline(c)}](${absolute(`/promise/${c.id}`)}) ([Markdown](${absolute(`/promise/${c.id}.md`)})): ${c.actor.name}, “${c.current.text.replace(/\s+/g, " ").trim()}”. ${STATUS_LABEL[c.file.status]}. ${costText(c)}.`,
    ),
    "",
    "## Sources",
    "",
    ...seed.sources.map((src) => `- [${src.title}](${src.url})`),
    "",
    "## Questions",
    "",
    ...FAQ.flatMap(({ q, a }) => [`### ${q}`, "", a, ""]),
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
