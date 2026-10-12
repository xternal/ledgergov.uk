import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSeed } from "@ledger/schema/seed";
import type { Quality } from "@ledger/schema";
import {
  ONE_UNIT,
  baseSettings,
  compute,
  createModel,
  decodeScenario,
  largestPerUnit,
  reckonerChanges,
  relativeBand,
  seriesFor,
  type ReckonerObservation,
} from "../src";

const seed = loadSeed();
const model = createModel(seed.statement, seed.levers);
const root = join(import.meta.dirname, "../../..");

/** The HMRC edition the build holds: data/build/manifest.json names it, data/build/observations holds its rows. */
const manifest = JSON.parse(readFileSync(join(root, "data/build/manifest.json"), "utf8")) as {
  sources: { id: string; freshness?: { vintage?: string } }[];
};
const vintage = manifest.sources.find((s) => s.id === "hmrc_reckoner")!.freshness!.vintage!;

/** The observation file's first nine columns hold no commas; method_note, the last, is not needed here. */
const observations: ReckonerObservation[] = readFileSync(join(root, `data/build/observations/hmrc_reckoner/${vintage}.csv`), "utf8")
  .split("\n")
  .slice(1)
  .filter(Boolean)
  .map((line) => {
    const [series_id, period, , value, , , source_id, v, quality] = line.split(",");
    return { series_id: series_id!, period: period!, value: Number(value), source_id: source_id!, vintage: v!, quality: quality as Quality };
  });

// HMRC, Direct effects of illustrative tax changes (June 2025), £ million, for a change made in April 2026:
// [2026-27, 2028-29], the first and last years of HMRC's table. A golden copy, typed from the bulletin.
const HMRC_1P: Record<string, { series: string; figures: [number, number] }> = {
  income_tax_basic: { series: "reckoner.income_tax_basic_rate_1p", figures: [6900, 8200] },
  income_tax_higher: { series: "reckoner.income_tax_higher_rate_1p", figures: [1600, 2100] },
  nics_main: { series: "reckoner.nics_employee_main_rate_1pp", figures: [5350, 5400] },
  vat_standard: { series: "reckoner.vat_standard_rate_1pp", figures: [8800, 9550] },
  corp_tax: { series: "reckoner.corp_tax_main_rate_1pp", figures: [3600, 4000] },
};
const HMRC_CGT: Record<string, { series: string; figures: Record<number, [number, number]> }> = {
  cgt_lower: { series: "reckoner.cgt_lower_rate_{at}pp", figures: { 1: [-5, 5], 5: [-40, -10], 10: [-130, -135] } },
  cgt_higher: { series: "reckoner.cgt_higher_rate_{at}pp", figures: { 1: [-15, -30], 5: [-170, -870], 10: [-540, -3565] } },
};

describe("ready-reckoner cards: HMRC's figures, the sandbox's levers", () => {
  it("reads the June 2025 edition, for a change made at the start of 2026-27", () => {
    expect(vintage).toBe("HMRC-DE-2025-06");
    expect(seed.sources.find((s) => s.id === "hmrc_reckoner")?.published_on).toBe("2025-06-24");
  });

  for (const [id, { series, figures }] of Object.entries(HMRC_1P)) {
    it(`${id}: one unit, HMRC's figure in its first and last year, with the editorial band`, () => {
      const [c] = reckonerChanges(model, { lever_id: id, series }, observations, seed.baseYear);
      const lever = model.leverById.get(id)!;
      expect(c).toMatchObject({ lever_id: id, by: ONE_UNIT, from: lever.base, to: lever.base + 1, series_id: series, source_id: "hmrc_reckoner", vintage, quality: "sourced" });
      expect(c!.first.period).toBe("2026-27");
      expect(c!.last.period).toBe("2028-29");
      expect(c!.first.range[1]).toBeCloseTo(figures[0] / 1000, 9);
      expect(c!.last.range[1]).toBeCloseTo(figures[1] / 1000, 9);
      expect(relativeBand(c!.first.range)).toBeCloseTo(0.1, 9);
      expect(relativeBand(c!.last.range)).toBeCloseTo(0.1, 9);
    });

    it(`${id}: the card's sandbox link makes exactly that change, and the sandbox gives the card's figure`, () => {
      const [c] = reckonerChanges(model, { lever_id: id, series }, observations, seed.baseYear);
      const decoded = decodeScenario(model, c!.scenario)!;
      expect(decoded.dropped).toEqual([]);
      expect(decoded.adjusted).toEqual([]);
      expect(decoded.settings).toEqual({ ...baseSettings(model), [id]: c!.to });
      // A rise that raises money cuts borrowing by the same amount, in year one.
      expect(compute(model, decoded.settings).y1.d_borrowing_bn[1]).toBeCloseTo(-c!.first.range[1], 9);
    });
  }

  for (const [id, { series, figures }] of Object.entries(HMRC_CGT)) {
    it(`${id}: each of HMRC's steps, never scaled`, () => {
      const changes = reckonerChanges(model, { lever_id: id, series }, observations, seed.baseYear);
      expect(changes.map((c) => c.by)).toEqual([1, 5, 10]);
      for (const c of changes) {
        expect(c.series_id).toBe(seriesFor(series, c.by));
        expect(c.first.range[1]).toBeCloseTo(figures[c.by]![0] / 1000, 9);
        expect(c.last.range[1]).toBeCloseTo(figures[c.by]![1] / 1000, 9);
        expect(decodeScenario(model, c.scenario)!.settings[id]).toBe(c.to);
      }
    });
  }

  it("a point on VAT raises the most of the one-point changes, in the first year and the last", () => {
    const all = [...Object.entries(HMRC_1P), ...Object.entries(HMRC_CGT)].flatMap(([lever_id, { series }]) =>
      reckonerChanges(model, { lever_id, series }, observations, seed.baseYear),
    );
    expect(largestPerUnit(all, "first")?.lever_id).toBe("vat_standard");
    expect(largestPerUnit(all, "last")?.lever_id).toBe("vat_standard");
  });

  it("stops the build when a lever and its observation disagree, or a series is missing", () => {
    const off = observations.map((o) => (o.series_id === "reckoner.vat_standard_rate_1pp" && o.period === "2026-27" ? { ...o, value: o.value + 0.05 } : o));
    expect(() => reckonerChanges(model, { lever_id: "vat_standard", series: "reckoner.vat_standard_rate_1pp" }, off, seed.baseYear)).toThrow(/first year/);
    expect(() => reckonerChanges(model, { lever_id: "vat_standard", series: "reckoner.no_such_row" }, observations, seed.baseYear)).toThrow(/two years/);
    expect(() => reckonerChanges(model, { lever_id: "no_such_lever", series: "reckoner.vat_standard_rate_1pp" }, observations, seed.baseYear)).toThrow(/no lever/);
    const mixed = observations.map((o) => (o.series_id === "reckoner.vat_standard_rate_1pp" && o.period === "2027-28" ? { ...o, vintage: "HMRC-DE-2099-01" } : o));
    expect(() => reckonerChanges(model, { lever_id: "vat_standard", series: "reckoner.vat_standard_rate_1pp" }, mixed, seed.baseYear)).toThrow(/two editions/);
  });

  it("relativeBand: the share either side of the centre, or null when lopsided or centred on zero", () => {
    expect(relativeBand([0.9, 1, 1.1])).toBeCloseTo(0.1, 9);
    expect(relativeBand([-1.1, -1, -0.9])).toBeCloseTo(0.1, 9);
    expect(relativeBand([0.8, 1, 1.1])).toBeNull();
    expect(relativeBand([0, 0, 0])).toBeNull();
  });
});
