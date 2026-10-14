import { Rng, type RngState } from "../core/rng";
import { ASSETS, MARKET_RULES, type AssetConfig } from "./assets";

/** One OHLCV candle. `t` is an absolute market-minute index, `label` the in-game minute of day used on axes. */
export interface Candle {
  t: number;
  label: number;
  /** Night number the candle belongs to (0 = warm-up history). Used to draw night separators. */
  night: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface Quote {
  mid: number;
  bid: number;
  ask: number;
}

type Regime = "normal" | "quiet" | "burst";

interface AssetState {
  cfg: AssetConfig;
  logP: number;
  logAnchor: number;
  drift: number;
  h: number; // GARCH-like variance multiplier
  lastZ: number;
  regime: Regime;
  regimeLeft: number;
  burstDir: number;
  burstScale: number;
  pendingReversal: boolean;
  candles: Candle[];
  ring: number[]; // last N log prices, for big-move detection
  lastBigMoveTick: number;
}

export interface BigMove {
  assetId: string;
  direction: 1 | -1;
  pct: number;
}

interface SavedAsset {
  id: string;
  logP: number;
  drift: number;
  h: number;
  lastZ: number;
  regime: Regime;
  regimeLeft: number;
  burstDir: number;
  burstScale: number;
  pendingReversal: boolean;
  candles: number[][];
  ring: number[];
  lastBigMoveTick: number;
}

export interface SavedMarket {
  v: 1;
  tick: number;
  minute: number;
  rng: RngState;
  spare?: number | null;
  assets: SavedAsset[];
}

const RING = 24;

/**
 * The single authoritative market. Every chart, NPC and terminal reads from
 * one instance of this class. Advancing is driven by a fixed-tick accumulator,
 * so the outcome does not depend on frame rate. Player positions are never an
 * input to price generation: nothing here is rigged toward a win or a loss.
 */
export class MarketEngine {
  readonly rules = MARKET_RULES;
  tick = 0;
  /** Absolute minute (candle) index. */
  minute = 0;
  private rng: Rng;
  private states = new Map<string, AssetState>();
  private acc = 0;
  /** Provides the in-game minute-of-day label and night number for new candles. */
  labelProvider: () => { label: number; night: number } = () => ({ label: this.minute % 1440, night: 1 });
  onBigMove: ((m: BigMove) => void) | null = null;
  onCandle: ((minute: number) => void) | null = null;

  constructor(seed = 20261013, assets: AssetConfig[] = ASSETS) {
    this.rng = new Rng(seed);
    for (const cfg of assets) {
      const anchor = Math.log(cfg.anchorPrice ?? cfg.startPrice);
      this.states.set(cfg.id, {
        cfg,
        logP: Math.log(cfg.startPrice),
        logAnchor: anchor,
        drift: 0,
        h: 1,
        lastZ: 0,
        regime: "normal",
        regimeLeft: 0,
        burstDir: 1,
        burstScale: 1,
        pendingReversal: false,
        candles: [],
        ring: [],
        lastBigMoveTick: -1e9,
      });
    }
  }

  /** Start over with a fresh seed (new game). */
  reset(seed: number) {
    this.rng = new Rng(seed);
    this.tick = 0;
    this.minute = 0;
    this.acc = 0;
    for (const s of this.states.values()) {
      s.logP = Math.log(s.cfg.startPrice);
      s.drift = 0;
      s.h = 1;
      s.lastZ = 0;
      s.regime = "normal";
      s.regimeLeft = 0;
      s.burstDir = 1;
      s.burstScale = 1;
      s.pendingReversal = false;
      s.candles = [];
      s.ring = [];
      s.lastBigMoveTick = -1e9;
    }
  }

  get assetIds(): string[] {
    return [...this.states.keys()];
  }

  config(id: string): AssetConfig {
    return this.state(id).cfg;
  }

  private state(id: string): AssetState {
    const s = this.states.get(id);
    if (!s) throw new Error(`Unknown asset ${id}`);
    return s;
  }

  /**
   * Generate pre-session history so charts start populated. Labels count back
   * from the provided start minute-of-day. Big-move callbacks are muted.
   */
  warmup(startLabel: number, candles: number = MARKET_RULES.warmupCandles): void {
    const cb = this.onBigMove;
    const cc = this.onCandle;
    const lp = this.labelProvider;
    this.onBigMove = null;
    this.onCandle = null;
    let i = 0;
    this.labelProvider = () => ({ label: (((startLabel - candles + i) % 1440) + 1440) % 1440, night: 0 });
    for (i = 0; i < candles; i++) {
      for (let k = 0; k < MARKET_RULES.ticksPerCandle; k++) this.step();
    }
    // Start the first live candle cleanly at the boundary.
    this.labelProvider = lp;
    this.onBigMove = cb;
    this.onCandle = cc;
    for (const s of this.states.values()) s.lastBigMoveTick = this.tick;
  }

  /** Advance by real seconds. Returns number of ticks processed. */
  advance(dtSeconds: number): number {
    if (!(dtSeconds > 0)) return 0;
    // Clamp huge gaps (tab in background etc.) — we never fast-forward silently.
    this.acc += Math.min(dtSeconds, 0.5);
    const tickDt = 1 / MARKET_RULES.ticksPerSecond;
    let n = 0;
    // Small epsilon so float accumulation of e.g. 1/60 steps never drops a tick.
    while (this.acc >= tickDt - 1e-9) {
      this.acc = Math.max(0, this.acc - tickDt);
      this.step();
      n++;
    }
    return n;
  }

  /** Fraction (0..1) of the way to the next tick — for smooth interpolation if needed. */
  get tickAlpha(): number {
    return this.acc * MARKET_RULES.ticksPerSecond;
  }

  step(): void {
    const tpc = MARKET_RULES.ticksPerCandle;
    const newCandle = this.tick % tpc === 0;
    if (newCandle && this.tick > 0) this.minute++;
    const lbl = newCandle ? this.labelProvider() : null;
    for (const s of this.states.values()) {
      this.stepAsset(s, newCandle, lbl);
    }
    this.tick++;
    if (newCandle && this.onCandle) this.onCandle(this.minute);
  }

  private stepAsset(s: AssetState, newCandle: boolean, lbl: { label: number; night: number } | null): void {
    const c = s.cfg;
    const r = this.rng;

    // Regime transitions
    if (s.regime === "normal") {
      if (r.chance(c.quietChance)) {
        s.regime = "quiet";
        s.regimeLeft = r.int(c.quietTicks[0], c.quietTicks[1]);
      } else if (r.chance(c.burstChance)) {
        this.startBurst(s, r.chance(0.5) ? 1 : -1, 1);
      } else if (s.pendingReversal) {
        s.pendingReversal = false;
        this.startBurst(s, -s.burstDir, 0.8);
      }
    } else {
      s.regimeLeft--;
      if (s.regimeLeft <= 0) {
        const was = s.regime;
        s.regime = "normal";
        if (was === "burst") {
          s.pendingReversal = r.chance(c.reversalChance);
        } else if (was === "quiet" && r.chance(c.quietBreakJump)) {
          this.startBurst(s, r.chance(0.5) ? 1 : -1, 1.25);
        }
      }
    }

    // Drift (trend) process
    s.drift = c.trendPersistence * s.drift + c.trendVol * r.normal();
    const driftCap = c.tickVol * 0.25;
    if (s.drift > driftCap) s.drift = driftCap;
    if (s.drift < -driftCap) s.drift = -driftCap;

    // Volatility clustering
    const alpha = 0.1 * c.volCluster;
    const beta = 0.88;
    s.h = Math.min(4, Math.max(0.3, 1 - alpha - beta + alpha * s.lastZ * s.lastZ + beta * s.h));
    let vol = c.tickVol * Math.sqrt(s.h);
    if (s.regime === "quiet") vol *= c.quietVolMult;

    const z = r.normal();
    let ret = s.drift + vol * z;
    if (s.regime === "burst") ret += s.burstDir * c.burstStrength * s.burstScale * (1 + 0.35 * r.normal());
    if (s.regime !== "quiet" && r.chance(c.jumpChance)) ret += c.jumpSize * r.normal();

    // Mean reversion toward the anchor, stronger far away, keeps a long session bounded.
    const dev = s.logP - s.logAnchor;
    ret -= c.meanReversion * dev;
    if (Math.abs(dev) > Math.log(5)) ret -= 0.002 * Math.sign(dev);

    s.lastZ = (ret - s.drift) / Math.max(1e-9, c.tickVol);
    s.logP += ret;
    const price = Math.exp(s.logP);

    // Volume
    const absZ = Math.min(10, Math.abs(ret) / c.tickVol);
    const vol24 = c.baseVolume * (0.55 + 0.9 * r.next()) * (1 + 0.32 * absZ) * (s.regime === "quiet" ? 0.45 : 1);

    // Candles
    if (newCandle || s.candles.length === 0) {
      const prevClose = s.candles.length ? s.candles[s.candles.length - 1].c : price;
      const l = lbl ?? this.labelProvider();
      s.candles.push({
        t: this.minute,
        label: l.label,
        night: l.night,
        o: prevClose,
        h: Math.max(prevClose, price),
        l: Math.min(prevClose, price),
        c: price,
        v: vol24,
      });
      if (s.candles.length > MARKET_RULES.historyCandles) s.candles.splice(0, s.candles.length - MARKET_RULES.historyCandles);
    } else {
      const cd = s.candles[s.candles.length - 1];
      if (price > cd.h) cd.h = price;
      if (price < cd.l) cd.l = price;
      cd.c = price;
      cd.v += vol24;
    }

    // Big-move detection on a short rolling window.
    s.ring.push(s.logP);
    if (s.ring.length > RING) s.ring.shift();
    if (s.ring.length === RING && this.tick - s.lastBigMoveTick > 240) {
      const move = s.logP - s.ring[0];
      const sigma = c.tickVol * Math.sqrt(RING);
      const pct = Math.exp(move) - 1;
      if (Math.abs(move) > 4.2 * sigma && Math.abs(pct) > 0.022) {
        s.lastBigMoveTick = this.tick;
        this.onBigMove?.({ assetId: c.id, direction: move > 0 ? 1 : -1, pct });
      }
    }
  }

  private startBurst(s: AssetState, dir: number, scale: number): void {
    const c = s.cfg;
    s.regime = "burst";
    s.regimeLeft = this.rng.int(c.burstTicks[0], c.burstTicks[1]);
    s.burstDir = dir;
    s.burstScale = scale;
  }

  // ---------------------------------------------------------------- queries

  price(id: string): number {
    return Math.exp(this.state(id).logP);
  }

  quote(id: string): Quote {
    const s = this.state(id);
    const mid = Math.exp(s.logP);
    const half = (mid * s.cfg.spreadBps) / 20000;
    return { mid, bid: mid - half, ask: mid + half };
  }

  candles(id: string): readonly Candle[] {
    return this.state(id).candles;
  }

  /** % change of mid versus the close `back` candles ago (or the oldest available). */
  changePct(id: string, back = 60): number {
    const cs = this.state(id).candles;
    if (cs.length < 2) return 0;
    const ref = cs[Math.max(0, cs.length - 1 - back)].c;
    return this.price(id) / ref - 1;
  }

  /** Simulated volume summed over the last `back` candles. */
  volume(id: string, back = 60): number {
    const cs = this.state(id).candles;
    let v = 0;
    for (let i = Math.max(0, cs.length - back); i < cs.length; i++) v += cs[i].v;
    return v;
  }

  /** Log return over the last n candles (incl. current). Used by NPC "strategies". */
  recentReturn(id: string, nCandles: number): number {
    const cs = this.state(id).candles;
    if (cs.length < 2) return 0;
    const ref = cs[Math.max(0, cs.length - 1 - nCandles)].o;
    return this.price(id) / ref - 1;
  }

  regime(id: string): Regime {
    return this.state(id).regime;
  }

  // ------------------------------------------------------------ persistence

  serialize(): SavedMarket {
    const r6 = (x: number) => Number(x.toPrecision(10));
    return {
      v: 1,
      tick: this.tick,
      minute: this.minute,
      rng: this.rng.getState(),
      spare: this.rng.spareNormal,
      assets: [...this.states.values()].map((s) => ({
        id: s.cfg.id,
        logP: s.logP,
        drift: s.drift,
        h: s.h,
        lastZ: s.lastZ,
        regime: s.regime,
        regimeLeft: s.regimeLeft,
        burstDir: s.burstDir,
        burstScale: s.burstScale,
        pendingReversal: s.pendingReversal,
        candles: s.candles.map((c) => [c.t, c.label, c.night, r6(c.o), r6(c.h), r6(c.l), r6(c.c), Math.round(c.v)]),
        ring: s.ring.slice(),
        lastBigMoveTick: s.lastBigMoveTick,
      })),
    };
  }

  restore(data: SavedMarket): boolean {
    if (!data || data.v !== 1 || !Array.isArray(data.assets)) return false;
    for (const a of data.assets) {
      const s = this.states.get(a.id);
      if (!s) continue; // asset removed from registry — ignore
      if (!Number.isFinite(a.logP)) return false;
      s.logP = a.logP;
      s.drift = a.drift;
      s.h = a.h;
      s.lastZ = a.lastZ;
      s.regime = a.regime;
      s.regimeLeft = a.regimeLeft;
      s.burstDir = a.burstDir;
      s.burstScale = a.burstScale;
      s.pendingReversal = a.pendingReversal;
      s.candles = a.candles.map((r) => ({ t: r[0], label: r[1], night: r[2], o: r[3], h: r[4], l: r[5], c: r[6], v: r[7] }));
      // Make the live candle consistent with the restored exact price.
      const last = s.candles[s.candles.length - 1];
      if (last) {
        const p = Math.exp(s.logP);
        last.c = p;
        last.h = Math.max(last.h, p);
        last.l = Math.min(last.l, p);
      }
      s.ring = a.ring.slice();
      s.lastBigMoveTick = a.lastBigMoveTick;
    }
    this.tick = data.tick;
    this.minute = data.minute;
    this.rng.setState(data.rng, data.spare ?? null);
    this.acc = 0;
    return true;
  }
}
