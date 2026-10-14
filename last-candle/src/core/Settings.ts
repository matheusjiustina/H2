export interface SettingsData {
  sensitivity: number; // 0.2 .. 3
  invertY: boolean;
  headBob: boolean;
  fov: number; // 60 .. 90
  renderScale: number; // 0.5 .. 1
  shadows: "off" | "low" | "high";
  volume: number; // 0..1
  ambience: number; // 0..1
  showFps: boolean;
}

const KEY = "lastcandle.settings.v1";

export const DEFAULT_SETTINGS: SettingsData = {
  sensitivity: 1,
  invertY: false,
  headBob: true,
  fov: 72,
  renderScale: 1,
  shadows: "high",
  volume: 0.8,
  ambience: 0.8,
  showFps: false,
};

export class Settings {
  data: SettingsData;
  private listeners: ((s: SettingsData) => void)[] = [];

  constructor() {
    this.data = { ...DEFAULT_SETTINGS };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch {
      /* storage unavailable: keep defaults */
    }
  }

  set<K extends keyof SettingsData>(k: K, v: SettingsData[K]) {
    this.data[k] = v;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
    for (const l of this.listeners) l(this.data);
  }

  onChange(fn: (s: SettingsData) => void) {
    this.listeners.push(fn);
  }
}
