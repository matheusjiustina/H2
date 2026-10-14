import type { SavedMarket } from "../market/MarketEngine";
import type { SavedPortfolio } from "../market/Portfolio";
import type { SimPosition } from "../npc/Npc";
import type { PropKind } from "../physics/Props";
import type { ProgressData } from "../systems/Progression";
import type { Stroke } from "../systems/Whiteboard";

export interface SavedProp {
  kind: PropKind;
  p: [number, number, number];
  q: [number, number, number, number];
  state: "free" | "pinned" | "stored";
  uses: number;
  data: Record<string, string | number | boolean>;
  home: [number, number, number] | null;
  hq: [number, number, number, number] | null;
}

export interface SaveData {
  v: 1;
  savedAt: number;
  market: SavedMarket;
  portfolio: SavedPortfolio;
  progress: ProgressData;
  clock: { night: number; startMarketMinute: number };
  player: { x: number; y: number; z: number; yaw: number };
  props: SavedProp[];
  whiteboard: Stroke[];
  npcs: { id: string; pos: SimPosition | null; mood: number; realizedPct: number; present: boolean }[];
  world: { fan: boolean; lamp: boolean; rain: number };
  events: { lastCallDone: boolean; arrivalDone: boolean; debateDone: boolean };
}

const KEY = "lastcandle.save.v1";

export const SaveStore = {
  load(): SaveData | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw) as SaveData;
      if (d.v !== 1 || !d.market || !d.portfolio || !d.progress) return null;
      return d;
    } catch {
      return null;
    }
  },
  write(d: SaveData): boolean {
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
      return true;
    } catch {
      return false;
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};
