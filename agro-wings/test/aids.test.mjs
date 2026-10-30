// Pilot aids (Assistance on): the physics is the same, only the way the keys
// reach the controls changes — a softer pedal on the take-off roll, a light
// rate damper and the torque trim on the helicopter, full travel at the stop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, deg } from './harness.mjs';
import { makeHeli, DT as HDT, pitchOf } from './heliharness.mjs';
import { planeAid, heliAid, expo, minSpeed, allAids, PLANE_AIDS, HELI_AIDS } from '../src/flight/pilotAid.js';
import { HeliAssist } from '../src/flight/heliAssist.js';
import { hoverPowerFrac } from '../src/flight/heliModel.js';
import { RUNWAY } from '../src/world/layout.js';
import { FLIGHT, FLIGHT_AT502, FLIGHT_B206 } from '../src/config.js';

test('expo keeps full travel at the stop and is finer near the centre', () => {
  assert.equal(expo(1, 0.45), 1);
  assert.equal(expo(-1, 0.45), -1);
  assert.ok(expo(0.3, 0.45) < 0.3 * 0.6);
});

// Take-off roll at full power, a 0.5 s pedal jab (60 %) at 15 m/s.
function rollJab(A, aid) {
  const sim = makeSim({ wind: false, A, hopper: 300 }); const { fm, env } = sim;
  const DT = A.sim.dt;
  fm.settleOnGround(RUNWAY.x0 + 20, RUNWAY.z, Math.PI / 2, env);
  fm.engine = 'running'; fm.throttle = 1; fm.parkBrake = false;
  const h0 = fm.heading(); let dev = 0, t = 0, tJab = null;
  for (let i = 0; i < 30 / DT && (t < 1 || fm.out.onGround); i++) {
    const v = fm.out.groundSpeed;
    if (v > 15 && tJab === null) tJab = t;
    const cmd = { pitch: v > 28 ? 0.3 : 0, roll: 0, yaw: tJab !== null && t - tJab < 0.5 ? 0.6 : 0 };
    sim.assist.update(fm, cmd, 'off', DT);
    if (aid) planeAid(fm, cmd, aid);
    fm.step(DT, env); t += DT;
    if (tJab !== null) dev = Math.max(dev, Math.abs(deg(fm.heading() - h0)));
  }
  return dev;
}

test('soft pedal on the ground: the same jab no longer ground-loops (Ipanema, AT-502)', (t) => {
  for (const A of [FLIGHT, FLIGHT_AT502]) {
    const raw = rollJab(A, null), aided = rollJab(A, { pedal: true });
    t.diagnostic(`heading excursion raw ${raw.toFixed(1)}°, aided ${aided.toFixed(1)}°`);
    assert.ok(aided < 10, `aided ${aided}`);
    assert.ok(aided < raw * 0.5, `raw ${raw} aided ${aided}`);
  }
});

test('in the air the aids keep full elevator and aileron travel', () => {
  const sim = makeSim({ wind: false });
  const { fm } = sim;
  fm.reset(new (fm.pos.constructor)(0, 300, 0), 0, { speed: 45, engineOn: true });
  fm.step(FLIGHT.sim.dt, sim.env);
  const cmd = { pitch: 1, roll: -1, yaw: 0 };
  sim.assist.update(fm, cmd, 'off', FLIGHT.sim.dt);
  planeAid(fm, cmd, allAids(PLANE_AIDS));
  assert.equal(fm.elevator, 1);
  assert.equal(fm.aileron, -1);
});

test('minimum speed grows with the weight and the bank', () => {
  const light = makeSim({ hopper: 0, fuel: 60 }).fm, heavy = makeSim({ hopper: 500, fuel: 200 }).fm;
  const v1 = minSpeed(light), v2 = minSpeed(heavy), v3 = minSpeed(heavy, 2);
  assert.ok(v2 > v1 && Math.abs(v3 / v2 - Math.SQRT2) < 1e-6);
  assert.ok(v2 * 1.944 > 45 && v2 * 1.944 < 70, `loaded Ipanema ${v2 * 1.944} kt`);
});

// Hands off in a hover for 6 s, then a 0.7 s full forward jab and release.
function hoverJab(A, model, aid) {
  const { fm, env } = makeHeli({ engineOn: true, alt: 20, model, A });
  const as = new HeliAssist();
  const lever = model === 'power' ? hoverPowerFrac(fm.A, fm.mass) : fm.collective;
  let yawMax = 0;
  const run = (sec, pitch) => {
    for (let i = 0; i < sec / HDT; i++) {
      const cmd = { pitch, roll: 0, yaw: 0, lever, leverRate: 0 };
      as.update(fm, cmd, 'off', HDT);
      if (aid) heliAid(fm, cmd, aid, as);
      fm.step(HDT, env);
      yawMax = Math.max(yawMax, Math.abs(fm.omega.y));
    }
  };
  run(6, 0);
  const yawHover = yawMax;
  run(0.7, -1); run(1.5, 0);
  return { yawHover: deg(yawHover), pitch: deg(pitchOf(fm)) };
}

test('helicopter: torque trim holds the nose in a hover (detailed rotor), the damper slows a tilt (both models)', (t) => {
  for (const A of [undefined, FLIGHT_B206]) {
    const raw = hoverJab(A, 'rotor', null), aided = hoverJab(A, 'rotor', allAids(HELI_AIDS));
    t.diagnostic(`rotor: yaw in hover raw ${raw.yawHover.toFixed(0)}°/s, aided ${aided.yawHover.toFixed(0)}°/s`);
    assert.ok(raw.yawHover > 60 && aided.yawHover < 15);
    const p0 = hoverJab(A, 'power', null), p1 = hoverJab(A, 'power', allAids(HELI_AIDS));
    t.diagnostic(`power: pitch 1.5 s after the jab raw ${p0.pitch.toFixed(0)}°, aided ${p1.pitch.toFixed(0)}°`);
    // It still tilts on (no attitude hold), only slower.
    assert.ok(p1.pitch < -8 && Math.abs(p1.pitch) < Math.abs(p0.pitch) * 0.6);
  }
});
