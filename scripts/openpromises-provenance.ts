/**
 * pnpm openpromises:provenance: where each installed OpenPromises package came from (OpenPromises decision 32;
 * docs/DECISIONS.md, 19 October 2026). Those packages install as soon as they are published, without pnpm's one-day
 * wait (`minimumReleaseAgeExclude` in pnpm-workspace.yaml), so CI makes sure each one was built by the engine's own
 * Release workflow (.github/workflows/release.yml), from the tag of its own version, in github.com/xternal/openpromises.
 * `npm audit signatures` (run before this in CI) verifies the signatures on the registry's attestations; this reads
 * the signed provenance and checks what it says, and that it covers the very tarball the registry serves (its
 * subject's sha512 is the registry's dist.integrity).
 *
 * Every @openpromises/* package in pnpm-lock.yaml is checked, which is what `pnpm install --frozen-lockfile` installs
 * in CI and on Vercel: the workspace's direct dependencies (the CLI and core at the root, core and publish in
 * packages/schema, react in apps/web) and theirs (files, quotes) alike. The lockfile's integrity, which pnpm checks
 * each download against, must be the registry's too. Copied from RussiaLedger.com (scripts/openpromises-provenance.ts
 * on its openpromises-engine-ci branch), which reads the root's node_modules/@openpromises; this workspace keeps its
 * OpenPromises packages in three places, so the lockfile is the one list of them all.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseAllDocuments } from "yaml";

const ROOT = join(import.meta.dirname, "..");
export const SOURCE = { repository: "https://github.com/xternal/openpromises", path: ".github/workflows/release.yml" } as const;
const REGISTRY = "https://registry.npmjs.org";

interface Statement {
  subject: { name: string; digest: { sha512?: string } }[];
  predicate: { buildDefinition?: { externalParameters?: { workflow?: { repository?: string; path?: string; ref?: string } } } };
}

/** What is wrong with one package's provenance, or nothing. `integrity` is the registry's "sha512-<base64>". */
export function provenanceProblems(name: string, version: string, integrity: string, statements: readonly Statement[]): string[] {
  const slsa = statements.find((s) => s.predicate?.buildDefinition);
  if (!slsa) return [`${name}@${version} has no build provenance`];
  const wf = slsa.predicate.buildDefinition?.externalParameters?.workflow ?? {};
  const out: string[] = [];
  if (wf.repository !== SOURCE.repository) out.push(`${name}@${version} was built from ${wf.repository ?? "an unknown repository"}, not ${SOURCE.repository}`);
  if (wf.path !== SOURCE.path) out.push(`${name}@${version} was built by ${wf.path ?? "an unknown workflow"}, not ${SOURCE.path}`);
  if (wf.ref !== `refs/tags/v${version}`) out.push(`${name}@${version} was built from ${wf.ref ?? "an unknown ref"}, not refs/tags/v${version}`);
  const hex = Buffer.from(integrity.replace(/^sha512-/, ""), "base64").toString("hex");
  if (!slsa.subject.some((s) => s.digest.sha512 === hex)) out.push(`${name}@${version}: the provenance does not cover the tarball the registry serves`);
  return out;
}

export interface Locked {
  name: string;
  version: string;
  /** The lockfile's "sha512-<base64>" for the tarball. */
  integrity: string;
}

type LockPackages = Record<string, { resolution?: { integrity?: string } }>;

/**
 * Every OpenPromises package a pnpm lockfile pins, by name, version and integrity (sorted). pnpm 12 writes two YAML
 * documents in one file, the package manager's own dependencies first and the workspace's second; both are read.
 */
export function lockedPackages(lockfile: string): Locked[] {
  const docs = parseAllDocuments(lockfile).map((d) => d.toJS() as { packages?: LockPackages } | null);
  const packages: LockPackages = Object.assign({}, ...docs.map((d) => d?.packages ?? {}));
  return Object.entries(packages)
    .flatMap(([key, value]) => {
      const m = /^(@openpromises\/[^@]+)@(.+)$/.exec(key);
      return m ? [{ name: m[1]!, version: m[2]!, integrity: value.resolution?.integrity ?? "" }] : [];
    })
    .sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function main() {
  const packages = lockedPackages(readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8"));
  if (!packages.length) throw new Error("pnpm-lock.yaml pins no @openpromises/* package: nothing to check, which is itself wrong");
  const problems: string[] = [];
  for (const { name, version, integrity } of packages) {
    const id = name.replace("/", "%2f");
    const meta = await json<{ dist: { integrity: string } }>(`${REGISTRY}/${id}/${version}`);
    if (integrity !== meta.dist.integrity) problems.push(`${name}@${version}: pnpm-lock.yaml pins a different tarball from the one the registry serves`);
    // A package published without provenance has no attestations: the registry answers 404, which is a problem to report.
    const res = await fetch(`${REGISTRY}/-/npm/v1/attestations/${id}@${version}`);
    const att = (res.ok ? await res.json() : {}) as { attestations?: { predicateType: string; bundle: { dsseEnvelope: { payload: string } } }[] };
    const statements = (att.attestations ?? [])
      .filter((a) => a.predicateType.includes("slsa.dev/provenance"))
      .map((a) => JSON.parse(Buffer.from(a.bundle.dsseEnvelope.payload, "base64").toString("utf8")) as Statement);
    problems.push(...provenanceProblems(name, version, meta.dist.integrity, statements));
  }
  for (const p of problems) console.error(p);
  console.log(`OpenPromises provenance: ${packages.length} packages checked (${packages.map((p) => `${p.name}@${p.version}`).join(", ")}), ${problems.length} problems.`);
  if (problems.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
