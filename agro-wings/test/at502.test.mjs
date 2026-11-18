// Air Tractor AT-502B (PR-AWT) validation against published figures
// (run: node --test test/). The PR-AGW keeps its own suite in flight.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, deg, Vector3, balaoDive, lowTurn } from './harness.mjs';
import { FLIGHT, FLIGHT_AT502 as A } from '../src/config.js';

const KT = 1.943844, FPM = 196.85;
const LB = 0.45359237;

function trimmed(hopper, speed, throttle, { fuel = 300, y = 400 } = {}) {
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
// Hopper load that brings the aircraft to a given gross mass with `fuel` L.
const hopperFor = (massKg, fuel) => massKg - A.emptyMass - A.pilotMass - fuel * A.fuelDensity;

test('PR-AGW keeps its piston engine and figures', () => {
  assert.equal(FLIGHT.turbine, undefined);
  assert.equal(FLIGHT.maxPower, 239e3);
  assert.equal(FLIGHT.hopperCapacity, 900);
  assert.equal(FLIGHT.mtow, 1800);
  assert.deepEqual(FLIGHT.wheelPoint, [0, -1.25, 0.75]);
});

test('AT-502B parked: three wheels, ~10° three-point attitude, no drift', () => {
  const sim = makeSim({ A, hopper: 0, fuel: 300, wind: true });
  const { fm } = sim;
  fm.settleOnGround(-420, -50, Math.PI / 2, sim.env);
  fm.parkBrake = true;
  const p0 = fm.pos.clone();
  sim.step(120 * 10);
  const a = sim.att();
  console.log(`  three-point pitch ${deg(a.pitch).toFixed(1)}°, drift ${(fm.pos.distanceTo(p0) * 100).toFixed(1)} cm`);
  assert.equal(fm.out.wheelsOnGround, 3);
  assert.ok(deg(a.pitch) > 8 && deg(a.pitch) < 13);
  assert.ok(fm.pos.distanceTo(p0) < 0.05);
});

test('PT6A start: starter, light-off, ground idle; turbine lag; run-down', () => {
  const sim = makeSim({ A, hopper: 0, fuel: 300, wind: false });
  const { fm } = sim;
  fm.settleOnGround(-385, 0, Math.PI / 2, sim.env);
  fm.engine = 'cranking'; fm.crankTime = 0; fm.parkBrake = true;
  let lightoff = null, running = null, ittPeak = 0;
  for (let i = 0; i < 120 * 25 && running === null; i++) {
    sim.step(1);
    if (lightoff === null && sim.events.some((e) => e.kind === 'lightoff')) lightoff = sim.t;
    if (fm.engine === 'running') running = sim.t;
    ittPeak = Math.max(ittPeak, fm.itt);
  }
  sim.step(120 * 4);
  console.log(`  light-off ${lightoff?.toFixed(1)} s, idle ${running?.toFixed(1)} s, ITT peak ${ittPeak.toFixed(0)} °C; idle Ng ${fm.ng.toFixed(1)} %, Np ${fm.rpm.toFixed(0)} rpm, ITT ${fm.itt.toFixed(0)} °C, ${fm.fuelFlow.toFixed(0)} L/h`);
  assert.ok(lightoff > 2 && lightoff < 5, 'light-off after the starter has spun Ng up');
  assert.ok(running > 8 && running < 18, `start took ${running} s`);
  assert.ok(ittPeak > fm.itt + 80, 'light-off ITT peak above idle');
  assert.ok(Math.abs(fm.ng - A.turbine.idleNg) < 1.5 && Math.abs(fm.rpm - A.idleRpm) < 60);
  // Power lever to full: torque builds over seconds, not instantly.
  fm.throttle = 1;
  let t90 = null;
  for (let i = 0; i < 120 * 12; i++) { sim.step(1); if (t90 === null && fm.torque > 0.9 * A.turbine.maxTorque) t90 = i / 120; }
  console.log(`  90 % torque after ${t90?.toFixed(1)} s; full power ${(fm.shaftPower / 745.7).toFixed(0)} shp, ${fm.torque.toFixed(0)} ft·lb, Np ${fm.rpm.toFixed(0)}, ITT ${fm.itt.toFixed(0)} °C, ${fm.fuelFlow.toFixed(0)} L/h`);
  assert.ok(t90 > 2 && t90 < 7, `spool-up ${t90} s`);
  assert.ok(Math.abs(fm.rpm - A.maxRpm) < 15, 'governed at 2,200 rpm');
  assert.ok(fm.shaftPower / 745.7 > 735 && fm.shaftPower / 745.7 < 752, 'flat-rated 750 shp');
  assert.ok(fm.fuelFlow > 230 && fm.fuelFlow < 270);
  // Shutdown: Ng and Np run down over seconds; the prop stops (feathered).
  fm.throttle = 0; fm.engine = 'off';
  sim.step(120 * 3);
  assert.ok(fm.ng > 20 && fm.rpm > 50, 'still spooling down after 3 s');
  sim.step(120 * 25);
  assert.ok(fm.ng < 3 && fm.rpm < 5, `run-down: Ng ${fm.ng}, Np ${fm.rpm}`);
});

function takeoff(hopper, fuel = 643) {
  const sim = makeSim({ A, hopper, fuel, wind: false });
  const { fm } = sim;
  fm.settleOnGround(-385, 0, Math.PI / 2, sim.env);
  fm.engine = 'running'; fm.ng = A.turbine.idleNg; fm.rpm = A.idleRpm; fm.throttle = 0.05;
  fm.flapsCmd = fm.flaps = 1 / 3;
  sim.step(240);
  const x0 = fm.pos.x;
  const vs = Math.sqrt((2 * fm.mass * 9.81) / (1.225 * A.wingArea * 2.0));
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

test('take-off: much longer at maximum weight, still inside the 800 m strip', () => {
  const light = takeoff(0), heavy = takeoff(hopperFor(4264, 643));
  console.log(`  ${light.mass.toFixed(0)} kg: ${light.dist.toFixed(0)} m @ ${(light.v * KT).toFixed(0)} kt; ${heavy.mass.toFixed(0)} kg: ${heavy.dist.toFixed(0)} m @ ${(heavy.v * KT).toFixed(0)} kt`);
  assert.ok(light.dist < 260);
  assert.ok(heavy.dist < 700, `MTOW roll ${heavy.dist}`);
  assert.ok(heavy.dist > light.dist * 2);
  assert.ok(heavy.v > light.v * 1.15);
});

test('climb at 9,400 lb matches the published 870 ft/min', () => {
  const fuel = 380;
  const sim = trimmed(hopperFor(9400 * LB, fuel), 49, 1, { fuel, y: 60 });
  holdSpeed(sim, 49, 10);
  const y0 = sim.fm.pos.y;
  holdSpeed(sim, 49, 20);
  const fpm = ((sim.fm.pos.y - y0) / 20) * FPM;
  console.log(`  ${(sim.fm.mass / LB).toFixed(0)} lb at ${(49 * KT).toFixed(0)} kt: ${fpm.toFixed(0)} ft/min (published 870)`);
  assert.ok(Math.abs(fpm - 870) / 870 < 0.12, `${fpm} ft/min`);
});

test('1 g stall at 8,000 lb near the published 71 kt (flaps up)', () => {
  const fuel = 300;
  const sim = trimmed(hopperFor(8000 * LB, fuel), 50, 0, { fuel });
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
  console.log(`  stall ${(res.eas * KT).toFixed(0)} kt at ${res.g.toFixed(2)} g → ${vs1g.toFixed(0)} kt at 1 g (published 71)`);
  assert.ok(Math.abs(vs1g - 71) < 5);
});

test('full power level speed and working-speed power at 8,000 lb', () => {
  const fuel = 300;
  const level = (thr) => {
    const sim = trimmed(hopperFor(8000 * LB, fuel), 60, thr, { fuel });
    const { fm } = sim;
    for (let i = 0; i < 120 * 120; i++) sim.step(1, { pitch: Math.max(-1, Math.min(1, (400 - fm.pos.y) * 0.02 - fm.vel.y * 0.1)), roll: 0, yaw: 0 }, 'normal');
    return { ias: fm.out.airspeed * KT * Math.sqrt(fm.out.density / 1.225), vs: fm.vel.y, ff: fm.fuelFlow };
  };
  const full = level(1), work = level(0.62);
  console.log(`  full power ${full.ias.toFixed(0)} kt IAS (${full.ff.toFixed(0)} L/h); 62 % lever ${work.ias.toFixed(0)} kt (${work.ff.toFixed(0)} L/h)`);
  assert.ok(Math.abs(full.vs) < 0.3 && full.ias > 132 && full.ias < 152);
  // Working speed 120–145 mph = 104–126 kt.
  assert.ok(work.ias > 104 && work.ias < 128);
});

test('pitch and roll response with the assist (loaded, spray speed)', () => {
  const sim = trimmed(1000, 56, 0.65);
  holdSpeed(sim, 56, 6);
  const { fm } = sim;
  let s = 0;
  for (let i = 0; i < 60; i++) { s = Math.min(1, s + 3.4 / 120); sim.step(1, { pitch: s, roll: 0, yaw: 0 }, 'normal'); }
  const q = -fm.omega.x, g = fm.out.gLoad;
  const sim2 = trimmed(1000, 56, 0.65);
  holdSpeed(sim2, 56, 6);
  let r = 0, t60 = null;
  for (let i = 0; i < 360 && t60 === null; i++) {
    r = Math.min(1, r + 3.2 / 120);
    sim2.step(1, { pitch: 0, roll: r, yaw: 0 }, 'normal');
    if (Math.abs(sim2.att().bank) > 1.05) t60 = i / 120;
  }
  console.log(`  ${deg(q).toFixed(0)}°/s and ${g.toFixed(2)} g after 0.5 s; 60° bank in ${t60?.toFixed(2)} s`);
  // (With the angle of attack at the protected limit the nose turns with
  // the path, so the g — not the pitch rate — is what a quick pull shows.)
  assert.ok(q > 0.25 && g > 1.6, `${deg(q).toFixed(0)}°/s, ${g.toFixed(2)} g`);
  assert.ok(t60 !== null && t60 < 1.5);
});

test('balão with 1,200 L: pull-up, steep reversal, no stall', () => {
  const sim = trimmed(1200, 58, 0.62);
  holdSpeed(sim, 58, 6);
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
  assert.ok(top > 18 && maxBank > 1.2 && stall < 0.2);
  assert.ok(Math.abs(turned) > Math.PI * 0.8);
});

test('balão with the dive back at working speed: the pull-out clears the ground (loaded)', () => {
  for (const [hop, dive, hPull, minLow] of [[600, 14, 14, 1.5], [1000, 14, 14, 1.5], [1000, 20, 18, 0.8]]) {
    const r = balaoDive(A, hop, { diveDeg: dive, hPull, fuel: 340, knots: 115 });
    console.log(`  ${hop} L, ${dive}° dive, pull at ${hPull} m (${r.pullKt?.toFixed(0)} kt): lowest ${typeof r.low === 'number' ? r.low.toFixed(1) + ' m' : r.low}, ${r.maxG.toFixed(2)} g, stall ${r.stall.toFixed(2)}`);
    assert.ok(typeof r.low === 'number' && r.low > minLow, `hit or too low: ${r.low}`);
    assert.ok(r.stall < 0.3, `stalled (${r.stall})`);
  }
});

test('landing: soft touchdown, beta and brakes stop it on the strip, no prop strike', () => {
  const sim = makeSim({ A, hopper: 0, fuel: 250, wind: false });
  const { fm } = sim;
  const g = sim.env.ground(-300, 0);
  fm.reset(new Vector3(-370, g + A.aglOffset + 4, 0), Math.PI / 2, { speed: 40, engineOn: true });
  fm.throttle = 0;
  fm.flaps = fm.flapsCmd = 2 / 3;
  let touch = null;
  const events = [];
  for (let i = 0; i < 120 * 50; i++) {
    const a = sim.att(), o = fm.out;
    const pitch = !o.onGround
      ? Math.max(-1, Math.min(1, ((-0.4 - o.agl * 0.15) - o.vs) * 0.6 + (0.1 - a.pitch) * 0.8))
      : 0.6;
    fm.brake = o.onGround && o.airspeed < 26 ? 1 : 0;
    sim.step(1, { pitch, roll: -a.bank * 2, yaw: Math.max(-1, Math.min(1, -(Math.PI / 2 - fm.heading()) * 3)) }, 'normal');
    events.push(...fm.events);
    if (!touch && o.onGround) touch = { x: fm.pos.x };
    if (touch && o.groundSpeed < 0.3) break;
  }
  const main = events.find((e) => e.kind === 'touch' && e.part !== 'tail');
  const props = events.filter((e) => e.kind === 'ground' && (e.part === 'prop' || e.part === 'spinner'));
  const roll = fm.pos.x - touch.x;
  console.log(`  touchdown ${main.speed.toFixed(2)} m/s, rollout ${roll.toFixed(0)} m (beta ${fm.beta})`);
  assert.ok(main.speed < A.hardLandingVs);
  assert.ok(roll < 450 && fm.pos.x < 400);
  assert.equal(props.length, 0);
});

test('low steep turn back (180° from 15 m, 1,180 L): 45° and 60° come round without touching the crop', () => {
  for (const [bank, maxLoss] of [[45, 5], [60, 10]]) {
    const r = lowTurn(A, 1180, bank, { knots: 115, fuel: 340 });
    console.log(`  ${bank}° bank, 1,180 L: ${typeof r.lost === 'number' ? r.lost.toFixed(1) + ' m' : r.lost} in ${r.t.toFixed(1)} s, ${r.v?.toFixed(0)} kt after, stall ${r.stall.toFixed(2)}`);
    assert.ok(typeof r.lost === 'number' && r.lost > -maxLoss, `lost ${r.lost}`);
    assert.ok(r.stall < 0.2, 'no stall');
  }
});
