// Air Tractor AT-802A (PR-AWX) and AT-802AF Fire Boss (PR-FBS): figures,
// stance, engines, performance against the published calibration targets,
// the amphibious floats, gear, scooping, dropping, the fire test field and
// the premium lock (run: node --test test/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, deg, Vector3 } from './harness.mjs';
import { FLIGHT_AT802 as AG, FLIGHT_FIREBOSS as FB, FLIGHT_AT502 } from '../src/config.js';
import { at802Extent } from '../src/aircraft/at802Model.js';
import { WaterSystem } from '../src/aircraft/fireboss.js';
import { FireField, FIRE_TEST_SPOTS } from '../src/world/fires.js';
import { WATER } from '../src/world/layout.js';
import { isUnlocked, setEntitlementSource, aircraftUnlocked, FIREBOSS_EXPANSION, setPremiumEnforced } from '../src/game/expansions.js';
import { AIRCRAFT_TYPES, AIRCRAFT_ORDER, productLimit } from '../src/aircraft/types.js';

const KT = 1.943844, FPM = 196.85;
const LAKE = WATER.ponds.find((p) => p.big);
const hopperFor = (A, m, fuel) => m - A.emptyMass - A.pilotMass - fuel * A.fuelDensity;
const ias = (fm) => fm.out.airspeed * KT * Math.sqrt(fm.out.density / 1.225);

function holdSpeed(sim, target, seconds) {
  const { fm } = sim;
  for (let i = 0; i < 120 * seconds; i++) {
    const a = sim.att();
    const pitchT = Math.max(-0.35, Math.min(0.3, (fm.out.airspeed - target) * 0.04));
    sim.step(1, { pitch: Math.max(-1, Math.min(1, (pitchT - a.pitch) * 3 + fm.omega.x)), roll: -a.bank * 2, yaw: 0 }, 'normal');
  }
}
function airborne(A, mass, speed, fuel = 500, y = 400) {
  const sim = makeSim({ A, hopper: hopperFor(A, mass, fuel), fuel, wind: false });
  sim.fm.reset(new Vector3(-2000, y, -300), Math.PI / 2, { speed, engineOn: true });
  sim.fm.gearCmd = false; sim.fm.gearDown = A.gearTime ? 0 : 1;
  return sim;
}
function climbRate(A, mass, v) {
  const sim = airborne(A, mass, v, 500, 80);
  sim.fm.throttle = 1;
  holdSpeed(sim, v, 12);
  const y0 = sim.fm.pos.y;
  holdSpeed(sim, v, 20);
  return ((sim.fm.pos.y - y0) / 20) * FPM;
}
function levelSpeed(A, mass) {
  const sim = airborne(A, mass, 70);
  const { fm } = sim;
  fm.throttle = 1;
  for (let i = 0; i < 120 * 140; i++) sim.step(1, { pitch: Math.max(-1, Math.min(1, (400 - fm.pos.y) * 0.02 - fm.vel.y * 0.1)), roll: 0, yaw: 0 }, 'normal');
  return { kt: ias(fm), vs: fm.vel.y };
}
function stallSpeed(A, mass, flaps) {
  const sim = airborne(A, mass, 60, 500, 600);
  const { fm } = sim;
  fm.throttle = 0; fm.flaps = fm.flapsCmd = flaps;
  for (let i = 0; i < 120 * 120; i++) {
    const a = sim.att();
    sim.step(1, { pitch: Math.max(-1, Math.min(1, (600 - fm.pos.y) * 0.05 - fm.vel.y * 0.4)), roll: -a.bank * 2, yaw: 0 }, 'normal');
    if (fm.out.stall > 0.3 || fm.vel.y < -3) return ias(fm);
  }
  return null;
}
function takeoff(A, mass, fuel = 600) {
  const sim = makeSim({ A, hopper: hopperFor(A, mass, fuel), fuel, wind: false });
  const { fm } = sim;
  fm.settleOnGround(-385, 0, Math.PI / 2, sim.env);
  fm.engine = 'running'; fm.ng = A.turbine.idleNg; fm.rpm = A.idleRpm; fm.throttle = 0.05;
  fm.flapsCmd = fm.flaps = 1 / 3;
  sim.step(240);
  const x0 = fm.pos.x;
  const vr = Math.sqrt((2 * fm.mass * 9.81) / (1.225 * A.wingArea * 1.95)) * 1.1;
  const cmd = { pitch: 0, roll: 0, yaw: 0 };
  for (let i = 0; i < 120 * 90; i++) {
    fm.throttle = Math.min(1, fm.throttle + 0.5 / 120);
    cmd.yaw = Math.max(-1, Math.min(1, -(Math.PI / 2 - fm.heading()) * 3 + fm.omega.y * 1.5));
    const v = fm.out.airspeed;
    cmd.pitch = v < 14 ? 0 : v < vr ? (A.floats ? 0.1 : -0.2) : 0.6;
    sim.step(1, cmd, 'normal');
    if (!fm.out.onGround && fm.out.agl > 0.5) return { dist: fm.pos.x - x0, kt: v * KT, mass: fm.mass };
  }
  return { dist: Infinity };
}

test('AT-802 figures: 18.04 m, ≈ 10.9 m, 37.29 m², 7,257 kg; PT6A-65AG 1,295 shp, PT6A-67F 1,600 shp; own parameters per configuration', () => {
  const ext = at802Extent();
  console.log(`  model span ${ext.span.toFixed(2)} m, length ${ext.length.toFixed(2)} m`);
  assert.ok(Math.abs(ext.span - 18.04) < 0.01);
  assert.ok(Math.abs(ext.length - 10.9) < 0.15, `length ${ext.length}`);
  assert.equal(AG.wingArea, 37.29); assert.equal(AG.span, 18.04);
  assert.equal(AG.mtow, 7257); assert.equal(AG.hopperCapacity, 3028); assert.equal(AG.fuelCapacity, 961);
  assert.ok(Math.abs(AG.maxPower / 745.7 - 1295) < 2);
  assert.ok(Math.abs(FB.maxPower / 745.7 - 1600) < 2);
  assert.equal(FB.hopperCapacity, 3104); assert.equal(FB.mtowWater, 5216); assert.equal(FB.mtowScoop, 7257);
  // Not a scaled copy of the AT-502 or of each other.
  assert.notEqual(AG.emptyMass, FB.emptyMass); assert.notEqual(AG.CD0, FB.CD0); assert.notDeepEqual(AG.inertiaEmpty, FB.inertiaEmpty);
  assert.notDeepEqual(AG.inertiaEmpty, FLIGHT_AT502.inertiaEmpty);
  assert.ok(FB.floats && !AG.floats && FB.gear.every((g) => g.retract) && !AG.gear.some((g) => g.retract));
  // Volume is not payload: the MTOW sets the product.
  const lim = productLimit(AG, AG.fuelCapacity);
  console.log(`  AT-802A product the MTOW allows with full fuel: ${lim.toFixed(0)} kg (hopper ${AG.hopperCapacity} L)`);
  assert.ok(lim > 3000 && lim < 3500);
});

test('AT-802A parked: three wheels, ≈ 10° three-point attitude, ≈ 3.4 m to the fin top', () => {
  const sim = makeSim({ A: AG, hopper: 0, fuel: 450, wind: false });
  const { fm } = sim;
  fm.settleOnGround(-470, -58, Math.PI / 2, sim.env);
  fm.parkBrake = true;
  const p0 = fm.pos.clone();
  sim.step(120 * 6);
  const a = sim.att();
  const g = sim.env.ground(fm.pos.x, fm.pos.z);
  const h = Math.max(...at802Extent().tops.map((p) => new Vector3(...p).applyQuaternion(fm.quat).add(fm.pos).y - g));
  console.log(`  three-point pitch ${deg(a.pitch).toFixed(1)}°, height ${h.toFixed(2)} m, drift ${(fm.pos.distanceTo(p0) * 100).toFixed(1)} cm`);
  assert.equal(fm.out.wheelsOnGround, 3);
  assert.ok(deg(a.pitch) > 9 && deg(a.pitch) < 11.5);
  assert.ok(h > 3.2 && h < 3.9, `height ${h}`);
  assert.ok(fm.pos.distanceTo(p0) < 0.06);
});

test('PT6A-65AG: start, idle, governed 1,700 rpm, 1,295 shp; mass follows fuel and hopper', () => {
  const sim = makeSim({ A: AG, hopper: 0, fuel: 450, wind: false });
  const { fm } = sim;
  fm.settleOnGround(-385, 0, Math.PI / 2, sim.env);
  fm.engine = 'cranking'; fm.crankTime = 0; fm.parkBrake = true;
  let lit = null;
  for (let i = 0; i < 120 * 30 && fm.engine !== 'running'; i++) { sim.step(1); if (lit === null && sim.events.some((e) => e.kind === 'lightoff')) lit = sim.t; }
  sim.step(120 * 6);
  console.log(`  light-off ${lit?.toFixed(1)} s, running after ${sim.t.toFixed(1)} s; idle Ng ${fm.ng.toFixed(0)} %, ${fm.rpm.toFixed(0)} rpm`);
  assert.equal(fm.engine, 'running');
  fm.throttle = 1;
  sim.step(120 * 8);
  const shp = fm.shaftPower / 745.7;
  console.log(`  full power: ${shp.toFixed(0)} shp, ${fm.rpm.toFixed(0)} rpm, ${fm.torque.toFixed(0)} ft·lb, ${fm.fuelFlow.toFixed(0)} L/h, static ${(fm.out.thrust / 1000).toFixed(1)} kN`);
  assert.ok(shp > 1280 && shp < 1300);
  assert.ok(Math.abs(fm.rpm - AG.maxRpm) < 30);
  assert.ok(fm.torque > 3900 && fm.torque < 4100);
  fm.updateMass();
  const m0 = fm.mass;
  fm.hopper = 1000; fm.updateMass();
  assert.ok(Math.abs(fm.mass - m0 - 1000) < 1e-6);
  fm.fuel -= 100; fm.updateMass();
  assert.ok(Math.abs(fm.mass - m0 - 1000 + 80) < 1e-6);
});

test('AT-802A performance: stall 92/79 kt, climb ≈ 780 ft/min at 7,257 kg, ≈ 166 kt, take-off roll', () => {
  const sc = stallSpeed(AG, 7257, 0), sf = stallSpeed(AG, 7257, 1);
  const climb = climbRate(AG, 7257, 52), light = climbRate(AG, 4500, 51);
  const lvl = levelSpeed(AG, 5500);
  const heavy = takeoff(AG, 7257), lightTo = takeoff(AG, 4200);
  console.log(`  stall at 7,257 kg: clean ${sc.toFixed(0)} kt, flaps ${sf.toFixed(0)} kt (published 92 / 79)`);
  console.log(`  climb at 101 kt: 7,257 kg ${climb.toFixed(0)} ft/min (published ≈ 780), 4,500 kg ${light.toFixed(0)} ft/min`);
  console.log(`  full power level at 5,500 kg: ${lvl.kt.toFixed(0)} kt (published cruise 166)`);
  console.log(`  take-off (flaps 1/3, 320 m field): 7,257 kg ${heavy.dist.toFixed(0)} m @ ${heavy.kt.toFixed(0)} kt (published ≈ 610 m), 4,200 kg ${lightTo.dist.toFixed(0)} m`);
  assert.ok(Math.abs(sc - 92) < 5 && Math.abs(sf - 79) < 6);
  assert.ok(climb > 650 && climb < 950 && light > climb * 1.6);
  assert.ok(lvl.kt > 155 && lvl.kt < 175 && Math.abs(lvl.vs) < 0.3);
  assert.ok(heavy.dist < 950 && lightTo.dist < 350 && heavy.dist > lightTo.dist * 2.5);
});

test('Fire Boss on its amphibious gear: four wheels, near level; gear will not retract with weight on the wheels', () => {
  const sim = makeSim({ A: FB, hopper: 0, fuel: 450, wind: false });
  const { fm } = sim;
  fm.settleOnGround(-472, -88, Math.PI / 2, sim.env);
  fm.parkBrake = true;
  sim.step(120 * 6);
  const a = sim.att();
  console.log(`  on wheels: pitch ${deg(a.pitch).toFixed(1)}°, wheels ${fm.out.wheelsOnGround}, CG ${(fm.pos.y - sim.env.ground(fm.pos.x, fm.pos.z)).toFixed(2)} m up`);
  assert.equal(fm.out.wheelsOnGround, 4);
  assert.ok(Math.abs(deg(a.pitch)) < 3);
  const ws = new WaterSystem(fm);
  assert.equal(ws.toggleGear(), false);
  assert.equal(fm.gearCmd, true);
});

test('Fire Boss gear: retracts in flight (wheels out of the contact model), gear-up on a runway lands on the float keels', () => {
  const sim = airborne(FB, 5000, 50, 450, 200);
  const { fm } = sim;
  fm.gearDown = 1; fm.gearCmd = true;
  const ws = new WaterSystem(fm);
  assert.equal(ws.toggleGear(), true);
  sim.step(120 * (FB.gearTime + 1));
  assert.equal(fm.gearDown, 0);
  // Belly onto the runway with the wheels up: the keels touch, not the wheels.
  const s2 = makeSim({ A: FB, hopper: 0, fuel: 450, wind: false });
  const f2 = s2.fm;
  f2.settleOnGround(-200, 0, Math.PI / 2, s2.env);
  f2.gearDown = 0; f2.gearCmd = false;
  f2.pos.y += 0.6;
  s2.step(120 * 2);
  const keel = s2.events.filter((e) => e.kind === 'ground' && e.part.startsWith('float'));
  console.log(`  gear-up runway contact: wheels ${f2.out.wheelsOnGround}, keel contacts ${keel.length} (${[...new Set(keel.map((e) => e.part))].join(', ')})`);
  assert.equal(f2.out.wheelsOnGround, 0);
  assert.ok(keel.length > 0);
});

test('Fire Boss afloat: buoyancy carries it at its draft; a gear-down touch on the water is flagged', () => {
  const sim = makeSim({ A: FB, hopper: 0, fuel: 450, wind: false });
  const { fm } = sim;
  fm.settleOnWater(LAKE.x - 300, LAKE.z, Math.PI / 2, sim.env);
  const wl = sim.env.water(fm.pos.x, fm.pos.z);
  sim.step(120 * 5);
  const a = sim.att();
  const draft = -fm.out.waterClear;
  console.log(`  afloat at ${fm.mass.toFixed(0)} kg: draft ${draft.toFixed(2)} m, pitch ${deg(a.pitch).toFixed(1)}°, bank ${deg(a.bank).toFixed(1)}°, water carries ${(fm.out.waterSupport * 100).toFixed(0)} %`);
  assert.ok(fm.out.onWater && fm.out.onGround);
  assert.ok(Math.abs(fm.out.waterSupport - 1) < 0.03);
  assert.ok(draft > 0.3 && draft < 0.9);
  assert.ok(Math.abs(deg(a.pitch)) < 6 && Math.abs(deg(a.bank)) < 2);
  assert.ok(Math.abs(fm.vel.y) < 0.05 && fm.pos.y > wl);
  // Heavier → deeper.
  fm.hopper = 800; fm.updateMass();
  sim.step(120 * 5);
  console.log(`  with 800 L: draft ${(-fm.out.waterClear).toFixed(2)} m`);
  assert.ok(-fm.out.waterClear > draft + 0.05);
  // Approach to the water with the wheels down.
  const s2 = airborne(FB, 5000, 40, 450, 0);
  s2.fm.pos.set(LAKE.x - 300, sim.env.water(LAKE.x - 300, LAKE.z) + 3.3, LAKE.z);
  s2.fm.gearDown = 1; s2.fm.gearCmd = true; s2.fm.vel.set(40, -1.5, 0);
  s2.step(120 * 2);
  const ev = s2.events.find((e) => e.kind === 'water');
  assert.ok(ev && ev.speed > 8 && s2.fm.gearDown > 0.5, 'water contact with the gear down (the aircraft crashes it)');
});

function waterRun(mass, { probes = false, maxT = 70 } = {}) {
  const fuel = 450;
  const sim = makeSim({ A: FB, hopper: Math.max(0, hopperFor(FB, mass, fuel)), fuel, wind: false });
  const { fm } = sim;
  fm.settleOnWater(LAKE.x - 420, LAKE.z, Math.PI / 2, sim.env);
  const ws = new WaterSystem(fm);
  if (probes) ws.toggleProbes();
  fm.engine = 'running'; fm.ng = FB.turbine.idleNg; fm.rpm = FB.idleRpm; fm.throttle = 0; fm.flaps = fm.flapsCmd = 1 / 3;
  const x0 = fm.pos.x;
  const cmd = { pitch: 0, roll: 0, yaw: 0 };
  const log = { maxHopper: 0, scooped: 0, maxMass: fm.mass };
  for (let i = 0; i < 120 * maxT; i++) {
    fm.throttle = Math.min(1, fm.throttle + 0.5 / 120);
    const at = sim.att(), v = fm.out.airspeed;
    cmd.yaw = Math.max(-1, Math.min(1, -(Math.PI / 2 - fm.heading()) * 3 + fm.omega.y * 1.5));
    cmd.roll = -at.bank * 2;
    // Hold the step; when scooping, stay on the water (no rotation).
    cmd.pitch = v < 12 ? 0.2 : (probes || v < 30) ? Math.max(-1, Math.min(1, (0.05 - at.pitch) * 4)) : 0.5;
    sim.step(1, cmd, 'normal');
    ws.step(1 / 120, null);
    fm.updateMass();
    log.maxHopper = Math.max(log.maxHopper, fm.hopper); log.maxMass = Math.max(log.maxMass, fm.mass);
    if (!fm.out.onWater && fm.out.agl > 1) return { ...log, off: true, dist: fm.pos.x - x0, kt: v * KT, t: sim.t, fm, ws };
    if (fm.pos.x - x0 > 900) break;
  }
  return { ...log, off: false, dist: fm.pos.x - x0, kt: fm.out.airspeed * KT, fm, ws };
}

test('Fire Boss water take-off: light ≈ 300 m, at 5,216 kg longer; overloaded floats do not get onto the step', () => {
  const light = waterRun(4300), max = waterRun(5216), over = waterRun(6400, { maxT: 45 });
  console.log(`  4,300 kg: ${light.dist.toFixed(0)} m, ${light.kt.toFixed(0)} kt, ${light.t.toFixed(0)} s; 5,216 kg: ${max.dist.toFixed(0)} m, ${max.kt.toFixed(0)} kt, ${max.t.toFixed(0)} s`);
  console.log(`  6,400 kg from rest: airborne ${over.off}, ${over.kt.toFixed(0)} kt after ${over.dist.toFixed(0)} m, overload flagged ${over.ws.overload || over.kt < 40}`);
  assert.ok(light.off && light.dist < 450);
  assert.ok(max.off && max.dist > light.dist * 1.3 && max.dist < 800);
  assert.ok(!over.off);
});

test('Scooping: fills on the step up to the scooping weight limit, the mass follows, the water costs drag', () => {
  const r = waterRun(4300, { probes: true, maxT: 40 });
  const { fm, ws } = r;
  console.log(`  scooped ${ws.scooped.toFixed(0)} L (tank ${fm.hopper.toFixed(0)} L, limit ${ws.scoopLimit().toFixed(0)} L), max mass ${r.maxMass.toFixed(0)} kg, still on the water: ${!r.off}`);
  assert.ok(ws.scooped > 1500);
  assert.ok(r.maxMass <= FB.mtowScoop + 1);
  assert.ok(fm.hopper <= FB.firefight.capacity);
  // With full fuel the limit is below the tank: never past 7,257 kg.
  const s2 = makeSim({ A: FB, hopper: 0, fuel: FB.fuelCapacity, wind: false });
  const w2 = new WaterSystem(s2.fm);
  console.log(`  limit with full fuel: ${w2.scoopLimit().toFixed(0)} L of ${FB.firefight.capacity}`);
  assert.ok(w2.scoopLimit() < FB.firefight.capacity && w2.scoopLimit() > 2400);
  // Momentum drag while filling.
  const s3 = makeSim({ A: FB, hopper: 0, fuel: 450, wind: false });
  s3.fm.settleOnWater(LAKE.x - 300, LAKE.z, Math.PI / 2, s3.env);
  const w3 = new WaterSystem(s3.fm);
  w3.probesCmd = true; w3.probes = 1; s3.fm.gearDown = 0;
  s3.fm.vel.set(30, 0, 0); s3.fm.out.waterSpeed = 30; s3.fm.out.onWater = true;
  w3.step(1 / 120, null);
  assert.ok(w3.scooping && s3.fm.extForce && s3.fm.extForce.x < -6000, `drag ${s3.fm.extForce?.x}`);
});

test('Drop: partial and full, progressive release, mass down by the litres released', () => {
  const sim = airborne(FB, 6000, 55, 450, 300);
  const { fm } = sim;
  fm.hopper = 3000; fm.updateMass();
  const ws = new WaterSystem(fm);
  const m0 = fm.mass;
  ws.toggleDrop();
  let n = 0;
  for (let i = 0; i < 60; i++) { ws.step(1 / 120, new Vector3()); n += ws.packets.length; fm.updateMass(); }
  ws.toggleDrop(); // close: partial drop
  for (let i = 0; i < 60; i++) { ws.step(1 / 120, new Vector3()); fm.updateMass(); }
  const partial = 3000 - fm.hopper;
  console.log(`  partial: ${partial.toFixed(0)} L released in 0.5 s (${n} packets), mass ${m0.toFixed(0)} → ${fm.mass.toFixed(0)} kg`);
  assert.ok(partial > 150 && partial < 900);
  assert.ok(Math.abs(m0 - fm.mass - partial) < 1);
  ws.toggleDrop();
  for (let i = 0; i < 120 * 4; i++) { ws.step(1 / 120, new Vector3()); fm.updateMass(); }
  console.log(`  full: tank ${fm.hopper.toFixed(0)} L, released ${ws.released.toFixed(0)} L, door ${ws.dropping ? 'open' : 'closed'}`);
  assert.equal(fm.hopper, 0);
  assert.ok(Math.abs(ws.released - 3000) < 1 && !ws.dropping);
});

test('Fire test field: water on a spot lowers its intensity and puts it out; water elsewhere does not', () => {
  const terrain = makeSim({}).terrain;
  const ff = new FireField(null, terrain);
  ff.setActive(true);
  const f = ff.fires[0];
  const miss = ff.applyWater(f.x + 300, f.z, 1000, 20);
  assert.equal(miss, 0);
  const on = ff.applyWater(f.x, f.z, 600, 18);
  console.log(`  600 L on spot 1 (r ${f.r} m): ${on.toFixed(0)} L on target, intensity ${(f.intensity * 100).toFixed(0)} %`);
  assert.ok(on > 0 && f.intensity < 1 && f.state === 'burning');
  ff.applyWater(f.x, f.z, 3000, 18);
  assert.equal(f.state, 'out');
  // Packets fall and land: a drop from 30 m over spot 2 reaches it.
  const f2 = ff.fires[1];
  for (let i = 0; i < 20; i++) ff.addPacket({ litres: 60, x: f2.x - 40 + i * 0.5, y: f2.y + 30, z: f2.z, vx: 45, vy: 0, vz: 0 });
  for (let i = 0; i < 600; i++) { ff.time += 0; ff.update(1 / 60, new Vector3()); }
  console.log(`  drop from 30 m at 87 kt: spot 2 intensity ${(f2.intensity * 100).toFixed(0)} %, impacts ${ff.impacts.length}`);
  assert.ok(ff.impacts.length > 0 && f2.intensity < 1);
  assert.equal(FIRE_TEST_SPOTS.length, ff.fires.length);
});

test('Premium lock: open in the testing phase; enforced, the Fire Boss is locked until the entitlement source grants it; nothing else is locked', () => {
  setEntitlementSource(null);
  assert.equal(aircraftUnlocked(AIRCRAFT_TYPES.at802f), true, 'testing phase: open by default');
  setPremiumEnforced(true);
  assert.equal(isUnlocked(FIREBOSS_EXPANSION.id), false);
  assert.equal(aircraftUnlocked(AIRCRAFT_TYPES.at802f), false);
  for (const id of AIRCRAFT_ORDER.filter((k) => k !== 'at802f')) assert.equal(aircraftUnlocked(AIRCRAFT_TYPES[id]), true, id);
  setEntitlementSource((id) => id === FIREBOSS_EXPANSION.id);
  assert.equal(aircraftUnlocked(AIRCRAFT_TYPES.at802f), true);
  assert.equal(isUnlocked('expansion.unknown'), false);
  setEntitlementSource(() => { throw new Error('offline'); });
  assert.equal(isUnlocked(FIREBOSS_EXPANSION.id), false);
  setEntitlementSource(null);
  setPremiumEnforced(false);
  assert.equal(AIRCRAFT_TYPES.at802f.premium, 'expansion.at802f-fireboss');
});

test('Fire Boss performance: 1,600 shp, ≈ 150 kt, slower and heavier than the AT-802A despite more power', () => {
  const fb = levelSpeed(FB, 5500), ag = levelSpeed(AG, 5500);
  const c = climbRate(FB, 7257, 52);
  console.log(`  full power level at 5,500 kg: Fire Boss ${fb.kt.toFixed(0)} kt (published max cruise 150 KIAS), AT-802A ${ag.kt.toFixed(0)} kt; Fire Boss climb at 7,257 kg ${c.toFixed(0)} ft/min`);
  assert.ok(fb.kt > 138 && fb.kt < 158);
  assert.ok(fb.kt < ag.kt - 8);
  assert.ok(FB.emptyMass > AG.emptyMass + 500);
  assert.ok(c > 400);
});
