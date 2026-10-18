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

test('climb and sink follow the power: rate in proportion to the difference, no yaw kick', (t) => {
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
  // Twice the difference, about twice the rate (linear within 20 %).
  assert.ok(Math.abs(rates[3] / rates[2] - 2) < 0.4 && Math.abs(rates[0] / rates[1] - 2) < 0.4, rates.join(' '));
  // Full power at the MTOW: about the published ~1,000 ft/min.
  const { fm, env } = heli({ engineOn: true, alt: 400, hopper: 250, fuel: 60 });
  fly(fm, env, new HeliAssist(), 'high', 15, { pitch: 0, roll: 0, yaw: 0, lever: 1 });
  const fpm = fm.vel.y * FPM;
  assert.ok(fpm > 700 && fpm < 1300, `MTOW full-power climb ${fpm.toFixed(0)} ft/min`);
  t.diagnostic(`±10 % → ${rates[2].toFixed(1)} / ${rates[1].toFixed(1)} m/s, ±20 % → ${rates[3].toFixed(1)} / ${rates[0].toFixed(1)} m/s; MTOW full power ${fpm.toFixed(0)} ft/min`);
});

test('cyclic: hands-off hover holds position; forward flight reaches ~100–120 kt', () => {
  const { fm, env } = heli({ engineOn: true, alt: 30 });
  const as = new HeliAssist();
  const p = hoverPowerFrac(A, fm.mass);
  fly(fm, env, as, 'high', 5, { pitch: 0, roll: 0, yaw: 0, lever: p });
  const p0 = fm.pos.clone();
  fly(fm, env, as, 'high', 20, { pitch: 0, roll: 0, yaw: 0, lever: p });
  assert.ok(Math.hypot(fm.pos.x - p0.x, fm.pos.z - p0.z) < 1.5, 'hover drift');
  fly(fm, env, as, 'high', 40, { pitch: -1, roll: 0, yaw: 0, lever: Math.min(1, p + 0.1) });
  const kt = Math.hypot(fm.vel.x, fm.vel.z) * KT;
  assert.ok(kt > 95 && kt < 125, `${kt.toFixed(0)} kt`);
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

test('cyclic keys: the nose goes where the stick puts it — no overshoot, no pitch-up on release', (t) => {
  const { fm, env } = heli({ engineOn: true, alt: 40, hopper: 150 });
  const keys = keyFlight(fm, env, new HeliAssist());
  const deg = () => pitchOf(fm) * 57.3;
  keys(2, 0, 0);
  // Forward key: about -18° within 1.5 s, never past -20°.
  let minP = 0, t18 = null;
  keys(4, -1, 0, (s) => { minP = Math.min(minP, deg()); if (t18 === null && deg() < -16) t18 = s; });
  assert.ok(t18 !== null && t18 < 1.5, `-16° after ${t18} s`);
  assert.ok(minP > -20.5, `forward overshoot ${minP.toFixed(1)}°`);
  // Released below ~55 kt: a calm flare to stop, never more than ~8° nose up.
  let maxP = -99;
  keys(6, 0, 0, () => { maxP = Math.max(maxP, deg()); });
  assert.ok(maxP < 8.5, `release flare ${maxP.toFixed(1)}° nose up`);
  // Forward again during the flare: the nose answers at once.
  let tBack = null;
  keys(3, -1, 0, (s) => { if (tBack === null && deg() < -16) tBack = s; });
  assert.ok(tBack !== null && tBack < 1.6, `forward again: -16° after ${tBack} s`);
  // Sideways keys do not move the nose (from a settled hover).
  keys(20, 0, 0);
  const p0 = deg();
  let maxAbsP = 0, maxBank = 0;
  keys(3, 0, 1, () => { maxAbsP = Math.max(maxAbsP, Math.abs(deg() - p0)); maxBank = Math.max(maxBank, bankOf(fm) * 57.3); });
  assert.ok(maxAbsP < 4 && maxBank > 22 && maxBank < 30, `roll: pitch ${maxAbsP.toFixed(1)}°, bank ${maxBank.toFixed(1)}°`);
  t.diagnostic(`-16° in ${t18.toFixed(2)} s (min ${minP.toFixed(1)}°), flare max ${maxP.toFixed(1)}°, forward again in ${tBack.toFixed(2)} s, roll ${maxBank.toFixed(1)}° with pitch ≤ ${maxAbsP.toFixed(1)}°`);
});
