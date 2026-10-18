// Flight-model validation (run: node --test test/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, deg, balaoDive } from './harness.mjs';
import { FlightModel } from '../src/flight/flightModel.js';
import { Assist } from '../src/flight/assist.js';
import { createFlightEnv } from '../src/flight/env.js';
import { FLIGHT } from '../src/config.js';
import { Vector3 } from 'three';

const KT = 1.943844;
const G = 9.81;

function takeoffRun(hopper) {
  const sim = makeSim({ hopper, fuel: 160, wind: false });
  const { fm } = sim;
  fm.settleOnGround(-385, 0, Math.PI / 2, sim.env);
  sim.step(240);
  fm.engine = 'running'; fm.rpm = 900; fm.flapsCmd = fm.flaps = 1 / 3;
  const x0 = fm.pos.x;
  const vs = Math.sqrt((2 * fm.mass * G) / (1.225 * FLIGHT.wingArea * 1.75));
  const cmd = { pitch: 0, roll: 0, yaw: 0 };
  for (let i = 0; i < 120 * 70; i++) {
    fm.throttle = Math.min(1, fm.throttle + 0.55 / 120);
    const hdgErr = Math.PI / 2 - fm.heading();
    cmd.yaw = Math.max(-1, Math.min(1, -hdgErr * 3 + fm.omega.y * 1.5));
    const v = fm.out.airspeed;
    cmd.pitch = v < 14 ? 0 : v < vs * 1.08 ? -0.2 : 0.7;
    sim.step(1, cmd, 'normal');
    if (!fm.out.onGround && fm.out.agl > 0.5) return { dist: fm.pos.x - x0, v: fm.out.airspeed, mass: fm.mass, sim };
  }
  return { dist: Infinity };
}

test('parked aircraft rests on three wheels without drifting', () => {
  const sim = makeSim({ hopper: 0, wind: true });
  const { fm } = sim;
  fm.settleOnGround(-352, -64, Math.PI / 2, sim.env);
  fm.parkBrake = true;
  const p0 = fm.pos.clone();
  sim.step(120 * 10);
  const a = sim.att();
  assert.ok(fm.pos.distanceTo(p0) < 0.05, `drift ${fm.pos.distanceTo(p0)}`);
  assert.ok(deg(a.pitch) > 8 && deg(a.pitch) < 13, `three-point pitch ${deg(a.pitch)}`);
  assert.equal(fm.out.wheelsOnGround, 3);
});

test('full hopper needs a clearly longer take-off than an empty one', () => {
  const e = takeoffRun(0), f = takeoffRun(850);
  console.log(`  empty ${e.dist.toFixed(0)} m @ ${(e.v * KT).toFixed(0)} kt, full ${f.dist.toFixed(0)} m @ ${(f.v * KT).toFixed(0)} kt`);
  assert.ok(e.dist < 260, `empty roll ${e.dist}`);
  assert.ok(f.dist < 760, `full roll ${f.dist} (runway is 785 m)`);
  assert.ok(f.dist > e.dist * 1.8, 'loaded take-off should be much longer');
  assert.ok(f.v > e.v * 1.15, 'loaded lift-off speed should be higher');
});

function trimmed(hopper, speed = 42, throttle = 0.75) {
  const sim = makeSim({ hopper, fuel: 160, wind: false });
  const { fm } = sim;
  fm.reset(new Vector3(0, 400, 0), Math.PI / 2, { speed, engineOn: true });
  fm.throttle = throttle;
  return sim;
}

// Simple speed-hold pilot through the stick (rate command).
function holdSpeed(sim, target, seconds, mode = 'normal') {
  const { fm } = sim;
  for (let i = 0; i < 120 * seconds; i++) {
    const err = fm.out.airspeed - target;
    const a = sim.att();
    const pitchT = Math.max(-0.35, Math.min(0.25, err * 0.04));
    sim.step(1, { pitch: Math.max(-1, Math.min(1, (pitchT - a.pitch) * 3 + fm.omega.x)), roll: -a.bank * 2, yaw: 0 }, mode);
  }
}

test('power-off glide: natural descent with a believable glide ratio', () => {
  const sim = trimmed(0, 36, 0);
  holdSpeed(sim, 34, 20);
  const { fm } = sim;
  const p0 = fm.pos.clone();
  holdSpeed(sim, 34, 30);
  const dist = Math.hypot(fm.pos.x - p0.x, fm.pos.z - p0.z), drop = p0.y - fm.pos.y;
  const ld = dist / drop;
  console.log(`  glide L/D ${ld.toFixed(1)}, sink ${(drop / 30).toFixed(2)} m/s at ${(fm.out.airspeed * KT).toFixed(0)} kt`);
  assert.ok(drop > 20, 'must descend, not float');
  assert.ok(ld > 6 && ld < 13, `L/D ${ld}`);
});

test('loaded aircraft climbs much worse than light one', () => {
  const climb = (hopper) => {
    const sim = trimmed(hopper, 42, 1);
    holdSpeed(sim, 40, 10);
    const y0 = sim.fm.pos.y;
    holdSpeed(sim, 40, 15);
    return (sim.fm.pos.y - y0) / 15;
  };
  const e = climb(0), f = climb(900);
  console.log(`  climb at 78 kt: empty ${e.toFixed(2)} m/s, full ${f.toFixed(2)} m/s`);
  assert.ok(e > 2.5, `empty climb ${e}`);
  assert.ok(e > f * 1.6, 'full load must climb clearly slower');
});

test('banked turn: rate matches g·tan(bank)/V and costs energy', () => {
  const fly = (bankT) => {
    const sim = trimmed(400, 46, 0.7);
    holdSpeed(sim, 46, 8);
    const { fm } = sim;
    const h0 = fm.pos.y;
    let rate = 0, n = 0, prev = fm.heading();
    for (let i = 0; i < 120 * 25; i++) {
      const a = sim.att();
      const roll = Math.max(-1, Math.min(1, (bankT - a.bank) * 2.5 - fm.omega.z * 0.5));
      const pitch = Math.max(-1, Math.min(1, (h0 - fm.pos.y) * 0.08 - fm.out.vs * 0.25 + fm.omega.x));
      sim.step(1, { pitch, roll, yaw: 0 }, 'normal');
      if (i > 120 * 8) {
        let d = fm.heading() - prev;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        rate += d * 120; n++;
      }
      prev = fm.heading();
    }
    return { rate: Math.abs(rate / n), bank: Math.abs(sim.att().bank), v: fm.out.airspeed, dh: fm.pos.y - h0 };
  };
  const straight = fly(0), turn = fly(0.52);
  const theory = (G * Math.tan(turn.bank)) / turn.v;
  console.log(`  bank ${deg(turn.bank).toFixed(0)}°, turn ${deg(turn.rate).toFixed(1)}°/s vs theory ${deg(theory).toFixed(1)}°/s; speed straight ${(straight.v * KT).toFixed(0)} kt vs turning ${(turn.v * KT).toFixed(0)} kt (same power, level)`);
  assert.ok(Math.abs(turn.rate - theory) / theory < 0.2);
  assert.ok(turn.v < straight.v - 1, 'a level turn bleeds energy compared with straight flight');
});

// Keyboard-style pilot (same input shaping as the game) from level flight at
// spraying speed. pilot(fm, att, turned, st) -> { pitch, roll } | { done }.
function pilotRun(hopper, pilot, mode = 'normal') {
  const sim = trimmed(hopper, 46, 0.85);
  holdSpeed(sim, 46, 6);
  const { fm } = sim;
  const h0 = fm.pos.y;
  const sh = { p: 0, r: 0 };
  const ap = (c, t, r) => (c < t ? Math.min(t, c + r / 120) : Math.max(t, c - r / 120));
  let turned = 0, prev = fm.heading(), t = 0, top = 0, low = 0, stall = 0, maxBank = 0;
  const st = { phase: 0 };
  while (t < 40) {
    const a = sim.att();
    const c = pilot(fm, a, turned, st);
    if (c.done) break;
    sh.p = ap(sh.p, c.pitch, c.pitch === 0 ? 4 : 3.4);
    sh.r = ap(sh.r, c.roll, c.roll === 0 ? 5 : 3.2);
    sim.step(1, { pitch: sh.p, roll: sh.r, yaw: 0 }, mode);
    let d = fm.heading() - prev; d = Math.atan2(Math.sin(d), Math.cos(d)); turned += d; prev = fm.heading();
    t += 1 / 120;
    top = Math.max(top, fm.pos.y - h0); low = Math.min(low, fm.pos.y - h0);
    stall = Math.max(stall, fm.out.stall); maxBank = Math.max(maxBank, Math.abs(a.bank));
  }
  return { t, dh: fm.pos.y - h0, top, low, stall, maxBank, turned, v: fm.out.airspeed };
}

test('ailerons: full stick rolls past 75° quickly, no bank cap while held', () => {
  let t60 = null, t = 0;
  const r = pilotRun(0, (fm, a) => {
    t += 1 / 120;
    if (Math.abs(a.bank) > 1.05 && t60 === null) t60 = t;
    if (Math.abs(a.bank) > 1.36 || t > 3) return { done: true };
    return { pitch: 0, roll: 1 };
  });
  console.log(`  60° bank after ${t60?.toFixed(2)} s; ${deg(r.maxBank).toFixed(0)}° reached in ${r.t.toFixed(1)} s`);
  assert.ok(r.maxBank > 1.3, `bank capped at ${deg(r.maxBank)}°`);
  assert.ok(t60 !== null && t60 < 1.3, `roll to 60° took ${t60} s`);
});

test('steep turn at 45° with the stick centred holds the flight path (empty and loaded)', () => {
  for (const hop of [0, 560]) {
    const r = pilotRun(hop, (fm, a, turned) => (Math.abs(turned) >= Math.PI ? { done: true } : { pitch: 0, roll: Math.abs(a.bank) < 0.7 ? 1 : 0 }));
    console.log(`  45° turn, hopper ${hop} L: 180° in ${r.t.toFixed(1)} s, height ${r.dh.toFixed(1)} m (lowest ${r.low.toFixed(1)})`);
    assert.ok(r.low > -12, `sank ${r.low} m`);
  }
});

test('balão: pull-up, steep reversal and the nose falls back — energy traded, no stall', () => {
  const balao = (fm, a, turned, st) => {
    if (st.phase === 0) { if (a.pitch > 0.42) st.phase = 1; return { pitch: 1, roll: 0 }; }
    if (st.phase === 1) { if (Math.abs(a.bank) > 1.12) st.phase = 2; return { pitch: 0, roll: 1 }; }
    if (st.phase === 2) { if (Math.abs(turned) > Math.PI * 0.85) st.phase = 3; return { pitch: 0.25, roll: 0 }; }
    if (Math.abs(a.bank) < 0.1) return { done: true };
    return { pitch: 0, roll: -1 };
  };
  for (const hop of [0, 560]) {
    const r = pilotRun(hop, balao);
    console.log(`  balão, hopper ${hop} L: ${deg(Math.abs(r.turned)).toFixed(0)}° in ${r.t.toFixed(1)} s, top +${r.top.toFixed(0)} m, end ${r.dh.toFixed(0)} m, bank ≤${deg(r.maxBank).toFixed(0)}°, stall ${r.stall.toFixed(2)}`);
    assert.ok(r.top > 18, `pull-up only gained ${r.top} m`);
    assert.ok(r.maxBank > 1.2, 'steep bank at the top');
    assert.ok(r.stall < 0.2, `stalled (${r.stall})`);
    assert.ok(r.dh > -20, `lost ${r.dh} m in the balão`);
  }
});

test('pitch response: full back stick brings the nose up within half a second', () => {
  for (const v0 of [46, 60]) {
    const sim = trimmed(300, v0, 0.9);
    holdSpeed(sim, v0, 6);
    const { fm } = sim;
    let s = 0, t = 0, q05 = 0, g05 = 0;
    while (t < 0.5) {
      s = Math.min(1, s + 3.4 / 120);
      sim.step(1, { pitch: s, roll: 0, yaw: 0 }, 'normal');
      t += 1 / 120;
    }
    q05 = -fm.omega.x; g05 = fm.out.gLoad;
    console.log(`  ${(v0 * KT).toFixed(0)} kt: pitch rate ${deg(q05).toFixed(0)}°/s and ${g05.toFixed(2)} g after 0.5 s`);
    assert.ok(q05 > 0.38, `pitch rate only ${deg(q05)}°/s`);
    assert.ok(g05 > 1.8, `only ${g05} g after 0.5 s`);
  }
});

test('pull-out: loaded, from a 10° descent at spray speed, levels within ~9 m', () => {
  const sim = trimmed(560, 50, 1);
  holdSpeed(sim, 50, 6);
  const { fm } = sim;
  // Nose down to a 10° descent and let the speed build.
  for (let i = 0; i < 120 * 6; i++) {
    const a = sim.att();
    sim.step(1, { pitch: Math.max(-1, Math.min(1, (-0.18 - a.pitch) * 3 + fm.omega.x)), roll: -a.bank * 2, yaw: 0 }, 'normal');
  }
  const y0 = fm.pos.y, vs0 = fm.out.vs, v0 = fm.out.airspeed;
  let s = 0, low = 0, stall = 0;
  for (let i = 0; i < 120 * 4 && fm.out.vs < 0.5; i++) {
    s = Math.min(1, s + 3.4 / 120);
    sim.step(1, { pitch: s, roll: 0, yaw: 0 }, 'normal');
    low = Math.min(low, fm.pos.y - y0); stall = Math.max(stall, fm.out.stall);
  }
  console.log(`  from ${(-vs0).toFixed(1)} m/s sink at ${(v0 * KT).toFixed(0)} kt: levelled after ${(-low).toFixed(1)} m, stall ${stall.toFixed(2)}`);
  assert.ok(-low < 9.3, `lost ${-low} m in the pull-out`);
  assert.ok(stall < 0.2, 'no stall in the pull-out');
});

test('hard pull: the g builds to the protected limit within ~0.6 s, the elevator does not chatter', () => {
  for (const hop of [0, 450]) {
    const sim = trimmed(hop, 50, 1);
    holdSpeed(sim, 50, 6);
    const { fm } = sim;
    // 20° dive at ~100 kt, then a full pull as the keyboard gives it.
    for (let i = 0; i < 120 * 5; i++) {
      const a = sim.att(), gam = Math.asin(fm.vel.y / fm.vel.length());
      sim.step(1, { pitch: Math.max(-1, Math.min(1, (-0.35 - gam) * 4 + (-0.35 - a.pitch) + fm.omega.x * 0.5)), roll: -a.bank * 2, yaw: 0 }, 'normal');
    }
    let s = 0, g06 = 0, flips = 0, stall = 0, prev = fm.elevator;
    for (let i = 0; i < 120 * 1.2; i++) {
      s = Math.min(1, s + 5 / 120);
      sim.step(1, { pitch: s, roll: 0, yaw: 0 }, 'normal');
      if (i === 72) g06 = fm.out.gLoad;
      if (Math.abs(fm.elevator - prev) > 0.3) flips++;
      prev = fm.elevator; stall = Math.max(stall, fm.out.stall);
    }
    const nProt = sim.assist.nAvail;
    console.log(`  hopper ${hop} L: ${g06.toFixed(2)} g after 0.6 s (wing gives ${nProt.toFixed(2)} g at the protected angle), ${flips} elevator jumps, stall ${stall.toFixed(2)}`);
    assert.ok(g06 > Math.min(nProt, 3.8) * 0.72, `only ${g06} g after 0.6 s`);
    assert.ok(flips <= 3, `elevator chatter: ${flips} jumps`);
    assert.ok(stall < 0.2, 'no stall');
  }
});

test('balão with the dive back: a hard pull near the ground levels out above it (loaded)', () => {
  for (const [hop, dive, hPull, minLow] of [[300, 14, 14, 4], [560, 14, 14, 4], [560, 20, 20, 1]]) {
    const r = balaoDive(FLIGHT, hop, { diveDeg: dive, hPull });
    console.log(`  ${hop} L, ${dive}° dive, pull at ${hPull} m (${r.pullKt?.toFixed(0)} kt): lowest ${typeof r.low === 'number' ? r.low.toFixed(1) + ' m' : r.low}, ${r.maxG.toFixed(2)} g, stall ${r.stall.toFixed(2)}`);
    assert.ok(typeof r.low === 'number' && r.low > minLow, `hit or too low: ${r.low}`);
    assert.ok(r.stall < 0.3, `stalled (${r.stall})`);
  }
});

test('stall: progressive, recoverable without assist; prevented with assist', () => {
  const sim = trimmed(0, 40, 0);
  const { fm } = sim;
  let stallAt = null;
  for (let i = 0; i < 120 * 12 && !stallAt; i++) {
    const a = sim.att();
    // Pilot holds the stick progressively back at idle (no assist).
    sim.step(1, { pitch: Math.min(1, 0.2 + i / 600), roll: -a.bank * 2, yaw: 0 }, 'off');
    if (fm.out.stall > 0.5) stallAt = { v: fm.out.airspeed, a: fm.out.alpha };
  }
  assert.ok(stallAt, 'aircraft should stall when held nose-high at idle');
  console.log(`  stall at ${(stallAt.v * KT).toFixed(0)} kt, alpha ${deg(stallAt.a).toFixed(1)}°`);
  assert.ok(deg(stallAt.a) > 14 && deg(stallAt.a) < 20);
  // Recovery: nose down + power
  fm.throttle = 1;
  let recovered = false;
  const y0 = fm.pos.y;
  for (let i = 0; i < 120 * 12; i++) {
    const a = sim.att();
    const pitchT = fm.out.airspeed < 32 ? -0.15 : 0.05;
    sim.step(1, { pitch: Math.max(-1, Math.min(1, (pitchT - a.pitch) * 2)), roll: -a.bank * 2, yaw: 0 }, 'off');
    if (fm.out.stall < 0.05 && fm.out.airspeed > 32 && fm.out.vs > -1) { recovered = true; break; }
  }
  console.log(`  recovered: ${recovered}, height lost ${(y0 - fm.pos.y).toFixed(0)} m`);
  assert.ok(recovered);
  const s2 = trimmed(0, 40, 0);
  let maxStall = 0;
  for (let i = 0; i < 120 * 15; i++) { s2.step(1, { pitch: 1, roll: 0, yaw: 0 }, 'normal'); maxStall = Math.max(maxStall, s2.fm.out.stall); }
  assert.ok(maxStall < 0.3, `assist max stall ${maxStall}`);
});

test('landing: wheels touch softly, brakes stop it on the strip without nosing over', () => {
  const sim = makeSim({ hopper: 0, fuel: 100, wind: false });
  const { fm } = sim;
  const g = sim.env.ground(-300, 0);
  fm.reset(new Vector3(-360, g + 1.25 + 4, 0), Math.PI / 2, { speed: 31, engineOn: true });
  fm.throttle = 0;
  fm.flaps = fm.flapsCmd = 2 / 3;
  let touch = null;
  const events = [];
  for (let i = 0; i < 120 * 40; i++) {
    const a = sim.att();
    const o = fm.out;
    let pitch;
    if (!o.onGround) pitch = Math.max(-1, Math.min(1, ((-0.4 - o.agl * 0.15) - o.vs) * 0.6 + (0.1 - a.pitch) * 0.8));
    else pitch = 0.6;
    fm.brake = o.onGround && o.airspeed < 22 ? 1 : 0;
    sim.step(1, { pitch, roll: -a.bank * 2, yaw: Math.max(-1, Math.min(1, -(Math.PI / 2 - fm.heading()) * 3)) }, 'normal');
    events.push(...fm.events);
    if (!touch && o.onGround) touch = { x: fm.pos.x, vs: -o.vs };
    if (touch && o.groundSpeed < 0.3) break;
  }
  const stop = fm.pos.x - touch.x;
  const props = events.filter((e) => e.kind === 'ground' && (e.part === 'prop' || e.part === 'spinner'));
  const mainTouch = events.find((e) => e.kind === 'touch' && e.part !== 'tail');
  console.log(`  touchdown ${mainTouch ? mainTouch.speed.toFixed(2) : '?'} m/s, rollout ${stop.toFixed(0)} m`);
  assert.ok(touch, 'must touch down');
  assert.ok(mainTouch.speed < FLIGHT.hardLandingVs, 'soft touchdown');
  assert.ok(stop < 450, `rollout ${stop}`);
  assert.equal(props.length, 0, 'no prop strike under braking');
  assert.ok(fm.pos.x < 400, 'stopped on the strip');
});

test('fixed step: same trajectory at 30, 60 and 144 fps', () => {
  // Frames of different length feed an accumulator; physics always advances
  // in 1/120 s steps, so after the same number of steps the state is identical.
  const run = (fps) => {
    const sim = trimmed(300, 44, 0.8);
    const { fm } = sim;
    const assist = new Assist();
    let acc = 0, steps = 0;
    const h = FLIGHT.sim.dt;
    while (steps < 1200) {
      acc += 1 / fps;
      while (acc >= h && steps < 1200) {
        const cmd = { pitch: 0.1, roll: steps < 360 ? 0.4 : 0, yaw: 0 };
        assist.update(fm, cmd, 'normal', h);
        fm.step(h, sim.env);
        acc -= h; steps++;
      }
    }
    return fm.pos.clone();
  };
  const a = run(30), b = run(60), c = run(144);
  console.log(`  divergence 30↔144 fps after 10 s: ${a.distanceTo(c).toFixed(6)} m`);
  assert.ok(a.distanceTo(b) < 1e-6 && a.distanceTo(c) < 1e-6);
});

test('light wind moves the aircraft smoothly (no random jerks)', () => {
  const sim = makeSim({ hopper: 300, fuel: 160, wind: true });
  const { fm } = sim;
  // Low level over the soy talhão, where gusts and turbulence are strongest.
  fm.reset(new Vector3(200, sim.env.top(200, -280) + 1.25 + 6, -280), Math.PI / 2, { speed: 46, engineOn: true });
  fm.throttle = 0.75;
  holdSpeed(sim, 46, 5);
  let maxRate = 0, sumB = 0, n = 0;
  for (let i = 0; i < 120 * 30; i++) {
    sim.step(1, { pitch: 0, roll: 0, yaw: 0 }, 'normal');
    maxRate = Math.max(maxRate, Math.abs(fm.omega.z));
    sumB += Math.abs(sim.att().bank); n++;
  }
  console.log(`  max roll rate ${deg(maxRate).toFixed(1)}°/s, mean |bank| ${deg(sumB / n).toFixed(1)}°, drift ${fm.pos.z + 280 > 0 ? '+' : ''}${(fm.pos.z + 280).toFixed(1)} m`);
  assert.ok(maxRate > 0, 'wind must have some effect');
  assert.ok(deg(maxRate) < 12);
  assert.ok(deg(sumB / n) < 5);
});

test('taxi: tailwheel steers both ways', () => {
  for (const yaw of [1, -1]) {
    const sim = makeSim({ hopper: 300, fuel: 160, wind: false });
    const { fm } = sim;
    fm.settleOnGround(-352, -64, Math.PI / 2, sim.env);
    fm.engine = 'running'; fm.rpm = 700;
    const h0 = fm.heading();
    for (let i = 0; i < 120 * 6; i++) { fm.throttle = 0.35; sim.step(1, { pitch: 0.4, roll: 0, yaw }, 'normal'); }
    const d = deg(fm.heading() - h0);
    assert.ok(yaw > 0 ? d < -15 : d > 15, `yaw ${yaw} turned ${d}`);
  }
});

test('pivot: brake + full rudder turns the aircraft around on the spot', () => {
  const sim = makeSim({ hopper: 0, fuel: 80, wind: false });
  const { fm } = sim;
  fm.settleOnGround(-103, 0, Math.PI / 2, sim.env);
  fm.engine = 'running'; fm.rpm = 700;
  const p0 = fm.pos.clone();
  let turned = 0, prev = fm.heading(), t = 0;
  while (Math.abs(turned) < Math.PI && t < 30) {
    fm.throttle = 0.42; fm.brake = 1;
    sim.step(1, { pitch: 0.4, roll: 0, yaw: -1 }, 'normal');
    let d = fm.heading() - prev;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    turned += d; prev = fm.heading(); t += 1 / 120;
  }
  const moved = Math.hypot(fm.pos.x - p0.x, fm.pos.z - p0.z);
  console.log(`#   180° pivot in ${t.toFixed(1)} s, moved ${moved.toFixed(1)} m`);
  assert.ok(t < 25, `pivot took ${t.toFixed(1)} s`);
  assert.ok(moved < 8, `pivot drifted ${moved.toFixed(1)} m`);
});

void FlightModel; void createFlightEnv;

test('trim with the assist on moves the held flight path (and it stays trimmed)', () => {
  for (const [dir, mode] of [[1, 'normal'], [-1, 'normal'], [1, 'high'], [-1, 'high']]) {
    const sim = trimmed(300, 46, 0.75);
    const { fm } = sim;
    const fly = (s, trim) => { for (let i = 0; i < 120 * s; i++) sim.step(1, { pitch: 0, roll: 0, yaw: 0, trim }, mode); };
    fly(8, 0);
    const y0 = fm.pos.y;
    fly(2, dir); // two seconds on the trim key
    fly(8, 0);
    const vs = fm.vel.y, dy = fm.pos.y - y0;
    console.log(`  ${mode} trim ${dir > 0 ? 'up' : 'down'}: ${vs.toFixed(1)} m/s held, ${dy.toFixed(0)} m in 10 s`);
    assert.ok(dir * vs > 3, `${mode} ${dir}: vertical speed ${vs}`);
    assert.ok(dir * dy > 25, `${mode} ${dir}: height change ${dy}`);
  }
});
