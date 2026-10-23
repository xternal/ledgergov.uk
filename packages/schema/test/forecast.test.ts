import { describe, expect, it } from "vitest";
import { appendOnlyIssues, forecastGap, PromiseFile, type VersionParameters } from "../src/index";
import { loadSeed } from "../src/seed";

const metric = { series_id: "ons-cpi-12-month-rate", target: 5.25, direction: "at_most" as const, unit: "%", by: "2023-12-31" };
const baseline = {
  value: 3.75,
  unit: "%",
  for: "2023-12-31",
  by: { kind: "official" as const, name: "OBR" },
  published_on: "2022-11-17",
  source: { title: "OBR: Economic and fiscal outlook, November 2022", url: "https://obr.uk/efo/economic-and-fiscal-outlook-november-2022/" },
};
const params = (over: Partial<NonNullable<VersionParameters>> = {}) => ({ who: "Households", funded_by: null, metric, baseline, ...over }) as VersionParameters;

describe("the target and the forecast at the time (OpenPromises decision 36)", () => {
  it("says when the forecast already met the target, in the site's words", () => {
    const g = forecastGap(params())!;
    expect(g.targetText).toBe("At most 5.25% by 31 December 2023");
    expect(g.forecastText).toBe("3.75% by 31 December 2023, the OBR's forecast of 17 November 2022, before the promise");
    expect(g.words).toBe("The forecast at the time already met the target.");
    expect([g.targetLabel, g.forecastLabel, g.max]).toEqual(["Target: at most 5.25%", "Forecast: 3.75%", 7]);
  });

  it("says how far a target is from a forecast that did not meet it, and nothing without both in one unit", () => {
    expect(forecastGap(params({ baseline: { ...baseline, value: 6.5 } }))!.words).toBe("The target is 1.25 percentage points below the forecast at the time.");
    expect(forecastGap(params({ metric: { ...metric, direction: "at_least", target: 18, unit: "weeks" }, baseline: { ...baseline, value: 12, unit: "weeks" } }))!.words).toBe(
      "The target is 6 weeks above the forecast at the time.",
    );
    expect(forecastGap(params({ baseline: undefined }))).toBeNull();
    expect(forecastGap(params({ baseline: { ...baseline, unit: "weeks" } }))).toBeNull();
  });

  it("refuses a forecast published after the version, and one in another unit than the target", () => {
    const card = loadSeed().cards.find((c) => c.id === "uk-halve-inflation-2023")!.file;
    const late = { ...card, versions: [{ ...card.versions[0]!, parameters: params({ baseline: { ...baseline, published_on: "2023-02-01" } }) }] };
    const other = { ...card, versions: [{ ...card.versions[0]!, parameters: params({ baseline: { ...baseline, unit: "weeks" } }) }] };
    const issues = (f: unknown) => (PromiseFile.safeParse(f).error?.issues ?? []).map((i) => i.path.join("."));
    expect(issues(late)).toEqual(["versions.0.parameters.baseline.published_on"]);
    expect(issues(other)).toEqual(["versions.0.parameters.baseline.unit"]);
  });

  it("lets a forecast be added to a published card, while a target needs a correction", () => {
    const before = { versions: [{ version: 1, text: "We will halve inflation.", parameters: { who: "Households" } }], events: [], replies: [] };
    const withForecast = structuredClone(before) as Record<string, any>;
    withForecast.versions[0].parameters.baseline = baseline;
    expect(appendOnlyIssues(before, withForecast)).toEqual([]);
    const withTarget = structuredClone(withForecast);
    withTarget.versions[0].parameters.metric = metric;
    expect(appendOnlyIssues(before, withTarget)).toEqual(["versions[0] was changed or removed; history is append-only (add a new entry, or record a correction)"]);
    withTarget.corrections = [{ date: "2026-10-23", path: "versions[0].parameters.metric", was: null, now: metric, reason: "The target as a number." }];
    expect(appendOnlyIssues(before, withTarget)).toEqual([]);
  });

  it("reads the halve-inflation card's target and forecast from its file", () => {
    const g = forecastGap(loadSeed().cards.find((c) => c.id === "uk-halve-inflation-2023")!.current.parameters ?? undefined)!;
    expect([g.metric.target, g.baseline.value, g.baseline.by.name, g.met]).toEqual([5.25, 3.75, "OBR", true]);
  });
});
