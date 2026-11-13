// Hopper sight liquid (src/aircraft/hopperLiquid.js): the slosh model.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HopperSlosh } from '../src/aircraft/hopperLiquid.js';

const run = (sl, secs, vel, quat, s = {}, dt = 1 / 60) => {
  for (let t = 0; t < secs; t += dt) sl.update(dt, typeof vel === 'function' ? vel(t) : vel, quat, { fill: 0.5, ...s });
};
const qAxis = (x, y, z, a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(x, y, z), a);

test('at rest, level: flat surface at the fill height', () => {
  const sl = new HopperSlosh(1000);
  run(sl, 3, new THREE.Vector3(), new THREE.Quaternion());
  assert.ok(Math.abs(sl.tx) < 1e-3 && Math.abs(sl.tz) < 1e-3, `${sl.tx} ${sl.tz}`);
  assert.ok(Math.abs(sl.wallHeight(0.5) - 0.5) < 1e-3);
  assert.equal(sl.wallHeight(0), -1); // empty: nothing to show
});

test('banked right on the ground: the surface stays level in the world (higher on the right)', () => {
  const sl = new HopperSlosh(1000), q = qAxis(0, 0, 1, 0.3); // +z (forward) rotation = right wing down
  run(sl, 0.1, new THREE.Vector3(), new THREE.Quaternion());
  run(sl, 15, new THREE.Vector3(), q);
  assert.ok(Math.abs(sl.tx - 0.3) < 0.01, `tx ${sl.tx}`);
});

test('nose up (tail on the ground): the product runs aft — the rear wall reads higher', () => {
  const sl = new HopperSlosh(1000), q = qAxis(1, 0, 0, -0.2); // −x rotation = nose up
  run(sl, 15, new THREE.Vector3(), q);
  assert.ok(Math.abs(sl.tz - 0.2) < 0.01, `tz ${sl.tz}`);
  assert.ok(sl.wallHeight(0.5) > 0.55);
});

test('accelerating forward pushes the product aft; braking pushes it forward', () => {
  const sl = new HopperSlosh(1000), q = new THREE.Quaternion();
  run(sl, 8, (t) => new THREE.Vector3(0, 0, 3 * t), q); // +3 m/s² forward (+z)
  assert.ok(Math.abs(sl.tz - Math.atan2(3, 9.81)) < 0.03, `tz ${sl.tz}`);
  const sl2 = new HopperSlosh(1000);
  run(sl2, 8, (t) => new THREE.Vector3(0, 0, 60 - 3 * t), q);
  assert.ok(sl2.tz < -0.25 && sl2.wallHeight(0.5) < 0.4, `tz ${sl2.tz}`);
});

test('a quick roll leaves the surface behind, then it sloshes back and settles', () => {
  const sl = new HopperSlosh(1000), vel = new THREE.Vector3();
  run(sl, 1, vel, new THREE.Quaternion());
  // Roll 0.4 rad in 0.25 s, then hold: the static target is the bank angle.
  const dt = 1 / 60;
  let maxOver = 0;
  for (let t = 0; t < 12; t += dt) {
    const q = qAxis(0, 0, 1, Math.min(1, t / 0.25) * 0.4);
    sl.update(dt, vel, q, { fill: 0.5 });
    if (t > 0.25) maxOver = Math.max(maxOver, Math.abs(sl.tx - 0.4));
  }
  assert.ok(maxOver > 0.02, `no slosh: ${maxOver}`); // it oscillates…
  assert.ok(Math.abs(sl.tx - 0.4) < 0.01, `not settled: ${sl.tx}`); // …and settles
});

test('ripples: engine and taxiing raise them, a quiet tank is calm; a teleport resettles', () => {
  const sl = new HopperSlosh(1000), q = new THREE.Quaternion(), v = new THREE.Vector3();
  run(sl, 3, v, q, { running: false });
  const calm = sl.amp;
  run(sl, 3, v, q, { running: true, rpmFrac: 1, onGround: true, gs: 15 });
  assert.ok(calm < 0.001 && sl.amp > 0.006, `${calm} ${sl.amp}`);
  sl.tx = 0.5;
  sl.update(1 / 60, new THREE.Vector3(500, 0, 0), q, { fill: 0.5 }); // jump of 500 m/s: reset
  assert.ok(Math.abs(sl.tx) < 1e-6);
});
