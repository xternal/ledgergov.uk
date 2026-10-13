import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConfig } from "@openpromises/core";
import { describe, expect, it } from "vitest";
import siteConfig from "../../../openpromises.config";
import { loadSeed } from "../src/seed";
import { SITE_EDITORIAL, cardVerification, readEditors, withVerification } from "../src/verification";
import type { ActorFile, PromiseFile, Review } from "../src";

const LIST = `editors:
  - handle: Pavel Guzhikov
    since: "2026-10-01"
    party: null
    named: true
  - handle: Sam
    since: "2026-10-01"
    party: secret-party
  - handle: Alex
    since: "2026-10-01"
    party: null
`;
const editors = readEditors({ OPENPROMISES_EDITORS_YAML: LIST })!;
const actors = new Map([
  ["secret-party", { id: "secret-party", kind: "party" }],
  ["keir-starmer", { id: "keir-starmer", kind: "person", party_id: "labour" }],
  ["labour", { id: "labour", kind: "party" }],
]) as unknown as ReadonlyMap<string, ActorFile>;
const card = (reviews: Review[], extra: Partial<PromiseFile> = {}) => ({ id: "uk-test-2024", actor_id: "keir-starmer", origin: "manual", reviews, ...extra }) as PromiseFile;
const approval = (by: string, on: string): Review => ({ by, kind: "editor", on, approves: true });
const auto: Review = { by: "Junior Editor", kind: "automated", on: "2026-10-06" };

describe("the editors list at build time", () => {
  it("is absent without either variable, or with an empty one (a fork's empty secret)", () => {
    expect(readEditors({})).toBeNull();
    expect(readEditors({ OPENPROMISES_EDITORS_YAML: "  \n" })).toBeNull();
  });

  it("reads the file's text from OPENPROMISES_EDITORS_YAML, or the file at OPENPROMISES_EDITORS", () => {
    expect(editors.map((e) => [e.handle, !!e.named])).toEqual([
      ["Pavel Guzhikov", true],
      ["Sam", false],
      ["Alex", false],
    ]);
    const file = join(mkdtempSync(join(tmpdir(), "editors-")), "editors.yaml");
    writeFileSync(file, LIST);
    expect(readEditors({ OPENPROMISES_EDITORS: file })).toEqual(editors);
    // The text wins over the path, as on Vercel.
    expect(readEditors({ OPENPROMISES_EDITORS_YAML: LIST, OPENPROMISES_EDITORS: "/nowhere.yaml" })).toEqual(editors);
  });

  it("stops the build on a list in the wrong shape, without echoing a party", () => {
    const bad = "editors:\n  - handle: Sam\n    party: secret-party\n";
    expect(() => readEditors({ OPENPROMISES_EDITORS_YAML: bad })).toThrow(/expected shape/);
    expect(() => readEditors({ OPENPROMISES_EDITORS_YAML: bad })).not.toThrow(/secret-party/);
    expect(() => readEditors({ OPENPROMISES_EDITORS: "/nowhere/editors.yaml" })).toThrow(/no editors list/);
  });
});

describe("the verification label", () => {
  it("names the editors who chose to be named and counts the rest", () => {
    const v = cardVerification(card([auto, approval("Pavel Guzhikov", "2026-10-12"), approval("Alex", "2026-10-13")]), actors, editors);
    expect(v).toMatchObject({ level: "editors", text: "Verified by Pavel Guzhikov and 1 independent editor", named: ["Pavel Guzhikov"], counted: 1, on: "2026-10-13" });
    expect(cardVerification(card([approval("Pavel Guzhikov", "2026-10-12")]), actors, editors).text).toBe("Verified by Pavel Guzhikov");
  });

  it("counts everyone when nobody chose to be named, as with Pavel's list before `named: true`", () => {
    const unnamed = editors.map(({ named: _named, ...e }) => e);
    expect(cardVerification(card([approval("Pavel Guzhikov", "2026-10-12"), approval("Alex", "2026-10-12")]), actors, unnamed).text).toBe("Verified by 2 independent editors");
  });

  it("says when only machines have checked it, by the reviewer's current name, or nobody has", () => {
    const v = cardVerification(card([auto]), actors, editors);
    expect(v).toMatchObject({ level: "automated", text: "Checked automatically by AI Journalist, not yet verified by an editor", automated: ["AI Journalist"], on: null });
    expect(cardVerification(card([]), actors, editors).text).toBe("Not yet verified by an editor");
  });

  it("never counts an approval about the editor's own party, from someone not on the list, or before they were an editor", () => {
    const own = card([approval("Sam", "2026-10-12")], { actor_id: "secret-party" });
    expect(cardVerification(own, actors, editors).level).toBe("none");
    expect(cardVerification(card([approval("Stranger", "2026-10-12"), approval("Alex", "2026-09-01")]), actors, editors).level).toBe("none");
  });

  it("says a second check is to come only where publication waits for it: a reader's submission", () => {
    const one = [approval("Alex", "2026-10-12")];
    expect(cardVerification(card(one), actors, editors).secondToCome).toBe(false);
    expect(cardVerification(card(one, { origin: "reader_submission" }), actors, editors).secondToCome).toBe(true);
  });

  it("follows openpromises.config.ts: publish by checks, two approvals, the reviewer's new name, the engine's words", () => {
    const config = resolveConfig(siteConfig);
    expect(config.editorial.publish).toBe("checked");
    expect(config.editorial.approvals).toBe(SITE_EDITORIAL.approvals);
    expect(config.editorial.renamed).toEqual(SITE_EDITORIAL.renamed);
    expect(Object.keys(config.messages.en ?? {}).filter((k) => k.startsWith("verify."))).toEqual([]);
  });
});

describe("cards at build time", () => {
  it("carry the label with the editors list", () => {
    const seed = withVerification(loadSeed(), editors);
    expect(seed.cards.every((c) => c.verification)).toBe(true);
    const gbe = seed.cards.find((c) => c.id === "uk-great-british-energy-2024")!;
    // Goodwill Stranger is not on this test list: only listed editors count.
    expect(gbe.verification).toMatchObject({ level: "editor", text: "Verified by Pavel Guzhikov", on: "2026-10-12" });
  });

  it("carry none without it, so pages keep the earlier wording", () => {
    const seed = loadSeed();
    expect(withVerification(seed, null)).toBe(seed);
    expect(seed.cards.some((c) => c.verification)).toBe(false);
  });
});
