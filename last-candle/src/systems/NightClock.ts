import type { MarketEngine } from "../market/MarketEngine";

export const NIGHT_START = 100; // 01:40
export const LAST_CALL = 280; // 04:40
export const NIGHT_END = 300; // 05:00
export const ARRIVAL = 125; // 02:05

/**
 * In-game clock tied to market candles: one candle = one in-game minute
 * (10 real seconds). A night runs 01:40 → 05:00 (~33 real minutes).
 */
export class NightClock {
  night = 1;
  /** Market minute index at which this night started. */
  startMarketMinute = 0;
  ended = false;

  constructor(private market: MarketEngine) {}

  get minuteOfDay(): number {
    return NIGHT_START + Math.max(0, this.market.minute - this.startMarketMinute);
  }

  /** Smooth minute including the current candle's progress (for HUD). */
  get smoothMinute(): number {
    const tickInCandle = this.market.tick % this.market.rules.ticksPerCandle;
    return this.minuteOfDay + tickInCandle / this.market.rules.ticksPerCandle;
  }

  startNight(n: number) {
    this.night = n;
    this.startMarketMinute = this.market.minute + 1; // next candle opens the night
    this.ended = false;
  }

  label(): { label: number; night: number } {
    return { label: this.minuteOfDay, night: this.night };
  }

  serialize() {
    return { night: this.night, startMarketMinute: this.startMarketMinute };
  }

  restore(d: { night: number; startMarketMinute: number } | undefined) {
    if (!d) return;
    this.night = d.night;
    this.startMarketMinute = d.startMarketMinute;
  }
}
