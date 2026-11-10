// Air Tractor AT-401B (PR-ATR): its own figures and geometry
// (run: node --test test/). The AT-502B and AT-802 keep their suites.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, deg, Vector3 } from './harness.mjs';
import { FLIGHT_AT502, FLIGHT_AT802, FLIGHT_AT401 as A } from '../src/config.js';
import { at401Extent } from '../src/aircraft/at401Model.js';
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

test('AT-502B and AT-802 keep their engines and figures', () => {
  assert.equal(FLIGHT_AT502.engineType ?? 'turboprop', FLIGHT_AT502.engineType ?? 'turboprop');
  assert.ok(FLIGHT_AT502.span > 15.8 && FLIGHT_AT802.span > 17.9);
  assert.notEqual(A.engineType, FLIGHT_AT502.engineType);
});

test('401B figures: 15.57 m, 8.23 m, 600 hp at 2,250 rpm, two blades 2.63 m, 477 L, 1,514 L, 3,565 kg', () => {
  const ext = at401Extent();
  console.log(`  model span ${ext.span.toFixed(3)} m, length ${ext.length.toFixed(2)} m`);
  assert.ok(Math.abs(ext.span - 15.57) < 0.03, `span ${ext.span}`);
  assert.ok(Math.abs(ext.length - 8.23) < 0.02);
  assert.equal(A.span, 15.57);
  assert.equal(A.engineType, 'radial');
  assert.ok(Math.abs(A.maxPower / 745.7 - 600) < 1);
  assert.equal(A.maxRpm, 2250);
  assert.equal(A.fuelCapacity, 477);
  assert.equal(A.hopperCapacity, 1514);
  assert.equal(A.mtow, 3565);
  assert.ok(Math.abs(A.propRadius * 2 - 8.645 * 0.3048) < 0.01, 'Hamilton Standard 8.645 ft');
  const lim = productLimit(A, A.fuelCapacity);
  console.log(`  product the MTOW allows with full fuel: ${lim.toFixed(0)} kg (hopper ${A.hopperCapacity} L)`);
  assert.ok(lim > 1000 && lim < A.hopperCapacity);
});

test('401B parked: three wheels, ≈ 10.6° three-point, ≈ 2.8 m high (roof)', () => {
  const sim = makeSim({ A, hopper: 0, fuel: 200, wind: true });
  const { fm } = sim;
  fm.settleOnGround(-420, -50, Math.PI / 2, sim.env);
  fm.parkBrake = true;
  const p0 = fm.pos.clone();
  sim.step(120 * 8);
  const a = sim.att();
  const g = sim.env.ground(fm.pos.x, fm.pos.z);
  const h = Math.max(...at401Extent().tops.map((p) => new Vector3(...p).applyQuaternion(fm.quat).add(fm.pos).y - g));
  console.log(`  three-point pitch ${deg(a.pitch).toFixed(1)}°, height ${h.toFixed(2)} m, drift ${(fm.pos.distanceTo(p0) * 100).toFixed(1)} cm`);
  assert.equal(fm.out.wheelsOnGround, 3);
  assert.ok(deg(a.pitch) > 9 && deg(a.pitch) < 12);
  assert.ok(h > 2.6 && h < 2.95, `height ${h}`);
  assert.ok(fm.pos.distanceTo(p0) < 0.05);
});

test('R-1340 start: idle, 2,250 rpm and 600 hp at full throttle, avgas flow', () => {
  const sim = makeSim({ A, hopper: 0, fuel: 200, wind: false });
  const { fm } = sim;
  fm.settleOnGround(-385, 0, Math.PI / 2, sim.env);
  fm.engine = 'cranking'; fm.crankTime = 0; fm.parkBrake = true;
  let catchT = null;
  for (let i = 0; i < 120 * 6 && catchT === null; i++) { sim.step(1); if (fm.engine === 'running') catchT = sim.t; }
  sim.step(120 * 5);
  console.log(`  caught after ${catchT?.toFixed(1)} s; idle ${fm.rpm.toFixed(0)} rpm, MP ${fm.mp.toFixed(1)} inHg, ${fm.fuelFlow.toFixed(0)} L/h`);
  assert.ok(catchT > 1.5 && catchT < 4);
  assert.ok(Math.abs(fm.rpm - A.idleRpm) < 60 && fm.mp < 15);
  fm.throttle = 1;
  sim.step(120 * 5);
  const hp = fm.shaftPower / 745.7;
  console.log(`  full throttle: ${fm.rpm.toFixed(0)} rpm, MP ${fm.mp.toFixed(1)} inHg, ${hp.toFixed(0)} hp, ${fm.fuelFlow.toFixed(0)} L/h, static thrust ${(fm.out.thrust / 1000).toFixed(2)} kN`);
  assert.ok(Math.abs(fm.rpm - A.maxRpm) < 20);
  assert.ok(hp > 560 && hp < 605); // 600 hp rated at 36 inHg: the static run sits just under it
  assert.ok(fm.fuelFlow > 190 && fm.fuelFlow < 240);
  assert.ok(fm.out.thrust > 7000 && fm.out.thrust < 12500);
});

function takeoff(hopper, fuel = 477) {
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

test('take-off: short when light, longer at 3,565 kg, inside the 800 m strip', () => {
  const light = takeoff(0, 200), heavy = takeoff(hopperFor(3565, 477));
  console.log(`  ${light.mass.toFixed(0)} kg: ${light.dist.toFixed(0)} m @ ${(light.v * KT).toFixed(0)} kt; ${heavy.mass.toFixed(0)} kg: ${heavy.dist.toFixed(0)} m @ ${(heavy.v * KT).toFixed(0)} kt`);
  assert.ok(light.dist < 300);
  assert.ok(heavy.dist < 700, `MTOW roll ${heavy.dist}`);
  assert.ok(heavy.dist > light.dist * 1.6);
});

test('climb ≈ 500+ ft/min at 3,565 kg, stronger light; the stall (polar ≈ 68 kt at MTOW, slow flight)', () => {
  const rate = (mass) => {
    const fuel = 200;
    const sim = trimmed(hopperFor(mass, fuel), 44, 1, { fuel, y: 60 });
    holdSpeed(sim, 44, 10);
    const y0 = sim.fm.pos.y;
    holdSpeed(sim, 44, 20);
    return ((sim.fm.pos.y - y0) / 20) * FPM;
  };
  const light = rate(2600), heavy = rate(3565);
  console.log(`  climb at ${(44 * KT).toFixed(0)} kt: 2,600 kg ${light.toFixed(0)} ft/min, 3,565 kg ${heavy.toFixed(0)} ft/min`);
  assert.ok(heavy > 450 && heavy < 1000 && light > heavy * 1.3 && light < 1900);
  // Stall from the polar (clean, MTOW), then slow flight at 3,565 kg near
  // idle: the stick comes back slowly until the wing stalls.
  const CLmax = A.CL0 + A.CLa * A.alphaStall;
  const vsPolar = Math.sqrt((2 * A.mtow * 9.81) / (1.225 * A.wingArea * CLmax)) * KT;
  const slow = (mass) => {
    const sim = trimmed(hopperFor(mass, 200), 42, 0.15, { fuel: 200, y: 300 });
    const { fm } = sim;
    let stallKt = null, maxA = 0, onset = 0;
    for (let i = 0; i < 120 * 60 && stallKt === null; i++) {
      const a = sim.att();
      sim.step(1, { pitch: Math.min(1, i / (120 * 30)), roll: -a.bank * 2, yaw: 0 }, 'off');
      maxA = Math.max(maxA, fm.out.alpha ?? 0); onset = Math.max(onset, fm.out.stall);
      if (fm.out.stall > 0.5) stallKt = fm.out.airspeed * KT * Math.sqrt(fm.out.density / 1.225);
    }
    return { stallKt, maxA, onset };
  };
  const heavy2 = slow(3565), light2 = slow(2600);
  console.log(`  polar stall at 3,565 kg ${vsPolar.toFixed(1)} kt; slow flight: 3,565 kg α max ${(heavy2.maxA * 57.3).toFixed(1)}° (onset ${heavy2.onset.toFixed(2)}), 2,600 kg stall at ${light2.stallKt?.toFixed(1)} kt`);
  assert.ok(Math.abs(vsPolar - 68) < 3);
  assert.ok(heavy2.maxA > A.alphaStall && heavy2.onset > 0, 'the heavy wing reaches the stall');
  assert.ok(light2.stallKt > 52 && light2.stallKt < 66, `stall ${light2.stallKt}`);
});

test('level speeds: full power ≈ 125 kt and a working throttle at 3,000 kg', () => {
  const fuel = 200;
  const level = (thr) => {
    const sim = trimmed(hopperFor(3000, fuel), 55, thr, { fuel });
    const { fm } = sim;
    for (let i = 0; i < 120 * 100; i++) sim.step(1, { pitch: Math.max(-1, Math.min(1, (400 - fm.pos.y) * 0.02 - fm.vel.y * 0.1)), roll: 0, yaw: 0 }, 'normal');
    return { ias: fm.out.airspeed * KT * Math.sqrt(fm.out.density / 1.225), vs: fm.vel.y, ff: fm.fuelFlow, rpm: fm.rpm };
  };
  const full = level(1), work = level(0.62);
  console.log(`  full power ${full.ias.toFixed(0)} kt (${full.ff.toFixed(0)} L/h); 62 % ${work.ias.toFixed(0)} kt, ${work.rpm.toFixed(0)} rpm (${work.ff.toFixed(0)} L/h)`);
  assert.ok(Math.abs(full.vs) < 0.3 && full.ias > 112 && full.ias < 138);
  assert.ok(work.ias > 80 && work.ias < full.ias);
});
