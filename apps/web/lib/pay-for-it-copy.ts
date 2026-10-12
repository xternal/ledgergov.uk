/**
 * Pay for it (/pay-for-it): the words. Neutral throughout: what each way of
 * paying takes and who decides it, never which way is right. Figures come
 * from the data (lib/pay-for-it.ts), never from here.
 */

export const PAY_TITLE = "Pay for it";

/** The page's title in search results. */
export const PAY_SEO_TITLE = "Pay for it: fund a UK political promise with a tax, a cut or borrowing";

/** How other pages link to it: what it does, in a line. */
export const PAY_LINK_TEXT = "Pay for a promise: a tax, a cut or borrowing";

/** What a share card of the page says: the claim, not the menu label. */
export const PAY_SHARE_TITLE = "Every promise has a price tag. Pay for one: tax, cut or borrow";

export const payDescription =
  "Pick a costed UK political promise, starting with the £2 bus fare cap, and choose how to pay for it: raise a tax, cut a spending line or borrow. See what happens to borrowing at once, as a range, on HMRC's and official figures. Every party's pledges, one standard.";

export const PAY_COPY = {
  lead: "Every promise has a price tag. Pick one, then decide how to pay for it: raise a tax, cut spending, or borrow. The sums are done as you choose.",
  shared: "You opened a plan someone shared. Change anything below to make your own; the link changes with it.",
  pickLabel: "Pick a pledge",
  pickHelp: "Every promise we track that has a yearly cost to the public purse, from any party.",
  inGovernment: "In government",
  inOpposition: "In opposition",
  publicBody: "Public bodies",
  otherOwners: "Others",
  costs: "Costs a year",
  centralBy: "Central figure",
  perHousehold: "per household",
  ofSpending: "of all spending",
  announced: "How it would be paid for, as announced",
  notStated: "Not stated when it was announced.",
  aboutCost: "About the cost",
  readCard: "Read the promise card",
  howTitle: "How to pay for it",
  quick: "Pay for all of it with",
  quickTax: "A tax",
  quickCut: "A spending cut",
  quickBorrow: "Borrowing",
  taxTitle: "Raise a tax",
  taxWhich: "Which tax",
  cutTitle: "Cut spending",
  cutWhich: "Which spending",
  borrowTitle: "Borrow",
  share: "Share of the cost",
  none: "None",
  all: "All",
  tooBigTax: "too big for HMRC's figures",
  tooBigCut: "smaller than the cut",
  borrowRest: "of the cost is borrowed:",
  borrowNone: "Nothing is borrowed.",
  everyArea: "Every area of spending",
  status: "Status",
  noTax: "No tax rises.",
  noCut: "No spending is cut.",
  tillTitle: "The till",
  tillPledge: "The pledge",
  tillTax: "From a tax",
  tillCut: "From a cut",
  tillBorrow: "Borrowed",
  tillChange: "Change in borrowing",
  statementTitle: "The Statement still balances",
  income: "Income: taxes and other receipts",
  borrowing: "Borrowing",
  spending: "Spending",
  before: "Before",
  after: "After",
  change: "Change",
  shareTitle: "Share this plan",
  shareHelp: "The link holds the pledge and your choices, nothing else, and opens this plan for anyone.",
  shareText: "How would you pay for it?",
  sourceHmrc: "HMRC's figure",
  sourceStatement: "the Statement",
  sourceRate: "Bank Rate",
  sourceHouseholds: "households, ONS",
  notAForecast: "A what-if on official figures, not a forecast: no wider effects on the economy, and nothing about whether a choice is right.",
} as const;

/** Who decides borrowing, and what sets the interest on it: "Set by the government. The interest on it follows Bank Rate, set by the Bank of England, and the markets." */
export const borrowWho = (government: string, rate: { label: string; by: string } | null) =>
  rate ? `${government}. The interest on it follows ${rate.label}, ${rate.by.charAt(0).toLowerCase()}${rate.by.slice(1)}, and the markets.` : `${government}.`;

/** How it works, in short paragraphs. The years and the edition come from the data. */
export function payHowItWorks(d: { year: string; taxYear: string; hmrcPublished: string }) {
  return [
    {
      h: "The cost",
      p: "Each pledge's yearly cost comes from its promise card: the central figure, who made it (a government department, the party itself or an independent body) and a range. Where the source gives one figure, the card adds our usual editorial band and says so.",
    },
    {
      h: "A tax",
      p: `HMRC publishes what 1p on income tax or National Insurance, or 1 point on VAT or corporation tax, raises in a year. Its figure for ${d.taxYear}, from the edition published ${d.hmrcPublished}, is the one on our tax cards. We divide your share of the cost by it to get the change needed, often a fraction of a penny. Capital gains tax is left out: HMRC says its figures cannot be scaled, and a rise raises little or loses money in its first year.`,
    },
    {
      h: "A cut",
      p: `A cut comes from one area of spending in the Statement for ${d.year}, the latest full year, or from every area by the same share. Debt interest is left out, because it follows interest rates and the size of the debt, and so are accounting adjustments, which are not a service.`,
    },
    {
      h: "Borrowing",
      p: "Whatever a tax or a cut does not pay is borrowed. Borrowing is what the state spends less what it takes in, so the Statement balances in every plan: income plus borrowing equals spending.",
    },
    {
      h: "Ranges",
      p: "The pledge's cost and the tax's yield are each uncertain, so the change in borrowing runs from the cheapest pledge with the best yield to the dearest with the worst. A cut is a decision about money already counted, so it is exact.",
    },
  ];
}

export const PAY_FAQ = [
  {
    q: "Is this what the government will do?",
    a: "No. It is a what-if: one pledge, paid for one way, on official figures. A real Budget pays for many things at once and the Office for Budget Responsibility checks the sums. Where a pledge said how it would be paid for, the page shows that too.",
  },
  {
    q: "Why does a tax need only a fraction of a penny?",
    a: "Because a penny on a big tax raises billions. HMRC's figure for 1p on the basic rate of income tax is several billion pounds a year, so a pledge costing a few hundred million needs a small fraction of that. Tax rates are usually set in whole pence; the fraction shows the scale.",
  },
  {
    q: "Why does borrowing still show a range when the pledge is paid for in full?",
    a: "The pledge's cost and the tax's yield are both estimates. If the pledge costs more than expected and the tax raises less, the gap is borrowed; the other way round, borrowing falls. The range shows both ends.",
  },
  {
    q: "Which pledges are here?",
    a: "Every promise card with a yearly cost to the public purse, from any party, in government or not, under the same rules. Pledges that raise money, such as a new tax, are not listed, because they need no paying for. They are on the promise ledger.",
  },
  {
    q: "Does a tax rise or a cut change how the economy behaves?",
    a: "HMRC's figures include how taxpayers respond, such as reporting less income, but not wider effects on prices, jobs or growth. Cuts are counted pound for pound. The sandbox on the home page shows rough effects on prices and growth, as wide ranges.",
  },
  {
    q: "Who decides each of these?",
    a: "Taxes, spending and borrowing are decided by the government and voted through by Parliament. The interest on borrowing depends on Bank Rate, which the Bank of England sets, and on the markets.",
  },
] as const;
