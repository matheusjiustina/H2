import type { TradeRecord } from "../market/Portfolio";

/** Typed game-wide event map. Systems talk through this instead of importing each other. */
export interface GameEvents {
  "market:bigMove": { assetId: string; direction: 1 | -1; pct: number };
  "market:candle": { minute: number };
  "trade:filled": { trade: TradeRecord };
  "trade:rejected": { reason: string };
  "player:sat": { stationId: string };
  "player:stood": { stationId: string };
  "player:terminalOpen": { stationId: string };
  "player:threw": { propKind: string };
  "player:hitNpc": { npcId: string; propKind: string; speed: number };
  "player:talked": { npcId: string };
  "player:drank": { propKind: string };
  "player:drew": Record<string, never>;
  "player:boardWiped": Record<string, never>;
  "receipt:printed": { tradeId: number };
  "receipt:pinned": { tradeId: number };
  "receipt:shown": { tradeId: number; npcId: string | null };
  "bin:scored": { propKind: string; fromLine: boolean };
  "fridge:opened": Record<string, never>;
  "fan:toggled": { on: boolean };
  "lamp:toggled": { on: boolean };
  "chair:spun": Record<string, never>;
  "secret:found": { id: string };
  "task:done": { id: string };
  "upgrade:installed": { id: string };
  "cosmetic:changed": { id: string; slot: string };
  "night:lastCall": { night: number };
  "night:end": { night: number };
  "night:start": { night: number };
  "rain:changed": { intensity: number };
  toast: { text: string; kind?: "info" | "good" | "bad" | "rep" };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<unknown>>>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as Handler<unknown>);
    return () => set!.delete(fn as Handler<unknown>);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[bus] handler for ${String(type)} failed`, err);
      }
    }
  }
}

export const bus = new EventBus();
