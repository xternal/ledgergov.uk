/**
 * Intake branches nobody finished (19 October 2026). The backtest found
 * intake/2026-10-10 and intake/2026-10-11 still holding drafts, with their
 * pull requests closed by hand and no desk run file, and intake/2026-10-18
 * landing four hours after that Monday's desk run. The weekly desk now sweeps
 * every intake branch that still holds drafts (docs/desk/ROUTINE.md, step 1),
 * and `pnpm harvest -- stale`, run daily by .github/workflows/harvest.yml and
 * by the desk, names any that is older than seven days.
 *
 * An intake branch is open while its tree still has drafts in
 * content/drafts/<date>/ and main has no desk run file for its day
 * (docs/desk/runs/<date>.yaml). The desk deletes the drafts when it has
 * decided each one, and records the day in a run file; a day triaged on
 * another branch (15 and 16 October 2026 went in with #119) keeps its drafts
 * on its own branch but has its run file on main. Branches are not deleted
 * after merge (the daily job never reads a day again while its branch exists).
 */

export const STALE_INTAKE_DAYS = 7;

export interface IntakeBranch {
  /** "intake/2026-10-10" (a remote-tracking "origin/intake/…" is read the same). */
  name: string;
  /** Draft files (content/drafts/<date>/*.yaml) in the branch's tree. */
  drafts: number;
  /** True when main has the desk's run file for the day, docs/desk/runs/<date>.yaml. */
  logged: boolean;
}

export interface StaleBranch {
  name: string;
  date: string;
  ageDays: number;
  drafts: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The intake date in a branch name, or null for anything that is not intake/<YYYY-MM-DD>. */
export function intakeDate(name: string): string | null {
  const m = /(?:^|\/)intake\/(\d{4}-\d{2}-\d{2})$/.exec(name);
  if (!m) return null;
  const d = new Date(`${m[1]}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== m[1] ? null : m[1]!;
}

/** Branches that still hold drafts, have no run file on main, and whose intake date is more than `days` days before `today`, oldest first. */
export function staleIntakeBranches(branches: IntakeBranch[], today: string, days = STALE_INTAKE_DAYS): StaleBranch[] {
  const now = Date.parse(`${today}T12:00:00Z`);
  if (Number.isNaN(now)) throw new Error(`staleIntakeBranches: today must be YYYY-MM-DD, got "${today}"`);
  const out: StaleBranch[] = [];
  for (const b of branches) {
    const date = intakeDate(b.name);
    if (!date || b.drafts <= 0 || b.logged) continue;
    const ageDays = Math.round((now - Date.parse(`${date}T12:00:00Z`)) / DAY_MS);
    if (ageDays > days) out.push({ name: b.name.replace(/^(?:refs\/remotes\/)?origin\//, ""), date, ageDays, drafts: b.drafts });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One log line per stale branch, for the daily job and the desk's report. */
export function staleLine(s: StaleBranch): string {
  return `${s.name} is ${plural(s.ageDays, "day")} old and still holds ${plural(s.drafts, "draft")}: the weekly desk must decide each one (docs/desk/ROUTINE.md, step 1).`;
}
