// R44 with the power model (the game's default handling): one power lever,
// rotor and torque as one. Flown the way a player does — power keys only for
// up and down, the 'high' assist for the cyclic — so these check that the
// flight follows the power: hover power set by the weight, climb and sink in
// proportion to the power difference, no yaw from power changes, gentle
// lift-off and landing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { makeHeli, DT, pitchOf, bankOf } from './heliharness.mjs';
import { HeliAssist } from '../src/flight/heliAssist.js';
import { hoverPowerFrac } from '../src/flight/heliModel.js';
import { FLIGHT_R44 as A } from '../src/config.js';

const KT = 1.943844, FPM = 196.85;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function fly(fm, env, as, mode, seconds, cmdFn, each) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const c = typeof cmdFn === 'function' ? cmdFn(i * DT) : cmdFn;
    as.update(fm, c, mode, DT);
    fm.step(DT, env);
    if (each) each(i * DT);
  }
}
const heli = (o = {}) => makeHeli({ model: 'power', fuel: 80, ...o });

test('start-up: rotor up to speed in under 10 s, no creep on the skids', () => {
  const { fm, env } = heli();
  const h0 = fm.heading();
  fm.engine = 'cranking'; fm.crankTime = 0;
  let tFlight = null;
  for (let i = 0; i < 120 * 20; i++) { fm.step(DT, env); if (tFlight === null && fm.phase === 'flight') tFlight = i * DT; }
  assert.ok(tFlight !== null && tFlight < 10, `rotor at speed after ${tFlight}s`);
  assert.ok(fm.out.rotorPct > 100.5 && fm.out.rotorPct < 102, `rotor ${fm.out.rotorPct}`);
  assert.ok(fm.out.onGround && Math.abs(fm.heading() - h0) < 0.01);
});

test('hover power depends only on the weight (light ~55 %, MTOW ~70 %), less in ground effect', (t) => {
  const light = hoverPowerFrac(A, 870), heavy = hoverPowerFrac(A, A.mtow);
  assert.ok(light > 0.5 && light < 0.6, `light ${light}`);
  assert.ok(heavy > 0.66 && heavy < 0.74, `MTOW ${heavy}`);
  assert.ok(hoverPowerFrac(A, A.mtow, 0) < heavy - 0.05, 'ground cushion');
  // The simulation hovers at exactly that power.
  for (const hopper of [0, 250]) {
    const { fm, env } = heli({ engineOn: true, alt: 60, hopper, fuel: 60 });
    const as = new HeliAssist();
    const p = hoverPowerFrac(A, fm.mass);
    const y0 = fm.pos.y;
    fly(fm, env, as, 'high', 15, { pitch: 0, roll: 0, yaw: 0, lever: p });
    assert.ok(Math.abs(fm.pos.y - y0) < 1.5 && Math.abs(fm.vel.y) < 0.15, `${hopper} L: dy ${fm.pos.y - y0}`);
  }
  t.diagnostic(`hover ${(light * 100).toFixed(0)} % light, ${(heavy * 100).toFixed(0)} % at MTOW`);
});

test('climb and sink follow the power: more power, more climb, no yaw kick', (t) => {
  const rates = [];
  for (const dp of [-0.2, -0.1, 0.1, 0.2]) {
    const { fm, env } = heli({ engineOn: true, alt: 400 });
    const as = new HeliAssist();
    const h0 = fm.heading();
    const p = hoverPowerFrac(A, fm.mass) + dp;
    fly(fm, env, as, 'high', 12, { pitch: 0, roll: 0, yaw: 0, lever: p });
    rates.push(fm.vel.y);
    assert.ok(Math.sign(fm.vel.y) === Math.sign(dp) && Math.abs(fm.vel.y) > 1, `${dp}: ${fm.vel.y}`);
    assert.ok(Math.abs(wrap(fm.heading() - h0)) < 0.01, 'power changes do not swing the nose');
  }
  // Twice the difference, a clearly bigger rate (the extra damping of slow
  // vertical motion makes small power changes settle gently: not linear).
  for (const r of [rates[3] / rates[2], rates[0] / rates[1]]) assert.ok(r > 1.6 && r < 3.2, rates.join(' '));
  // Full power at the MTOW: about the published ~1,000 ft/min.
  const { fm, env } = heli({ engineOn: true, alt: 400, hopper: 250, fuel: 60 });
  fly(fm, env, new HeliAssist(), 'high', 15, { pitch: 0, roll: 0, yaw: 0, lever: 1 });
  const fpm = fm.vel.y * FPM;
  assert.ok(fpm > 700 && fpm < 1300, `MTOW full-power climb ${fpm.toFixed(0)} ft/min`);
  t.diagnostic(`±10 % → ${rates[2].toFixed(1)} / ${rates[1].toFixed(1)} m/s, ±20 % → ${rates[3].toFixed(1)} / ${rates[0].toFixed(1)} m/s; MTOW full power ${fpm.toFixed(0)} ft/min`);
});

test('cyclic: hands-off hover holds position', () => {
  const { fm, env } = heli({ engineOn: true, alt: 30 });
  const as = new HeliAssist();
  const p = hoverPowerFrac(A, fm.mass);
  fly(fm, env, as, 'high', 5, { pitch: 0, roll: 0, yaw: 0, lever: p });
  const p0 = fm.pos.clone();
  fly(fm, env, as, 'high', 20, { pitch: 0, roll: 0, yaw: 0, lever: p });
  assert.ok(Math.hypot(fm.pos.x - p0.x, fm.pos.z - p0.z) < 1.5, 'hover drift');
});

// A held tilt (the normal assist's attitude hold) at a given power: the
// speed and climb rate it settles at.
function cruise(tiltDeg, dp, secs = 60) {
  const { fm, env } = heli({ engineOn: true, alt: 600, hopper: 150 });
  const as = new HeliAssist();
  const lever = Math.min(1, hoverPowerFrac(A, fm.mass) + dp);
  fly(fm, env, as, 'normal', secs, () => { as.holdPitch = -tiltDeg / 57.3; as.pHeld = false; return { pitch: 0, roll: 0, yaw: 0, lever }; });
  return { kt: Math.hypot(fm.vel.x, fm.vel.z) * KT, vs: fm.vel.y };
}

test('speed follows the tilt and the power (thrust along the rotor axis), up to ~130 kt', (t) => {
  const at = [5, 10, 20, 30].map((d) => cruise(d, 0));
  // More tilt, more speed — smoothly, with no wall between hover and cruise.
  for (let i = 1; i < at.length; i++) assert.ok(at[i].kt > at[i - 1].kt + 8, at.map((c) => c.kt.toFixed(0)).join(' / '));
  assert.ok(at[1].kt > 30 && at[1].kt < 55, `10°: ${at[1].kt.toFixed(0)} kt`);
  // ~20°: cruise at about the hover power (translational lift), level.
  assert.ok(at[2].kt > 95 && at[2].kt < 120 && Math.abs(at[2].vs) < 1.5, `20°: ${at[2].kt.toFixed(0)} kt, ${at[2].vs.toFixed(1)} m/s`);
  // ~30° at the hover power sinks: the tilt takes lift away.
  assert.ok(at[3].vs < -1, `30°: ${at[3].vs.toFixed(1)} m/s`);
  // More power at the same tilt: faster (and climbing).
  const p10 = cruise(10, 0.2), p30 = cruise(30, 0.2);
  assert.ok(p10.kt > at[1].kt + 8 && p10.vs > at[1].vs + 1, `10° +20 %: ${p10.kt.toFixed(0)} kt`);
  assert.ok(p30.kt > at[3].kt && p30.vs > at[3].vs + 1, `30° +20 %: ${p30.kt.toFixed(0)} kt, ${p30.vs.toFixed(1)} m/s`);
  // Top speed with full power: about the Vne (130 kt).
  const top = cruise(30, 1);
  assert.ok(top.kt > 115 && top.kt < 140, `full power, 30°: ${top.kt.toFixed(0)} kt`);
  t.diagnostic(`hover power: 5° ${at[0].kt.toFixed(0)} kt, 10° ${at[1].kt.toFixed(0)}, 20° ${at[2].kt.toFixed(0)} (${at[2].vs.toFixed(1)} m/s), 30° ${at[3].kt.toFixed(0)} (${at[3].vs.toFixed(1)} m/s); +20 %: 10° ${p10.kt.toFixed(0)} kt, 30° ${p30.kt.toFixed(0)} kt (${p30.vs.toFixed(1)} m/s); top ${top.kt.toFixed(0)} kt`);
});

test('pedals turn in a hover; released, the heading is held', () => {
  const { fm, env } = heli({ engineOn: true, alt: 30 });
  const as = new HeliAssist();
  const p = hoverPowerFrac(A, fm.mass);
  fly(fm, env, as, 'high', 5, { pitch: 0, roll: 0, yaw: 0, lever: p });
  let maxRate = 0;
  fly(fm, env, as, 'high', 3, { pitch: 0, roll: 0, yaw: -1, lever: p }, () => { maxRate = Math.max(maxRate, fm.omega.y); });
  assert.ok(maxRate > 0.5, `yaw rate ${maxRate}`);
  fly(fm, env, as, 'high', 3, { pitch: 0, roll: 0, yaw: 0, lever: p });
  const h0 = fm.heading();
  fly(fm, env, as, 'high', 15, { pitch: 0, roll: 0, yaw: 0, lever: p });
  assert.ok(Math.abs(wrap(fm.heading() - h0)) < 0.03, 'heading held');
});

test('lift-off on power, hover, and a gentle landing with the power eased off', (t) => {
  const { fm, env } = heli({ hopper: 100 });
  fm.reset(new Vector3(0, 0, 0), 0); fm.settleOnGround(0, 0, 0, env);
  fm.engine = 'cranking'; fm.crankTime = 0;
  const as = new HeliAssist();
  fly(fm, env, as, 'high', 12, { pitch: 0, roll: 0, yaw: 0, lever: 0 });
  // Power up as a player holding Shift (0.55/s) until off the skids, then hold.
  let lever = 0;
  const hov = hoverPowerFrac(A, fm.mass);
  let tOff = null;
  fly(fm, env, as, 'high', 8, (s) => { if (fm.out.onGround || fm.out.agl < 2.5) lever = Math.min(1, lever + 0.55 * DT); else lever = hov; return { pitch: 0, roll: 0, yaw: 0, lever }; },
    (s) => { if (tOff === null && !fm.out.onGround) tOff = s; });
  assert.ok(!fm.out.onGround && fm.out.agl > 1.5, 'lifted off');
  const p0 = fm.pos.clone();
  fly(fm, env, as, 'high', 10, { pitch: 0, roll: 0, yaw: 0, lever: hov });
  const drift = Math.hypot(fm.pos.x - p0.x, fm.pos.z - p0.z);
  assert.ok(drift < 1.5 && Math.abs(fm.vel.y) < 0.3, `hover drift ${drift}`);
  // Ease the power below the hover in ground effect (a little power above
  // that only hovers lower: the ground cushion): it settles down and the
  // cushion (ground effect, plus the assist's) puts it on the skids softly.
  const events = [];
  let vTouch = null, tTouch = null;
  const watch = (s) => {
    for (const e of fm.events) if (e.kind === 'touch' || e.kind === 'ground') events.push(e);
    if (vTouch === null && fm.out.onGround) { vTouch = -fm.vel.y; tTouch = s; }
  };
  const hovIGE = hoverPowerFrac(A, fm.mass, 0);
  fly(fm, env, as, 'high', 20, { pitch: 0, roll: 0, yaw: 0, lever: hovIGE - 0.04 }, watch);
  assert.ok(vTouch !== null, 'down within 20 s');
  fly(fm, env, as, 'high', 4, { pitch: 0, roll: 0, yaw: 0, lever: 0 }, watch);
  assert.ok(fm.out.onGround && fm.out.wheelsOnGround === 4, 'on both skids');
  assert.ok(vTouch < 1.0, `touchdown ${vTouch} m/s`);
  assert.ok(events.every((e) => e.kind === 'touch' && e.speed < A.hardLandingVs), JSON.stringify(events));
  assert.ok(Math.abs(pitchOf(fm)) < 0.08, 'level');
  t.diagnostic(`off the skids ${tOff?.toFixed(1)} s after raising power; hover drift ${drift.toFixed(2)} m; down ${tTouch.toFixed(1)} s after easing the power, at ${vTouch.toFixed(2)} m/s`);
});

// Keyboard stick as the game shapes it (full travel in ~0.45 s, back to
// centre in ~0.3 s), with the 'high' assist.
function keyFlight(fm, env, as) {
  const s = { lon: 0, lat: 0 };
  const ap = (c, t, r) => c + Math.max(-r * DT, Math.min(r * DT, t - c));
  const lever = hoverPowerFrac(A, fm.mass);
  return (sec, tp, tr, each) => fly(fm, env, as, 'high', sec, () => {
    s.lon = ap(s.lon, tp, tp === 0 ? 3.5 : 2.2); s.lat = ap(s.lat, tr, tr === 0 ? 3.5 : 2.2);
    return { pitch: s.lon, roll: s.lat, yaw: 0, lever };
  }, each);
}

test('cyclic keys: the tilt grows while the key is held (to 45°), levels on release with no pitch-up', (t) => {
  const { fm, env } = heli({ engineOn: true, alt: 60, hopper: 150 });
  const keys = keyFlight(fm, env, new HeliAssist());
  const deg = () => pitchOf(fm) * 57.3;
  keys(2, 0, 0);
  // Forward key: past the old 18° within 1.6 s, still growing, never past 47°.
  const at = [];
  let minP = 0;
  keys(4, -1, 0, (s) => { minP = Math.min(minP, deg()); for (const k of [1, 2, 3]) if (at[k] === undefined && s >= k) at[k] = deg(); });
  assert.ok(at[1] < -6 && at[1] > -20, `1 s: ${at[1].toFixed(1)}°`);
  assert.ok(at[2] < -20 && at[3] < at[2] - 8, `2 s: ${at[2].toFixed(1)}°, 3 s: ${at[3].toFixed(1)}°`);
  assert.ok(minP < -42 && minP > -47, `limit ${minP.toFixed(1)}°`);
  // Released: back to level within ~4 s, never more than ~3° nose up.
  let maxP = -99, tLevel = null;
  keys(8, 0, 0, (s) => { maxP = Math.max(maxP, deg()); if (tLevel === null && deg() > -2) tLevel = s; });
  assert.ok(tLevel !== null && tLevel < 4, `level after ${tLevel} s`);
  assert.ok(maxP < 3, `release: ${maxP.toFixed(1)}° nose up`);
  // A short press is a small tilt: the nose answers at once.
  let tTen = null;
  keys(1.2, -1, 0, (s) => { if (tTen === null && deg() < -8) tTen = s; });
  assert.ok(tTen !== null && tTen < 1.1, `-8° after ${tTen} s`);
  // Sideways keys: the bank grows the same way and does not move the nose.
  keys(20, 0, 0);
  const p0 = deg();
  let maxAbsP = 0, maxBank = 0, b1 = null;
  keys(1, 0, 1, (s) => { maxAbsP = Math.max(maxAbsP, Math.abs(deg() - p0)); maxBank = Math.max(maxBank, bankOf(fm) * 57.3); });
  b1 = bankOf(fm) * 57.3;
  keys(3, 0, 0, () => { maxAbsP = Math.max(maxAbsP, Math.abs(deg() - p0)); maxBank = Math.max(maxBank, bankOf(fm) * 57.3); });
  assert.ok(b1 > 10 && b1 < 30, `bank after 1 s: ${b1.toFixed(1)}°`);
  assert.ok(maxBank < b1 + 9, `bank runs on to ${maxBank.toFixed(1)}° after release at ${b1.toFixed(1)}°`);
  assert.ok(Math.abs(bankOf(fm) * 57.3) < 3 && maxAbsP < 4, `levels; pitch moved ${maxAbsP.toFixed(1)}°`);
  t.diagnostic(`forward key: ${at[1].toFixed(0)}° at 1 s, ${at[2].toFixed(0)}° at 2 s, ${at[3].toFixed(0)}° at 3 s, limit ${minP.toFixed(1)}°; level ${tLevel.toFixed(1)} s after release (max ${maxP.toFixed(1)}° up); roll ${b1.toFixed(0)}° after 1 s, peak ${maxBank.toFixed(0)}°`);
});

test('released stick: levels out and glides on, slowing down gradually (no braking flare)', (t) => {
  const { fm, env } = heli({ engineOn: true, alt: 60, hopper: 150 });
  const keys = keyFlight(fm, env, new HeliAssist());
  const speed = () => Math.hypot(fm.vel.x, fm.vel.z);
  keys(1, 0, 0);
  keys(3.5, -1, 0);
  // Released: the speed still builds while the nose comes up, then decays.
  let tLevel = null, maxUp = -99, vMax = 0;
  keys(4, 0, 0, (s) => { const p = pitchOf(fm) * 57.3; maxUp = Math.max(maxUp, p); vMax = Math.max(vMax, speed()); if (tLevel === null && Math.abs(p) < 2) tLevel = s; });
  keys(6, 0, 0);
  const v10 = speed();
  assert.ok(tLevel !== null && tLevel < 4, `level after ${tLevel} s`);
  assert.ok(maxUp < 3, `no flare: max ${maxUp.toFixed(1)}° nose up`);
  assert.ok(v10 < vMax * 0.75 && v10 > vMax * 0.3, `glide: ${vMax.toFixed(1)} -> ${v10.toFixed(1)} m/s in 10 s`);
  // ...and ends up stopped over the ground, still without a flare.
  keys(40, 0, 0, () => { maxUp = Math.max(maxUp, pitchOf(fm) * 57.3); });
  assert.ok(speed() < 0.4, `stopped: ${speed().toFixed(2)} m/s after 50 s`);
  assert.ok(maxUp < 3, `no flare while stopping: max ${maxUp.toFixed(1)}° nose up`);
  t.diagnostic(`level ${tLevel.toFixed(2)} s after release, ${(vMax * KT).toFixed(0)} -> ${(v10 * KT).toFixed(0)} kt in 10 s, stopped within 50 s`);
});

test('released in a breeze: the hover holds over the ground (no drifting off with the wind)', (t) => {
  for (const wind of [new Vector3(2.5, 0, 0), new Vector3(-1.5, 0, 2.5)]) {
    const { fm, env } = heli({ engineOn: true, alt: 30, hopper: 150 });
    env.wind.copy(wind);
    const as = new HeliAssist();
    const p = hoverPowerFrac(A, fm.mass);
    fly(fm, env, as, 'high', 15, { pitch: 0, roll: 0, yaw: 0, lever: p });
    const x0 = fm.pos.x, z0 = fm.pos.z;
    let tilt = 0;
    fly(fm, env, as, 'high', 20, { pitch: 0, roll: 0, yaw: 0, lever: p }, () => { tilt = Math.max(tilt, Math.abs(pitchOf(fm)), Math.abs(bankOf(fm))); });
    const drift = Math.hypot(fm.pos.x - x0, fm.pos.z - z0);
    assert.ok(drift < 2, `wind ${wind.x},${wind.z}: drift ${drift.toFixed(2)} m in 20 s`);
    assert.ok(tilt * 57.3 < 5, `gentle lean: ${(tilt * 57.3).toFixed(1)}°`);
    t.diagnostic(`wind ${wind.length().toFixed(1)} m/s: drift ${drift.toFixed(2)} m in 20 s, lean ≤ ${(tilt * 57.3).toFixed(1)}°`);
  }
});

test('power answers at once: a 2.5 m/s sink is stopped within ~1.3 s on the power keys, then it holds', (t) => {
  const { fm, env } = heli({ engineOn: true, alt: 60, hopper: 150 });
  const as = new HeliAssist();
  const hov = hoverPowerFrac(A, fm.mass);
  let lever = hov;
  const step = (l) => { as.update(fm, { pitch: 0, roll: 0, yaw: 0, lever: l }, 'high', DT); fm.step(DT, env); };
  for (let i = 0; i < 3 / DT; i++) step(lever);
  lever = hov - 0.12;
  for (let i = 0; i < 20 / DT && fm.vel.y > -2.5; i++) step(lever);
  const y0 = fm.pos.y;
  let tStop = null, low = 0, i = 0;
  // The power key held (0.9/s, as the game moves the lever) to hover + 6 %, back to the hover figure once the sink stops.
  for (; i < 10 / DT; i++) {
    if (tStop === null) { lever = Math.min(hov + 0.06, lever + 0.9 * DT); if (fm.vel.y >= 0) tStop = i * DT; } else lever = Math.max(hov, lever - 0.9 * DT);
    step(lever); low = Math.min(low, fm.pos.y - y0);
  }
  assert.ok(tStop !== null && tStop < 1.3, `stopped after ${tStop} s`);
  assert.ok(-low < 1.3, `lost ${-low} m`);
  assert.ok(Math.abs(fm.vel.y) < 0.15, `holds: ${fm.vel.y} m/s`);
  t.diagnostic(`sink stopped after ${tStop.toFixed(2)} s, ${(-low).toFixed(1)} m lost, then holds (${fm.vel.y.toFixed(2)} m/s)`);
});
