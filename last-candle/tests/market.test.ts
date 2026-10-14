import { describe, expect, it } from "vitest";
import { ASSETS, MARKET_RULES } from "../src/market/assets";
import { MarketEngine } from "../src/market/MarketEngine";
import { Portfolio } from "../src/market/Portfolio";

const meta = { symbol: "TEST", minute: 0, label: 120, night: 1, station: "PC 03" };

describe("MarketEngine", () => {
  it("keeps every price positive and every candle coherent over a long run", () => {
    const m = new MarketEngine(42);
    m.warmup(100);
    for (let i = 0; i < 40 * 600; i++) m.step();
    for (const a of ASSETS) {
      const cs = m.candles(a.id);
      expect(cs.length).toBe(MARKET_RULES.historyCandles);
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        expect(c.o).toBeGreaterThan(0);
        expect(c.l).toBeGreaterThan(0);
        expect(c.h).toBeGreaterThanOrEqual(Math.max(c.o, c.c) - 1e-12);
        expect(c.l).toBeLessThanOrEqual(Math.min(c.o, c.c) + 1e-12);
        expect(c.v).toBeGreaterThan(0);
        if (i > 0) {
          expect(c.t).toBe(cs[i - 1].t + 1);
          expect(c.o).toBeCloseTo(cs[i - 1].c, 12);
        }
      }
      const q = m.quote(a.id);
      expect(q.bid).toBeLessThan(q.ask);
      expect(q.bid).toBeGreaterThan(0);
    }
  });

  it("advances identically regardless of how frame time is chunked", () => {
    const a = new MarketEngine(7);
    const b = new MarketEngine(7);
    for (let i = 0; i < 300; i++) a.advance(1 / 60);
    for (let i = 0; i < 50; i++) b.advance(0.1);
    expect(a.tick).toBe(b.tick);
    for (const id of a.assetIds) expect(a.price(id)).toBe(b.price(id));
  });

  it("restores from a save and continues on the exact same path", () => {
    const a = new MarketEngine(99);
    a.warmup(60);
    for (let i = 0; i < 1234; i++) a.step();
    const saved = JSON.parse(JSON.stringify(a.serialize()));
    const b = new MarketEngine(1);
    b.warmup(60, 5);
    expect(b.restore(saved)).toBe(true);
    for (let i = 0; i < 500; i++) {
      a.step();
      b.step();
    }
    for (const id of a.assetIds) expect(b.price(id)).toBeCloseTo(a.price(id), 9);
  });

  it("gives assets distinct personalities from the same engine", () => {
    const m = new MarketEngine(5);
    const sumAbs: Record<string, number> = {};
    const prev: Record<string, number> = {};
    for (const id of m.assetIds) {
      sumAbs[id] = 0;
      prev[id] = m.price(id);
    }
    for (let i = 0; i < 40 * 400; i++) {
      m.step();
      for (const id of m.assetIds) {
        const p = m.price(id);
        sumAbs[id] += Math.abs(Math.log(p / prev[id]));
        prev[id] = p;
      }
    }
    expect(sumAbs.stonkbonker).toBeGreaterThan(sumAbs.delta);
    expect(sumAbs.pons).toBeLessThan(sumAbs.delta);
  });
});

describe("Portfolio", () => {
  const q = (mid: number, spread = 0.002) => ({ mid, bid: mid * (1 - spread / 2), ask: mid * (1 + spread / 2) });

  it("rejects buys above balance and leaves state untouched", () => {
    const p = new Portfolio(100);
    const r = p.buy("delta", 100, q(10), meta);
    expect(r.ok).toBe(false);
    expect(p.cash).toBe(100);
    expect(p.position("delta")).toBeNull();
    expect(p.history.length).toBe(0);
    const max = p.maxBuyNotional();
    expect(p.buy("delta", max, q(10), meta).ok).toBe(true);
    expect(p.cash).toBeGreaterThanOrEqual(0);
    expect(p.cash).toBeLessThan(0.02);
  });

  it("rejects sells above holdings", () => {
    const p = new Portfolio(1000);
    p.buy("hookr", 100, q(1), meta);
    const held = p.position("hookr")!.qty;
    const r = p.sell("hookr", held * 1.01, q(1), meta);
    expect(r.ok).toBe(false);
    expect(p.position("hookr")!.qty).toBe(held);
    expect(p.sell("pons", 1, q(1), meta).ok).toBe(false);
  });

  it("round trip at an unchanged mid loses exactly spread + fees", () => {
    const p = new Portfolio(1000);
    const quote = q(2, 0.004);
    p.buy("delta", 200, quote, meta);
    const qty = p.position("delta")!.qty;
    const r = p.sell("delta", qty, quote, meta);
    expect(r.ok).toBe(true);
    const sellNotional = qty * quote.bid;
    const expected = sellNotional * (1 - 0.001) - 200 * 1.001;
    expect(p.realizedTotal).toBeCloseTo(expected, 6);
    expect(p.cash).toBeCloseTo(1000 + expected, 6);
    expect(p.position("delta")).toBeNull();
  });

  it("computes average entry, partial realized P/L and unrealized consistently", () => {
    const p = new Portfolio(10000);
    p.buy("pons", 1000, q(10, 0), meta);
    p.buy("pons", 1000, q(20, 0), meta);
    const pos = p.position("pons")!;
    expect(pos.qty).toBeCloseTo(150, 9);
    expect(pos.avgEntry).toBeCloseTo(2000 / 150, 9);
    expect(pos.costBasis).toBeCloseTo(2002, 9);

    const quote = q(16, 0);
    const unreal = p.unrealized("pons", quote);
    expect(unreal).toBeCloseTo(150 * 16 * 0.999 - 2002, 6);

    const r = p.sell("pons", 50, quote, meta);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.trade.realizedPnl).toBeCloseTo(50 * 16 * 0.999 - 2002 / 3, 6);
      expect(Object.isFrozen(r.trade)).toBe(true);
    }
    // Remaining unrealized + realized == what a full liquidation would have produced.
    const rest = p.unrealized("pons", quote);
    expect(rest + p.realizedTotal).toBeCloseTo(unreal, 6);
  });

  it("serializes and restores without changing history", () => {
    const p = new Portfolio(500);
    p.buy("cashcat", 120, q(1.2), meta);
    p.sell("cashcat", p.position("cashcat")!.qty / 2, q(1.3), meta);
    const s = JSON.parse(JSON.stringify(p.serialize()));
    const p2 = new Portfolio();
    expect(p2.restore(s)).toBe(true);
    expect(p2.cash).toBe(p.cash);
    expect(p2.history).toEqual(p.history);
    expect(p2.position("cashcat")!.qty).toBe(p.position("cashcat")!.qty);
  });
});
