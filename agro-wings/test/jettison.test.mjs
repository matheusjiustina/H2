// Jettison (alijamento) and the Fire Boss drop: the dump gate empties the
// hopper in a few seconds and lightens the aircraft (nothing counts as
// application); the Fire Boss door stays open to the last litre; a full,
// well-placed load knocks a spot fire down; the drop sight predicts where the
// water lands (ahead of the release point, with the aircraft's speed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, getTerrain } from './harness.mjs';
import { FLIGHT_E203, FLIGHT_FIREBOSS as FB } from '../src/config.js';
import { Jettison } from '../src/spray/jettison.js';
import { WaterSystem } from '../src/aircraft/fireboss.js';
import { FireField, fallStep } from '../src/world/fires.js';

const fakeGame = (fm, A) => {
  const toasts = [];
  const ac = { fm, A, kind: 'plane', type: { spray: {} }, state: 'ok', water: null, model: {} };
  return { aircraft: ac, sprayer: { on: true }, toast: (m) => toasts.push(m), toasts, audio: null };
};

test('dump gate: a full hopper goes in about 5 s, the aircraft gets lighter, the spray valve closes', () => {
  const A = FLIGHT_E203;
  const sim = makeSim({ A, hopper: A.hopperCapacity, fuel: 150, wind: false });
  const fm = sim.fm;
  const m0 = fm.mass;
  const g = fakeGame(fm, A);
  const j = new Jettison(g);
  j.toggle();
  assert.ok(j.on && !g.sprayer.on);
  const h = 1 / 120;
  let t = 0;
  while (j.on && t < 20) { j.step(h); fm.updateMass(); t += h; }
  console.log(`  ${A.hopperCapacity} L dumped in ${t.toFixed(1)} s, mass ${m0.toFixed(0)} → ${fm.mass.toFixed(0)} kg`);
  assert.ok(t > 3.5 && t < 8, String(t));
  assert.equal(fm.hopper, 0);
  assert.ok(m0 - fm.mass > A.hopperCapacity * A.liquidDensity * 0.95);
  assert.ok(Math.abs(j.dumped - A.hopperCapacity) < 1);
});

test('dump gate: closing it again keeps the rest; empty hopper or no gate: nothing happens', () => {
  const A = FLIGHT_E203;
  const sim = makeSim({ A, hopper: 600, fuel: 150, wind: false });
  const g = fakeGame(sim.fm, A);
  const j = new Jettison(g);
  j.toggle();
  for (let i = 0; i < 120; i++) j.step(1 / 120);
  j.toggle();
  const kept = sim.fm.hopper;
  for (let i = 0; i < 120; i++) j.step(1 / 120);
  assert.ok(!j.on && kept < 600 && kept > 300 && sim.fm.hopper === kept);
  sim.fm.hopper = 0; j.toggle();
  assert.ok(!j.on);
  g.aircraft.kind = 'heli'; sim.fm.hopper = 300; j.toggle();
  assert.ok(!j.on);
});

test('Fire Boss jettison: the door opens fully and cannot be closed until the tank is empty', () => {
  const sim = makeSim({ A: FB, hopper: 3000, fuel: 400, wind: false });
  const ws = new WaterSystem(sim.fm);
  ws.jettison();
  ws.toggleDrop(); // (ignored while jettisoning)
  let t = 0;
  while (sim.fm.hopper > 0 && t < 10) { ws.step(1 / 120); t += 1 / 120; }
  console.log(`  3000 L out of the door in ${t.toFixed(1)} s`);
  assert.equal(sim.fm.hopper, 0);
  assert.ok(!ws.dropping && !ws.dumping);
});

test('drop: water lands ahead of the release point (forward speed kept); a full load on a spot knocks it down', () => {
  const T = getTerrain();
  const ff = new FireField(null, T);
  ff.active = true;
  const f = ff.fires[0];
  // Free fall from 30 m at 52 m/s: lands well ahead.
  const p = { x: 0, y: T.heightAt(0, 0) + 30, z: 0, vx: 52, vy: 0, vz: 0, age: 0 };
  while (p.y > T.heightAt(p.x, p.z) + 0.5) fallStep(p, { x: 0, z: 0 }, 1 / 60);
  console.log(`  released at 30 m, 52 m/s: lands ${p.x.toFixed(0)} m ahead after ${p.age.toFixed(1)} s`);
  assert.ok(p.x > 60 && p.x < 140);
  // A full load centred on spot 1 along x.
  const v = 52, dur = 3100 / 1300, lead = p.x;
  let x = f.x - lead - (v * dur) / 2;
  const y = T.heightAt(f.x, f.z) + 30;
  let left = 3100;
  for (let t = 0; t < 20; t += 1 / 60) {
    if (left > 0) { const L = Math.min(left, 1300 / 60); left -= L; ff.addPacket({ litres: L, x, y, z: f.z, vx: v, vy: 0, vz: 0 }); }
    x += v / 60;
    ff.update(1 / 60, { x: 0, z: 0 });
  }
  console.log(`  spot 1 (r ${f.r} m) after one load: ${f.state}, intensity ${(f.intensity * 100).toFixed(0)} %`);
  assert.equal(f.state, 'out');
});
