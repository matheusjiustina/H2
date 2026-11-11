export type Quality = 'low' | 'medium' | 'high';
export type TimeMode = 'cycle' | 'day' | 'afternoon' | 'sunset' | 'night';
export type WeatherMode = 'auto' | 'clear' | 'rain';

export interface Settings {
  quality: Quality;
  master: number;
  music: number;
  sfx: number;
  sensitivity: number;
  invertY: boolean;
  showFps: boolean;
  time: TimeMode;
  weather: WeatherMode;
}

export interface SaveData {
  v: number;
  settings: Settings;
  started: boolean;
  /** Completed mission ids. */
  completed: string[];
  /** Index of the next campaign mission (== MISSIONS.length when finished). */
  mission: number;
  cash: number;
  outfit: string;
  outfits: string[];
  vehicles: string[];
  districts: string[];
  collectibles: number[];
  records: Record<string, number>;
  weapons: string[];
  finished: boolean;
  stats: { cancelled: number; escapes: number; knockouts: number; distance: number };
  pos: { x: number; y: number; z: number } | null;
}

const KEY = 'everyone-against-trump.save.v1';

export const defaultSettings = (): Settings => ({
  quality: 'medium',
  master: 0.8,
  music: 0.5,
  sfx: 0.9,
  sensitivity: 1,
  invertY: false,
  showFps: false,
  time: 'cycle',
  weather: 'auto',
});

export const defaultSave = (): SaveData => ({
  v: 1,
  settings: defaultSettings(),
  started: false,
  completed: [],
  mission: 0,
  cash: 0,
  outfit: 'president',
  outfits: ['president'],
  vehicles: [],
  districts: ['downtown', 'suburbs'],
  collectibles: [],
  records: {},
  weapons: ['golf'],
  finished: false,
  stats: { cancelled: 0, escapes: 0, knockouts: 0, distance: 0 },
  pos: null,
});

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Merge loaded data over defaults, keeping only values of the expected type. */
function sanitize<T>(def: T, raw: unknown): T {
  if (Array.isArray(def)) {
    if (!Array.isArray(raw)) return def;
    const sample = def.length ? typeof def[0] : null;
    return raw.filter((x) => sample === null ? typeof x === 'string' || typeof x === 'number' : typeof x === sample) as unknown as T;
  }
  if (isObj(def)) {
    if (!isObj(raw)) return def;
    const out: Record<string, unknown> = {};
    const keys = Object.keys(def);
    if (keys.length === 0) {
      // free-form record of numbers
      for (const k of Object.keys(raw)) if (typeof raw[k] === 'number') out[k] = raw[k];
      return out as T;
    }
    for (const k of keys) out[k] = sanitize((def as Record<string, unknown>)[k], raw[k]);
    return out as T;
  }
  if (def === null) return (isObj(raw) ? raw : null) as T;
  return (typeof raw === typeof def ? raw : def) as T;
}

export class SaveStore {
  data: SaveData = defaultSave();
  /** True when a save existed but could not be read. */
  recovered = false;

  load(): SaveData {
    try {
      const txt = localStorage.getItem(KEY);
      if (!txt) return (this.data = defaultSave());
      const raw = JSON.parse(txt);
      if (!isObj(raw) || raw.v !== 1) throw new Error('bad save version');
      const d = sanitize(defaultSave(), raw);
      if (d.pos && !(Number.isFinite(d.pos.x) && Number.isFinite(d.pos.y) && Number.isFinite(d.pos.z))) d.pos = null;
      d.mission = Math.max(0, Math.floor(d.mission));
      d.cash = Math.max(0, Math.floor(d.cash));
      if (!d.outfits.includes('president')) d.outfits.push('president');
      this.data = d;
    } catch (err) {
      console.warn('[save] corrupted save data – starting fresh', err);
      try {
        const bad = localStorage.getItem(KEY);
        if (bad) localStorage.setItem(KEY + '.corrupt', bad);
        localStorage.removeItem(KEY);
      } catch {
        /* storage unavailable */
      }
      this.recovered = true;
      this.data = defaultSave();
    }
    return this.data;
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (err) {
      console.warn('[save] could not write save', err);
    }
  }

  /** Start a new campaign but keep settings. */
  reset() {
    const s = this.data.settings;
    this.data = defaultSave();
    this.data.settings = s;
    this.save();
  }
}
