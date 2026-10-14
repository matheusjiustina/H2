import { MARKET_RULES } from "./assets";
import type { Quote } from "./MarketEngine";

export interface Position {
  assetId: string;
  qty: number;
  /** Total cost including buy fees for the units currently held. */
  costBasis: number;
  /** Volume-weighted average fill price (ask) for units currently held, excluding fees. */
  avgEntry: number;
}

export interface TradeRecord {
  readonly id: number;
  readonly side: "BUY" | "SELL";
  readonly assetId: string;
  readonly symbol: string;
  readonly qty: number;
  /** Fill price (ask for buys, bid for sells). */
  readonly price: number;
  readonly notional: number;
  readonly fee: number;
  /** Market minute, in-game clock label (minute of day) and night number at fill time. */
  readonly minute: number;
  readonly label: number;
  readonly night: number;
  readonly station: string;
  /** SELL only: realized P/L including the buy fees of the sold units and this sell fee. */
  readonly realizedPnl: number | null;
  /** SELL only: average entry price of the sold units and their fee-inclusive cost. */
  readonly avgEntry: number | null;
  readonly costOfSold: number | null;
  readonly closedPosition: boolean;
}

export type OrderResult = { ok: true; trade: TradeRecord } | { ok: false; reason: string };

export interface TradeMeta {
  symbol: string;
  minute: number;
  label: number;
  night: number;
  station: string;
}

export interface SavedPortfolio {
  v: 1;
  cash: number;
  positions: Position[];
  history: TradeRecord[];
  nextId: number;
  realizedTotal: number;
  feesTotal: number;
  floatsReceived: number;
}

const EPS = 1e-9;
const MIN_ORDER = 1;
const HISTORY_CAP = 300;
const clean = (x: number) => Math.round(x * 1e8) / 1e8;

/**
 * Spot-only virtual account. All mutations go through buy()/sell(), which
 * validate first and only then apply the change atomically. Completed trade
 * records are frozen and never edited afterwards.
 */
export class Portfolio {
  cash: number;
  readonly feeRate: number;
  private positions = new Map<string, Position>();
  private historyList: TradeRecord[] = [];
  private nextId = 1;
  realizedTotal = 0;
  feesTotal = 0;
  floatsReceived = 0;

  constructor(startingCash = 1000, feeRate: number = MARKET_RULES.feeRate) {
    this.cash = startingCash;
    this.feeRate = feeRate;
  }

  get history(): readonly TradeRecord[] {
    return this.historyList;
  }

  position(assetId: string): Position | null {
    return this.positions.get(assetId) ?? null;
  }

  allPositions(): Position[] {
    return [...this.positions.values()];
  }

  /** Largest notional that can be bought with available cash after the fee. */
  maxBuyNotional(): number {
    return Math.max(0, Math.floor((this.cash / (1 + this.feeRate)) * 100) / 100);
  }

  buy(assetId: string, notional: number, quote: Quote, meta: TradeMeta): OrderResult {
    if (!Number.isFinite(notional) || notional <= 0) return { ok: false, reason: "Enter an order size." };
    if (notional < MIN_ORDER) return { ok: false, reason: `Minimum order is $${MIN_ORDER.toFixed(2)}.` };
    if (!(quote.ask > 0)) return { ok: false, reason: "No price available." };
    const fee = clean(notional * this.feeRate);
    const total = clean(notional + fee);
    if (total > this.cash + EPS) {
      return { ok: false, reason: `Not enough balance. Need $${total.toFixed(2)} incl. fee, have $${this.cash.toFixed(2)}.` };
    }
    const qty = notional / quote.ask;
    const pos = this.positions.get(assetId) ?? { assetId, qty: 0, costBasis: 0, avgEntry: 0 };
    const newQty = pos.qty + qty;
    pos.avgEntry = (pos.avgEntry * pos.qty + quote.ask * qty) / newQty;
    pos.qty = newQty;
    pos.costBasis = clean(pos.costBasis + total);
    this.positions.set(assetId, pos);
    this.cash = Math.max(0, clean(this.cash - total));
    this.feesTotal = clean(this.feesTotal + fee);
    const trade: TradeRecord = Object.freeze({
      id: this.nextId++,
      side: "BUY",
      assetId,
      symbol: meta.symbol,
      qty,
      price: quote.ask,
      notional,
      fee,
      minute: meta.minute,
      label: meta.label,
      night: meta.night,
      station: meta.station,
      realizedPnl: null,
      avgEntry: null,
      costOfSold: null,
      closedPosition: false,
    });
    this.push(trade);
    return { ok: true, trade };
  }

  /** Sell an exact token quantity. Selling more than held is rejected, never clamped silently. */
  sell(assetId: string, qty: number, quote: Quote, meta: TradeMeta): OrderResult {
    const pos = this.positions.get(assetId);
    if (!pos || pos.qty <= 0) return { ok: false, reason: `You don't hold any ${meta.symbol}.` };
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: "Enter an order size." };
    if (qty > pos.qty * (1 + 1e-9) + 1e-12) {
      return { ok: false, reason: `Not enough ${meta.symbol}. You hold ${formatQty(pos.qty)}.` };
    }
    if (!(quote.bid > 0)) return { ok: false, reason: "No price available." };
    const closing = qty >= pos.qty * (1 - 1e-9);
    const q = closing ? pos.qty : qty;
    const notional = q * quote.bid;
    if (notional < 0.01) return { ok: false, reason: "Order too small." };
    const fee = clean(notional * this.feeRate);
    const costOfSold = closing ? pos.costBasis : clean(pos.costBasis * (q / pos.qty));
    const realized = clean(notional - fee - costOfSold);
    const avgEntry = pos.avgEntry;
    this.cash = clean(this.cash + notional - fee);
    this.realizedTotal = clean(this.realizedTotal + realized);
    this.feesTotal = clean(this.feesTotal + fee);
    if (closing) {
      this.positions.delete(assetId);
    } else {
      pos.qty -= q;
      pos.costBasis = clean(pos.costBasis - costOfSold);
    }
    const trade: TradeRecord = Object.freeze({
      id: this.nextId++,
      side: "SELL",
      assetId,
      symbol: meta.symbol,
      qty: q,
      price: quote.bid,
      notional,
      fee,
      minute: meta.minute,
      label: meta.label,
      night: meta.night,
      station: meta.station,
      realizedPnl: realized,
      avgEntry,
      costOfSold,
      closedPosition: closing,
    });
    this.push(trade);
    return { ok: true, trade };
  }

  /** Sell a USD notional worth of tokens at the bid. Rejects if that exceeds holdings. */
  sellNotional(assetId: string, notional: number, quote: Quote, meta: TradeMeta): OrderResult {
    if (!Number.isFinite(notional) || notional <= 0) return { ok: false, reason: "Enter an order size." };
    if (!(quote.bid > 0)) return { ok: false, reason: "No price available." };
    return this.sell(assetId, notional / quote.bid, quote, meta);
  }

  /** Value if liquidated now at the bid, after the exit fee. */
  liquidationValue(assetId: string, quote: Quote): number {
    const pos = this.positions.get(assetId);
    if (!pos) return 0;
    return pos.qty * quote.bid * (1 - this.feeRate);
  }

  /** Unrealized P/L if closed now (bid, exit fee included) — equals realized P/L of an immediate full sell. */
  unrealized(assetId: string, quote: Quote): number {
    const pos = this.positions.get(assetId);
    if (!pos) return 0;
    return this.liquidationValue(assetId, quote) - pos.costBasis;
  }

  equity(quoteOf: (id: string) => Quote): number {
    let e = this.cash;
    for (const p of this.positions.values()) e += this.liquidationValue(p.assetId, quoteOf(p.assetId));
    return e;
  }

  unrealizedTotal(quoteOf: (id: string) => Quote): number {
    let u = 0;
    for (const p of this.positions.values()) u += this.unrealized(p.assetId, quoteOf(p.assetId));
    return u;
  }

  /** Owner's float when the player is broke and helps out. Tracked separately, never mixed into P/L. */
  receiveFloat(amount: number): void {
    if (!(amount > 0)) return;
    this.cash = clean(this.cash + amount);
    this.floatsReceived = clean(this.floatsReceived + amount);
  }

  trade(id: number): TradeRecord | undefined {
    return this.historyList.find((t) => t.id === id);
  }

  lastClosedTrade(): TradeRecord | undefined {
    for (let i = this.historyList.length - 1; i >= 0; i--) {
      if (this.historyList[i].side === "SELL") return this.historyList[i];
    }
    return undefined;
  }

  private push(t: TradeRecord): void {
    this.historyList.push(t);
    if (this.historyList.length > HISTORY_CAP) this.historyList.splice(0, this.historyList.length - HISTORY_CAP);
  }

  serialize(): SavedPortfolio {
    return {
      v: 1,
      cash: this.cash,
      positions: this.allPositions().map((p) => ({ ...p })),
      history: this.historyList.map((t) => ({ ...t })),
      nextId: this.nextId,
      realizedTotal: this.realizedTotal,
      feesTotal: this.feesTotal,
      floatsReceived: this.floatsReceived,
    };
  }

  restore(d: SavedPortfolio): boolean {
    if (!d || d.v !== 1 || !Number.isFinite(d.cash)) return false;
    this.cash = d.cash;
    this.positions.clear();
    for (const p of d.positions) {
      if (p.qty > 0 && Number.isFinite(p.costBasis)) this.positions.set(p.assetId, { ...p });
    }
    this.historyList = d.history.map((t) => Object.freeze({ ...t }));
    this.nextId = d.nextId;
    this.realizedTotal = d.realizedTotal;
    this.feesTotal = d.feesTotal;
    this.floatsReceived = d.floatsReceived ?? 0;
    return true;
  }
}

export function formatQty(q: number): string {
  if (q >= 1e6) return (q / 1e6).toFixed(2) + "M";
  if (q >= 1e4) return (q / 1e3).toFixed(1) + "K";
  if (q >= 100) return q.toFixed(1);
  if (q >= 1) return q.toFixed(3);
  return q.toFixed(4);
}
