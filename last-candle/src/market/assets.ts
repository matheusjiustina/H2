/**
 * Asset registry.
 *
 * IMPORTANT: everything here is fictional gameplay tuning. Names are used as
 * plain text only; there are no contracts, real prices, official logos or
 * on-chain data. The personalities below are game rules, not descriptions of
 * the real projects. Replace/extend this table later with verified material
 * (display name, emblem art, etc.) without touching the engine.
 */
export type EmblemShape = "delta" | "hook" | "ring" | "bolt" | "whisker";

export interface AssetConfig {
  id: string;
  symbol: string;
  name: string;
  /** Short line shown in the terminal ("personality" of the simulation). */
  blurb: string;
  emblem: { shape: EmblemShape; color: string };
  startPrice: number;
  /** Long-run anchor the price weakly reverts to (log space). Defaults to startPrice. */
  anchorPrice?: number;
  decimals: number;
  /** Base per-tick log-return volatility. */
  tickVol: number;
  /** AR(1) persistence of the drift term (0 = none, 0.999 = very long trends). */
  trendPersistence: number;
  /** Std-dev of drift innovations. */
  trendVol: number;
  /** Mean reversion strength toward the anchor per tick. */
  meanReversion: number;
  /** Volatility clustering (0 = none). */
  volCluster: number;
  /** Probability per tick of a jump, and the jump std-dev (log). */
  jumpChance: number;
  jumpSize: number;
  /** Directional bursts: chance per tick, length (ticks), per-tick push, and odds of a reversal afterwards. */
  burstChance: number;
  burstTicks: [number, number];
  burstStrength: number;
  reversalChance: number;
  /** Quiet regimes: chance per tick to enter, length, and volatility multiplier while quiet. */
  quietChance: number;
  quietTicks: [number, number];
  quietVolMult: number;
  /** Extra jump chance on the tick a quiet regime ends. */
  quietBreakJump: number;
  /** Bid/ask spread in basis points (full spread). */
  spreadBps: number;
  /** Mean simulated volume per tick, in tokens. */
  baseVolume: number;
}

export const MARKET_RULES = {
  ticksPerSecond: 4,
  /** One candle = one in-game minute = 40 ticks = 10 real seconds. */
  ticksPerCandle: 40,
  /** Virtual fee on notional, both sides. */
  feeRate: 0.001,
  historyCandles: 240,
  /** Candles generated before the first night so charts are never empty. */
  warmupCandles: 150,
} as const;

export const ASSETS: AssetConfig[] = [
  {
    id: "delta",
    symbol: "DELTA",
    name: "Delta",
    blurb: "Relatively balanced moves.",
    emblem: { shape: "delta", color: "#7fb3ff" },
    startPrice: 12.4,
    decimals: 3,
    tickVol: 0.0006,
    trendPersistence: 0.985,
    trendVol: 0.000005,
    meanReversion: 0.00002,
    volCluster: 0.25,
    jumpChance: 0.0006,
    jumpSize: 0.005,
    burstChance: 0.0004,
    burstTicks: [10, 24],
    burstStrength: 0.0008,
    reversalChance: 0.25,
    quietChance: 0.0008,
    quietTicks: [40, 90],
    quietVolMult: 0.6,
    quietBreakJump: 0.1,
    spreadBps: 12,
    baseVolume: 180,
  },
  {
    id: "hookr",
    symbol: "HOOKR",
    name: "HOOKR",
    blurb: "Fast accelerations and reversals.",
    emblem: { shape: "hook", color: "#ffb35c" },
    startPrice: 0.8421,
    decimals: 4,
    tickVol: 0.001,
    trendPersistence: 0.95,
    trendVol: 0.000008,
    meanReversion: 0.00004,
    volCluster: 0.35,
    jumpChance: 0.0008,
    jumpSize: 0.008,
    burstChance: 0.0015,
    burstTicks: [8, 20],
    burstStrength: 0.0022,
    reversalChance: 0.7,
    quietChance: 0.0004,
    quietTicks: [30, 60],
    quietVolMult: 0.7,
    quietBreakJump: 0.2,
    spreadBps: 20,
    baseVolume: 2600,
  },
  {
    id: "pons",
    symbol: "PONS",
    name: "Pons",
    blurb: "Gradual, longer trends.",
    emblem: { shape: "ring", color: "#9be3b0" },
    startPrice: 3.215,
    decimals: 3,
    tickVol: 0.00045,
    trendPersistence: 0.998,
    trendVol: 0.0000015,
    meanReversion: 0.00002,
    volCluster: 0.15,
    jumpChance: 0.0003,
    jumpSize: 0.004,
    burstChance: 0.0002,
    burstTicks: [20, 40],
    burstStrength: 0.0005,
    reversalChance: 0.15,
    quietChance: 0.0006,
    quietTicks: [60, 120],
    quietVolMult: 0.7,
    quietBreakJump: 0.05,
    spreadBps: 14,
    baseVolume: 640,
  },
  {
    id: "stonkbonker",
    symbol: "STONK",
    name: "Stonkbonker",
    blurb: "High volatility. Bring a helmet.",
    emblem: { shape: "bolt", color: "#ff7a7a" },
    startPrice: 0.04213,
    decimals: 5,
    tickVol: 0.0019,
    trendPersistence: 0.97,
    trendVol: 0.000012,
    meanReversion: 0.00006,
    volCluster: 0.45,
    jumpChance: 0.002,
    jumpSize: 0.014,
    burstChance: 0.0012,
    burstTicks: [6, 18],
    burstStrength: 0.0032,
    reversalChance: 0.45,
    quietChance: 0.0002,
    quietTicks: [20, 40],
    quietVolMult: 0.8,
    quietBreakJump: 0.2,
    spreadBps: 35,
    baseVolume: 52000,
  },
  {
    id: "cashcat",
    symbol: "CCAT",
    name: "Cashcat",
    blurb: "Long naps, then sudden pounces.",
    emblem: { shape: "whisker", color: "#e8d27a" },
    startPrice: 1.087,
    decimals: 4,
    tickVol: 0.0008,
    trendPersistence: 0.97,
    trendVol: 0.000005,
    meanReversion: 0.00003,
    volCluster: 0.3,
    jumpChance: 0.0005,
    jumpSize: 0.009,
    burstChance: 0.00035,
    burstTicks: [6, 14],
    burstStrength: 0.0042,
    reversalChance: 0.35,
    quietChance: 0.004,
    quietTicks: [120, 360],
    quietVolMult: 0.18,
    quietBreakJump: 0.5,
    spreadBps: 18,
    baseVolume: 1800,
  },
];

export const assetById = (id: string): AssetConfig => {
  const a = ASSETS.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown asset ${id}`);
  return a;
};
