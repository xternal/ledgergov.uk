/**
 * Statements the weekly desk always drops, caught by fixed rules before a
 * draft is written (19 October 2026). The backtest of AI Journalist over the
 * desk's run files found two main reasons for dropping a draft: `process`
 * (23 drafts) and `grant` (5). The definitions are the desk's own
 * (docs/desk/ROUTINE.md, step 2):
 *
 * - process: a step inside government: lay an order, publish a strategy with
 *   no date, an internal reorganisation, a minor amendment to a Bill;
 * - grant: money already handed to named recipients, with nothing left to check.
 *
 * The extraction prompt asks the model to label these too (extract.ts); these
 * rules are the deterministic net behind it. Each rule is narrow on purpose:
 * packages/server/test/harvest-rules.test.ts checks that it catches the desk's
 * real dropped quotes and keeps every quote on a card published by
 * 19 October 2026. Rules read the quote only, never who said it, so they treat
 * every speaker and party the same (invariant 6).
 */

export type RuleCode = "process" | "grant";

export interface Rule {
  code: RuleCode;
  /** Plain words for the PR body's dropped table. */
  label: string;
  test(quote: string): boolean;
}

const MONTH = /\b(?:January|February|March|April|June|July|August|September|October|November|December)\b|\bMay (?:19|20)\d{2}\b/;
const YEAR = /\b(?:19|20)\d{2}\b/;
const RELATIVE =
  /\b(?:by|in|from|until|before|during|this|next) (?:the )?(?:spring|summer|autumn|winter|end of (?:the|this|next) (?:year|month|Parliament|parliament))\b|\b(?:this|next) (?:year|month|week|Parliament|parliament)\b|\bwithin (?:\d+|a|one|two|three|four|five|six|eight|ten|twelve) (?:days?|weeks?|months?|years?)\b|\bChristmas\b/i;

/** True when the quote names a time: a year, a month, a season or end of a period, or "within N weeks". */
export function hasDate(quote: string): boolean {
  return YEAR.test(quote) || MONTH.test(quote) || RELATIVE.test(quote);
}

const MONEY = String.raw`£\s?\d[\d,.]*\s*(?:k|m|bn|million|billion|thousand)?\b`;
const RECIPIENTS = String.raw`(?:local authorities|councils|authorities|integrated care boards|ICBs|trusts|schools|colleges|universities|charities|organisations|projects|police forces|forces|hospitals)`;

export const RULES: Rule[] = [
  // ---- process: a step inside government
  {
    code: "process",
    label: "lays an order, regulations or a code before Parliament",
    test: (q) =>
      /\blay (?:an?|the) (?:draft |new |statutory |final )?(?:order|regulations|statutory instrument|code of practice|code)\b/i.test(q) ||
      /\b(?:bring(?:ing)?|lay(?:ing)?|put(?:ting)?)\b[^.]{0,80}\bbefore Parliament\b/i.test(q),
  },
  {
    code: "process",
    label: "notifies a contingent liability",
    test: (q) => /\bcontingent liabilit(?:y|ies)\b/i.test(q),
  },
  {
    code: "process",
    label: "amends a Bill or a section of an Act",
    test: (q) => /\bamend(?:s|ed|ing|ments?)?\b[^.]{0,160}\b(?:in|into) the (?:[A-Z][\w’']*\s){0,5}Bill\b/.test(q) || /\bamends? (?:section|sections|schedule|regulation)s? \d+/i.test(q),
  },
  {
    code: "process",
    label: "moves work between parts of government",
    test: (q) => /\b(?:will be|to be|is being|are being) (?:centralised|centralized|merged|consolidated) (?:under|into|within|in)\b/i.test(q),
  },
  {
    code: "process",
    label: "changes an organisation's boundaries",
    test: (q) => /\bchanges? (?:to|in)\b[^.]{0,60}\bboundar(?:y|ies)\b/i.test(q),
  },
  {
    code: "process",
    label: "appoints an official",
    test: (q) => /\bappoint(?:ment of|ing|s)?\b[^.]{0,60}?\b(?:lead|champion|commissioners?|inspectors?|adviser|advisor|tsar|czar|envoy|chair|ombudsman)s?\b/i.test(q),
  },
  {
    code: "process",
    label: "finishes a review",
    test: (q) => /\b(?:complete|conclude|finish) (?:its|their|the|a|this) review\b/i.test(q),
  },
  {
    code: "process",
    label: "updates leaflets, labels or guidance, with no date",
    test: (q) => /\b(?:leaflets?|labels?|guidance|forms?|templates?)\b[^.]{0,80}\bwill be (?:updated|revised|amended)\b/i.test(q) && !hasDate(q),
  },
  {
    code: "process",
    label: "writes a strategy, guidance or tool, with no date",
    test: (q) =>
      /\b(?:publish|develop|produce|draw up)\b[^.]{0,60}\b(?:strateg(?:y|ies)|guidance|codes? of practice|framework|roadmap|route|toolkit|tool|checker|portal)\b/i.test(q) && !hasDate(q),
  },
  // ---- grant: money already handed to named recipients
  {
    code: "grant",
    label: "money shared out among a counted set of recipients",
    test: (q) =>
      new RegExp(String.raw`${MONEY}[^.]{0,120}?\b(?:to|across|through|between|among|for) (?:all (?:the )?|the \d[\d,]* |\d[\d,]* )(?:\w+ ){0,2}?${RECIPIENTS}\b`, "i").test(q) &&
      !hasDate(q),
  },
  {
    code: "grant",
    label: "money already being paid",
    test: (q) =>
      /\b(?:is|are) (?:now )?(?:funding|providing|giving|awarding|granting|donating|contributing) (?:an? )?(?:additional |extra |further |new )?£/i.test(q) ||
      /\b(?:has|have) (?:awarded|allocated|granted|given|donated|provided) (?:an? )?(?:additional |extra |further |new )?£/i.test(q),
  },
  {
    code: "grant",
    label: "named places receive repairs",
    test: (q) => /\b(?:will|to) (?:benefit from|receive) (?:restoration|repairs?|refurbishment|renovation)\b/i.test(q),
  },
];

/** The first rule a quote falls under, or null when none does. */
export function ruledOut(quote: string): Rule | null {
  const q = quote.replace(/\s+/g, " ");
  return RULES.find((r) => r.test(q)) ?? null;
}
