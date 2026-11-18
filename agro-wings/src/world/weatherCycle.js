// Dynamic weather and passing time of day (visual; the flight model's wind is
// untouched). With 'Dynamic' weather the sky moves through the presets on its
// own: clear spells, cloud building up, a brief light shower, clearing; morning
// mist that lifts once the morning is over. The farm the aircraft is near
// leans it (Vale do Rio: humid, showers; Santa Rita: dry; Serra Azul: mist in
// the mornings). With 'Passing' time of day the light runs dawn → morning →
// midday → golden hour → dusk and round again. Every change goes through the
// atmosphere's smooth transition; requests from the farms read the current
// state (postponed while it rains, morning-only work, and so on).
import { TIME_ORDER } from './atmosphere.js';
import { nearestSite } from './layout.js';

// Next weather: [id, weight]. Mist only forms at dawn / in the morning.
const NEXT = {
  clear: [['partly', 3], ['clear', 1], ['mist', 0.6]],
  partly: [['clear', 2], ['overcast', 1.6], ['partly', 0.6], ['mist', 0.4]],
  overcast: [['rain', 1.6], ['partly', 2], ['overcast', 0.5]],
  rain: [['overcast', 2], ['partly', 1]],
  mist: [['partly', 2], ['clear', 1.5]],
};
// Spell length (s): [min, max]. Rain is a brief shower.
const SPELL = { clear: [240, 420], partly: [200, 360], overcast: [140, 240], rain: [80, 150], mist: [150, 240] };
// Farm tendencies: weight multipliers.
const LEAN = {
  dry: { clear: 2, rain: 0.3, overcast: 0.6 },
  humid: { rain: 2.4, overcast: 1.6, clear: 0.7 },
  mist: { mist: 3, overcast: 1.2 },
  // Exposed plateau: the wind clears the sky and blows the mist away.
  windy: { clear: 1.6, partly: 1.3, mist: 0.2, rain: 0.6 },
};
const MORNING = new Set(['dawn', 'morning']);
export const TIME_STAGE = 360; // s per time-of-day stage when time passes

export class WeatherCycle {
  constructor(game, rnd = Math.random) {
    this.game = game;
    this.rnd = rnd;
    this.weather = 'partly';
    this.time = 'morning';
    this.spell = 0;
    this.stage = 0;
  }

  // dynamic: weather moves on its own; flow: time of day passes.
  start({ weather, time, dynamic, flow }) {
    this.weather = weather;
    this.time = time;
    this.dynamic = dynamic;
    this.flow = flow;
    this.spell = this._len(weather);
    this.stage = TIME_STAGE;
  }

  _len(id) { const [a, b] = SPELL[id]; return a + (b - a) * this.rnd(); }

  // Weather tendency where the aircraft is (the main farm has none).
  lean() {
    const ac = this.game.aircraft;
    if (!ac) return null;
    const { site, dist } = nearestSite(ac.fm.pos.x, ac.fm.pos.z);
    return !site.main && dist < 2500 ? LEAN[site.farm.weather] : null;
  }

  pick(from) {
    const lean = this.lean() || {};
    const opts = NEXT[from].filter(([id]) => id !== 'mist' || MORNING.has(this.time));
    const w = opts.map(([id, k]) => k * (lean[id] ?? 1));
    let r = this.rnd() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) return opts[i][0]; }
    return opts[opts.length - 1][0];
  }

  // Returns true when time or weather changed (the caller re-targets the sky).
  update(dt) {
    let changed = false;
    if (this.flow) {
      this.stage -= dt;
      if (this.stage <= 0) {
        this.stage += TIME_STAGE;
        this.time = TIME_ORDER[(TIME_ORDER.indexOf(this.time) + 1) % TIME_ORDER.length];
        changed = true;
        // The morning mist lifts once the morning is over.
        if (this.weather === 'mist' && !MORNING.has(this.time)) { this.weather = 'partly'; this.spell = this._len('partly'); }
      }
    }
    if (this.dynamic) {
      this.spell -= dt;
      if (this.spell <= 0) {
        const next = this.pick(this.weather);
        if (next !== this.weather) changed = true;
        this.weather = next;
        this.spell = this._len(next);
      }
    }
    return changed;
  }
}
