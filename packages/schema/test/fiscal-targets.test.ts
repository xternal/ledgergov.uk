import { describe, expect, it } from "vitest";
import raw from "../../../data/build/fiscal_targets.json";
import { loadFiscalTargets } from "../src/fiscal-targets-data";
import { FiscalTargetsBundle, assessed } from "../src/fiscal-targets";

const clone = () => structuredClone(raw) as any;

describe("fiscal_targets.json (/budget/how-it-works)", () => {
  it("parses, oldest assessment first", () => {
    const b = loadFiscalTargets();
    const order = b.assessments.map((a) => a.vintage);
    expect(order).toEqual([...order].sort());
    expect(order).toContain("EFO-2025-11");
  });

  it("gives the OBR's own headroom figures with their table and vintage", () => {
    const nov = loadFiscalTargets().assessments.find((a) => a.vintage === "EFO-2025-11")!;
    expect(nov.table).toBe("Table 7.1");
    const s = assessed(nov, "current_budget", "margin")!;
    expect(s.value).toBeCloseTo(21.7, 1);
    expect(s).toMatchObject({ unit: "gbp_bn", period: "2029-30", kind: "forecast", quality: "sourced", source_id: "obr_fiscal_targets", vintage: "EFO-2025-11" });
    expect(s.method_note).toContain("row 'November 2025 forecast'");
    expect(assessed(nov, "psnfl", "margin")!.value).toBeCloseTo(24.4, 1);
    expect(assessed(nov, "current_budget", "probability")!.value).toBe(59);
  });

  it("cites only sources it lists", () => {
    const b = loadFiscalTargets();
    const ids = new Set(b.sources.map((s) => s.id));
    for (const o of [...b.assessments.flatMap((a) => a.observations), ...(b.latest_forecast?.observations ?? [])]) expect(ids.has(o.source_id!)).toBe(true);
  });

  it("rejects an observation from another edition, a missing rule and an unlisted source", () => {
    const wrongVintage = clone();
    wrongVintage.assessments[0].observations[0].vintage = "EFO-1999-01";
    expect(FiscalTargetsBundle.safeParse(wrongVintage).success).toBe(false);

    const noRule = clone();
    noRule.assessments[0].observations = noRule.assessments[0].observations.filter((o: any) => o.series_id !== "fiscal_targets.psnfl.margin");
    expect(FiscalTargetsBundle.safeParse(noRule).success).toBe(false);

    const unlisted = clone();
    unlisted.sources = unlisted.sources.filter((s: any) => s.id !== "obr_fiscal_targets");
    expect(() => loadFiscalTargets(unlisted)).toThrow(/not listed/);
  });

  it("only lists a newer forecast as the latest", () => {
    const stale = clone();
    stale.latest_forecast = { ...(stale.latest_forecast ?? { url: "https://obr.uk/", edition: "x", status: "not_assessed", observations: [] }), vintage: "EFO-2025-11" };
    expect(FiscalTargetsBundle.safeParse(stale).success).toBe(false);
  });
});
