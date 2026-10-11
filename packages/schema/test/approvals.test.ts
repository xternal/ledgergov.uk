import { describe, expect, it } from "vitest";
import { APPROVALS_NEEDED, Review, appendReviewText, approvalRefusal, approvers, parseEditors } from "../src";

const editors = parseEditors(`editors:
  - handle: Sam
    since: "2026-10-10"
    party: null
  - handle: Alex
    since: "2026-10-11"
    until: "2026-12-31"
    party: labour
`);
const actors = new Map([
  ["labour", { kind: "party" as const }],
  ["keir-starmer", { kind: "person" as const, party_id: "labour" }],
  ["reform-uk", { kind: "party" as const }],
]);
const card = (actor_id: string, reviews: Review[] = []) => ({ id: "uk-test-2024", actor_id, reviews });
const approval = (by: string, on: string): Review => ({ by, kind: "editor", on, approves: true });

describe("editors list", () => {
  it("reads the engine's format", () => {
    expect(editors.map((e) => e.handle)).toEqual(["Sam", "Alex"]);
  });
  it("refuses anything else without echoing the file", () => {
    expect(() => parseEditors("- handle: Sam\n  party: secret-party\n")).toThrow(/expected shape/);
    expect(() => parseEditors("- handle: Sam\n  party: secret-party\n")).not.toThrow(/secret-party/);
    expect(() => parseEditors("editors:\n")).toThrow(/expected shape/);
  });
});

describe("review schema", () => {
  it("lets only an editor's review approve", () => {
    expect(Review.safeParse(approval("Sam", "2026-10-12")).success).toBe(true);
    expect(Review.safeParse({ by: "AI Journalist", kind: "automated", on: "2026-10-12", approves: true }).success).toBe(false);
    expect(Review.safeParse({ by: "AI Journalist", kind: "automated", on: "2026-10-12" }).success).toBe(true);
  });
});

describe("approvals", () => {
  const today = "2026-10-12";
  it("counts editors' approvals only", () => {
    const c = card("reform-uk", [
      { by: "AI Journalist", kind: "automated", on: "2026-10-09" },
      { by: "Sam", kind: "editor", on: "2026-10-12" },
      approval("Alex", "2026-10-12"),
    ]);
    expect([...approvers(c, editors, actors)]).toEqual(["Alex"]);
  });
  it("ignores approvals from outside the list or outside an editor's dates", () => {
    const c = card("reform-uk", [approval("Someone", "2026-10-12"), approval("Alex", "2026-10-10"), approval("Alex", "2027-01-05")]);
    expect(approvers(c, editors, actors).size).toBe(0);
  });
  it("needs two different editors", () => {
    expect(APPROVALS_NEEDED).toBe(2);
    const c = card("reform-uk", [approval("Sam", "2026-10-12")]);
    expect(approvalRefusal(c, "Sam", today, today, editors, actors)).toMatch(/already approved/);
    expect(approvalRefusal(c, "Alex", today, today, editors, actors)).toBeNull();
  });
  it("never lets an editor approve a card about their own party, directly or through a person", () => {
    expect(approvalRefusal(card("labour"), "Alex", today, today, editors, actors)).toMatch(/own party/);
    expect(approvalRefusal(card("keir-starmer"), "Alex", today, today, editors, actors)).toMatch(/own party/);
    expect(approvers(card("keir-starmer", [approval("Alex", today)]), editors, actors).size).toBe(0);
    expect(approvalRefusal(card("keir-starmer"), "Sam", today, today, editors, actors)).toBeNull();
  });
  it("refuses unknown editors, dates before an editor joined, future dates and bad dates", () => {
    expect(approvalRefusal(card("reform-uk"), "Someone", today, today, editors, actors)).toMatch(/not on the editors list/);
    expect(approvalRefusal(card("reform-uk"), "Alex", "2026-10-10", today, editors, actors)).toMatch(/not an editor on/);
    expect(approvalRefusal(card("reform-uk"), "Sam", "2026-10-13", today, editors, actors)).toMatch(/future/);
    expect(approvalRefusal(card("reform-uk"), "Sam", "12/10/2026", today, editors, actors)).toMatch(/YYYY-MM-DD/);
  });
  it("never names an editor's party in a refusal", () => {
    expect(approvalRefusal(card("labour"), "Alex", today, today, editors, actors)).not.toMatch(/labour/i);
  });
});

describe("appending a review to the card's text", () => {
  const review = approval("Sam", "2026-10-12");
  const card = [
    "id: uk-test-2024",
    "editor_check_required: true",
    "status_note: >-",
    "  A long note folded",
    "  over two lines.",
    "reviews:",
    "  - by: AI Journalist",
    "    kind: automated",
    '    on: "2026-10-09"',
    "",
    "# Why the contract is linked.",
    "contracts:",
    "  - ocds-h6vhtk-000001",
    "",
  ].join("\n");

  it("adds the review at the end of the list and leaves every other line alone", () => {
    const out = appendReviewText(card, { ...review, note: "Checked: quote, sources" });
    expect(out).toBe(
      card.replace(
        '    on: "2026-10-09"\n',
        '    on: "2026-10-09"\n  - by: Sam\n    kind: editor\n    on: "2026-10-12"\n    note: "Checked: quote, sources"\n    approves: true\n',
      ),
    );
  });
  it("drops the editor-check flag only when asked", () => {
    expect(appendReviewText(card, review)).toContain("editor_check_required: true");
    expect(appendReviewText(card, review, true)).not.toContain("editor_check_required");
  });
  it("starts the list when it is empty or missing", () => {
    expect(appendReviewText("id: a\nreviews: []\n", review)).toBe('id: a\nreviews:\n  - by: Sam\n    kind: editor\n    on: "2026-10-12"\n    approves: true\n');
    expect(appendReviewText("id: a\n", review)).toBe('id: a\nreviews:\n  - by: Sam\n    kind: editor\n    on: "2026-10-12"\n    approves: true\n');
  });
});
