import { normaliseForMatch } from "../intake/text";
import type { Candidate, FoldedQuote } from "./types";

/**
 * One draft per source and speaker (19 October 2026). On 14 October one
 * GOV.UK release on the Remediation of Unsafe Cladding Bill gave seven
 * drafts: one per measure of the Bill and one for the 2029 remediation target.
 * Editors made two cards and folded the other five as duplicates. The
 * backtest found the same pattern on other days, so the harvester now folds
 * before any draft is written: candidates from the same source by the same
 * speaker, or whose quotes overlap, become one draft. Its `quote` is the most
 * checkable of them (a deadline first, then a figure, then the model's
 * confidence, then the earliest), and the others follow in `also`, in the
 * order they appear, each with its own exact span. Nothing is dropped: the
 * desk still sees every commitment and can make more than one card from a
 * draft.
 *
 * Who the speaker is comes from the candidate's own speaker data (Hansard's
 * member id, else the actor, else the name as printed), the same way for
 * every speaker and party.
 */

const speakerKey = (c: Candidate): string =>
  c.speaker.memberId != null ? `member:${c.speaker.memberId}` : c.speaker.actorId ? `actor:${c.speaker.actorId}` : `name:${normaliseForMatch(c.speaker.name).text}`;

const overlaps = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1];

/** Higher is more checkable: a deadline, then a figure. */
const checkable = (c: Candidate) => (c.suggested.deadline ? 2 : 0) + (c.suggested.how_much ? 1 : 0);

function lead(a: Candidate, b: Candidate): number {
  return checkable(b) - checkable(a) || b.confidence - a.confidence || a.span[0] - b.span[0] || a.span[1] - b.span[1];
}

const folded = (c: Candidate): FoldedQuote => ({ quote: c.quote, span: c.span, suggested: c.suggested, why: c.why, confidence: c.confidence });

/**
 * Fold candidates into one per source and speaker. Candidates of different
 * sources never fold together. The result keeps the order of each group's
 * first candidate in the input.
 */
export function foldCandidates(candidates: Candidate[]): Candidate[] {
  // Union-find over the candidates: same source and (same speaker or overlapping quote).
  const parent = candidates.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < candidates.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = candidates[i]!;
      const b = candidates[j]!;
      if (a.sourceId !== b.sourceId) continue;
      if (speakerKey(a) === speakerKey(b) || overlaps(a.span, b.span)) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Candidate[]>();
  candidates.forEach((c, i) => {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(c);
    else groups.set(root, [c]);
  });
  const out: Candidate[] = [];
  for (const list of groups.values()) {
    const [first, ...rest] = [...list].sort(lead);
    // An already-folded candidate brings its own folded quotes along.
    const also = [...(first!.also ?? []), ...rest.flatMap((c) => [folded(c), ...(c.also ?? [])])].sort((a, b) => a.span[0] - b.span[0] || a.span[1] - b.span[1]);
    const head: Candidate = { ...first! };
    delete head.also;
    out.push(also.length ? { ...head, also } : head);
  }
  return out;
}

/** How many quotes a list of (possibly folded) candidates holds. */
export const quoteCount = (candidates: Candidate[]) => candidates.reduce((n, c) => n + 1 + (c.also?.length ?? 0), 0);
