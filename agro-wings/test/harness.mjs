// Headless flight harness: real terrain + flight model + assist, fixed 120 Hz.
import { Vector3 } from 'three';
import { FlightModel } from '../src/flight/flightModel.js';
import { Assist } from '../src/flight/assist.js';
import { createFlightEnv, windAt } from '../src/flight/env.js';
import { TerrainData } from '../src/world/terrainData.js';
import { FLIGHT } from '../src/config.js';

globalThis.performance ??= { now: () => Date.now() };

let terrainSingleton = null;
export function getTerrain() {
  terrainSingleton ??= new TerrainData();
  return terrainSingleton;
}

export function makeSim({ wind = true, hopper = 0, fuel = 200, A = FLIGHT } = {}) {
  const terrain = getTerrain();
  const env = createFlightEnv(terrain);
  const fm = new FlightModel(A);
  fm.fuel = fuel;
  fm.hopper = hopper;
  fm.updateMass();
  const assist = new Assist();
  const sim = {
    terrain, env, fm, assist, t: 0, wind,
    step(n = 1, cmd = { pitch: 0, roll: 0, yaw: 0 }, mode = 'normal') {
      for (let i = 0; i < n; i++) {
        if (sim.wind) windAt(env.wind, sim.t, fm.pos, fm.out.agl);
        else env.wind.set(0, 0, 0);
        assist.update(fm, cmd, mode, FLIGHT.sim.dt);
        fm.step(FLIGHT.sim.dt, env);
        sim.events.push(...fm.events);
        sim.t += FLIGHT.sim.dt;
      }
    },
    events: [],
    att() { return FlightModel.attitude(fm, {}); },
  };
  return sim;
}

export const deg = (r) => (r * 180) / Math.PI;
export { Vector3 };

// The whole balão near the ground, flown as on the keyboard (a pull reaches
// full travel as the game shapes it: 0.4 s descending, ~0.8 s otherwise): a pass at 3 m and working
// speed, full pull to 25° nose up, roll into a 65° bank and turn back ~150°,
// roll level, dive back at `diveDeg`, and a full pull once the wheels are
// `hPull` metres up. Returns the lowest wheel height after the turn (or
// 'HIT'), the speed and g of the pull-out and the worst stall.
export function balaoDive(A, hopper, { hPull = 14, diveDeg = 14, fuel = 140, knots = 100, pullRamp = null } = {}) {
  const KT = 1.943844, D = 180 / Math.PI;
  const V = knots / KT;
  const sim = makeSim({ hopper, fuel, wind: false, A });
  const { fm, env } = sim;
  const x0 = -600, z0 = -300;
  fm.reset(new Vector3(x0 - 700, env.ground(x0, z0) + A.aglOffset + 20, z0), Math.PI / 2, { speed: V, engineOn: true });
  fm.throttle = 1;
  // Settle into the pass: 3 m over the ground at working speed.
  for (let i = 0; i < 120 * 12; i++) {
    const a = sim.att(), o = fm.out;
    const vsT = Math.max(-3, Math.min(2, (3 - o.agl) * 0.6));
    const pT = Math.max(-0.2, Math.min(0.2, 0.03 + (vsT - fm.vel.y) * 0.05));
    fm.throttle = Math.max(0.3, Math.min(1, fm.throttle + (V - o.airspeed) * 0.2 / 120));
    sim.step(1, { pitch: Math.max(-1, Math.min(1, (pT - a.pitch) * 3 + fm.omega.x)), roll: -a.bank * 2, yaw: 0 }, 'normal');
  }
  fm.throttle = 1;
  const sh = { p: 0, r: 0 };
  const ap = (c, t, r) => (c < t ? Math.min(t, c + r / 120) : Math.max(t, c - r / 120));
  let phase = 1, t = 0, turned = 0, prev = fm.heading(), low = 99, maxG = 0, stall = 0, tPh = 0, pullKt = null, hit = false;
  while (t < 60) {
    const a = sim.att(), o = fm.out;
    let cp = 0, cr = 0;
    if (phase === 1) { cp = 1; if (a.pitch > 25 / D) phase = 2; }
    else if (phase === 2) { cr = 1; if (Math.abs(a.bank) > 65 / D) phase = 3; }
    else if (phase === 3) { cp = 0.4; if (Math.abs(turned) > 150 / D) phase = 4; }
    else if (phase === 4) { cr = -1; if (Math.abs(a.bank) < 8 / D) { phase = 5; tPh = t; } }
    else if (phase === 5) {
      cp = Math.max(-1, Math.min(1, (-diveDeg / D - Math.asin(fm.vel.y / fm.vel.length())) * 3));
      if (o.agl < hPull && fm.vel.y < -0.5) { phase = 6; pullKt = o.airspeed * KT; }
      if (t - tPh > 15) break;
    } else if (phase === 6) { cp = 1; if (fm.vel.y >= 0) { phase = 7; tPh = t; } }
    else if (t - tPh > 2) break;
    sh.p = ap(sh.p, cp, cp === 0 ? 4 : cp > 0 ? (pullRamp ?? (fm.vel.y < -0.05 * Math.max(1, fm.vel.length()) || sh.p < 0 ? 2.5 : 1.2)) : 3.4); sh.r = ap(sh.r, cr, cr === 0 ? 5 : 3.2);
    sim.step(1, { pitch: sh.p, roll: sh.r, yaw: 0 }, 'normal');
    let d = fm.heading() - prev; d = Math.atan2(Math.sin(d), Math.cos(d)); turned += d; prev = fm.heading();
    t += 1 / 120;
    stall = Math.max(stall, o.stall);
    if (phase >= 5) { low = Math.min(low, o.agl); maxG = Math.max(maxG, o.gLoad); }
    if (o.agl < 0.05 || fm.events.some((e) => e.kind === 'crash' || e.kind === 'strike')) { hit = true; break; }
  }
  return { low: hit ? 'HIT' : low, pullKt, maxG, stall, mass: fm.mass };
}

// A low steep 180° turn back to the next swath: from 15 m at working speed,
// the roll key held to `bankDeg`, then released (the assist holds the bank
// and the flight path). Returns the height lost (negative) or 'HIT'.
export function lowTurn(A, hopper, bankDeg, { h0 = 15, knots = 100, fuel = 140 } = {}) {
  const KT = 1.943844, D = 180 / Math.PI;
  const sim = makeSim({ hopper, fuel, wind: false, A }); const { fm, env } = sim;
  const x0 = -600, z0 = -300;
  fm.reset(new Vector3(x0 - 700, env.ground(x0, z0) + A.aglOffset + h0 + 10, z0), Math.PI / 2, { speed: knots / KT, engineOn: true });
  fm.throttle = 1;
  for (let i = 0; i < 120 * 12; i++) {
    const a = sim.att(), o = fm.out;
    const vsT = Math.max(-3, Math.min(2, (h0 - o.agl) * 0.6));
    const pT = Math.max(-0.2, Math.min(0.2, 0.03 + (vsT - fm.vel.y) * 0.05));
    fm.throttle = Math.max(0.3, Math.min(1, fm.throttle + (knots / KT - o.airspeed) * 0.2 / 120));
    sim.step(1, { pitch: Math.max(-1, Math.min(1, (pT - a.pitch) * 3 + fm.omega.x)), roll: -a.bank * 2, yaw: 0 }, 'normal');
  }
  fm.throttle = 1;
  const a0 = fm.out.agl;
  let r = 0, turned = 0, prev = fm.heading(), t = 0, low = 99, rolled = false, stall = 0;
  while (t < 30 && Math.abs(turned) < Math.PI) {
    const a = sim.att(), o = fm.out;
    const want = rolled ? 0 : 1;
    if (!rolled && Math.abs(a.bank) > bankDeg / D) rolled = true;
    r = r < want ? Math.min(want, r + 3.2 / 120) : Math.max(want, r - 5 / 120);
    sim.step(1, { pitch: 0, roll: r, yaw: 0 }, 'normal');
    let d = fm.heading() - prev; d = Math.atan2(Math.sin(d), Math.cos(d)); turned += d; prev = fm.heading(); t += 1 / 120;
    low = Math.min(low, o.agl); stall = Math.max(stall, o.stall);
    if (o.agl < 0.05 || fm.events.some((e) => e.kind === 'crash' || e.kind === 'strike')) return { lost: 'HIT', t, stall };
  }
  return { lost: low - a0, t, stall, v: fm.out.airspeed * KT };
}
