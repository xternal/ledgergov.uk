import { describe, expect, it } from "vitest";
import { intakeDate, staleIntakeBranches, staleLine, STALE_INTAKE_DAYS } from "../src/harvest/stale";

/**
 * Intake branches nobody finished (19 October 2026). The branches as they
 * stood that day: the drafts left in each branch's tree, and whether main
 * had the desk's run file for the day.
 */
const ON_19_OCTOBER = [
  // Pull requests #75 and #86 closed by hand on 12 October; no run file; drafts still on the branch.
  { name: "origin/intake/2026-10-10", drafts: 1, logged: false },
  { name: "origin/intake/2026-10-11", drafts: 1, logged: false },
  // Triaged on the branch: drafts deleted.
  { name: "origin/intake/2026-10-13", drafts: 0, logged: true },
  // Triaged on another branch (#119): drafts left here, run files on main.
  { name: "origin/intake/2026-10-15", drafts: 25, logged: true },
  { name: "origin/intake/2026-10-16", drafts: 4, logged: true },
  // Landed four hours after Monday's desk run, before its triage (#125).
  { name: "origin/intake/2026-10-18", drafts: 2, logged: false },
];

describe("stale intake branches", () => {
  it("names the two orphans of 10 and 11 October on 19 October, oldest first", () => {
    const old = staleIntakeBranches(ON_19_OCTOBER, "2026-10-19");
    expect(old).toEqual([
      { name: "intake/2026-10-10", date: "2026-10-10", ageDays: 9, drafts: 1 },
      { name: "intake/2026-10-11", date: "2026-10-11", ageDays: 8, drafts: 1 },
    ]);
    expect(staleLine(old[0]!)).toBe("intake/2026-10-10 is 9 days old and still holds 1 draft: the weekly desk must decide each one (docs/desk/ROUTINE.md, step 1).");
  });

  it("waits more than seven days, and names a day left open after that", () => {
    expect(STALE_INTAKE_DAYS).toBe(7);
    expect(staleIntakeBranches(ON_19_OCTOBER, "2026-10-17")).toEqual([]); // seven days: not yet
    expect(staleIntakeBranches(ON_19_OCTOBER, "2026-10-18").map((s) => s.name)).toEqual(["intake/2026-10-10"]);
    expect(staleIntakeBranches(ON_19_OCTOBER, "2026-10-26").map((s) => s.name)).toEqual(["intake/2026-10-10", "intake/2026-10-11", "intake/2026-10-18"]);
    expect(staleIntakeBranches(ON_19_OCTOBER, "2026-10-19", 30)).toEqual([]);
  });

  it("never names a day with no drafts left, or with its run file on main", () => {
    const names = staleIntakeBranches(ON_19_OCTOBER, "2027-01-01").map((s) => s.name);
    expect(names).not.toContain("intake/2026-10-13");
    expect(names).not.toContain("intake/2026-10-15");
    expect(names).not.toContain("intake/2026-10-16");
  });

  it("reads only intake/<date> branch names", () => {
    expect(intakeDate("origin/intake/2026-10-10")).toBe("2026-10-10");
    expect(intakeDate("intake/2026-10-10")).toBe("2026-10-10");
    expect(intakeDate("desk/2026-10-19")).toBeNull();
    expect(intakeDate("intake/2026-02-30")).toBeNull();
    expect(intakeDate("intake/2026-10-10-redo")).toBeNull();
    expect(() => staleIntakeBranches([], "19/10/2026")).toThrow(/YYYY-MM-DD/);
  });
});
