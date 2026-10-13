import type { GameStateData } from './types';
import type { BagStyle, HairStyle, HatStyle } from '../characters/Appearance';

export const SAVE_VERSION = 2;
const SAVE_KEY = 'crypto-world.save';
const SETTINGS_KEY = 'crypto-world.settings';

export interface Cosmetics {
  jacket: string;
  bag: BagStyle;
  bagColor: string;
  hat: HatStyle;
  hatColor: string;
  hairStyle: HairStyle;
  hair: string;
  skin: string;
}

export const DEFAULT_COSMETICS: Cosmetics = {
  jacket: '#e8823a',
  bag: 'messenger',
  bagColor: '#2f8f8f',
  hat: 'cap',
  hatColor: '#2d4060',
  hairStyle: 'swoop',
  hair: '#4a3226',
  skin: '#efc3a1',
};

export interface SaveData {
  version: number;
  savedAt: number;
  state: GameStateData;
  player: { dir: [number, number, number]; facing: [number, number, number] };
  time: number;
  cosmetics: Cosmetics;
  dials: number[];
}

export interface Settings {
  master: number;
  music: number;
  ambience: number;
  sfx: number;
  quality: 'auto' | 'low' | 'medium' | 'high';
  sensitivity: number;
  invertY: boolean;
  autoFollow: boolean;
  showFps: boolean;
  textSpeed: number;
  dayLength: 'slow' | 'normal' | 'fast';
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  music: 0.55,
  ambience: 0.7,
  sfx: 0.8,
  quality: 'auto',
  sensitivity: 1,
  invertY: false,
  autoFollow: true,
  showFps: false,
  textSpeed: 1,
  dayLength: 'normal',
};

/** Minimal storage interface so tests can use an in-memory map. */
export interface KeyValueStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function isVec3(v: unknown): v is [number, number, number] {
  return Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

function isState(s: any): s is GameStateData {
  return (
    s && typeof s === 'object' && typeof s.flags === 'object' && Array.isArray(s.inventory) && typeof s.missions === 'object' &&
    typeof s.talked === 'object' && Array.isArray(s.seen) && Array.isArray(s.secrets) && Array.isArray(s.fragments)
  );
}

/** Upgrades older save layouts to the current version. Returns null if it cannot. */
export function migrate(raw: any): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  let d = { ...raw };
  if (d.version === 1) {
    // v1 stored discoveries as "found" and had no cosmetics or dials.
    d = { ...d, version: 2, cosmetics: d.cosmetics ?? DEFAULT_COSMETICS, dials: d.dials ?? [0, 0, 0, 0] };
    if (d.state && !d.state.secrets && Array.isArray(d.state.found)) d.state.secrets = d.state.found;
  }
  if (d.version !== SAVE_VERSION) return null;
  if (!isState(d.state) || !d.player || !isVec3(d.player.dir) || !isVec3(d.player.facing)) return null;
  const len = Math.hypot(...d.player.dir);
  if (len < 0.5 || len > 1.5) return null;
  d.time = typeof d.time === 'number' && Number.isFinite(d.time) ? ((d.time % 1) + 1) % 1 : 0.34;
  d.cosmetics = { ...DEFAULT_COSMETICS, ...(d.cosmetics ?? {}) };
  d.dials = Array.isArray(d.dials) && d.dials.length === 4 ? d.dials.map((n: unknown) => (typeof n === 'number' ? Math.abs(Math.floor(n)) % 10 : 0)) : [0, 0, 0, 0];
  d.state.night = !!d.state.night;
  d.state.tracked = typeof d.state.tracked === 'string' ? d.state.tracked : null;
  return d as SaveData;
}

/** Versioned local persistence with graceful handling of outdated or corrupt data. */
export class SaveSystem {
  lastError: string | null = null;

  constructor(private store: KeyValueStore | null = typeof localStorage !== 'undefined' ? localStorage : null) {}

  hasSave(): boolean {
    return this.load() !== null;
  }

  load(): SaveData | null {
    if (!this.store) return null;
    let text: string | null = null;
    try {
      text = this.store.getItem(SAVE_KEY);
    } catch {
      return null;
    }
    if (!text) return null;
    try {
      const data = migrate(JSON.parse(text));
      if (!data) {
        this.lastError = 'Save data was invalid or from an unsupported version.';
        this.quarantine(text);
      }
      return data;
    } catch {
      this.lastError = 'Save data was corrupt.';
      this.quarantine(text);
      return null;
    }
  }

  save(data: Omit<SaveData, 'version' | 'savedAt'>): boolean {
    if (!this.store) return false;
    try {
      this.store.setItem(SAVE_KEY, JSON.stringify({ ...data, version: SAVE_VERSION, savedAt: Date.now() }));
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    try {
      this.store?.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }

  private quarantine(text: string): void {
    try {
      this.store?.setItem(`${SAVE_KEY}.corrupt`, text);
      this.store?.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }

  loadSettings(): Settings {
    try {
      const t = this.store?.getItem(SETTINGS_KEY);
      if (!t) return { ...DEFAULT_SETTINGS };
      const s = JSON.parse(t);
      const out = { ...DEFAULT_SETTINGS };
      for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
        if (typeof s[k] === typeof DEFAULT_SETTINGS[k]) (out as any)[k] = s[k];
      }
      return out;
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings(s: Settings): void {
    try {
      this.store?.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }
}
