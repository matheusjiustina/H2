// Phase 6: reproducible physics regression. Runs fixed scenarios through the real flight / helicopter /
// spray code at the fixed 120 Hz step and writes traces + a checksum per scenario. Run the SAME file on
// two source trees (e.g. the v73 tag and the working tree) and diff the JSON: every value must be identical.
// Usage: node test/p6golden.mjs out.json
import fs from 'node:fs';
import { Vector3 } from 'three';
import { makeSim as _makeSim } from './harness.mjs';
import { makeHeli as _makeHeli } from './heliharness.mjs';
import { HeliAssist } from '../src/flight/heliAssist.js';
import { AIRCRAFT_TYPES } from '../src/aircraft/types.js';
import { Sprayer } from '../src/spray/sprayer.js';
import { FieldCoverage } from '../src/spray/coverage.js';
import { CONTRACT_FIELDS } from '../src/world/layout.js';
import { FLIGHT_B206 } from '../src/config.js';

// The model's stall wobble uses Math.random: seed it per scenario so traces are reproducible (test-side only).
let _s = 1;
const seed = () => { _s = 12345; Math.random = () => { _s = (Math.imul(_s, 1664525) + 1013904223) >>> 0; return _s / 4294967296; }; };
const makeSim = (o) => { seed(); return _makeSim(o); };
const makeHeli = (o) => { seed(); return _makeHeli(o); };
const r = (v, d = 4) => (typeof v === 'number' ? +v.toFixed(d) : 0);
const state = (fm) => [r(fm.pos.x, 3), r(fm.pos.y, 3), r(fm.pos.z, 3), r(fm.vel.x, 3), r(fm.vel.y, 3), r(fm.vel.z, 3), r(fm.rpm, 2), r(fm.fuel, 4), r(fm.hopper, 3), r(fm.mass, 3), r(fm.flaps, 3)];
function hash(a) { let h = 2166136261 >>> 0; const s = JSON.stringify(a); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); }
const out = {};
const rec = (name, trace, extra = {}) => { out[name] = { hash: hash(trace), n: trace.length, samples: trace.filter((_, i) => i % 8 === 0).slice(0, 12), ...extra }; };

const PLANES = ['ipanema', 'at502', 'm18', 'thrush', 'e203', 'a188', 'pa36', 'agcat', 'e201', 'at401', 'at802', 'at802f'].filter((k) => AIRCRAFT_TYPES[k]);
// 1+2+5+6: loaded take-off, power step, turn + altitude change, short-field landing — per aeroplane, with and without wind.
for (const id of PLANES) for (const wind of [false, true]) {
  const T = AIRCRAFT_TYPES[id], A = T.flight;
  const sim = makeSim({ hopper: Math.min(T.loads?.free?.hopper ?? 600, 900) * 0.9, fuel: T.loads?.free?.fuel ?? 160, wind, A });
  const { fm, env } = sim; const tr = [];
  fm.settleOnGround(-385, 0, Math.PI / 2, env);
  sim.step(240);
  fm.engine = 'running'; fm.rpm = A.idleRpm ?? 900; fm.flapsCmd = fm.flaps = 1 / 3;
  const cmd = { pitch: 0, roll: 0, yaw: 0 };
  let airborne = null;
  for (let i = 0; i < 120 * 40; i++) {
    fm.throttle = Math.min(1, fm.throttle + 0.55 / 120);
    cmd.yaw = Math.max(-1, Math.min(1, -(Math.PI / 2 - fm.heading()) * 3 + fm.omega.y * 1.5));
    cmd.pitch = fm.out.airspeed < 14 ? 0 : fm.out.airspeed < 30 ? -0.1 : 0.45;
    // from t = 25 s: a bank and a throttle step
    if (i > 120 * 25) cmd.roll = i < 120 * 31 ? 0.35 : -0.35;
    if (i === 120 * 33) fm.throttle = 0.4;
    sim.step(1, cmd, 'normal');
    if (!airborne && !fm.out.onGround) airborne = r(sim.t, 2);
    if (i % 6 === 0) tr.push(state(fm));
  }
  rec(`plane.${id}.${wind ? 'wind' : 'calm'}`, tr, { liftoffAt: airborne, final: state(fm) });
}
// 3: short-field landing: a stabilised approach at 1.3 Vs to a 300 m strip, brakes at touchdown.
for (const id of ['ipanema', 'at502', 'm18']) {
  const A = AIRCRAFT_TYPES[id].flight;
  const sim = makeSim({ hopper: 0, fuel: 100, wind: false, A }); const { fm, env } = sim; const tr = [];
  fm.reset(new Vector3(-900, env.ground(-900, 0) + A.aglOffset + 45, 0), Math.PI / 2, { speed: 40, engineOn: true });
  fm.throttle = 0.25; fm.flapsCmd = fm.flaps = 0.66;
  let td = null;
  for (let i = 0; i < 120 * 60; i++) {
    const o = fm.out, a = sim.att();
    const tgtVs = Math.max(-3.5, Math.min(0, (4 - o.agl) * 0.5 - 1.5));
    const pT = Math.max(-0.1, Math.min(0.2, 0.04 + (tgtVs - fm.vel.y) * 0.06));
    const cmd = { pitch: Math.max(-1, Math.min(1, (pT - a.pitch) * 3 + fm.omega.x)), roll: -a.bank * 2, yaw: Math.max(-1, Math.min(1, -(Math.PI / 2 - fm.heading()) * 3)) };
    if (o.onGround) { fm.throttle = 0; fm.brake = 1; if (td === null) td = r(fm.pos.x, 2); }
    sim.step(1, cmd, 'normal');
    if (i % 6 === 0) tr.push(state(fm));
    if (o.onGround && o.groundSpeed < 0.3) break;
  }
  rec(`landing.${id}`, tr, { touchdownX: td, stopX: r(fm.pos.x, 2), final: state(fm) });
}
// 4: hot day = the model's own density/ambient parameters (no temperature input exists; run at altitude to vary density).
for (const id of ['ipanema', 'at802']) {
  const A = AIRCRAFT_TYPES[id].flight; const sim = makeSim({ hopper: 500, fuel: 150, wind: true, A }); const { fm, env } = sim; const tr = [];
  fm.reset(new Vector3(0, env.ground(0, 0) + A.aglOffset + 1500, 0), 0.7, { speed: 55, engineOn: true }); fm.throttle = 1;
  for (let i = 0; i < 120 * 30; i++) { sim.step(1, { pitch: 0.05 * Math.sin(i / 200), roll: 0.2 * Math.sin(i / 300), yaw: 0 }, 'normal'); if (i % 6 === 0) tr.push(state(fm)); }
  rec(`highalt.${id}`, tr, { final: state(fm) });
}
// 7: helicopters: climb, hover, forward flight, descent, both models.
for (const [name, A] of [['r44', undefined], ['b206', FLIGHT_B206]]) for (const model of ['rotor', 'power']) {
  const { fm, env } = makeHeli({ engineOn: true, alt: 100, fuel: 100, hopper: 100, model, ...(A ? { A } : {}) }); const tr = [];
  const DT = 1 / 120, as = new HeliAssist();
  for (let i = 0; i < 120 * 40; i++) {
    const t = i / 120;
    const c = { pitch: t > 15 && t < 30 ? -0.3 : 0, roll: t > 30 ? 0.1 : 0, yaw: 0, lever: t < 10 ? 0.55 : 0.5, leverRate: 0 };
    as.update(fm, c, 'normal', DT);
    fm.step(DT, env);
    if (i % 6 === 0) tr.push([...state(fm), r(fm.power, 1), r(fm.collective, 4)]);
  }
  rec(`heli.${name}.${model}`, tr, { final: state(fm) });
}
// 8: spraying a field pass with coverage + hopper use, for three aircraft, with a crosswind.
for (const id of ['ipanema', 'at502', 'm18']) {
  const T = AIRCRAFT_TYPES[id], soy = CONTRACT_FIELDS.find((f) => f.name === 'T-07');
  const sim = makeSim({ hopper: 900, fuel: 160, wind: false, A: T.flight }); const { fm, env } = sim;
  const windVec = new Vector3(2.5, 0, 3);
  const game = { aircraft: { fm, env, windVec, type: T, A: T.flight }, toast() {}, audio: null };
  const sp = new Sprayer(game); const cov = new FieldCoverage(soy); sp.setTargets([cov]);
  const z = -280, top = env.top(soy.x0 - 30, z);
  fm.reset(new Vector3(soy.x0 - 30, top + T.flight.aglOffset + 3.4, z), Math.PI / 2, { speed: 46, engineOn: true }); fm.throttle = 0.75; sp.on = true;
  const tr = [];
  for (let i = 0; fm.pos.x < soy.x1 + 30 && i < 120 * 60; i++) {
    env.wind.copy(windVec);
    fm.quat.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2); fm.omega.set(0, 0, 0); fm.vel.set(46, 0, 0);
    fm.pos.y = env.top(fm.pos.x, z) + T.flight.aglOffset + 3.4; fm.pos.z = z;
    fm.step(1 / 120, env); sp.step(1 / 120);
    if (i % 24 === 0) tr.push([...state(fm), r(sp.applied ?? 0, 4)]);
  }
  let sum = 0; for (let k = 0; k < cov.dose.length; k++) sum += cov.dose[k];
  rec(`spray.${id}`, tr, { doseSum: r(sum, 4), hash2: hash(Array.from(cov.dose).map((v) => r(v, 4))), hopperLeft: r(fm.hopper, 3), final: state(fm) });
}
fs.writeFileSync(process.argv[2] || 'golden.json', JSON.stringify(out, null, 1));
console.log(Object.keys(out).length, 'scenarios;', Object.entries(out).map(([k, v]) => `${k}:${v.hash}`).join(' ').slice(0, 400));
