import { describe, expect, it } from "vitest";
import borrowingRaw from "../../../data/build/borrowing.json";
import { loadBorrowing } from "../src/borrowing-data";

const clone = () => structuredClone(borrowingRaw) as any;

describe("borrowing.json", () => {
  it("parses, one release and one OBR edition", () => {
    const b = loadBorrowing();
    expect(b.months).toHaveLength(12);
    expect(b.outturn.values).toHaveLength(b.months.indexOf(b.through) + 1);
    expect(b.so_far.outturn.vintage).toBe(b.outturn.provenance.vintage);
    if (b.profile) expect(b.so_far.profile!.vintage).toBe(b.profile.provenance.vintage);
  });

  it("says the OBR's path is a single line, not a range", () => {
    const b = loadBorrowing();
    if (b.profile) {
      expect(b.profile.range).toBe("point");
      expect(b.profile.provenance.method_note).toMatch(/no range/);
    }
  });

  it("checks running totals", () => {
    const raw = clone();
    raw.outturn.cumulative[1] += 1;
    expect(() => loadBorrowing(raw)).toThrow(/running total does not add up/);
  });

  it("needs one value per month so far", () => {
    const raw = clone();
    raw.outturn.values.pop();
    raw.outturn.cumulative.pop();
    expect(() => loadBorrowing(raw)).toThrow(/one value per month so far/);
  });

  it("cites only sources it lists", () => {
    const raw = clone();
    raw.sources = raw.sources.filter((s: { id: string }) => s.id !== "ons_psf");
    expect(() => loadBorrowing(raw)).toThrow(/cites ons_psf/);
  });

  it("never compares without the OBR's path", () => {
    const raw = clone();
    raw.profile = null;
    expect(() => loadBorrowing(raw)).toThrow(/a comparison needs the OBR's path/);
  });
});
