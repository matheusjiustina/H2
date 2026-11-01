// Cessna A188B AgTruck (PR-AGT): its figures, stance and performance
// (run: node --test test/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, deg, Vector3 } from './harness.mjs';
import { FLIGHT_A188 as A } from '../src/config.js';
import { a188Extent } from '../src/aircraft/a188Model.js';
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


test('AgTruck figures: 12.70 m, 7.94 m, 300 hp at 2,850 rpm, 204 L, 1,060 L, 1,905 kg; volume is not payload', () => {
  const ext = a188Extent();
  console.log(`  model span ${ext.span.toFixed(3)} m, length ${ext.length.toFixed(2)} m`);
  assert.ok(Math.abs(ext.span - 12.7) < 0.02, `span ${ext.span}`);
  assert.ok(Math.abs(ext.length - 7.94) < 0.03);
  assert.equal(A.span, 12.7);
  assert.ok(Math.abs(A.maxPower / 745.7 - 300) < 0.5);
  assert.equal(A.maxRpm, 2850);
  assert.equal(A.fuelCapacity, 204);
  assert.equal(A.hopperCapacity, 1060);
  assert.equal(A.mtow, 1905);
  const lim = productLimit(A, A.fuelCapacity);
  console.log(`  product the MTOW allows with full fuel: ${lim.toFixed(0)} kg (hopper ${A.hopperCapacity} L)`);
  assert.ok(lim > 550 && lim < 750 && lim < A.hopperCapacity);
});

test('AgTruck parked: three wheels, the PR-LEO stance (datum ≈ 7° nose-up), ≈ 2.4 m high', () => {
  const sim = makeSim({ A, hopper: 0, fuel: 150, wind: true });
  const { fm } = sim;
  fm.settleOnGround(-420, -50, Math.PI / 2, sim.env);
  fm.parkBrake = true;
  const p0 = fm.pos.clone();
  sim.step(120 * 8);
  const a = sim.att();
  const g = sim.env.ground(fm.pos.x, fm.pos.z);
  const h = Math.max(...a188Extent().tops.map((p) => new Vector3(...p).applyQuaternion(fm.quat).add(fm.pos).y - g));
  console.log(`  three-point pitch ${deg(a.pitch).toFixed(1)}°, height ${h.toFixed(2)} m, drift ${(fm.pos.distanceTo(p0) * 100).toFixed(1)} cm`);
  assert.equal(fm.out.wheelsOnGround, 3);
  assert.ok(deg(a.pitch) > 6 && deg(a.pitch) < 8.5, `pitch ${deg(a.pitch)}`);
  assert.ok(h > 2.3 && h < 2.5, `height ${h}`);
  assert.ok(fm.pos.distanceTo(p0) < 0.05);
});

test('IO-520 start and the constant-speed prop: idle, governed 2,850 rpm, 300 hp', () => {
  const sim = makeSim({ A, hopper: 0, fuel: 150, wind: false });
  const { fm } = sim;
  fm.settleOnGround(-385, 0, Math.PI / 2, sim.env);
  fm.engine = 'cranking'; fm.crankTime = 0; fm.parkBrake = true;
  let catchT = null;
  for (let i = 0; i < 120 * 6 && catchT === null; i++) { sim.step(1); if (fm.engine === 'running') catchT = sim.t; }
  sim.step(120 * 5);
  console.log(`  caught after ${catchT?.toFixed(1)} s; idle ${fm.rpm.toFixed(0)} rpm, MP ${fm.mp.toFixed(1)} inHg`);
  assert.ok(catchT > 1 && catchT < 2.5);
  assert.ok(Math.abs(fm.rpm - A.idleRpm) < 70 && fm.mp < 15);
  fm.throttle = 1;
  sim.step(120 * 5);
  const hp = fm.shaftPower / 745.7;
  console.log(`  full throttle: ${fm.rpm.toFixed(0)} rpm, ${hp.toFixed(0)} hp, ${fm.fuelFlow.toFixed(0)} L/h, static thrust ${(fm.out.thrust / 1000).toFixed(2)} kN`);
  assert.ok(Math.abs(fm.rpm - A.maxRpm) < 25);
  assert.ok(hp > 290 && hp < 302);
  assert.ok(fm.fuelFlow > 85 && fm.fuelFlow < 110);
});

function takeoff(hopper, fuel = 204) {
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

test('take-off: short when light, longer at 1,905 kg, inside the 800 m strip', () => {
  const light = takeoff(0, 100), heavy = takeoff(hopperFor(1905, 204));
  console.log(`  ${light.mass.toFixed(0)} kg: ${light.dist.toFixed(0)} m @ ${(light.v * KT).toFixed(0)} kt; ${heavy.mass.toFixed(0)} kg: ${heavy.dist.toFixed(0)} m @ ${(heavy.v * KT).toFixed(0)} kt`);
  assert.ok(light.dist < 220);
  assert.ok(heavy.dist < 520, `MTOW roll ${heavy.dist}`);
  assert.ok(heavy.dist > light.dist * 1.6);
});

test('climb positive at 1,905 kg and stronger light; level speeds', () => {
  const rate = (mass) => {
    const fuel = 150;
    const sim = trimmed(hopperFor(mass, fuel), 35, 1, { fuel, y: 60 });
    holdSpeed(sim, 35, 10);
    const y0 = sim.fm.pos.y;
    holdSpeed(sim, 35, 20);
    return ((sim.fm.pos.y - y0) / 20) * FPM;
  };
  const light = rate(1350), heavy = rate(1905);
  console.log(`  climb at ${(35 * KT).toFixed(0)} kt: 1,350 kg ${light.toFixed(0)} ft/min, 1,905 kg ${heavy.toFixed(0)} ft/min`);
  assert.ok(heavy > 250 && light > heavy * 1.25 && light < 1600);
  const fuel = 150;
  const sim = trimmed(hopperFor(1600, fuel), 50, 1, { fuel });
  const { fm } = sim;
  for (let i = 0; i < 120 * 100; i++) sim.step(1, { pitch: Math.max(-1, Math.min(1, (400 - fm.pos.y) * 0.02 - fm.vel.y * 0.1)), roll: 0, yaw: 0 }, 'normal');
  const ias = fm.out.airspeed * KT * Math.sqrt(fm.out.density / 1.225);
  console.log(`  full power level at 1,600 kg: ${ias.toFixed(0)} kt`);
  assert.ok(Math.abs(fm.vel.y) < 0.3 && ias > 95 && ias < 130);
});
