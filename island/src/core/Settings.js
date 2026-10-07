// Quality presets + persisted user settings.

export const PRESETS = {
  low: { renderScale: 0.7, shadows: 'low', vegetation: 'low', water: 'low', post: 'low' },
  medium: { renderScale: 0.85, shadows: 'medium', vegetation: 'medium', water: 'medium', post: 'medium' },
  high: { renderScale: 1.0, shadows: 'high', vegetation: 'high', water: 'high', post: 'high' },
};

export const VEGETATION = {
  low: { density: 0.45, grassRadius: 26, grassDensity: 0.45, lod0: 26, lod1: 70, maxDist: 260, plantDist: 45, castSmall: false },
  medium: { density: 0.7, grassRadius: 40, grassDensity: 0.7, lod0: 40, lod1: 110, maxDist: 380, plantDist: 70, castSmall: false },
  high: { density: 1.0, grassRadius: 56, grassDensity: 1.0, lod0: 55, lod1: 150, maxDist: 520, plantDist: 95, castSmall: true },
};

export const WATER = {
  low: { reflections: 'off', reflectionScale: 0.25, ripples: 128, grid: 'low' },
  medium: { reflections: 'lite', reflectionScale: 0.33, ripples: 192, grid: 'medium' },
  high: { reflections: 'full', reflectionScale: 0.5, ripples: 256, grid: 'high' },
};

export const POST = {
  low: { ssao: false, bloom: false, fxaa: true, sharpen: 0.22 },
  medium: { ssao: false, bloom: true, fxaa: true, sharpen: 0.2 },
  high: { ssao: true, bloom: true, fxaa: true, sharpen: 0.18 },
};

const DEFAULTS = {
  preset: 'high',
  renderScale: 1.0,
  shadows: 'high',
  vegetation: 'high',
  water: 'high',
  post: 'high',
  master: 0.85,
  ambience: 0.9,
  effects: 0.9,
  music: 0.7,
  sensitivity: 1.0,
  invertY: false,
  fov: 72,
  showFps: false,
};

const KEY = 'tidemark-settings-v1';

export class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    this.listeners = [];
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { stored = null; }
    if (stored) Object.assign(this.values, stored);
    else this.applyPreset(this.detectPreset(), false);
    // URL overrides (testing / quick switching)
    const q = new URLSearchParams(location.search).get('quality');
    if (q && PRESETS[q]) this.applyPreset(q, false);
  }

  detectPreset() {
    try {
      // phones and tablets: keep it light, they share a small power and heat budget
      if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) return 'low';
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      if (!gl) return 'low';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
      if (/swiftshader|llvmpipe|software/.test(name)) return 'low';
      if (/intel|uhd|iris|mali|adreno|powervr|apple m1|apple gpu/.test(name)) return 'medium';
      return 'high';
    } catch { return 'medium'; }
  }

  applyPreset(name, notify = true) {
    const p = PRESETS[name];
    if (!p) return;
    Object.assign(this.values, p, { preset: name });
    if (notify) this.changed();
  }

  set(key, value) {
    this.values[key] = value;
    if (['renderScale', 'shadows', 'vegetation', 'water', 'post'].includes(key)) this.values.preset = 'custom';
    this.changed();
  }

  get(key) { return this.values[key]; }

  changed() {
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* storage unavailable */ }
    for (const l of this.listeners) l(this.values);
  }

  onChange(fn) { this.listeners.push(fn); }
}
