// Bell 206B-3 JetRanger III (FLIGHT_B206) on the shared helicopter model:
// its own figures give its own behaviour — heavier and slower to answer
// than the R44, the turboshaft start (N1, TOT, torque), the Simplex 4900
// load. Flown the way the game does (power model, 'high' assist) unless the
// test says otherwise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHeli, DT, pitchOf } from './heliharness.mjs';
import { HeliAssist } from '../src/flight/heliAssist.js';
import { hoverPowerFrac, hoverPower } from '../src/flight/heliModel.js';
import { FLIGHT_B206 as A, FLIGHT_R44 } from '../src/config.js';

const KT = 1.943844, FPM = 196.85;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const heli = (o = {}) => makeHeli({ model: 'power', fuel: 150, A, ...o });
function fly(fm, env, as, mode, seconds, cmd, each) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    as.update(fm, typeof cmd === 'function' ? cmd(i * DT) : cmd, mode, DT);
    fm.step(DT, env);
    each?.(i * DT);
  }
}

test('mass: empty + Simplex 4900 kit + pilot + fuel + tank; the full 530 L tank needs the fuel cut', (t) => {
  const { fm } = heli({ fuel: 0, hopper: 0 });
  assert.equal(fm.mass, A.emptyMass + A.agKitMass + A.pilotMass);
  const { fm: f2 } = heli({ fuel: 120, hopper: 530 });
  assert.ok(f2.mass > A.mtow, `full tank + 120 L fuel ${f2.mass.toFixed(0)} kg > MTOW`);
  // What the load sheet allows with 120 L of fuel.
  const room = A.mtow - (A.emptyMass + A.agKitMass + A.pilotMass + 120 * A.fuelDensity);
  assert.ok(room > 350 && room < 450, `${room} L of liquid at the MTOW`);
  t.diagnostic(`at the MTOW with 120 L of fuel: ${room.toFixed(0)} L in the tank`);
});

test('hover power: heavier than the R44 per unit of power (~82 % at the MTOW out of ground effect)', (t) => {
  const heavy = hoverPowerFrac(A, A.mtow), light = hoverPowerFrac(A, 1060);
  assert.ok(heavy > 0.78 && heavy < 0.86, `MTOW ${heavy}`);
  assert.ok(heavy > hoverPowerFrac(FLIGHT_R44, FLIGHT_R44.mtow) + 0.06, 'less margin than the R44');
  assert.ok(light > 0.55 && light < 0.65, `light ${light}`);
  // The detailed rotor model hovers the MTOW within the 317 shp take-off
  // rating out of ground effect, and within the 270 shp continuous rating
  // in ground effect.
  const pOGE = hoverPower(A, A.mtow), pIGE = hoverPower(A, A.mtow, 1);
  assert.ok(pOGE < A.engine.ratedKW * 1000 && pIGE < A.engine.mcpKW * 1000, `OGE ${(pOGE / 745.7).toFixed(0)} shp, IGE ${(pIGE / 745.7).toFixed(0)} shp`);
  for (const hopper of [0, 380]) {
    const { fm, env } = heli({ engineOn: true, alt: 60, hopper, fuel: 120 });
    const p = hoverPowerFrac(A, fm.mass), y0 = fm.pos.y;
    fly(fm, env, new HeliAssist(), 'high', 15, { pitch: 0, roll: 0, yaw: 0, lever: p });
    assert.ok(Math.abs(fm.pos.y - y0) < 1.5 && Math.abs(fm.vel.y) < 0.15, `${hopper} L: dy ${fm.pos.y - y0}`);
  }
  t.diagnostic(`hover ${(light * 100).toFixed(0)} % light, ${(heavy * 100).toFixed(0)} % at MTOW; rotor model OGE ${(pOGE / 745.7).toFixed(0)} shp, IGE ${(pIGE / 745.7).toFixed(0)} shp`);
});

test('full power at the MTOW climbs about 1,000 ft/min; no yaw kick from the power', (t) => {
  const { fm, env } = heli({ engineOn: true, alt: 400, hopper: 380, fuel: 120 });
  const h0 = fm.heading();
  fly(fm, env, new HeliAssist(), 'high', 15, { pitch: 0, roll: 0, yaw: 0, lever: 1 });
  const fpm = fm.vel.y * FPM;
  assert.ok(fpm > 750 && fpm < 1350, `${fpm.toFixed(0)} ft/min`);
  assert.ok(Math.abs(wrap(fm.heading() - h0)) < 0.01);
  t.diagnostic(`MTOW full-power climb ${fpm.toFixed(0)} ft/min`);
});

test('power answers later than the R44 (turbine), the nose turns slower on the pedals', (t) => {
  const rise = (Ax) => {
    const { fm, env } = makeHeli({ model: 'power', fuel: 100, A: Ax, engineOn: true, alt: 100 });
    const as = new HeliAssist();
    const p = hoverPowerFrac(Ax, fm.mass) + 0.15;
    let tHalf = null;
    fly(fm, env, as, 'high', 3, { pitch: 0, roll: 0, yaw: 0, lever: p }, (s) => { if (tHalf === null && fm.vel.y > 1) tHalf = s; });
    return tHalf;
  };
  const turn = (Ax) => {
    const { fm, env } = makeHeli({ model: 'power', fuel: 100, A: Ax, engineOn: true, alt: 30 });
    const h0 = fm.heading();
    fly(fm, env, new HeliAssist(), 'high', 1.5, { pitch: 0, roll: 0, yaw: 1, lever: hoverPowerFrac(Ax, fm.mass) });
    return Math.abs(wrap(fm.heading() - h0));
  };
  const b = rise(A), r = rise(FLIGHT_R44);
  assert.ok(b > r, `1 m/s climb after ${b}s (R44 ${r}s)`);
  const yb = turn(A), yr = turn(FLIGHT_R44);
  assert.ok(yb < yr && yb > 0.2, `heading change in 1.5 s ${yb} vs R44 ${yr}`);
  t.diagnostic(`1 m/s climb after ${b.toFixed(2)} s (R44 ${r.toFixed(2)} s); 1.5 s of pedal ${(yb * 57.3).toFixed(0)}° (R44 ${(yr * 57.3).toFixed(0)}°)`);
});

// A held tilt (the normal assist's attitude hold) at a given power, as in
// r44power.test.mjs.
function cruise(Ax, tiltDeg, dp, secs = 60) {
  const { fm, env } = makeHeli({ model: 'power', A: Ax, engineOn: true, alt: 600, hopper: Ax === A ? 250 : 150, fuel: 120 });
  const as = new HeliAssist();
  const lever = Math.min(1, hoverPowerFrac(Ax, fm.mass) + dp);
  fly(fm, env, as, 'normal', secs, () => { as.holdPitch = -tiltDeg / 57.3; as.pHeld = false; return { pitch: 0, roll: 0, yaw: 0, lever }; });
  return { kt: Math.hypot(fm.vel.x, fm.vel.z) * KT, vs: fm.vel.y };
}

test('speed follows the tilt and the power; level top speed about the Vne (122 kt)', (t) => {
  const c20 = cruise(A, 20, 0), top = cruise(A, 25, 0.15), climb = cruise(A, 30, 1);
  assert.ok(c20.kt > 85 && c20.kt < 118 && Math.abs(c20.vs) < 2, `20°: ${c20.kt.toFixed(0)} kt ${c20.vs.toFixed(1)} m/s`);
  assert.ok(top.kt > 108 && top.kt < 128 && Math.abs(top.vs) < 2, `25° +15 %: ${top.kt.toFixed(0)} kt ${top.vs.toFixed(1)} m/s`);
  // Full power at 30°: the excess goes into the climb (lighter rotor damping than the R44's).
  assert.ok(climb.vs > 3, `30° full power: ${climb.vs.toFixed(1)} m/s`);
  t.diagnostic(`20° at hover power ${c20.kt.toFixed(0)} kt (${c20.vs.toFixed(1)} m/s); 25° +15 % ${top.kt.toFixed(0)} kt (${top.vs.toFixed(1)} m/s); 30° full power ${climb.kt.toFixed(0)} kt climbing ${climb.vs.toFixed(1)} m/s`);
});

test('turboshaft start: N1 to ground idle, TOT peak at light-off, rotor to 100 % N2 with no clutch', (t) => {
  for (const model of ['power', 'rotor']) {
    const { fm, env } = makeHeli({ model, fuel: 150, A });
    fm.engine = 'cranking'; fm.crankTime = 0;
    let totPeak = 0, tFlight = null, sawClutch = false, n1AtCatch = 0;
    for (let i = 0; i < 120 * 30; i++) {
      const was = fm.engine;
      fm.step(DT, env);
      if (was === 'cranking' && fm.engine === 'running') n1AtCatch = fm.ng;
      totPeak = Math.max(totPeak, fm.itt);
      if (fm.phase === 'clutch') sawClutch = true;
      if (tFlight === null && fm.phase === 'flight' && fm.out.rotorPct > 98) tFlight = i * DT;
    }
    assert.ok(!sawClutch, 'no belt clutch on the turbine');
    assert.ok(n1AtCatch > 50 && n1AtCatch < 66, `${model}: N1 at the end of the start ${n1AtCatch}`);
    assert.ok(totPeak > 650 && totPeak < 810, `${model}: TOT peak ${totPeak}`);
    assert.ok(tFlight !== null && tFlight < 20, `${model}: rotor at speed after ${tFlight}`);
    assert.ok(Math.abs(fm.out.rotorPct - 100) < 1.5, `${model}: NR ${fm.out.rotorPct}`);
    assert.ok(fm.out.onGround, 'stays on the skids');
    t.diagnostic(`${model}: N1 ${n1AtCatch.toFixed(0)} % at idle, TOT peak ${totPeak.toFixed(0)} °C, rotor at speed after ${tFlight.toFixed(1)} s`);
  }
});

test('gauges follow the power: torque and TOT rise with it, N1 high in a climb; fuel flow ~100 L/h at cruise power', (t) => {
  const { fm, env } = heli({ engineOn: true, alt: 200, fuel: 150 });
  const as = new HeliAssist();
  fly(fm, env, as, 'high', 6, { pitch: 0, roll: 0, yaw: 0, lever: hoverPowerFrac(A, fm.mass) });
  const hov = { tq: fm.torque, tot: fm.itt, n1: fm.ng };
  fly(fm, env, as, 'high', 6, { pitch: 0, roll: 0, yaw: 0, lever: 1 });
  const top = { tq: fm.torque, tot: fm.itt, n1: fm.ng, ff: fm.fuelFlow };
  assert.ok(hov.tq > 55 && hov.tq < 90, `hover torque ${hov.tq}`);
  assert.ok(top.tq > hov.tq + 10 && top.tq <= 105, `full torque ${top.tq}`);
  assert.ok(top.tot > hov.tot + 40 && top.tot < A.engine.totMax, `TOT ${hov.tot} → ${top.tot}`);
  assert.ok(top.n1 > 95 && top.n1 < 102, `N1 ${top.n1}`);
  assert.ok(top.ff > 90 && top.ff < 140, `fuel flow ${top.ff} L/h`);
  t.diagnostic(`hover: torque ${hov.tq.toFixed(0)} %, TOT ${hov.tot.toFixed(0)} °C, N1 ${hov.n1.toFixed(0)} %; full: ${top.tq.toFixed(0)} %, ${top.tot.toFixed(0)} °C, ${top.n1.toFixed(1)} %, ${top.ff.toFixed(0)} L/h`);
});

test('spraying empties the tank: the mass and the hover power fall with it', () => {
  const { fm } = heli({ engineOn: true, alt: 30, hopper: 380, fuel: 120 });
  const m0 = fm.mass, p0 = hoverPowerFrac(A, fm.mass);
  fm.hopper = 0; fm.updateMass();
  assert.ok(Math.abs(m0 - fm.mass - 380) < 1e-6);
  assert.ok(hoverPowerFrac(A, fm.mass) < p0 - 0.15);
});
