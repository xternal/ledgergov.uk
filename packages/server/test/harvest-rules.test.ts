import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ActorFile } from "@ledger/schema";
import { DEFAULT_INTAKE_MODEL, extractFromSources, type ExtractClient } from "../src/harvest/extract";
import { hasDate, ruledOut } from "../src/harvest/rules";
import type { SourceDoc } from "../src/harvest/types";

/**
 * Process steps and grants are dropped at extraction (19 October 2026): the
 * model labels them, and fixed rules catch the ones it calls commitments.
 * Tested on the desk's own dropped drafts and on every card published by then.
 */

const fixture = <T>(name: string): T => JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "harvest", name), "utf8")) as T;
const DROPPED = fixture<{ dropped: { draft: string; code: "process" | "grant"; note: string; quote: string }[] }>("desk-dropped-process-grant.json").dropped;
const CARDS = fixture<{ quotes: { card: string; version: number; text: string }[] }>("card-quotes-2026-10-19.json").quotes;

/** Dropped by the desk, but too close to real commitments for a fixed rule: left to the model's label. */
const LEFT_TO_THE_MODEL = [
  "2026-10-12-govuk-troubles-bill-reinforced-with-permanent-legal-protections-an-3", // a veteran on an advisory group
  "2026-10-14-govuk-mhra-2030-strategy-to-modernise-patient-centred-regulation-f-4", // "Establish an MHRA Centre…": a card says "establish a new centre" too
  "2026-10-14-wms-hcws375-1", // a consultation, in words that do not say so
  "2026-10-16-govuk-ofsted-to-pilot-new-independent-complaint-review-service-1", // a pilot: a card is a pilot too
];

describe("the desk's dropped drafts, 12 to 16 October 2026", () => {
  it("are the 23 process steps and 5 grants of the run files", () => {
    expect(DROPPED.filter((d) => d.code === "process")).toHaveLength(23);
    expect(DROPPED.filter((d) => d.code === "grant")).toHaveLength(5);
  });

  it.each(DROPPED.filter((d) => !LEFT_TO_THE_MODEL.includes(d.draft)).map((d) => [d.draft, d.code, d.quote] as const))("drops %s as %s", (_draft, code, quote) => {
    expect(ruledOut(quote)?.code).toBe(code);
  });

  it("catches 24 of the 28, every grant among them, and leaves four to the model", () => {
    const caught = DROPPED.filter((d) => ruledOut(d.quote)?.code === d.code);
    expect(caught).toHaveLength(24);
    expect(caught.filter((d) => d.code === "grant")).toHaveLength(5);
    expect(DROPPED.filter((d) => !ruledOut(d.quote)).map((d) => d.draft)).toEqual(LEFT_TO_THE_MODEL);
  });
});

describe("every published card", () => {
  it("keeps every version of every card on main on 19 October 2026", () => {
    expect(CARDS.length).toBeGreaterThan(100);
    const hit = CARDS.flatMap((c) => {
      const r = ruledOut(c.text);
      return r ? [`${c.card} v${c.version}: ${r.label}`] : [];
    });
    expect(hit).toEqual([]);
  });
});

describe("rules", () => {
  it("know a date when they see one", () => {
    expect(hasDate("by March 2029")).toBe(true);
    expect(hasDate("from April")).toBe(true);
    expect(hasDate("before Parliament later this year")).toBe(true);
    expect(hasDate("by the end of this Parliament")).toBe(true);
    expect(hasDate("within 4 weeks")).toBe(true);
    expect(hasDate("by summer")).toBe(true);
    expect(hasDate("in 2026/27")).toBe(true);
    expect(hasDate("over the next three years")).toBe(false);
    expect(hasDate("The Bill may change")).toBe(false);
  });

  it("drop a strategy or guidance with no date, and keep it with one", () => {
    expect(ruledOut("Departments will publish a new strategy for apprenticeships.")?.code).toBe("process");
    expect(ruledOut("We will publish a new strategy for apprenticeships by March 2027.")).toBeNull();
  });

  it("keep money with an outcome, and drop money shared out among counted recipients", () => {
    expect(ruledOut("We will invest £400 million a year in new bus routes from April 2027.")).toBeNull();
    expect(ruledOut("A further £12 million will go to the 30 councils with the most empty homes.")?.code).toBe("grant");
    expect(ruledOut("The government is investing £4.2 billion between last April and March 2029 to repair defences.")).toBeNull();
    expect(ruledOut("The UK is providing £5m to the agency this year.")?.code).toBe("grant");
  });

  it("read the quote only, the same for every speaker", () => {
    const q = "At the earliest possible opportunity, I will lay an Order which specifies this new public interest consideration.";
    expect(ruledOut(q)).toEqual(ruledOut(q.replace("I will", "the Leader of the Opposition will")));
  });
});

describe("at extraction", () => {
  const actors: ActorFile[] = [{ id: "hm-government", name: "HM Government", kind: "government", roles: [] }];
  const order = DROPPED.find((d) => d.draft === "2026-10-12-wms-hcws358-1")!.quote;
  const grant = DROPPED.find((d) => d.draft === "2026-10-12-wms-hcws354-3")!.quote;
  const kept = "We will cap bus fares at £2 across England from 1 January 2027 for every passenger.";
  const text = ["Written statement", order, grant, kept].join("\n");
  const doc: SourceDoc = { id: "wms-test", kind: "hansard_wms", url: "https://questions-statements.parliament.uk/written-statements/detail/2026-10-12/HCWS999", title: "Test", date: "2026-10-12", venue: "parliament", venueLabel: "Written ministerial statement", text, segments: [{ start: 0, end: text.length, name: "A Minister", role: "Minister", party: "Labour", memberId: 7 }], people: [] };
  const proposal = (quote: string, kind: string) => ({ quote, speaker_name: "A Minister", why: "Why.", policy_area: null, who: null, how_much: null, when: null, funded_by: null, deadline: null, kind, check: "Something to check.", confidence: 0.8 });
  const client = (candidates: object[]): { client: ExtractClient; requests: { system: { text: string }[]; output_config: { format: { schema: { properties: { candidates: { items: { properties: { kind: { enum: string[] } } } } } } } } }[] } => {
    const requests: never[] = [];
    return {
      requests,
      client: {
        beta: {
          messages: {
            async create(body) {
              requests.push(body as never);
              return { content: [{ type: "text", text: JSON.stringify({ candidates }) }], stop_reason: "end_turn", stop_details: null, model: DEFAULT_INTAKE_MODEL } as never;
            },
          },
        },
      },
    };
  };

  it("drops what the model labels a process step or a grant", async () => {
    const report = await extractFromSources([doc], { client: client([proposal(order, "process"), proposal(grant, "grant"), proposal(kept, "commitment")]).client, actors, known: [] });
    expect(report.candidates.map((c) => c.quote)).toEqual([kept]);
    expect(report.dropped.map((d) => d.reason)).toEqual(["not a future commitment (process)", "not a future commitment (grant)"]);
  });

  it("drops them by rule when the model calls them commitments", async () => {
    const report = await extractFromSources([doc], { client: client([proposal(order, "commitment"), proposal(grant, "commitment"), proposal(kept, "commitment")]).client, actors, known: [] });
    expect(report.candidates.map((c) => c.quote)).toEqual([kept]);
    expect(report.dropped.map((d) => d.reason)).toEqual(["process: lays an order, regulations or a code before Parliament", "grant: money shared out among a counted set of recipients"]);
  });

  it("writes the desk's definitions into the prompt and the output schema", async () => {
    const c = client([]);
    await extractFromSources([doc], { client: c.client, actors, known: [] });
    const body = c.requests[0]!;
    expect(body.output_config.format.schema.properties.candidates.items.properties.kind.enum).toEqual(["commitment", "event", "ongoing", "aspiration", "process", "grant"]);
    const prompt = body.system[0]!.text;
    expect(prompt).toContain('"process" for a step inside government: laying an order or regulations before Parliament, publishing a strategy, plan or guidance with no date, an internal reorganisation');
    expect(prompt).toContain("or a minor amendment to a Bill");
    expect(prompt).toContain('"grant" for money already handed, or being handed, to named recipients');
    expect(prompt).toContain("with nothing left to check");
    expect(prompt).toContain("The measures of one Bill, scheme, plan or strategy are one commitment");
  });
});
