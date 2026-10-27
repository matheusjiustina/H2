// Embraer EMB-203 Ipanema (PR-IPB): its own figures and geometry
// (run: node --test test/). The EMB-202A keeps its own suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, deg, Vector3 } from './harness.mjs';
import { FLIGHT, FLIGHT_E203 as A } from '../src/config.js';
import { e203Extent } from '../src/aircraft/e203Model.js';
import { productLimit } from '../src/aircraft/types.js';

const KT = 1.943844, FPM = 196.85;
const hopperFor = (massKg, fuel) => massKg - A.emptyMass - A.pilotMass - fuel * A.fuelDensity;
function trimmed(hopper, speed, throttle, { fuel = 200, y = 400 } = {}) {
  const sim = makeSim({ A, hopper, fuel, wind: false });
  sim.fm.reset(new Vector3(0, y, -300), Math.PI / 2, { speed, engineOn: true });
  sim.fm.throttle = throttle;
  return sim;
}
function holdSpeed(sim, target, seconds) {
  const { fm } = sim;
  for (let i = 0; i < 120 * seconds; i++) {
    const a = sim.att();
    const pitchT = Math.max(-0.35, Math.min(0.25, (fm.out.airspeed - target) * 0.04));
    sim.step(1, { pitch: Math.max(-1, Math.min(1, (pitchT - a.pitch) * 3 + fm.omega.x)), roll: -a.bank * 2, yaw: 0 }, 'normal');
  }
}

test('EMB-202A keeps its engine and figures', () => {
  assert.equal(FLIGHT.radial, undefined);
  assert.equal(FLIGHT.maxPower, 239e3);
  assert.equal(FLIGHT.hopperCapacity, 900);
  assert.equal(FLIGHT.span, 11.7);
});

test('203 figures: 13.30 m, 8.00 m, 320 hp at 2,700 rpm, 292 L, 1,050 L, 1,900 kg; volume is not payload', () => {
  const ext = e203Extent();
  console.log(`  model span ${ext.span.toFixed(3)} m, length ${ext.length.toFixed(2)} m`);
  assert.ok(Math.abs(ext.span - 13.3) < 0.02, `span ${ext.span}`);
  assert.ok(Math.abs(ext.length - 8.0) < 0.01);
  assert.equal(A.span, 13.3);
  assert.ok(Math.abs(A.maxPower / 745.7 - 320) < 0.5);
  assert.equal(A.maxRpm, 2700);
  assert.equal(A.fuelCapacity, 292);
  assert.equal(A.hopperCapacity, 1050);
  assert.equal(A.mtow, 1900);
  assert.ok(Math.abs(A.propRadius * 2 - 86 * 0.0254) < 0.01, 'Hartzell 86 in');
  const lim = productLimit(A, A.fuelCapacity);
  console.log(`  product the MTOW allows with full fuel: ${lim.toFixed(0)} kg (hopper ${A.hopperCapacity} L)`);
  assert.ok(lim > 400 && lim < 600 && lim < A.hopperCapacity);
});

test('203 parked: three wheels, nearly level (≈ 3°), 2.43 m high', () => {
  const sim = makeSim({ A, hopper: 0, fuel: 200, wind: true });
  const { fm } = sim;
  fm.settleOnGround(-420, -50, Math.PI / 2, sim.env);
  fm.parkBrake = true;
  const p0 = fm.pos.clone();
  sim.step(120 * 8);
  const a = sim.att();
  const g = sim.env.ground(fm.pos.x, fm.pos.z);
  const h = Math.max(...e203Extent().tops.map((p) => new Vector3(...p).applyQuaternion(fm.quat).add(fm.pos).y - g));
  console.log(`  three-point pitch ${deg(a.pitch).toFixed(1)}°, height ${h.toFixed(2)} m, drift ${(fm.pos.distanceTo(p0) * 100).toFixed(1)} cm`);
  assert.equal(fm.out.wheelsOnGround, 3);
  assert.ok(deg(a.pitch) > 2 && deg(a.pitch) < 5);
  assert.ok(Math.abs(h - 2.43) < 0.08, `height ${h}`);
  assert.ok(fm.pos.distanceTo(p0) < 0.05);
});

test('IO-540 start and the constant-speed prop: idle, governed 2,700 rpm, 320 hp, ethanol flow', () => {
  const sim = makeSim({ A, hopper: 0, fuel: 200, wind: false });
  const { fm } = sim;
  fm.settleOnGround(-385, 0, Math.PI / 2, sim.env);
  fm.engine = 'cranking'; fm.crankTime = 0; fm.parkBrake = true;
  let catchT = null;
  for (let i = 0; i < 120 * 6 && catchT === null; i++) { sim.step(1); if (fm.engine === 'running') catchT = sim.t; }
  sim.step(120 * 5);
  console.log(`  caught after ${catchT?.toFixed(1)} s; idle ${fm.rpm.toFixed(0)} rpm, MP ${fm.mp.toFixed(1)} inHg, ${fm.fuelFlow.toFixed(0)} L/h`);
  assert.ok(catchT > 1 && catchT < 2.5);
  assert.ok(Math.abs(fm.rpm - A.idleRpm) < 60 && fm.mp < 15);
  fm.throttle = 1;
  sim.step(120 * 5);
  const hp = fm.shaftPower / 745.7;
  console.log(`  full throttle: ${fm.rpm.toFixed(0)} rpm, MP ${fm.mp.toFixed(1)} inHg, ${hp.toFixed(0)} hp, ${fm.fuelFlow.toFixed(0)} L/h, static thrust ${(fm.out.thrust / 1000).toFixed(2)} kN`);
  assert.ok(Math.abs(fm.rpm - A.maxRpm) < 20);
  assert.ok(hp > 310 && hp < 322);
  assert.ok(fm.fuelFlow > 100 && fm.fuelFlow < 125);
  assert.ok(fm.out.thrust > 3800 && fm.out.thrust < 6500);
});

function takeoff(hopper, fuel = 292) {
  const sim = makeSim({ A, hopper, fuel, wind: false });
  const { fm } = sim;
  fm.settleOnGround(-385, 0, Math.PI / 2, sim.env);
  fm.engine = 'running'; fm.rpm = A.idleRpm; fm.mp = A.radial.mpIdle; fm.throttle = 0.05;
  fm.flapsCmd = fm.flaps = 1 / 3;
  sim.step(240);
  const x0 = fm.pos.x;
  const vs = Math.sqrt((2 * fm.mass * 9.81) / (1.225 * A.wingArea * 1.9));
  const cmd = { pitch: 0, roll: 0, yaw: 0 };
  for (let i = 0; i < 120 * 90; i++) {
    fm.throttle = Math.min(1, fm.throttle + 0.55 / 120);
    cmd.yaw = Math.max(-1, Math.min(1, -(Math.PI / 2 - fm.heading()) * 3 + fm.omega.y * 1.5));
    const v = fm.out.airspeed;
    cmd.pitch = v < 14 ? 0 : v < vs * 1.1 ? -0.2 : 0.6;
    sim.step(1, cmd, 'normal');
    if (!fm.out.onGround && fm.out.agl > 0.5) return { dist: fm.pos.x - x0, v, mass: fm.mass };
  }
  return { dist: Infinity };
}

test('take-off: short when light, longer at 1,900 kg, inside the 800 m strip', () => {
  const light = takeoff(0, 120), heavy = takeoff(hopperFor(1900, 292));
  console.log(`  ${light.mass.toFixed(0)} kg: ${light.dist.toFixed(0)} m @ ${(light.v * KT).toFixed(0)} kt; ${heavy.mass.toFixed(0)} kg: ${heavy.dist.toFixed(0)} m @ ${(heavy.v * KT).toFixed(0)} kt`);
  assert.ok(light.dist < 230);
  assert.ok(heavy.dist < 520, `MTOW roll ${heavy.dist}`);
  assert.ok(heavy.dist > light.dist * 1.6);
});

test('climb positive at 1,900 kg and stronger light; stall at MTOW from the polar', () => {
  const rate = (mass) => {
    const fuel = 200;
    const sim = trimmed(hopperFor(mass, fuel), 36, 1, { fuel, y: 60 });
    holdSpeed(sim, 36, 10);
    const y0 = sim.fm.pos.y;
    holdSpeed(sim, 36, 20);
    return ((sim.fm.pos.y - y0) / 20) * FPM;
  };
  const light = rate(1450), heavy = rate(1900);
  console.log(`  climb at ${(36 * KT).toFixed(0)} kt: 1,450 kg ${light.toFixed(0)} ft/min, 1,900 kg ${heavy.toFixed(0)} ft/min`);
  assert.ok(heavy > 350 && light > heavy * 1.25 && light < 1600);
  // Stall: clean, 1 g, at MTOW.
  const fuel = 200;
  const sim = trimmed(hopperFor(1900, fuel), 40, 0, { fuel });
  const { fm } = sim;
  let ei = 0.1, res = null;
  for (let i = 0; i < 120 * 90 && !res; i++) {
    const a = sim.att();
    ei += (-fm.vel.y * 0.02 - (fm.pos.y - 400) * 0.002) / 120;
    sim.step(1, { pitch: Math.max(-1, Math.min(1, ei - fm.vel.y * 0.05 + fm.omega.x * 0.6)), roll: -a.bank * 2, yaw: 0 }, 'off');
    if (fm.out.stall > 0.3) res = { eas: fm.out.airspeed * Math.sqrt(fm.out.density / 1.225), g: fm.out.gLoad };
  }
  assert.ok(res, 'must stall');
  const vs1g = (res.eas / Math.sqrt(Math.max(0.5, res.g))) * KT;
  console.log(`  clean stall at 1,900 kg: ${vs1g.toFixed(0)} kt (polar: 56)`);
  assert.ok(Math.abs(vs1g - 56) < 5);
});

test('level speeds: full power and a working throttle at 1,700 kg', () => {
  const fuel = 200;
  const level = (thr) => {
    const sim = trimmed(hopperFor(1700, fuel), 50, thr, { fuel });
    const { fm } = sim;
    for (let i = 0; i < 120 * 100; i++) sim.step(1, { pitch: Math.max(-1, Math.min(1, (400 - fm.pos.y) * 0.02 - fm.vel.y * 0.1)), roll: 0, yaw: 0 }, 'normal');
    return { ias: fm.out.airspeed * KT * Math.sqrt(fm.out.density / 1.225), vs: fm.vel.y, ff: fm.fuelFlow, rpm: fm.rpm };
  };
  const full = level(1), work = level(0.62);
  console.log(`  full power ${full.ias.toFixed(0)} kt (${full.ff.toFixed(0)} L/h); 62 % ${work.ias.toFixed(0)} kt, ${work.rpm.toFixed(0)} rpm (${work.ff.toFixed(0)} L/h)`);
  assert.ok(Math.abs(full.vs) < 0.3 && full.ias > 100 && full.ias < 135);
  assert.ok(work.ias > 80 && work.ias < full.ias);
});
