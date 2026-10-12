import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSeed } from "@ledger/schema/seed";
import type { Quality, Range } from "@ledger/schema";
import {
  ALL_BORROWED,
  EVERY_LINE,
  NOT_CUTTABLE,
  PAY_SHARES,
  createModel,
  cuttableLines,
  decodePlan,
  encodePlan,
  payFor,
  planIssues,
  pledgeOf,
  reckonerChanges,
  type PayOptions,
  type PayPlan,
  type Pledge,
  type ReckonerObservation,
} from "../src";

const seed = loadSeed();
const model = createModel(seed.statement, seed.levers);
const root = join(import.meta.dirname, "../../..");
const EPS = 1e-9;

/** The /tax cards' per-unit levers and HMRC's series for each (lib/reckoner-copy.ts): the taxes Pay for it offers. */
const TAX_CARDS: Record<string, string> = {
  income_tax_basic: "reckoner.income_tax_basic_rate_1p",
  income_tax_higher: "reckoner.income_tax_higher_rate_1p",
  nics_main: "reckoner.nics_employee_main_rate_1pp",
  vat_standard: "reckoner.vat_standard_rate_1pp",
  corp_tax: "reckoner.corp_tax_main_rate_1pp",
};

const pledges = seed.cards.map((c) => pledgeOf(c, model)).filter((p): p is Pledge => p !== null);
const opts: PayOptions = { model, pledges, taxLevers: Object.keys(TAX_CARDS) };
const BUS_CAP = "uk-bus-cap-2-2026";
const plan = (p: Partial<PayPlan> = {}): PayPlan => ({ pledge_id: BUS_CAP, tax: null, cut: null, ...p });

const manifest = JSON.parse(readFileSync(join(root, "data/build/manifest.json"), "utf8")) as { sources: { id: string; freshness?: { vintage?: string } }[] };
const vintage = manifest.sources.find((s) => s.id === "hmrc_reckoner")!.freshness!.vintage!;
const observations: ReckonerObservation[] = readFileSync(join(root, `data/build/observations/hmrc_reckoner/${vintage}.csv`), "utf8")
  .split("\n")
  .slice(1)
  .filter(Boolean)
  .map((line) => {
    const [series_id, period, , value, , , source_id, v, quality] = line.split(",");
    return { series_id: series_id!, period: period!, value: Number(value), source_id: source_id!, vintage: v!, quality: quality as Quality };
  });

const expectRange = (r: Range, want: Range) => r.forEach((x, i) => expect(x).toBeCloseTo(want[i]!, 9));
const contains = (r: Range, x: number) => r[0] - EPS <= x && x <= r[2] + EPS;

/** Every plan the page can make for a pledge: each tax and each line at each share, alone and together, that can be costed. */
function everyPlan(pledgeId: string): PayPlan[] {
  const shares = PAY_SHARES.filter((s) => s > 0);
  const taxes = [null, ...opts.taxLevers.flatMap((lever_id) => shares.map((share) => ({ lever_id, share })))];
  const cuts = [null, ...[EVERY_LINE, ...cuttableLines(model).map((l) => l.id)].flatMap((line_id) => shares.map((share) => ({ line_id, share })))];
  return taxes.flatMap((tax) => cuts.map((cut) => ({ pledge_id: pledgeId, tax, cut }))).filter((p) => planIssues(opts, p).length === 0);
}

describe("pledges: every card with a yearly cost to the public purse, from any party", () => {
  it("takes the bus cap's cost from its card, landing on transport spending", () => {
    const bus = pledges.find((p) => p.id === BUS_CAP)!;
    expect(bus.cost_bn).toEqual([0.36, 0.4, 0.44]);
    expect(bus.lands_on).toEqual({ side: "spending", line: "economic_affairs" });
  });

  it("offers every costed card that costs money, whoever made it, and none that raises money", () => {
    const costing = seed.cards.filter((c) => (c.current.parameters?.how_much_bn_per_year?.[1] ?? 0) > 0);
    expect(pledges.map((p) => p.id).sort()).toEqual(costing.map((c) => c.id).sort());
    // One standard (invariant 6): both government and opposition pledges are on offer.
    const standings = new Set(seed.cards.filter((c) => pledges.some((p) => p.id === c.id)).map((c) => (c.party ?? c.actor).standing ?? c.actor.standing));
    expect(standings).toContain("government");
    expect(standings).toContain("opposition");
    for (const c of seed.cards.filter((x) => (x.current.parameters?.how_much_bn_per_year?.[1] ?? 0) < 0)) expect(pledgeOf(c, model)).toBeNull();
  });

  it("a tax pledge lowers income; a spending pledge adds to its own area's line", () => {
    for (const p of pledges) {
      const card = seed.cards.find((c) => c.id === p.id)!;
      if (card.file.policy_area === "taxes") expect(p.lands_on).toEqual({ side: "receipt" });
      else expect(p.lands_on).toEqual({ side: "spending", line: card.file.policy_area });
    }
  });

  it("never lets a cut come from debt interest or accounting adjustments", () => {
    const ids = cuttableLines(model).map((l) => l.id);
    for (const id of NOT_CUTTABLE) expect(ids).not.toContain(id);
    expect(planIssues(opts, plan({ cut: { line_id: "debt_interest", share: 100 } }))).not.toEqual([]);
  });
});

describe("the bus cap, paid three ways", () => {
  it("borrowed: borrowing rises by the whole cost, with its range", () => {
    const r = payFor(opts, plan());
    expectRange(r.d_borrowing_bn, [0.36, 0.4, 0.44]);
    expect(r.shares).toEqual({ tax: 0, cut: 0, borrow: 100 });
    expect(r.borrowed_bn).toBeCloseTo(0.4, 9);
  });

  it("from the basic rate of income tax: 0.4 / 6.9 of a penny, and borrowing unchanged in the centre, ±£0.08bn", () => {
    const r = payFor(opts, plan({ tax: { lever_id: "income_tax_basic", share: 100 } }));
    expect(r.tax!.units).toBeCloseTo(0.4 / 6.9, 12);
    expect(r.tax!.to).toBeCloseTo(20 + 0.4 / 6.9, 12);
    expectRange(r.tax!.raises_bn, [0.36, 0.4, 0.44]);
    expectRange(r.d_borrowing_bn, [-0.08, 0, 0.08]);
  });

  it("cut from running government (where the announced climate-finance switch sits): borrowing unchanged in the centre, ±£0.04bn", () => {
    const r = payFor(opts, plan({ cut: { line_id: "general_services", share: 100 } }));
    expect(r.cut!.amount_bn).toBeCloseTo(0.4, 12);
    expect(r.cut!.pct_of_line).toBeCloseTo((0.4 / seed.statement.spending.find((l) => l.id === "general_services")!.bn) * 100, 9);
    expectRange(r.d_borrowing_bn, [-0.04, 0, 0.04]);
  });

  it("cut from every line by the same share: each line gives the same percentage", () => {
    const r = payFor(opts, plan({ cut: { line_id: EVERY_LINE, share: 100 } }));
    const lines = cuttableLines(model);
    const total = lines.reduce((a, l) => a + l.bn, 0);
    expect(r.cut!.line_bn).toBeCloseTo(total, 9);
    for (const m of r.cut!.by_line) {
      const line = lines.find((l) => l.id === m.line)!;
      expect((-m.d_bn / line.bn) * 100).toBeCloseTo(r.cut!.pct_of_line, 9);
    }
    expect(r.cut!.by_line.reduce((a, m) => a - m.d_bn, 0)).toBeCloseTo(0.4, 12);
  });

  it("half from tax, a quarter from a cut, a quarter borrowed", () => {
    const r = payFor(opts, plan({ tax: { lever_id: "vat_standard", share: 50 }, cut: { line_id: "defence", share: 25 } }));
    expect(r.shares).toEqual({ tax: 50, cut: 25, borrow: 25 });
    expect(r.borrowed_bn).toBeCloseTo(0.1, 12);
    // Cost [0.36, 0.4, 0.44], VAT yield [0.18, 0.2, 0.22], cut 0.1.
    expectRange(r.d_borrowing_bn, [0.36 - 0.22 - 0.1, 0.1, 0.44 - 0.18 - 0.1]);
  });
});

describe("every funding route changes borrowing by the pledge's cost", () => {
  for (const p of pledges) {
    it(`${p.id}`, () => {
      const borrowed = payFor(opts, { pledge_id: p.id, tax: null, cut: null });
      expectRange(borrowed.d_borrowing_bn, p.cost_bn);
      for (const pl of everyPlan(p.id)) {
        const r = payFor(opts, pl);
        // What the tax and the cut pay comes off borrowing, pound for pound in the centre.
        expect(borrowed.d_borrowing_bn[1] - r.d_borrowing_bn[1]).toBeCloseTo((p.cost_bn[1] * (r.shares.tax + r.shares.cut)) / 100, 9);
        expect(r.d_borrowing_bn[1]).toBeCloseTo(r.borrowed_bn, 9);
        // The change in borrowing is a range around what is left to borrow, never a point
        // (a card's range may end at its central figure, as the defence 2.5% card's does).
        expect(r.d_borrowing_bn[0]).toBeLessThan(r.d_borrowing_bn[2]);
        expect(contains(r.d_borrowing_bn, r.d_borrowing_bn[1])).toBe(true);
        // Paid in full, borrowing is unchanged in the centre and zero sits inside the range.
        if (r.shares.borrow === 0) expect(contains(r.d_borrowing_bn, 0)).toBe(true);
      }
    });
  }
});

describe("the Statement balances in every plan (invariant 4)", () => {
  it("receipts + borrowing = spending, before and after, for every pledge and every plan", () => {
    let n = 0;
    for (const p of pledges) {
      for (const pl of [{ pledge_id: p.id, tax: null, cut: null }, ...everyPlan(p.id)]) {
        const r = payFor(opts, pl);
        for (const t of [r.before, r.after]) expect(Math.abs(t.receipts_bn + t.borrowing_bn - t.spending_bn)).toBeLessThan(EPS);
        // Borrowing after is borrowing before plus the change, and the lines that move add up to the totals.
        expect(r.after.borrowing_bn - r.before.borrowing_bn).toBeCloseTo(r.d_borrowing_bn[1], 9);
        const moved = (side: "receipt" | "spending") => r.moves.filter((m) => m.side === side).reduce((a, m) => a + m.d_bn, 0);
        expect(r.after.receipts_bn - r.before.receipts_bn).toBeCloseTo(moved("receipt"), 9);
        expect(r.after.spending_bn - r.before.spending_bn).toBeCloseTo(moved("spending"), 9);
        n++;
      }
    }
    expect(n).toBeGreaterThan(pledges.length * 100);
  });

  it("starts from the Statement as published: its own borrowing figure", () => {
    const r = payFor(opts, plan());
    expect(Math.abs(r.before.borrowing_bn - seed.statement.borrowing_bn)).toBeLessThan(0.1);
  });
});

describe("the tax route uses the /tax cards' figures", () => {
  for (const [leverId, series] of Object.entries(TAX_CARDS)) {
    it(`${leverId}: the change needed is the cost over the card's first-year figure, and raises the card's range scaled to it`, () => {
      const [card] = reckonerChanges(model, { lever_id: leverId, series }, observations, seed.baseYear);
      for (const share of PAY_SHARES.filter((s) => s > 0)) {
        const pl = plan({ tax: { lever_id: leverId, share } });
        if (planIssues(opts, pl).length) continue;
        const r = payFor(opts, pl);
        const amount = (0.4 * share) / 100;
        expect(r.tax!.units).toBeCloseTo(amount / card!.first.range[1], 12);
        expect(r.tax!.from).toBe(card!.from);
        expectRange(r.tax!.per_unit_bn, card!.first.range);
        expectRange(r.tax!.raises_bn, card!.first.range.map((x) => x * r.tax!.units) as Range);
        expect(r.tax!.raises_bn[1]).toBeCloseTo(amount, 12);
      }
    });
  }

  it("never stretches HMRC's figures past the lever's range: NATO's 5% is too big for the basic rate alone", () => {
    const nato = pledges.find((p) => p.id === "uk-nato-5pc-2035-2025")!;
    const pl: PayPlan = { pledge_id: nato.id, tax: { lever_id: "income_tax_basic", share: 100 }, cut: null };
    expect(nato.cost_bn[1] / 6.9).toBeGreaterThan(5);
    expect(planIssues(opts, pl).join()).toMatch(/cannot raise that much/);
    expect(() => payFor(opts, pl)).toThrow();
  });

  it("offers no stepped tax (capital gains tax) and no tax missing from the cards", () => {
    expect(planIssues(opts, plan({ tax: { lever_id: "cgt_higher", share: 100 } }))).not.toEqual([]);
    expect(planIssues({ ...opts, taxLevers: [...opts.taxLevers, "cgt_higher"] }, plan({ tax: { lever_id: "cgt_higher", share: 100 } }))).not.toEqual([]);
    expect(planIssues(opts, plan({ tax: { lever_id: "income_tax_additional", share: 100 } }))).not.toEqual([]);
  });
});

describe("a shared link reproduces the plan", () => {
  it("encodes readable ids and shares, with nothing else in the link", () => {
    expect(encodePlan(plan())).toBe(ALL_BORROWED);
    expect(encodePlan(plan({ tax: { lever_id: "income_tax_basic", share: 100 } }))).toBe("tax-income_tax_basic-100");
    expect(encodePlan(plan({ tax: { lever_id: "vat_standard", share: 50 }, cut: { line_id: "defence", share: 25 } }))).toBe("tax-vat_standard-50.cut-defence-25");
    expect(encodePlan(plan({ cut: { line_id: EVERY_LINE, share: 75 } }))).toBe("cut-all-75");
  });

  it("every plan for every pledge round-trips through its link and gives the same result", () => {
    for (const p of pledges) {
      for (const pl of [{ pledge_id: p.id, tax: null, cut: null }, ...everyPlan(p.id)]) {
        const back = decodePlan(opts, p.id, encodePlan(pl));
        expect(back).toEqual(pl);
        expect(payFor(opts, back!)).toEqual(payFor(opts, pl));
      }
    }
  });

  it("turns away anything that is not a plan this data can cost", () => {
    for (const seg of [
      "",
      "tax",
      "tax-income_tax_basic-30",
      "tax-income_tax_basic-050",
      "tax-income_tax_basic-0",
      "tax-no_such_lever-100",
      "cut-debt_interest-50",
      "cut-defence-50.tax-income_tax_basic-50",
      "tax-income_tax_basic-75.cut-defence-50",
      "tax-income_tax_basic-50.tax-vat_standard-50",
      "tax-income_tax_basic-50.cut-defence-25.cut-health-25",
      "borrow.tax-income_tax_basic-50",
      "TAX-INCOME_TAX_BASIC-100",
    ])
      expect(decodePlan(opts, BUS_CAP, seg), seg).toBeNull();
    expect(decodePlan(opts, "no-such-pledge", ALL_BORROWED)).toBeNull();
    expect(decodePlan(opts, "uk-green-wealth-tax-2024", ALL_BORROWED)).toBeNull();
  });
});
