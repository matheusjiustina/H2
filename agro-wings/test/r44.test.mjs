// Robinson R44 (helicopter model + control laws) in Node: start-up, hover in
// and out of ground effect, speed, climb, autorotation, yaw, translations,
// lift-off and landing. Figures are checked against the published R44
// Raven II data where it exists (cruise ~109–117 kt, max climb ~1,000 ft/min,
// 245 hp take-off / 205 hp continuous, rotor 101–102 % governed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { makeHeli, DT, pitchOf } from './heliharness.mjs';
import { HeliAssist } from '../src/flight/heliAssist.js';
import { FLIGHT_R44 as A } from '../src/config.js';
import { hoverPower } from '../src/flight/heliModel.js';

const HP = 745.7, KT = 1.943844, FPM = 196.85;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Fly with the control laws: cmd = { pitch (+aft), roll (+right), yaw (+right), lever, leverRate }.
function fly(fm, env, as, mode, seconds, cmdFn, each) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const c = typeof cmdFn === 'function' ? cmdFn(i * DT) : cmdFn;
    as.update(fm, c, mode, DT);
    fm.step(DT, env);
    if (each) each(i * DT);
  }
}
const speedKt = (fm) => Math.hypot(fm.vel.x, fm.vel.z) * KT;
const avgPower = (fm, env, as, mode, cmd, s) => { let p = 0, n = 0; fly(fm, env, as, mode, s, cmd, () => { p += fm.power; n++; }); return p / n / HP; };

test('start-up: crank, clutch, warm-up, governor holds 101–102 % with the skids still', () => {
  const { fm, env } = makeHeli({ fuel: 80 });
  const h0 = fm.heading();
  fm.engine = 'cranking'; fm.crankTime = 0;
  let tGov = null;
  for (let i = 0; i < 120 * 60; i++) { fm.step(DT, env); if (tGov === null && fm.out.rotorPct > 100.5) tGov = i * DT; }
  assert.ok(tGov !== null && tGov < 45, `governed at ${tGov}s`);
  assert.ok(fm.out.rotorPct > 100.8 && fm.out.rotorPct < 102.2, `rotor ${fm.out.rotorPct}`);
  assert.ok(Math.abs(fm.heading() - h0) < 0.02, 'no creep on the skids');
  assert.ok(fm.out.onGround);
});

test('hover power: OGE at MTOW within take-off power, IGE needs less', (t) => {
  const as = new HeliAssist();
  const run = (alt, coll) => {
    const { fm, env } = makeHeli({ engineOn: true, alt, fuel: 140, hopper: 250 });
    fm.hopper = (A.mtow - (A.emptyMass + A.agKitMass + A.pilotMass + fm.fuel * A.fuelDensity)) / A.liquidDensity; fm.updateMass();
    if (coll) fm.collective = coll; // start trimmed so a low hover does not sink onto the skids
    as.reset();
    fly(fm, env, as, 'high', 40, { pitch: 0, roll: 0, yaw: 0, lever: 0.5, leverRate: 0 });
    const hp = avgPower(fm, env, as, 'high', { pitch: 0, roll: 0, yaw: 0, lever: 0.5, leverRate: 0 }, 5);
    return { hp, mass: fm.mass, drift: speedKt(fm), coll: fm.collective, skid: fm.pos.y + A.skids[0][1], ground: fm.out.onGround };
  };
  // IGE at a 2 ft skid height, the POH's in-ground-effect reference.
  const oge = run(60), ige = run(-A.skids[0][1] + 0.61, oge.coll * 0.97);
  assert.ok(Math.abs(oge.mass - A.mtow) < 1);
  assert.ok(!ige.ground && Math.abs(ige.skid - 0.61) < 0.15, `IGE hover held at ${ige.skid.toFixed(2)} m skid height`);
  assert.ok(oge.hp < 245 && oge.hp > 170, `OGE ${oge.hp.toFixed(0)} hp`);
  assert.ok(ige.hp < oge.hp * 0.96, `IGE ${ige.hp.toFixed(0)} vs OGE ${oge.hp.toFixed(0)} hp`);
  t.diagnostic(`hover at ${oge.mass.toFixed(0)} kg: OGE ${oge.hp.toFixed(0)} hp, IGE (skids 2 ft) ${ige.hp.toFixed(0)} hp`);
  // The load sheet's trimmed estimate agrees with the flown hover.
  const eO = hoverPower(A, oge.mass) / HP, eI = hoverPower(A, ige.mass, ige.skid) / HP;
  assert.ok(Math.abs(eO - oge.hp) / oge.hp < 0.05, `load-sheet OGE ${eO.toFixed(0)} vs flown ${oge.hp.toFixed(0)} hp`);
  assert.ok(Math.abs(eI - ige.hp) / ige.hp < 0.05, `load-sheet IGE ${eI.toFixed(0)} vs flown ${ige.hp.toFixed(0)} hp`);
  t.diagnostic(`load-sheet estimate: OGE ${eO.toFixed(0)} hp, IGE ${eI.toFixed(0)} hp`);
});

test('level speed at 205 hp continuous is 100–125 kt (published cruise 109–117 kt)', (t) => {
  // Push forward until the power reaches MCP, read the speed.
  const { fm, env } = makeHeli({ engineOn: true, alt: 150, fuel: 100, hopper: 0, speed: 50 });
  const as = new HeliAssist();
  let lever = 0.45, pitchCmd = 0;
  fly(fm, env, as, 'high', 90, (t) => {
    const p = fm.power / HP;
    pitchCmd = clamp(pitchCmd + (p < 205 ? -0.0004 : 0.0006), -1, 0.2);
    return { pitch: pitchCmd, roll: 0, yaw: 0, lever, leverRate: 0 };
  });
  const kt = speedKt(fm), hp = fm.power / HP;
  assert.ok(kt > 100 && kt < 125, `${kt.toFixed(0)} kt at ${hp.toFixed(0)} hp`);
  assert.ok(Math.abs(fm.pos.y - 150) < 15, 'height held');
  t.diagnostic(`level at ${hp.toFixed(0)} hp: ${kt.toFixed(0)} kt (${fm.mass.toFixed(0)} kg)`);
});

test('climb at MTOW with continuous power: 700–1,500 ft/min (published max ~1,000)', (t) => {
  const { fm, env } = makeHeli({ engineOn: true, alt: 150, fuel: 140, hopper: 0, speed: 28 });
  fm.hopper = (A.mtow - (A.emptyMass + A.agKitMass + A.pilotMass + fm.fuel * A.fuelDensity)); fm.updateMass();
  const as = new HeliAssist();
  fly(fm, env, as, 'normal', 25, { pitch: 0, roll: 0, yaw: 0, lever: 0.5 });
  // Raise the lever until 205 hp, hold 55 kt with pitch.
  let lever = 0.45, pc = 0;
  let vs = 0, n = 0;
  fly(fm, env, as, 'normal', 50, () => {
    lever = clamp(lever + (fm.power / HP < 205 ? 0.0006 : -0.0006), 0, 1);
    pc = clamp(pc + (speedKt(fm) > 55 ? 0.0003 : -0.0003), -0.6, 0.6);
    return { pitch: pc, roll: 0, yaw: 0, lever };
  }, (t) => { if (t > 30) { vs += fm.vel.y; n++; } });
  const fpm = (vs / n) * FPM;
  assert.ok(fpm > 700 && fpm < 1500, `${fpm.toFixed(0)} ft/min`);
  t.diagnostic(`climb at ${fm.mass.toFixed(0)} kg, 205 hp, 55 kt: ${fpm.toFixed(0)} ft/min`);
});

test('autorotation: engine cut at 70 kt, collective down — rotor stays in the green, steady descent', (t) => {
  const { fm, env } = makeHeli({ engineOn: true, alt: 900, fuel: 100, speed: 36 });
  const as = new HeliAssist();
  fly(fm, env, as, 'normal', 15, { pitch: 0, roll: 0, yaw: 0, lever: 0.42 });
  fm.engine = 'off';
  let lever = 0.42;
  let minR = 200, maxR = 0, vs = 0, n = 0;
  fly(fm, env, as, 'normal', 40, (t) => {
    lever = Math.max(0.05, lever - 0.6 * DT); // lower the collective within a second
    return { pitch: speedKt(fm) > 65 ? 0.08 : -0.08, roll: 0, yaw: 0, lever };
  }, (t) => { if (t > 8) { minR = Math.min(minR, fm.out.rotorPct); maxR = Math.max(maxR, fm.out.rotorPct); vs += fm.vel.y; n++; } });
  const fpm = -(vs / n) * FPM;
  assert.ok(minR > 90 && maxR < 110, `rotor ${minR.toFixed(0)}–${maxR.toFixed(0)} %`);
  assert.ok(fpm > 1000 && fpm < 2600, `descent ${fpm.toFixed(0)} ft/min`);
  t.diagnostic(`autorotation: rotor ${minR.toFixed(0)}–${maxR.toFixed(0)} %, ${fpm.toFixed(0)} ft/min`);
});

test('over-pitching at MTOW droops the rotor below 97 % (low-rpm horn)', () => {
  const { fm, env } = makeHeli({ engineOn: true, alt: 60, fuel: 140, hopper: 0 });
  fm.hopper = (A.mtow - (A.emptyMass + A.agKitMass + A.pilotMass + fm.fuel * A.fuelDensity)); fm.updateMass();
  const as = new HeliAssist();
  fly(fm, env, as, 'normal', 10, { pitch: 0, roll: 0, yaw: 0, lever: 0.56 });
  let low = 0;
  fly(fm, env, as, 'normal', 6, { pitch: 0, roll: 0, yaw: 0, lever: 1 }, () => { low = Math.max(low, fm.out.lowRotor); });
  assert.equal(low, 1);
  assert.ok(fm.out.rotorPct < 97, `rotor ${fm.out.rotorPct.toFixed(1)} %`);
});

test('yaw: pedals turn the aircraft in a hover; released, heading is held', (t) => {
  const { fm, env } = makeHeli({ engineOn: true, alt: 30, fuel: 80 });
  const as = new HeliAssist();
  const base = { pitch: 0, roll: 0, lever: 0.47, leverRate: 0 };
  fly(fm, env, as, 'high', 12, { ...base, yaw: 0 });
  const h0 = fm.heading();
  fly(fm, env, as, 'high', 20, { ...base, yaw: 0 });
  const drift = Math.abs(Math.atan2(Math.sin(fm.heading() - h0), Math.cos(fm.heading() - h0)));
  assert.ok(drift < 0.05, `heading drift ${(drift * 57.3).toFixed(1)}°`);
  let maxRate = 0;
  fly(fm, env, as, 'high', 3, { ...base, yaw: -1 }, () => { maxRate = Math.max(maxRate, fm.omega.y); }); // left pedal: nose left
  assert.ok(maxRate > 0.5, `yaw rate ${(maxRate * 57.3).toFixed(0)}°/s`);
  // Raw (no assist): full right pedal swings the nose right.
  const r = makeHeli({ engineOn: true, alt: 30, fuel: 80 });
  const raw = new HeliAssist();
  let minRate = 0;
  fly(r.fm, r.env, raw, 'off', 2, { pitch: 0, roll: 0, yaw: 1, lever: 0.47 }, () => { minRate = Math.min(minRate, r.fm.omega.y); });
  assert.ok(minRate < -0.4, `raw right pedal ${(minRate * 57.3).toFixed(0)}°/s`);
  t.diagnostic(`heading drift ${(drift * 57.3).toFixed(2)}° in 20 s; pedal yaw ${(maxRate * 57.3).toFixed(0)}°/s (assist), ${(-minRate * 57.3).toFixed(0)}°/s raw after 2 s`);
});

test('translations: forward, backward, sideways from a hover (normal assist)', () => {
  const dirs = [
    ['forward', { pitch: -0.5, roll: 0 }, (f, l) => f > 4],
    ['backward', { pitch: 0.4, roll: 0 }, (f, l) => f < -2.5],
    ['right', { pitch: 0, roll: 0.5 }, (f, l) => l < -2.5],
    ['left', { pitch: 0, roll: -0.5 }, (f, l) => l > 2.5],
  ];
  for (const [name, stick, ok] of dirs) {
    const { fm, env } = makeHeli({ engineOn: true, alt: 20, fuel: 80 });
    const as = new HeliAssist();
    fly(fm, env, as, 'high', 10, { pitch: 0, roll: 0, yaw: 0, lever: 0.47, leverRate: 0 });
    fly(fm, env, as, 'normal', 4, { ...stick, yaw: 0, lever: fm.collective });
    const h = fm.heading();
    const f = fm.vel.x * Math.sin(h) + fm.vel.z * Math.cos(h), l = fm.vel.x * Math.cos(h) - fm.vel.z * Math.sin(h);
    assert.ok(ok(f, l), `${name}: forward ${f.toFixed(1)} m/s, left ${l.toFixed(1)} m/s`);
  }
});

test('vertical lift-off, hover hold, and a gentle landing on the skids', (t) => {
  const { fm, env } = makeHeli({ fuel: 80, hopper: 100 });
  fm.reset(new Vector3(0, 0, 0), 0); fm.settleOnGround(0, 0, 0, env);
  // Spin up (start sequence) on the ground.
  fm.engine = 'cranking'; fm.crankTime = 0;
  const as = new HeliAssist();
  fly(fm, env, as, 'high', 45, { pitch: 0, roll: 0, yaw: 0, lever: 0 });
  assert.ok(fm.out.rotorPct > 100.5);
  // Raise the lever to lift off, climb to ~3 m, hold.
  let lever = 0;
  const touches = [];
  fly(fm, env, as, 'normal', 12, () => { lever = Math.min(0.55, lever + 0.12 * DT); return { pitch: 0, roll: 0, yaw: 0, lever }; });
  assert.ok(!fm.out.onGround, 'lifted off');
  fly(fm, env, as, 'high', 20, { pitch: 0, roll: 0, yaw: 0, lever, leverRate: 0 });
  const p0 = fm.pos.clone();
  fly(fm, env, as, 'high', 20, { pitch: 0, roll: 0, yaw: 0, lever, leverRate: 0 });
  const drift = Math.hypot(fm.pos.x - p0.x, fm.pos.z - p0.z);
  assert.ok(drift < 2.5, `hover drift ${drift.toFixed(2)} m`);
  // Descend at ~0.4 m/s to touchdown (lever-rate command), then lower the lever.
  fly(fm, env, as, 'high', 30, (t) => ({ pitch: 0, roll: 0, yaw: 0, lever, leverRate: fm.out.onGround ? -1 : -0.16 }), () => {
    for (const e of fm.events) if (e.kind === 'touch' || e.kind === 'ground') touches.push(e);
  });
  fly(fm, env, as, 'normal', 8, { pitch: 0, roll: 0, yaw: 0, lever: 0 });
  assert.ok(fm.out.onGround && fm.out.wheelsOnGround === 4, 'on both skids');
  assert.ok(touches.every((e) => e.kind === 'touch' && e.speed < A.hardLandingVs), JSON.stringify(touches));
  assert.ok(Math.abs(pitchOf(fm)) < 0.08, 'level on the skids');
  t.diagnostic(`hover drift ${drift.toFixed(2)} m in 20 s; touchdown ${touches.map((e) => e.speed.toFixed(2)).join(', ')} m/s`);
});
