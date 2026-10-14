// Exploratory flight checks with printed numbers (used while tuning).
import { makeSim, deg } from './harness.mjs';
import { KT } from '../src/core/math.js';
import { BASE } from '../src/world/layout.js';

function takeoff(hopper, label) {
  const sim = makeSim({ hopper, fuel: 200 });
  const { fm } = sim;
  fm.settleOnGround(-385, 0, Math.PI / 2, sim.env);
  sim.step(240); // settle 2 s
  const a0 = sim.att();
  console.log(`[${label}] mass ${fm.mass.toFixed(0)} kg, 3-point pitch ${deg(a0.pitch).toFixed(1)}°, y ${fm.pos.y.toFixed(3)}`);
  fm.engine = 'running'; fm.rpm = 900; fm.flapsCmd = fm.flaps = 1 / 3;
  const x0 = fm.pos.x;
  let liftoff = null, t = 0;
  const cmd = { pitch: 0, roll: 0, yaw: 0 };
  for (let i = 0; i < 120 * 60; i++) {
    fm.throttle = Math.min(1, fm.throttle + 0.55 / 120);
    // Keep runway heading with rudder.
    const hdgErr = Math.PI / 2 - fm.heading();
    cmd.yaw = Math.max(-1, Math.min(1, -hdgErr * 3 - fm.omega.y * -1.5));
    cmd.roll = 0;
    const v = fm.out.airspeed;
    const vr = hopper > 400 ? 31 : 26;
    if (v < 14) cmd.pitch = 0; else if (v < vr) cmd.pitch = -0.15; else cmd.pitch = 0.35;
    sim.step(1, cmd);
    t += 1 / 120;
    if (!liftoff && !fm.out.onGround && fm.out.agl > 0.3) liftoff = { d: fm.pos.x - x0, t, v: fm.out.airspeed };
    if (liftoff && fm.out.agl > 15) break;
  }
  const a = sim.att();
  console.log(`[${label}] liftoff after ${liftoff?.d.toFixed(0)} m, ${liftoff?.t.toFixed(1)} s at ${(liftoff?.v * KT).toFixed(0)} kt; 15 m reached at x=${(fm.pos.x - x0).toFixed(0)} m; pitch ${deg(a.pitch).toFixed(1)} bank ${deg(a.bank).toFixed(1)} z-dev ${fm.pos.z.toFixed(1)}`);
  return sim;
}

function cruiseAndGlide(sim, label) {
  const { fm } = sim;
  const cmd = { pitch: 0, roll: 0, yaw: 0 };
  fm.flapsCmd = 0; fm.flaps = 0;
  // Climb to ~150 m AGL.
  for (let i = 0; i < 120 * 60 && fm.out.agl < 150; i++) {
    cmd.pitch = fm.out.airspeed > 38 ? 0.15 : fm.out.airspeed < 33 ? -0.1 : 0;
    sim.step(1, cmd);
  }
  cmd.pitch = 0;
  fm.throttle = 0.72;
  sim.step(120 * 20, cmd);
  console.log(`[${label}] cruise 72%: ${(fm.out.airspeed * KT).toFixed(0)} kt, vs ${fm.out.vs.toFixed(2)} m/s, rpm ${fm.rpm.toFixed(0)}, fuel ${fm.fuel.toFixed(1)} L`);
  fm.throttle = 1;
  sim.step(120 * 25, cmd);
  console.log(`[${label}] full power level: ${(fm.out.airspeed * KT).toFixed(0)} kt, vs ${fm.out.vs.toFixed(2)}`);
  // Glide: idle, hold ~ 65 kt with raw pitch control loop.
  fm.throttle = 0;
  const p0 = fm.pos.clone(), y0 = fm.pos.y;
  let tt = 0;
  for (let i = 0; i < 120 * 30; i++) {
    const err = fm.out.airspeed - 34;
    cmd.pitch = Math.max(-0.4, Math.min(0.4, err * 0.05));
    sim.step(1, cmd);
    tt += 1 / 120;
  }
  const dist = Math.hypot(fm.pos.x - p0.x, fm.pos.z - p0.z), drop = y0 - fm.pos.y;
  console.log(`[${label}] glide 30 s: speed ${(fm.out.airspeed * KT).toFixed(0)} kt, sink ${(drop / tt).toFixed(2)} m/s, L/D ${(dist / drop).toFixed(1)}`);
}

function turnTest(label, hopper) {
  const sim = makeSim({ hopper, wind: false });
  const { fm } = sim;
  fm.reset(new sim.fm.pos.constructor(0, 300, 0), Math.PI / 2, { speed: 46, engineOn: true });
  fm.throttle = 0.8;
  const cmd = { pitch: 0, roll: 0, yaw: 0 };
  sim.step(120 * 5, cmd);
  const v0 = fm.out.airspeed, h0 = fm.pos.y;
  // Roll in with the stick, then centre (assist holds the bank).
  cmd.roll = 0.6; sim.step(60, cmd);
  const rollRate = deg(fm.omega.z);
  cmd.roll = 0;
  let t = 0, yaw0 = fm.heading(), turned = 0, prev = yaw0;
  for (let i = 0; i < 120 * 30; i++) {
    sim.step(1, cmd); t += 1 / 120;
    let d = fm.heading() - prev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
    turned += d; prev = fm.heading();
  }
  const a = sim.att();
  console.log(`[${label}] roll rate (0.5 s @0.6 stick) ${rollRate.toFixed(0)}°/s; held bank ${deg(a.bank).toFixed(0)}°, turn ${(deg(Math.abs(turned)) / t).toFixed(1)}°/s, speed ${(v0 * KT).toFixed(0)}→${(fm.out.airspeed * KT).toFixed(0)} kt, alt ${(fm.pos.y - h0).toFixed(0)} m`);
}

function stallTest(label, hopper) {
  const sim = makeSim({ hopper, wind: false });
  const { fm } = sim;
  fm.reset(new sim.fm.pos.constructor(0, 400, 0), Math.PI / 2, { speed: 40, engineOn: true });
  fm.throttle = 0;
  const cmd = { pitch: 0.8, roll: 0, yaw: 0 };
  let stallT = null, minV = 99, t = 0;
  for (let i = 0; i < 120 * 20; i++) {
    sim.step(1, cmd, 'off'); t += 1 / 120;
    minV = Math.min(minV, fm.out.airspeed);
    if (stallT === null && fm.out.stall > 0.5) stallT = { t, v: fm.out.airspeed, a: fm.out.alpha };
  }
  const lost0 = fm.pos.y;
  cmd.pitch = -0.3; fm.throttle = 1;
  let rec = null;
  for (let i = 0; i < 120 * 15; i++) {
    sim.step(1, cmd, 'off');
    if (fm.out.stall < 0.05 && fm.out.airspeed > 30) { cmd.pitch = 0.1; if (!rec) rec = { y: fm.pos.y }; }
  }
  console.log(`[${label}] stall (no assist) at ${stallT ? (stallT.v * KT).toFixed(0) + ' kt, alpha ' + deg(stallT.a).toFixed(1) + '°' : 'never'}; min ${(minV * KT).toFixed(0)} kt; recovered ${rec ? 'yes, lost ' + (lost0 - rec.y).toFixed(0) + ' m' : 'no'}; final vs ${fm.out.vs.toFixed(1)}`);
  // With assist the same pull should not stall.
  const s2 = makeSim({ hopper, wind: false });
  s2.fm.reset(new sim.fm.pos.constructor(0, 400, 0), Math.PI / 2, { speed: 40, engineOn: true });
  s2.fm.throttle = 0;
  let maxStall = 0;
  for (let i = 0; i < 120 * 20; i++) { s2.step(1, { pitch: 0.8, roll: 0, yaw: 0 }, 'normal'); maxStall = Math.max(maxStall, s2.fm.out.stall); }
  console.log(`[${label}] same pull with assist: max stall ${maxStall.toFixed(2)}, speed ${(s2.fm.out.airspeed * KT).toFixed(0)} kt`);
}

function parked() {
  const sim = makeSim({ hopper: 0 });
  const { fm } = sim;
  fm.settleOnGround(BASE.pad.x, BASE.pad.z, BASE.pad.heading, sim.env);
  fm.parkBrake = true;
  const p0 = fm.pos.clone();
  sim.step(120 * 10);
  const a = sim.att();
  console.log(`[parked] drift ${fm.pos.distanceTo(p0).toFixed(3)} m, pitch ${deg(a.pitch).toFixed(1)}°, bank ${deg(a.bank).toFixed(2)}°, comp ${fm.gear.map((g) => g.compression.toFixed(3)).join('/')}`);
}

parked();
const s1 = takeoff(0, 'empty');
cruiseAndGlide(s1, 'empty');
const s2 = takeoff(900, 'full');
cruiseAndGlide(s2, 'full');
turnTest('turn empty', 0);
turnTest('turn full', 900);
stallTest('stall empty', 0);
stallTest('stall full', 900);
