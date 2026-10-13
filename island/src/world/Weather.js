import { damp, clamp, rng } from '../utils/MathUtils.js';

// Auto weather cycles through the four fair states; the storm is only set by hand (dev panel).
// Wind stays light in all of them so flying, landing and boat trips are always possible.
export const WEATHER_STATES = {
  CLEAR: { label: 'Clear', cloud: 0.3, rain: 0, wind: 0.32, gust: 0.45, fog: 1.0, fogLow: 0, sunDim: 1.0, waves: 1.0, overcast: 0.0, stay: [240, 460] },
  FOG: { label: 'Light fog', cloud: 0.42, rain: 0, wind: 0.14, gust: 0.2, fog: 7.5, fogLow: 1, sunDim: 0.72, waves: 0.75, overcast: 0.22, stay: [140, 240] },
  CLOUDY: { label: 'Overcast', cloud: 0.72, rain: 0, wind: 0.48, gust: 0.55, fog: 1.6, fogLow: 0, sunDim: 0.68, waves: 1.12, overcast: 0.45, stay: [200, 380] },
  LIGHT_RAIN: { label: 'Passing rain', cloud: 0.86, rain: 0.34, wind: 0.52, gust: 0.6, fog: 2.4, fogLow: 0.2, sunDim: 0.36, waves: 1.2, overcast: 0.72, stay: [70, 140] },
  STORM: { label: 'Tropical storm', cloud: 1.0, rain: 1.0, wind: 1.0, gust: 1.0, fog: 4.6, fogLow: 0, sunDim: 0.1, waves: 1.75, overcast: 1.0, stay: [120, 200] },
};

const KEYS = Object.keys(WEATHER_STATES);

/**
 * Weather state machine with gradual transitions. Rain accumulates wetness on the world
 * which dries off slowly afterwards. Storms trigger lightning + thunder events.
 */
export class Weather {
  constructor() {
    this.state = 'CLEAR';
    this.target = WEATHER_STATES.CLEAR;
    const t = this.target;
    this.p = { cloud: t.cloud, rain: t.rain, wind: t.wind, gust: t.gust, fog: t.fog, fogLow: t.fogLow, sunDim: t.sunDim, waves: t.waves, overcast: t.overcast };
    this.wetness = 0;
    this.lightning = 0;
    this.transitionRate = 0.035; // ~30 s for a full transition
    this.auto = true;
    this.nextChange = 240 + Math.random() * 200;
    this.timer = 0;
    this.r = rng(4242);
    this.windAngle = -0.7;
    this.onThunder = null; // (distance, intensity)
    this._lightningTimer = 6;
    this._flash = 0;
    this._pendingThunder = [];
  }

  set(state, instant = false) {
    if (!WEATHER_STATES[state]) return;
    this.state = state;
    this.target = WEATHER_STATES[state];
    this.timer = 0;
    const [a, b] = this.target.stay;
    this.nextChange = a + this.r() * (b - a);
    if (instant) {
      const t = this.target;
      Object.assign(this.p, { cloud: t.cloud, rain: t.rain, wind: t.wind, gust: t.gust, fog: t.fog, fogLow: t.fogLow, sunDim: t.sunDim, waves: t.waves, overcast: t.overcast });
      this.wetness = t.rain > 0 ? 0.8 : this.wetness;
    }
  }

  _pickNext() {
    const r = this.r();
    const cur = this.state;
    // fair weather most of the time: overcast spells, the odd passing shower, morning fog
    // banks. Storms never come on their own.
    if (cur === 'CLEAR') return r < 0.38 ? 'CLOUDY' : r < 0.52 ? 'LIGHT_RAIN' : r < 0.64 ? 'FOG' : 'CLEAR';
    if (cur === 'FOG') return r < 0.65 ? 'CLEAR' : 'CLOUDY';
    if (cur === 'CLOUDY') return r < 0.45 ? 'CLEAR' : r < 0.8 ? 'LIGHT_RAIN' : r < 0.9 ? 'FOG' : 'CLOUDY';
    if (cur === 'LIGHT_RAIN') return r < 0.55 ? 'CLOUDY' : 'CLEAR';
    return 'LIGHT_RAIN';
  }

  update(dt) {
    this.timer += dt;
    if (this.auto && this.timer > this.nextChange) this.set(this._pickNext());
    const k = this.transitionRate;
    const t = this.target;
    for (const key of Object.keys(this.p)) this.p[key] = damp(this.p[key], t[key], k * (key === 'rain' ? 1.3 : key === 'fog' || key === 'fogLow' ? 0.7 : 1), dt);
    // rain only once clouds have built up
    const rain = this.p.rain * clamp((this.p.cloud - 0.55) / 0.3, 0, 1);
    this.rain = rain;
    // wetness: soaks quickly, dries slowly
    if (rain > 0.02) this.wetness = Math.min(1, this.wetness + dt * rain * 0.06);
    else this.wetness = Math.max(0, this.wetness - dt * 0.006 * (1.2 - this.p.cloud));
    // slowly veering wind direction
    this.windAngle += Math.sin(this.timer * 0.01) * dt * 0.004;

    // lightning
    const storm = clamp((this.p.rain - 0.6) / 0.4, 0, 1) * clamp((this.p.cloud - 0.9) / 0.1, 0, 1);
    this._flash = Math.max(0, this._flash - dt * 6);
    if (storm > 0.3) {
      this._lightningTimer -= dt;
      if (this._lightningTimer <= 0) {
        this._lightningTimer = 5 + this.r() * 16 / storm;
        this._flash = 0.8 + this.r() * 0.7;
        const dist = 400 + this.r() * 2600;
        this._pendingThunder.push({ t: dist / 343, dist, intensity: 0.5 + this.r() * 0.5 });
        // double flicker
        setTimeout(() => { this._flash = Math.max(this._flash, 0.6); }, 90 + this.r() * 120);
      }
    }
    for (let i = this._pendingThunder.length - 1; i >= 0; i--) {
      const ev = this._pendingThunder[i];
      ev.t -= dt;
      if (ev.t <= 0) {
        this._pendingThunder.splice(i, 1);
        if (this.onThunder) this.onThunder(ev.dist, ev.intensity);
      }
    }
    this.lightning = this._flash;
  }

  get label() { return WEATHER_STATES[this.state].label; }
  static get keys() { return KEYS; }
}
