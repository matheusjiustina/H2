// Piper PA-36-300 Pawnee Brave (PR-PWB): its figures, stance and performance
// (run: node --test test/). The cruise targets are the type's published
// figures at 75 % power (190 km/h TAS with the spray kit, 228 km/h without);
// the "without" case removes the kit's share of the drag (CDsprayKit).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, deg, Vector3 } from './harness.mjs';
import { FLIGHT_PA36 as A } from '../src/config.js';
import { pa36Extent } from '../src/aircraft/pa36Model.js';
import { productLimit, AIRCRAFT_TYPES } from '../src/aircraft/types.js';

const KT = 1.943844, FPM = 196.85;
const hopperFor = (massKg, fuel) => massKg - A.emptyMass - A.pilotMass - fuel * A.fuelDensity;
function trimmed(hopper, speed, throttle, { fuel = 200, y = 400, Ax = A } = {}) {
  const sim = makeSim({ A: Ax, hopper, fuel, wind: false });
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
function holdLevel(sim, seconds, y) {
  const { fm } = sim;
  for (let i = 0; i < 120 * seconds; i++) sim.step(1, { pitch: Math.max(-1, Math.min(1, (y - fm.pos.y) * 0.02 - fm.vel.y * 0.1)), roll: -sim.att().bank * 2, yaw: 0 }, 'normal');
}
// Throttle that gives 75 % of the rated power at a height (the governor
// holds 2,700 rpm; the higher, the more throttle it takes).
const thr75At = (y) => {
  let lo = 0.5, hi = 1;
  for (let k = 0; k < 14; k++) {
    const mid = (lo + hi) / 2, sim = trimmed(0, 50, mid, { y });
    sim.step(600);
    if (sim.fm.shaftPower / A.maxPower < 0.75) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
};
const thr75 = thr75At(400);

test('Brave figures: 11.8 m, 8.2 m, 300 hp at 2,700 rpm, 2.13 m prop, 326 L, 852 L, 1,039 / 1,996 kg; the MTOW caps the product', () => {
  const ext = pa36Extent();
  console.log(`  model span ${ext.span.toFixed(3)} m, length ${ext.length.toFixed(3)} m, height on the wheels ${ext.height.toFixed(2)} m (reference frame)`);
  assert.ok(Math.abs(ext.span - 11.8) < 0.02, `span ${ext.span}`);
  assert.ok(Math.abs(ext.length - 8.2) < 0.03, `length ${ext.length}`);
  assert.equal(A.span, 11.8);
  assert.equal(A.wingArea, 20.9);
  assert.ok(Math.abs(A.maxPower / 745.7 - 300) < 0.5);
  assert.equal(A.maxRpm, 2700);
  assert.ok(Math.abs(2 * A.propRadius - 2.13) < 0.01);
  assert.equal(A.fuelCapacity, 326);
  assert.equal(A.hopperCapacity, 852);
  assert.equal(A.maxHopperKg, 862);
  assert.equal(A.emptyMass, 1039);
  assert.equal(A.mtow, 1996);
  assert.ok(A.loadByWeight);
  const full = productLimit(A, A.fuelCapacity), dry = productLimit(A, 0);
  console.log(`  product the MTOW allows: ${full.toFixed(0)} kg with full fuel, ${dry.toFixed(0)} kg with none (hopper ${A.hopperCapacity} L, ${A.maxHopperKg} kg)`);
  assert.ok(full > 600 && full < 660 && full < A.hopperCapacity);
  assert.ok(dry <= A.maxHopperKg);
  // A full hopper at full fuel would be over the MTOW: the load sheet flags it.
  assert.ok(A.emptyMass + A.pilotMass + A.fuelCapacity * A.fuelDensity + A.hopperCapacity * A.liquidDensity > A.mtow);
  assert.equal(AIRCRAFT_TYPES.pa36.flight, A);
});

test('Brave parked: three wheels, ≈ 9° nose-up, ≈ 2.3 m high, no creep', () => {
  const sim = makeSim({ A, hopper: 0, fuel: 150, wind: true });
  const { fm } = sim;
  fm.settleOnGround(-420, -50, Math.PI / 2, sim.env);
  fm.parkBrake = true;
  const p0 = fm.pos.clone();
  sim.step(120 * 8);
  const a = sim.att();
  const g = sim.env.ground(fm.pos.x, fm.pos.z);
  const h = Math.max(...pa36Extent().tops.map((p) => new Vector3(...p).applyQuaternion(fm.quat).add(fm.pos).y - g));
  console.log(`  three-point pitch ${deg(a.pitch).toFixed(1)}°, height ${h.toFixed(2)} m, drift ${(fm.pos.distanceTo(p0) * 100).toFixed(1)} cm`);
  assert.equal(fm.out.wheelsOnGround, 3);
  assert.ok(deg(a.pitch) > 7.5 && deg(a.pitch) < 10, `pitch ${deg(a.pitch)}`);
  assert.ok(h > 2.2 && h < 2.4, `height ${h}`);
  assert.ok(fm.pos.distanceTo(p0) < 0.05);
});

test('IO-540-K start and the constant-speed Hartzell: idle, governed 2,700 rpm, 300 hp', () => {
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
  // Normally aspirated: the rated 300 hp at sea level, less at the field's
  // density altitude (Gagg–Ferrar).
  const sigma = fm.out.density / 1.225, rated = 300 * (sigma - 0.12) / 0.88;
  console.log(`  full throttle at σ ${sigma.toFixed(3)}: ${fm.rpm.toFixed(0)} rpm, ${hp.toFixed(0)} hp (${rated.toFixed(0)} expected), MP ${fm.mp.toFixed(1)} inHg, ${fm.fuelFlow.toFixed(0)} L/h, static thrust ${(fm.out.thrust / 1000).toFixed(2)} kN`);
  assert.ok(Math.abs(fm.rpm - A.maxRpm) < 25);
  assert.ok(Math.abs(hp - rated) < 4 && hp < 300);
  assert.ok(fm.mp < A.radial.mpMax && fm.mp > A.radial.mpMax * 0.9);
  assert.ok(fm.fuelFlow > 85 && fm.fuelFlow < 115);
  // Sea-level density: the full 300 hp.
  const sl = makeSim({ A: { ...A, radial: { ...A.radial, lapse: false } }, hopper: 0, fuel: 150, wind: false });
  sl.fm.reset(new Vector3(0, 400, -300), Math.PI / 2, { speed: 40, engineOn: true });
  sl.fm.throttle = 1; sl.step(600);
  assert.ok(Math.abs(sl.fm.shaftPower / 745.7 - 300) < 2);
});

function takeoff(hopper, fuel = 326) {
  const sim = makeSim({ A, hopper, fuel, wind: false });
  const { fm } = sim;
  fm.settleOnGround(-385, 0, Math.PI / 2, sim.env);
  fm.engine = 'running'; fm.rpm = A.idleRpm; fm.mp = A.radial.mpIdle; fm.throttle = 0.05;
  fm.flapsCmd = fm.flaps = 1 / 3;
  sim.step(240);
  const x0 = fm.pos.x;
  const vs = Math.sqrt((2 * fm.mass * 9.81) / (1.225 * A.wingArea * 1.9));
  const cmd = { pitch: 0, roll: 0, yaw: 0 };
  let maxYaw = 0;
  for (let i = 0; i < 120 * 90; i++) {
    fm.throttle = Math.min(1, fm.throttle + 0.55 / 120);
    const err = Math.PI / 2 - fm.heading();
    maxYaw = Math.max(maxYaw, Math.abs(err));
    cmd.yaw = Math.max(-1, Math.min(1, -err * 3 + fm.omega.y * 1.5));
    const v = fm.out.airspeed;
    cmd.pitch = v < 14 ? 0 : v < vs * 1.1 ? -0.2 : 0.6;
    sim.step(1, cmd, 'normal');
    if (!fm.out.onGround && fm.out.agl > 0.5) return { dist: fm.pos.x - x0, v, mass: fm.mass, maxYaw };
  }
  return { dist: Infinity, maxYaw };
}

test('take-off (taildragger, rudder held straight): short when light, longer at 1,996 kg', () => {
  const light = takeoff(0, 120), heavy = takeoff(hopperFor(1996, 326));
  console.log(`  ${light.mass.toFixed(0)} kg: ${light.dist.toFixed(0)} m @ ${(light.v * KT).toFixed(0)} kt; ${heavy.mass.toFixed(0)} kg: ${heavy.dist.toFixed(0)} m @ ${(heavy.v * KT).toFixed(0)} kt; worst heading error ${deg(Math.max(light.maxYaw, heavy.maxYaw)).toFixed(1)}°`);
  assert.ok(light.dist < 230, `light roll ${light.dist}`);
  assert.ok(heavy.dist < 560, `MTOW roll ${heavy.dist}`);
  assert.ok(heavy.dist > light.dist * 1.6);
  assert.ok(deg(Math.max(light.maxYaw, heavy.maxYaw)) < 8);
});

test('climb: weight and altitude both cut it; full-power level speed', () => {
  const rate = (mass, y = 60) => {
    const fuel = 150;
    const sim = trimmed(hopperFor(mass, fuel), 37, 1, { fuel, y });
    holdSpeed(sim, 37, 10);
    const y0 = sim.fm.pos.y;
    holdSpeed(sim, 37, 20);
    return ((sim.fm.pos.y - y0) / 20) * FPM;
  };
  const light = rate(1350), heavy = rate(1996), high = rate(1996, 2100);
  console.log(`  climb at ${(37 * KT).toFixed(0)} kt TAS: 1,350 kg ${light.toFixed(0)} ft/min, 1,996 kg ${heavy.toFixed(0)} ft/min, 1,996 kg at ≈ 8,000 ft MSL ${high.toFixed(0)} ft/min`);
  assert.ok(heavy > 300 && light > heavy * 1.3 && light < 1700);
  assert.ok(high < heavy * 0.8);
  const fuel = 150;
  const sim = trimmed(hopperFor(1700, fuel), 50, 1, { fuel });
  holdLevel(sim, 100, 400);
  const ias = sim.fm.out.airspeed * KT * Math.sqrt(sim.fm.out.density / 1.225);
  console.log(`  full power level at 1,700 kg: ${ias.toFixed(0)} kt IAS`);
  assert.ok(Math.abs(sim.fm.vel.y) < 0.3 && ias > 100 && ias < 125);
});

test('cruise at 75 % power: ≈ 190 km/h TAS with the spray kit, ≈ 228 km/h without', () => {
  const cruise = (Ax, mass = 1700, y = 400) => {
    const fuel = 200;
    const sim = trimmed(hopperFor(mass, fuel), 50, y === 400 ? thr75 : thr75At(y), { fuel, y, Ax });
    holdLevel(sim, 140, y);
    return { kmh: sim.fm.out.airspeed * 3.6, hp: sim.fm.shaftPower / 745.7, rho: sim.fm.out.density };
  };
  const kit = cruise(A), clean = cruise({ ...A, CD0: A.CD0 - A.CDsprayKit }), heavy = cruise(A, 1996), high = cruise(A, 1700, 1200);
  console.log(`  throttle ${thr75.toFixed(3)} → ${kit.hp.toFixed(0)} hp; 1,700 kg (ρ ${kit.rho.toFixed(3)}): kit ${kit.kmh.toFixed(0)} km/h, clean ${clean.kmh.toFixed(0)} km/h; 1,996 kg ${heavy.kmh.toFixed(0)} km/h; 5,000 ft ${high.kmh.toFixed(0)} km/h TAS (${high.hp.toFixed(0)} hp)`);
  assert.ok(Math.abs(kit.hp - 225) < 3);
  assert.ok(Math.abs(kit.kmh - 190) < 5, `kit ${kit.kmh}`);
  assert.ok(Math.abs(clean.kmh - 228) < 6, `clean ${clean.kmh}`);
  assert.ok(heavy.kmh < kit.kmh && high.kmh > kit.kmh && Math.abs(high.hp - 225) < 3);
});

test('the hopper load moves pitch inertia and mass; spray points under the booms', () => {
  const sim0 = makeSim({ A, hopper: 0, fuel: 150, wind: false }), sim1 = makeSim({ A, hopper: 600, fuel: 150, wind: false });
  const I0 = sim0.fm.inertia ?? sim0.fm.I, I1 = sim1.fm.inertia ?? sim1.fm.I;
  console.log(`  mass ${sim0.fm.mass.toFixed(0)} → ${sim1.fm.mass.toFixed(0)} kg`);
  assert.ok(sim1.fm.mass - sim0.fm.mass > 599);
  if (I0 && I1) {
    const arr = (I) => (Array.isArray(I) ? I : [I.x, I.y, I.z]);
    assert.ok(arr(I1).every((v, i) => v >= arr(I0)[i]));
  }
  const ty = AIRCRAFT_TYPES.pa36;
  assert.ok(Math.abs(ty.spray.boom[0] - 4.9) < 0.01 && ty.spray.boom[1] < 0);
  assert.ok(ty.bounds.length >= 6 && ty.bounds.every((b) => b[0] < b[1] && b[2] < b[3] && b[4] < b[5]));
});
