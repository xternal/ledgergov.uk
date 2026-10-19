import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { DraftFile, type ActorFile } from "@ledger/schema";
import { checkDrafts, knownQuotes, prBody, writeDrafts } from "../src/harvest/drafts";
import { DEFAULT_INTAKE_MODEL, extractFromSources, type ExtractClient } from "../src/harvest/extract";
import { foldCandidates, quoteCount } from "../src/harvest/fold";
import type { Candidate, HarvestReport, SourceDoc } from "../src/harvest/types";

/**
 * One draft per source and speaker (19 October 2026). The case that made the
 * rule: on 14 October 2026 one GOV.UK release about the Remediation of Unsafe
 * Cladding Bill gave seven drafts; editors made two cards and folded the
 * other five as duplicates (docs/desk/runs/2026-10-14.yaml).
 */

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", "harvest", name), "utf8");

interface StoredDraft {
  id: string;
  quote: string;
  source_span: [number, number];
  speaker: { name: string };
  suggested: Record<"policy_area" | "who" | "how_much" | "when" | "funded_by" | "deadline", string | null>;
  why: string;
  confidence: number;
}
const OCT14 = JSON.parse(fixture("intake-2026-10-14-building-safety.json")) as {
  source: { id: string; url: string; title: string; date: string; venue_label: string };
  desk: { card: Record<string, string>; duplicate: string[] };
  drafts: StoredDraft[];
};
const TEXT = fixture("govuk-building-safety-2026-10-14.txt");
const RELEASE: SourceDoc = {
  id: OCT14.source.id,
  kind: "govuk_press_release",
  url: OCT14.source.url,
  title: OCT14.source.title,
  date: OCT14.source.date,
  venue: "press_release",
  venueLabel: OCT14.source.venue_label,
  text: TEXT,
  segments: [],
  people: [],
};
const actors: ActorFile[] = [{ id: "hm-government", name: "HM Government", kind: "government", roles: [] }];

/** What the model proposed on 14 October: the seven stored drafts, as model output. */
const OCT14_PROPOSALS = OCT14.drafts.map((d) => ({
  quote: d.quote,
  speaker_name: d.speaker.name,
  why: d.why,
  ...d.suggested,
  kind: "commitment",
  check: "The Bill's measure is in force.",
  confidence: d.confidence,
}));

function fakeClient(answers: object[]): ExtractClient {
  return {
    beta: {
      messages: {
        async create() {
          const a = answers.shift() ?? { candidates: [] };
          return { content: [{ type: "text", text: JSON.stringify(a) }], stop_reason: "end_turn", stop_details: null, model: DEFAULT_INTAKE_MODEL } as never;
        },
      },
    },
  };
}

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe("the 14 October 2026 building-safety release", () => {
  it("was seven drafts from one release, every quote exact in the stored source", () => {
    expect(OCT14.drafts).toHaveLength(7);
    for (const d of OCT14.drafts) expect(TEXT.slice(d.source_span[0], d.source_span[1])).toBe(d.quote);
    // The desk made two cards and folded the other five into one of them.
    expect(Object.keys(OCT14.desk.card)).toHaveLength(2);
    expect(OCT14.desk.duplicate).toHaveLength(5);
  });

  it("now gives one draft holding all seven commitments, led by the dated target", async () => {
    const report = await extractFromSources([RELEASE], { client: fakeClient([{ candidates: OCT14_PROPOSALS }]), actors, known: [] });
    expect(report.errors).toEqual([]);
    expect(report.dropped).toEqual([]);
    expect(report.candidates).toHaveLength(1);
    expect(quoteCount(report.candidates)).toBe(7);

    const [draft] = report.candidates;
    const byId = new Map(OCT14.drafts.map((d) => [d.id, d]));
    const quoteOf = (id: string) => byId.get(id)!.quote;
    // The lead is the one with a deadline: the end-2029 remediation target (the card uk-cladding-remediation-2029).
    const target = Object.entries(OCT14.desk.card).find(([, card]) => card === "uk-cladding-remediation-2029")![0];
    expect(draft!.quote).toBe(quoteOf(target));
    expect(draft!.suggested.deadline).toBe("2029-12-31");
    expect(draft!.speaker).toMatchObject({ name: "HM Government", actorId: "hm-government", check: "segment" });
    // The other card's quote and the five the desk folded as duplicates are all in the same draft, in source order.
    const legalDuty = Object.entries(OCT14.desk.card).find(([, card]) => card === "uk-cladding-legal-duty-2026")![0];
    expect(draft!.also!.map((a) => a.quote)).toEqual([legalDuty, ...OCT14.desk.duplicate].map(quoteOf).sort((a, b) => TEXT.indexOf(a) - TEXT.indexOf(b)));
    for (const a of draft!.also!) expect(TEXT.slice(a.span[0], a.span[1])).toBe(a.quote);
    expect(draft!.also!.find((a) => a.quote.includes("£500,000"))!.suggested.how_much).toBe("penalties of up to £500,000");
  });

  it("writes one draft file that passes the exact-match check, and every quote counts as known", async () => {
    const report = await extractFromSources([RELEASE], { client: fakeClient([{ candidates: OCT14_PROPOSALS }]), actors, known: [] });
    const root = mkdtempSync(join(tmpdir(), "ledger-fold-"));
    roots.push(root);
    const full: HarvestReport = { date: "2026-10-14", sources: [{ id: RELEASE.id, kind: RELEASE.kind, title: RELEASE.title, url: RELEASE.url, candidates: 1 }], ...report };
    writeDrafts(full, [RELEASE], { root, date: "2026-10-14" });
    const dir = join(root, "content", "drafts", "2026-10-14");
    expect(readdirSync(dir).filter((f) => f.endsWith(".yaml"))).toEqual([`2026-10-14-${RELEASE.id}-1.yaml`]);
    expect(checkDrafts(root).errors).toEqual([]);

    const yaml = readFileSync(join(dir, `2026-10-14-${RELEASE.id}-1.yaml`), "utf8");
    const back = DraftFile.parse(parse(yaml));
    expect(back.also).toHaveLength(6);
    expect(yaml).toMatch(/^ {4}source_span: \[\d+, \d+\]$/m);
    expect(yaml).toContain("# The same speaker's other commitments in this source");
    expect(new Set(knownQuotes(root))).toEqual(new Set(OCT14.drafts.map((d) => d.quote)));

    const md = prBody(full, { now: new Date("2026-10-15T06:20:00Z") });
    expect(md).toContain("**7 candidate promises** in 1 draft (one per source and speaker) from 1 of 1 source;");
    expect(md).toContain("and 6 more quotes in the draft |");
  });

  it("a second run of the day skips every quote already in the draft", async () => {
    const known = OCT14.drafts.map((d) => d.quote);
    const report = await extractFromSources([RELEASE], { client: fakeClient([{ candidates: OCT14_PROPOSALS }]), actors, known });
    expect(report.candidates).toEqual([]);
    expect(report.dropped.map((d) => d.reason)).toEqual(Array(7).fill("already on a card or in a draft"));
  });
});

describe("foldCandidates", () => {
  const TEXT2 = "Alpha one two three four five. Beta one two three four five. Gamma one two three four five.";
  const at = (s: string) => [TEXT2.indexOf(s), TEXT2.indexOf(s) + s.length] as [number, number];
  const cand = (sourceId: string, quote: string, who: Partial<Candidate["speaker"]>, over: Partial<Candidate> = {}): Candidate => ({
    sourceId,
    quote,
    span: at(quote),
    speaker: { name: "A Minister", role: null, party: null, memberId: null, actorId: null, check: "segment", ...who },
    suggested: { policy_area: null, who: null, how_much: null, when: null, funded_by: null, deadline: null },
    why: "Why.",
    confidence: 0.7,
    model: "m",
    ...over,
  });

  it("keeps different speakers, and different sources, apart", () => {
    const a = cand("s1", "Alpha one two three four five.", { memberId: 1, name: "One" });
    const b = cand("s1", "Beta one two three four five.", { memberId: 2, name: "Two" });
    const c = cand("s2", "Gamma one two three four five.", { memberId: 1, name: "One" });
    expect(foldCandidates([a, b, c])).toEqual([a, b, c]);
  });

  it("folds overlapping quotes even when the names differ", () => {
    const a = cand("s1", "Alpha one two three four five. Beta", { name: "HM Government", actorId: "hm-government" });
    const b = cand("s1", "Beta one two three four five.", { name: "Department for Things" });
    const [only, ...rest] = foldCandidates([a, b]);
    expect(rest).toEqual([]);
    expect(quoteCount([only!])).toBe(2);
  });

  it("leads with a deadline, then a figure, then confidence, then the earliest; the rest in source order", () => {
    const first = cand("s1", "Alpha one two three four five.", {}, { confidence: 0.9 });
    const money = cand("s1", "Beta one two three four five.", {}, { suggested: { ...first.suggested, how_much: "£1m" }, confidence: 0.5 });
    const dated = cand("s1", "Gamma one two three four five.", {}, { suggested: { ...first.suggested, deadline: "2027-03-31" }, confidence: 0.5 });
    const [one] = foldCandidates([first, money, dated]);
    expect(one!.quote).toBe(dated.quote);
    expect(one!.also!.map((a) => a.quote)).toEqual([first.quote, money.quote]);
    const [two] = foldCandidates([first, money]);
    expect(two!.quote).toBe(money.quote);
  });

  it("leaves a lone candidate as it is, with no also", () => {
    const a = cand("s1", "Alpha one two three four five.", {});
    expect(foldCandidates([a])).toEqual([a]);
    expect("also" in foldCandidates([a])[0]!).toBe(false);
  });
});
