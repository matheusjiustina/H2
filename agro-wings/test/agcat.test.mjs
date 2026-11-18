// Grumman G-164A Super Ag-Cat 450 (radial R-985) — its figures, stance and
// performance (run: node --test test/). Calibration targets, from the type
// data: 58 kt (67 mph) stall at 4,500 lb with no flaps, an initial climb of
// ≈ 1,080 ft/min at gross (sources disagree; the higher figures belong to
// the 600 hp B), working speed 70–86 kt, the R-985's 450 hp at 2,300 rpm.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, deg, Vector3 } from './harness.mjs';
import { FLIGHT_AGCAT as A, SPRAY_AGCAT } from '../src/config.js';
import { agcatExtent, AGCAT_WING } from '../src/aircraft/agcatModel.js';
import { productLimit, AIRCRAFT_TYPES, AIRCRAFT_ORDER } from '../src/aircraft/types.js';

const KT = 1.943844, FPM = 196.85;
const hopperFor = (massKg, fuel) => massKg - A.emptyMass - A.pilotMass - fuel * A.fuelDensity;
function trimmed(hopper, speed, throttle, { fuel = 150, y = 400, Ax = A } = {}) {
  const sim = makeSim({ A: Ax, hopper, fuel, wind: false });
  sim.fm.reset(new Vector3(0, y, -300), Math.PI / 2, { speed, engineOn: true });
  sim.fm.throttle = throttle;
  return sim;
}
function holdSpeed(sim, target, seconds) {
  const { fm } = sim;
  for (let i = 0; i < 120 * seconds; i++) {
    const a = sim.att();
    const pitchT = Math.max(-0.35, Math.min(0.3, (fm.out.airspeed - target) * 0.04));
    sim.step(1, { pitch: Math.max(-1, Math.min(1, (pitchT - a.pitch) * 3 + fm.omega.x)), roll: -a.bank * 2, yaw: 0 }, 'normal');
  }
}
function holdLevel(sim, seconds, y) {
  const { fm } = sim;
  for (let i = 0; i < 120 * seconds; i++) sim.step(1, { pitch: Math.max(-1, Math.min(1, (y - fm.pos.y) * 0.02 - fm.vel.y * 0.1)), roll: -sim.att().bank * 2, yaw: 0 }, 'normal');
}

test('G-164A figures: 10.95 m, 7.42 m, 30.47 m², 450 hp at 2,300 rpm direct drive, 175 L fuel, 1,136 L / 907 kg hopper, 1,220 / 2,041 kg', () => {
  const ext = agcatExtent();
  console.log(`  model span ${ext.span.toFixed(3)} m (lower ${ext.lowerSpan.toFixed(2)} m), length ${ext.length.toFixed(3)} m`);
  assert.ok(Math.abs(ext.span - 10.95) < 0.01);
  assert.ok(Math.abs(ext.length - 7.42) < 0.01);
  assert.ok(ext.lowerSpan < ext.span && ext.lowerSpan > 10);
  assert.equal(A.span, 10.95);
  assert.equal(A.wingArea, 30.47);
  // Both wings' nominal planform areas add up to the published area.
  const area = 2 * AGCAT_WING.upper.half * AGCAT_WING.upper.chord + 2 * AGCAT_WING.lower.half * AGCAT_WING.lower.chord;
  assert.ok(Math.abs(area - 30.47) / 30.47 < 0.03, `area ${area}`);
  assert.ok(Math.abs(A.maxPower / 745.7 - 450) < 0.5);
  assert.equal(A.maxRpm, 2300);
  assert.equal(A.radial.gear, 1);
  assert.equal(A.engineType, 'radial');
  assert.equal(A.fuelCapacity, 175);
  assert.equal(A.hopperCapacity, 1136);
  assert.equal(A.maxHopperKg, 907);
  assert.equal(A.emptyMass, 1220);
  assert.equal(A.mtow, 2041);
  assert.ok(A.noFlaps && A.CLflap === 0 && A.CDflap === 0);
  const full = productLimit(A, A.fuelCapacity), dry = productLimit(A, 0);
  console.log(`  product the MTOW allows: ${full.toFixed(0)} kg with full fuel, ${dry.toFixed(0)} kg with none (hopper ${A.hopperCapacity} L, ${A.maxHopperKg} kg)`);
  assert.ok(full > 590 && full < 630);
  assert.ok(dry < A.maxHopperKg && dry < A.hopperCapacity);
  const T = AIRCRAFT_TYPES.agcat;
  assert.equal(T.flight, A);
  assert.ok(AIRCRAFT_ORDER.includes('agcat'));
  assert.equal(T.audio.profile, 'r985');
  assert.equal(T.audio.blades, 2);
  assert.equal(T.spray.swath, SPRAY_AGCAT.swath);
  assert.ok(T.bounds.every((b) => b[0] < b[1] && b[2] < b[3] && b[4] < b[5]));
});

test('Ag-Cat parked: three wheels, ≈ 12° nose-up, ≈ 3.3 m high, no creep', () => {
  const sim = makeSim({ A, hopper: 0, fuel: 150, wind: true });
  const { fm } = sim;
  fm.settleOnGround(-420, -50, Math.PI / 2, sim.env);
  fm.parkBrake = true;
  const p0 = fm.pos.clone();
  sim.step(120 * 8);
  const a = sim.att();
  const g = sim.env.ground(fm.pos.x, fm.pos.z);
  const tops = agcatExtent().tops.map((p) => new Vector3(...p).applyQuaternion(fm.quat).add(fm.pos).y - g);
  const h = Math.max(...tops);
  console.log(`  three-point pitch ${deg(a.pitch).toFixed(1)}°, height ${h.toFixed(2)} m (wing ${tops[0].toFixed(2)}, blade up ${tops[2].toFixed(2)}, fin ${tops[3].toFixed(2)}), drift ${(fm.pos.distanceTo(p0) * 100).toFixed(1)} cm`);
  assert.equal(fm.out.wheelsOnGround, 3);
  assert.ok(deg(a.pitch) > 10 && deg(a.pitch) < 13, `pitch ${deg(a.pitch)}`);
  assert.ok(h > 3.1 && h < 3.45, `height ${h}`);
  assert.ok(fm.pos.distanceTo(p0) < 0.05);
  // Prop clear of the ground on three wheels and tail up.
  const tipDown = new Vector3(0, 0.12 - A.propRadius, 1.86).applyQuaternion(fm.quat).add(fm.pos).y - g;
  assert.ok(tipDown > 0.35, `prop clearance ${tipDown}`);
});

test('R-985 start (inertia starter, coughs, catch) and the constant-speed prop: idle, governed 2,300 rpm, 450 hp', () => {
  const sim = makeSim({ A, hopper: 0, fuel: 150, wind: false });
  const { fm } = sim;
  fm.settleOnGround(-385, 0, Math.PI / 2, sim.env);
  fm.engine = 'cranking'; fm.crankTime = 0; fm.parkBrake = true;
  let catchT = null;
  for (let i = 0; i < 120 * 6 && catchT === null; i++) { sim.step(1); if (fm.engine === 'running') catchT = sim.t; }
  const coughs = sim.events.filter((e) => e.kind === 'cough').length;
  sim.step(120 * 6);
  console.log(`  ${coughs} coughs, caught after ${catchT?.toFixed(1)} s; idle ${fm.rpm.toFixed(0)} rpm, MP ${fm.mp.toFixed(1)} inHg`);
  assert.ok(coughs >= 2 && catchT > 2 && catchT < 3);
  assert.ok(Math.abs(fm.rpm - A.idleRpm) < 80 && fm.mp < 15);
  fm.throttle = 1;
  sim.step(120 * 6);
  const hp = fm.shaftPower / 745.7;
  const sigma = fm.out.density / 1.225, rated = 450 * (sigma - 0.12) / 0.88;
  console.log(`  full throttle at σ ${sigma.toFixed(3)}: ${fm.rpm.toFixed(0)} rpm, ${hp.toFixed(0)} hp (${rated.toFixed(0)} expected), MP ${fm.mp.toFixed(1)} inHg, ${fm.fuelFlow.toFixed(0)} L/h, static thrust ${(fm.out.thrust / 1000).toFixed(2)} kN`);
  assert.ok(Math.abs(fm.rpm - A.maxRpm) < 25);
  assert.ok(Math.abs(hp - rated) < 6 && hp < 450);
  assert.ok(fm.fuelFlow > 140 && fm.fuelFlow < 180);
  assert.ok(fm.out.thrust > 6000 && fm.out.thrust < 9500);
});

test('stall: ≈ 58 kt at 2,041 kg, no flaps (the flap command changes nothing)', () => {
  const CLmax = A.CL0 + A.CLa * A.alphaStall;
  const vs = (m) => Math.sqrt((2 * m * 9.81) / (1.225 * A.wingArea * CLmax)) * KT;
  console.log(`  CLmax ${CLmax.toFixed(3)}: Vs ${vs(2041).toFixed(1)} kt at 2,041 kg, ${vs(1450).toFixed(1)} kt at 1,450 kg`);
  assert.ok(Math.abs(vs(2041) - 58) < 2);
  assert.equal(AIRCRAFT_TYPES.agcat.vspeeds.vs1, 58);
  // Slow flight at 2,041 kg, power near idle: the stick comes back slowly
  // until the wing stalls.
  const sim = trimmed(hopperFor(2041, 150), 38, 0.12, { y: 300 });
  const { fm } = sim;
  let stallKt = null;
  for (let i = 0; i < 120 * 60 && stallKt === null; i++) {
    const a = sim.att();
    sim.step(1, { pitch: Math.min(1, i / (120 * 30)), roll: -a.bank * 2, yaw: 0 }, 'off'); // no stall protection
    if (fm.out.stall > 0.5) stallKt = fm.out.airspeed * KT * Math.sqrt(fm.out.density / 1.225);
  }
  console.log(`  slow flight at 2,041 kg: stall at ${stallKt?.toFixed(1)} kt IAS`);
  assert.ok(stallKt > 52 && stallKt < 62, `stall ${stallKt}`);
});

test('climb at gross ≈ 1,000–1,250 ft/min, weight and altitude cut it; full-power level speed; working speed at ~70 % power', () => {
  const rate = (mass, y = 60) => {
    const fuel = 150;
    const sim = trimmed(hopperFor(mass, fuel), 33, 1, { fuel, y });
    holdSpeed(sim, 33, 10);
    const y0 = sim.fm.pos.y;
    holdSpeed(sim, 33, 20);
    return ((sim.fm.pos.y - y0) / 20) * FPM;
  };
  // At the field's density (σ ≈ 0.92): ≈ 10 % less power than at sea level.
  const light = rate(1450), heavy = rate(2041), high = rate(2041, 2100);
  console.log(`  climb at ${(33 * KT).toFixed(0)} kt TAS: 1,450 kg ${light.toFixed(0)} ft/min, 2,041 kg ${heavy.toFixed(0)} ft/min, 2,041 kg at ≈ 8,000 ft MSL ${high.toFixed(0)} ft/min`);
  assert.ok(heavy > 950 && heavy < 1300, `gross climb ${heavy}`);
  assert.ok(light > heavy * 1.3 && light < 2200);
  assert.ok(high < heavy * 0.75);
  const top = trimmed(hopperFor(1800, 150), 50, 1);
  holdLevel(top, 100, 400);
  const ias = top.fm.out.airspeed * KT * Math.sqrt(top.fm.out.density / 1.225);
  const work = trimmed(hopperFor(1800, 150), 40, 0.62);
  holdLevel(work, 100, 400);
  const wIas = work.fm.out.airspeed * KT * Math.sqrt(work.fm.out.density / 1.225), wHp = work.fm.shaftPower / 745.7;
  console.log(`  full power level at 1,800 kg: ${ias.toFixed(0)} kt IAS; throttle 0.62 → ${wHp.toFixed(0)} hp, ${wIas.toFixed(0)} kt IAS`);
  assert.ok(Math.abs(top.fm.vel.y) < 0.3 && ias > 100 && ias < 120, `top ${ias}`);
  assert.ok(wIas > 70 && wIas < 92, `working ${wIas}`);
});

function takeoff(hopper, fuel = 175) {
  const sim = makeSim({ A, hopper, fuel, wind: false });
  const { fm } = sim;
  fm.settleOnGround(-385, 0, Math.PI / 2, sim.env);
  fm.engine = 'running'; fm.rpm = A.idleRpm; fm.mp = A.radial.mpIdle; fm.throttle = 0.05;
  sim.step(240);
  const x0 = fm.pos.x;
  const vs = Math.sqrt((2 * fm.mass * 9.81) / (1.225 * A.wingArea * (A.CL0 + A.CLa * A.alphaStall)));
  const cmd = { pitch: 0, roll: 0, yaw: 0 };
  let maxYaw = 0;
  for (let i = 0; i < 120 * 90; i++) {
    fm.throttle = Math.min(1, fm.throttle + 0.55 / 120);
    const err = Math.PI / 2 - fm.heading();
    maxYaw = Math.max(maxYaw, Math.abs(err));
    cmd.yaw = Math.max(-1, Math.min(1, -err * 3 + fm.omega.y * 1.5));
    const v = fm.out.airspeed;
    cmd.pitch = v < 12 ? 0 : v < vs * 1.05 ? -0.2 : 0.6;
    sim.step(1, cmd, 'normal');
    if (!fm.out.onGround && fm.out.agl > 0.5) return { dist: fm.pos.x - x0, v, mass: fm.mass, maxYaw };
  }
  return { dist: Infinity, maxYaw };
}

test('take-off (taildragger, rudder held straight): short when light, longer at 2,041 kg', () => {
  const light = takeoff(0, 100), heavy = takeoff(hopperFor(2041, 175));
  console.log(`  ${light.mass.toFixed(0)} kg: ${light.dist.toFixed(0)} m @ ${(light.v * KT).toFixed(0)} kt; ${heavy.mass.toFixed(0)} kg: ${heavy.dist.toFixed(0)} m @ ${(heavy.v * KT).toFixed(0)} kt; worst heading error ${deg(Math.max(light.maxYaw, heavy.maxYaw)).toFixed(1)}°`);
  assert.ok(light.dist < 230, `light roll ${light.dist}`);
  assert.ok(heavy.dist < 520, `MTOW roll ${heavy.dist}`);
  assert.ok(heavy.dist > light.dist * 1.5);
  assert.ok(deg(Math.max(light.maxYaw, heavy.maxYaw)) < 8);
});

test('the same physics in every quality profile: the model is visual only', () => {
  // The flight config has no quality-dependent field, and the type's
  // physical points do not depend on the model build.
  assert.ok(!Object.keys(A).some((k) => /quality|lod|profile/i.test(k)));
  const T = AIRCRAFT_TYPES.agcat;
  assert.deepEqual(T.work[0], A.gear[0].p.map((v, i) => (i === 0 ? 0 : v)));
});
