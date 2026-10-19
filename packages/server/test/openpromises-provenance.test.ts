import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { lockedPackages, provenanceProblems, SOURCE } from "../../../scripts/openpromises-provenance";

/**
 * OpenPromises decision 32 (docs/DECISIONS.md, 19 October 2026): the engine's packages install as soon as they are
 * published, and CI checks where each came from (scripts/openpromises-provenance.ts, after `npm audit signatures`).
 * The first two tests are RussiaLedger.com's, unchanged.
 */

const integrity = `sha512-${Buffer.from("ab".repeat(64), "hex").toString("base64")}`;
const statement = (workflow: Record<string, string>, sha512 = "ab".repeat(64)) => ({
  subject: [{ name: "pkg:npm/%40openpromises/core@0.10.0", digest: { sha512 } }],
  predicate: { buildDefinition: { externalParameters: { workflow } } },
});
const good = { repository: SOURCE.repository, path: SOURCE.path, ref: "refs/tags/v0.10.0" };
const root = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

describe("OpenPromises provenance", () => {
  it("accepts a package built by the engine's Release workflow from its own tag", () => {
    expect(provenanceProblems("@openpromises/core", "0.10.0", integrity, [statement(good)])).toEqual([]);
  });

  it("refuses another repository, another workflow, another tag, another tarball, or none", () => {
    expect(provenanceProblems("@openpromises/core", "0.10.0", integrity, [statement({ ...good, repository: "https://github.com/someone/fork" })])[0]).toMatch(/built from https:\/\/github.com\/someone\/fork/);
    expect(provenanceProblems("@openpromises/core", "0.10.0", integrity, [statement({ ...good, path: ".github/workflows/other.yml" })])[0]).toMatch(/built by/);
    expect(provenanceProblems("@openpromises/core", "0.10.0", integrity, [statement({ ...good, ref: "refs/heads/main" })])[0]).toMatch(/refs\/tags\/v0.10.0/);
    expect(provenanceProblems("@openpromises/core", "0.10.0", integrity, [statement(good, "cd".repeat(64))])[0]).toMatch(/does not cover the tarball/);
    expect(provenanceProblems("@openpromises/core", "0.10.0", integrity, [])).toEqual(["@openpromises/core@0.10.0 has no build provenance"]);
  });
});

describe("the packages it checks", () => {
  it("are every OpenPromises package in the lockfile, from both of a pnpm 12 lockfile's documents", () => {
    const lockfile = [
      "---",
      "lockfileVersion: '9.0'",
      "packages:",
      "  pnpm@12.9.1:",
      "    resolution: {integrity: sha512-pnpm}",
      "---",
      "lockfileVersion: '9.0'",
      "packages:",
      "  '@openpromises/react@0.10.0':",
      "    resolution: {integrity: sha512-react}",
      "  '@openpromises/core@0.10.0':",
      "    resolution: {integrity: sha512-core}",
      "  zod@4.6.5:",
      "    resolution: {integrity: sha512-zod}",
      "",
    ].join("\n");
    expect(lockedPackages(lockfile)).toEqual([
      { name: "@openpromises/core", version: "0.10.0", integrity: "sha512-core" },
      { name: "@openpromises/react", version: "0.10.0", integrity: "sha512-react" },
    ]);
  });

  it("include every one this workspace depends on, all at one version, as the engine's packages are released together", () => {
    const locked = lockedPackages(root("pnpm-lock.yaml"));
    const names = locked.map((p) => p.name);
    for (const name of ["@openpromises/cli", "@openpromises/core", "@openpromises/publish", "@openpromises/react"]) expect(names).toContain(name);
    expect(new Set(locked.map((p) => p.version)).size).toBe(1);
    for (const p of locked) expect(p.integrity).toMatch(/^sha512-/);
  });

  it("are the only ones that skip pnpm's one-day wait: pnpm-workspace.yaml excludes @openpromises/* and nothing else", () => {
    const workspace = parse(root("pnpm-workspace.yaml")) as Record<string, unknown>;
    expect(workspace.minimumReleaseAgeExclude).toEqual(["@openpromises/*"]);
    expect(workspace.minimumReleaseAge).toBeUndefined();
  });
});
