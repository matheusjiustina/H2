// PZL M-18B Dromader (PR-DMD) validation against published figures
// (run: node --test test/). The PR-AGW and the AT-502B keep their own suites.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, deg, Vector3, balaoDive, lowTurn } from './harness.mjs';
import { FLIGHT, FLIGHT_AT502, FLIGHT_M18 as A } from '../src/config.js';

const KT = 1.943844, FPM = 196.85;

function trimmed(hopper, speed, throttle, { fuel = 400, y = 400 } = {}) {
  const sim = makeSim({ A, hopper, fuel, wind: false });
  sim.fm.reset(new Vector3(0, y, -300), Math.PI / 2, { speed, engineOn: true });
  sim.fm.throttle = throttle;
  return sim;
}
function holdSpeed(sim, target, seconds, mode = 'normal') {
  const { fm } = sim;
  for (let i = 0; i < 120 * seconds; i++) {
    const a = sim.att();
    const pitchT = Math.max(-0.35, Math.min(0.25, (fm.out.airspeed - target) * 0.04));
    sim.step(1, { pitch: Math.max(-1, Math.min(1, (pitchT - a.pitch) * 3 + fm.omega.x)), roll: -a.bank * 2, yaw: 0 }, mode);
  }
}
const hopperFor = (massKg, fuel) => massKg - A.emptyMass - A.pilotMass - fuel * A.fuelDensity;

test('PR-AGW and AT-502B keep their engines and figures', () => {
  assert.equal(FLIGHT.radial, undefined);
  assert.equal(FLIGHT_AT502.radial, undefined);
  assert.equal(FLIGHT.maxPower, 239e3);
  assert.equal(FLIGHT_AT502.maxPower, 559e3);
  assert.equal(FLIGHT_AT502.hopperCapacity, 1893);
  assert.deepEqual(FLIGHT_AT502.wheelPoint, [0, -1.45, 0.95]);
});

test('Dromader figures: 17.7 m, 40 m², 2,710 / 5,300 kg, 2,500 L hopper, 980 hp radial', () => {
  assert.equal(A.span, 17.7);
  assert.equal(A.wingArea, 40);
  assert.equal(A.emptyMass, 2710);
  assert.equal(A.mtow, 5300);
  assert.equal(A.hopperCapacity, 2500);
  assert.ok(Math.abs(A.maxPower / 745.7 - 980) < 1);
  // Hopper volume is not payload: full fuel + pilot leave ≈ 2,000 kg.
  const payload = A.mtow - A.emptyMass - A.pilotMass - A.fuelCapacity * A.fuelDensity;
  assert.ok(payload > 1900 && payload < 2100 && payload < A.hopperCapacity * A.liquidDensity);
});

test('Dromader parked: three wheels, ≈ 13° three-point attitude, no drift', () => {
  const sim = makeSim({ A, hopper: 0, fuel: 300, wind: true });
  const { fm } = sim;
  fm.settleOnGround(-420, -50, Math.PI / 2, sim.env);
  fm.parkBrake = true;
  const p0 = fm.pos.clone();
  sim.step(120 * 10);
  const a = sim.att();
  console.log(`  three-point pitch ${deg(a.pitch).toFixed(1)}°, drift ${(fm.pos.distanceTo(p0) * 100).toFixed(1)} cm`);
  assert.equal(fm.out.wheelsOnGround, 3);
  assert.ok(deg(a.pitch) > 10 && deg(a.pitch) < 15);
  assert.ok(fm.pos.distanceTo(p0) < 0.05);
});

test('ASz-62IR start: slow crank, coughs, catch, idle; governed take-off rpm and power; run-down', () => {
  const sim = makeSim({ A, hopper: 0, fuel: 300, wind: false });
  const { fm } = sim;
  fm.settleOnGround(-385, 0, Math.PI / 2, sim.env);
  fm.engine = 'cranking'; fm.crankTime = 0; fm.parkBrake = true;
  let catchT = null, coughs = 0;
  for (let i = 0; i < 120 * 10 && catchT === null; i++) {
    sim.step(1);
    coughs += fm.events.filter((e) => e.kind === 'cough').length;
    if (fm.engine === 'running') catchT = sim.t;
  }
  sim.step(120 * 6);
  console.log(`  caught after ${catchT?.toFixed(1)} s (${coughs} coughs); idle ${fm.rpm.toFixed(0)} rpm, MP ${fm.mp.toFixed(1)} inHg, oil ${fm.oilP.toFixed(0)} psi, ${fm.fuelFlow.toFixed(0)} L/h`);
  assert.ok(catchT > 2.5 && catchT < 4.5 && coughs === 2);
  assert.ok(Math.abs(fm.rpm - A.idleRpm) < 60 && fm.mp < 16 && fm.oilP > 30);
  fm.throttle = 1;
  sim.step(120 * 6);
  const hp = fm.shaftPower / 745.7;
  console.log(`  full throttle: ${fm.rpm.toFixed(0)} rpm (prop ${(fm.rpm * A.radial.gear).toFixed(0)}), MP ${fm.mp.toFixed(1)} inHg, ${hp.toFixed(0)} hp, ${fm.fuelFlow.toFixed(0)} L/h, static thrust ${(fm.out.thrust / 1000).toFixed(1)} kN`);
  assert.ok(Math.abs(fm.rpm - A.maxRpm) < 20, 'governed at 2,200 rpm');
  assert.ok(hp > 960 && hp < 985, `${hp} hp`);
  assert.ok(fm.mp > 40.5 && fm.mp < 41.5);
  assert.ok(fm.fuelFlow > 310 && fm.fuelFlow < 340);
  // Cylinder heads warm up with power on the ground; shutdown runs the prop down.
  assert.ok(fm.cht > 50, `CHT ${fm.cht}`);
  fm.throttle = 0; fm.engine = 'off';
  sim.step(120 * 10);
  assert.ok(fm.rpm < 5 && fm.mp > 28, `run-down: ${fm.rpm} rpm, MP ${fm.mp}`);
});

function takeoff(hopper, fuel = 712) {
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
    cmd.pitch = v < 16 ? 0 : v < vs * 1.1 ? -0.2 : 0.6;
    sim.step(1, cmd, 'normal');
    if (!fm.out.onGround && fm.out.agl > 0.5) return { dist: fm.pos.x - x0, v, mass: fm.mass };
  }
  return { dist: Infinity };
}

test('take-off: short when light, much longer at 5,300 kg, inside the 800 m strip', () => {
  const light = takeoff(0, 300), heavy = takeoff(hopperFor(5300, 712));
  console.log(`  ${light.mass.toFixed(0)} kg: ${light.dist.toFixed(0)} m @ ${(light.v * KT).toFixed(0)} kt; ${heavy.mass.toFixed(0)} kg: ${heavy.dist.toFixed(0)} m @ ${(heavy.v * KT).toFixed(0)} kt`);
  assert.ok(light.dist < 260);
  assert.ok(heavy.dist < 720, `MTOW roll ${heavy.dist}`);
  assert.ok(heavy.dist > light.dist * 2);
  assert.ok(heavy.v > light.v * 1.15);
});

test('climb at 4,200 kg near the published ≈ 1,100 ft/min; positive at 5,300 kg', () => {
  const rate = (mass) => {
    const fuel = 400;
    const sim = trimmed(hopperFor(mass, fuel), 40, 1, { fuel, y: 60 });
    holdSpeed(sim, 40, 10);
    const y0 = sim.fm.pos.y;
    holdSpeed(sim, 40, 20);
    return ((sim.fm.pos.y - y0) / 20) * FPM;
  };
  const mid = rate(4200), heavy = rate(5300);
  console.log(`  4,200 kg at ${(40 * KT).toFixed(0)} kt: ${mid.toFixed(0)} ft/min (published ≈ 1,100); 5,300 kg: ${heavy.toFixed(0)} ft/min`);
  assert.ok(Math.abs(mid - 1100) / 1100 < 0.15, `${mid} ft/min`);
  assert.ok(heavy > 350 && heavy < mid * 0.8);
});

test('1 g stall at 4,200 kg with full flaps near the published 58 kt', () => {
  const fuel = 300;
  const sim = trimmed(hopperFor(4200, fuel), 42, 0, { fuel });
  const { fm } = sim;
  fm.flaps = fm.flapsCmd = 1;
  let ei = 0.1, res = null;
  for (let i = 0; i < 120 * 90 && !res; i++) {
    const a = sim.att();
    ei += (-fm.vel.y * 0.02 - (fm.pos.y - 400) * 0.002) / 120;
    sim.step(1, { pitch: Math.max(-1, Math.min(1, ei - fm.vel.y * 0.05 + fm.omega.x * 0.6)), roll: -a.bank * 2, yaw: 0 }, 'off');
    if (fm.out.stall > 0.3) res = { eas: fm.out.airspeed * Math.sqrt(fm.out.density / 1.225), g: fm.out.gLoad };
  }
  assert.ok(res, 'must stall');
  const vs1g = (res.eas / Math.sqrt(Math.max(0.5, res.g))) * KT;
  console.log(`  stall ${(res.eas * KT).toFixed(0)} kt at ${res.g.toFixed(2)} g → ${vs1g.toFixed(0)} kt at 1 g (published 58)`);
  assert.ok(Math.abs(vs1g - 58) < 5);
});

test('full power level speed and working-speed power at 4,200 kg', () => {
  const fuel = 400;
  const level = (thr) => {
    const sim = trimmed(hopperFor(4200, fuel), 55, thr, { fuel });
    const { fm } = sim;
    for (let i = 0; i < 120 * 120; i++) sim.step(1, { pitch: Math.max(-1, Math.min(1, (400 - fm.pos.y) * 0.02 - fm.vel.y * 0.1)), roll: 0, yaw: 0 }, 'normal');
    return { ias: fm.out.airspeed * KT * Math.sqrt(fm.out.density / 1.225), vs: fm.vel.y, ff: fm.fuelFlow, rpm: fm.rpm, mp: fm.mp };
  };
  const full = level(1), work = level(0.62);
  console.log(`  full power ${full.ias.toFixed(0)} kt IAS (${full.ff.toFixed(0)} L/h); 62 % throttle ${work.ias.toFixed(0)} kt, ${work.rpm.toFixed(0)} rpm, MP ${work.mp.toFixed(1)} (${work.ff.toFixed(0)} L/h)`);
  assert.ok(Math.abs(full.vs) < 0.3 && full.ias > 118 && full.ias < 140);
  // Working speed 160–190 km/h = 86–103 kt.
  assert.ok(work.ias > 86 && work.ias < 108);
});

test('pitch and roll response with the assist (loaded, spray speed): heavier than the AT, still crisp', () => {
  const sim = trimmed(1500, 50, 0.65);
  holdSpeed(sim, 50, 6);
  const { fm } = sim;
  let s = 0;
  for (let i = 0; i < 60; i++) { s = Math.min(1, s + 3.4 / 120); sim.step(1, { pitch: s, roll: 0, yaw: 0 }, 'normal'); }
  const g = fm.out.gLoad;
  const sim2 = trimmed(1500, 50, 0.65);
  holdSpeed(sim2, 50, 6);
  let r = 0, t60 = null;
  for (let i = 0; i < 480 && t60 === null; i++) {
    r = Math.min(1, r + 3.2 / 120);
    sim2.step(1, { pitch: 0, roll: r, yaw: 0 }, 'normal');
    if (Math.abs(sim2.att().bank) > 1.05) t60 = i / 120;
  }
  console.log(`  ${g.toFixed(2)} g after 0.5 s; 60° bank in ${t60?.toFixed(2)} s`);
  assert.ok(g > 1.5, `${g.toFixed(2)} g`);
  assert.ok(t60 !== null && t60 < 2.2 && t60 > 0.8);
});

test('balão with 1,500 L: pull-up, steep reversal, no stall', () => {
  const sim = trimmed(1500, 52, 0.62);
  holdSpeed(sim, 52, 6);
  const { fm } = sim;
  const h0 = fm.pos.y;
  const sh = { p: 0, r: 0 };
  const ap = (c, t, k) => (c < t ? Math.min(t, c + k / 120) : Math.max(t, c - k / 120));
  let phase = 0, turned = 0, prev = fm.heading(), top = 0, stall = 0, maxBank = 0;
  for (let i = 0; i < 120 * 40; i++) {
    const a = sim.att();
    let c;
    if (phase === 0) { if (a.pitch > 0.42) phase = 1; c = { pitch: 1, roll: 0 }; }
    else if (phase === 1) { if (Math.abs(a.bank) > 1.12) phase = 2; c = { pitch: 0, roll: 1 }; }
    else if (phase === 2) { if (Math.abs(turned) > Math.PI * 0.85) phase = 3; c = { pitch: 0.25, roll: 0 }; }
    else if (Math.abs(a.bank) < 0.1) break;
    else c = { pitch: 0, roll: -1 };
    sh.p = ap(sh.p, c.pitch, c.pitch === 0 ? 4 : 3.4);
    sh.r = ap(sh.r, c.roll, c.roll === 0 ? 5 : 3.2);
    sim.step(1, { pitch: sh.p, roll: sh.r, yaw: 0 }, 'normal');
    let d = fm.heading() - prev; d = Math.atan2(Math.sin(d), Math.cos(d)); turned += d; prev = fm.heading();
    top = Math.max(top, fm.pos.y - h0); stall = Math.max(stall, fm.out.stall); maxBank = Math.max(maxBank, Math.abs(a.bank));
  }
  console.log(`  ${deg(Math.abs(turned)).toFixed(0)}°, top +${top.toFixed(0)} m, bank ≤${deg(maxBank).toFixed(0)}°, stall ${stall.toFixed(2)}`);
  assert.ok(top > 15 && maxBank > 1.2 && stall < 0.2);
  assert.ok(Math.abs(turned) > Math.PI * 0.8);
});

test('balão with the dive back at working speed: the pull-out clears the ground (loaded)', () => {
  for (const [hop, dive, hPull, minLow] of [[800, 14, 14, 1.5], [1500, 14, 15, 1.2]]) {
    const r = balaoDive(A, hop, { diveDeg: dive, hPull, fuel: 400, knots: 100 });
    console.log(`  ${hop} L, ${dive}° dive, pull at ${hPull} m (${r.pullKt?.toFixed(0)} kt): lowest ${typeof r.low === 'number' ? r.low.toFixed(1) + ' m' : r.low}, ${r.maxG.toFixed(2)} g, stall ${r.stall.toFixed(2)}`);
    assert.ok(typeof r.low === 'number' && r.low > minLow, `hit or too low: ${r.low}`);
    assert.ok(r.stall < 0.3, `stalled (${r.stall})`);
  }
});

test('landing: soft touchdown, brakes stop it on the strip, no prop strike', () => {
  const sim = makeSim({ A, hopper: 0, fuel: 300, wind: false });
  const { fm } = sim;
  const g = sim.env.ground(-300, 0);
  fm.reset(new Vector3(-370, g + A.aglOffset + 4, 0), Math.PI / 2, { speed: 36, engineOn: true });
  fm.throttle = 0;
  fm.flaps = fm.flapsCmd = 2 / 3;
  let touch = null;
  const events = [];
  for (let i = 0; i < 120 * 50; i++) {
    const a = sim.att(), o = fm.out;
    const pitch = !o.onGround
      ? Math.max(-1, Math.min(1, ((-0.4 - o.agl * 0.15) - o.vs) * 0.6 + (0.1 - a.pitch) * 0.8))
      : 0.6;
    fm.brake = o.onGround && o.airspeed < 24 ? 1 : 0;
    sim.step(1, { pitch, roll: -a.bank * 2, yaw: Math.max(-1, Math.min(1, -(Math.PI / 2 - fm.heading()) * 3)) }, 'normal');
    events.push(...fm.events);
    if (!touch && o.onGround) touch = { x: fm.pos.x };
    if (touch && o.groundSpeed < 0.3) break;
  }
  const main = events.find((e) => e.kind === 'touch' && e.part !== 'tail');
  const props = events.filter((e) => e.kind === 'ground' && (e.part === 'prop' || e.part === 'spinner'));
  const roll = fm.pos.x - touch.x;
  console.log(`  touchdown ${main.speed.toFixed(2)} m/s, rollout ${roll.toFixed(0)} m`);
  assert.ok(main.speed < A.hardLandingVs);
  assert.ok(roll < 480 && fm.pos.x < 400);
  assert.equal(props.length, 0);
});

test('low steep turn back (180° from 15 m, 1,500 L): 45° comes round without touching the crop', () => {
  const r = lowTurn(A, 1500, 45, { knots: 100, fuel: 400 });
  console.log(`  45° bank, 1,500 L: ${typeof r.lost === 'number' ? r.lost.toFixed(1) + ' m' : r.lost} in ${r.t.toFixed(1)} s, ${r.v?.toFixed(0)} kt after, stall ${r.stall.toFixed(2)}`);
  assert.ok(typeof r.lost === 'number' && r.lost > -6, `lost ${r.lost}`);
  assert.ok(r.stall < 0.2, 'no stall');
});
