import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WorldStreaming } from '../src/world/worldStreaming.js';

function fakeWorld() {
  const cells = [];
  for (let i = -20; i < 20; i++) for (let j = -20; j < 20; j++) cells.push({ center: new THREE.Vector3((i + 0.5) * 500, 0, (j + 0.5) * 500), built: false });
  const veg = { cells, cellRadius: () => 2300, build: (c) => { c.built = true; }, release: (c) => { c.built = false; }, stats: () => ({}) };
  const calls = [];
  const terrainMesh = { stream: (a, o) => { calls.push([a, o]); return { built: 0, released: 0 }; }, fineStats: () => ({}) };
  return { veg, world: { vegetation: veg, terrainMesh }, calls };
}
const built = (v) => v.cells.filter((c) => c.built);
const drawable = (c, p) => Math.hypot(c.center.x - p.x, c.center.z - p.z) - 300 < 1800;

test('first scan (teleport) builds every drawable cell at once and nothing far', () => {
  const { veg, world } = fakeWorld();
  const ws = new WorldStreaming(world);
  const cam = new THREE.Vector3(0, 100, 0);
  ws.update(cam, 0.016);
  assert.ok(veg.cells.filter((c) => drawable(c, cam)).every((c) => c.built), 'nothing drawable is missing');
  assert.ok(built(veg).length < veg.cells.length / 2, 'far cells stay unbuilt');
  assert.equal(ws.s.jumps, 1);
});

test('flying on: prefetch ahead, release far behind, nothing drawable is ever missing', () => {
  const { veg, world } = fakeWorld();
  const ws = new WorldStreaming(world);
  const cam = new THREE.Vector3(-3000, 150, 0);
  ws.update(cam, 0.016);
  let missing = 0;
  for (let t = 0; t < 120; t += 0.1) { // 2 minutes at 80 m/s along +x
    cam.x += 8;
    ws.update(cam, 0.1);
    for (const c of veg.cells) if (drawable(c, cam) && !c.built) missing++;
  }
  assert.equal(missing, 0);
  assert.ok(veg.cells.filter((c) => c.built && c.center.x < cam.x - 4000).length === 0, 'cells far behind are released');
  assert.ok(ws.s.vegReleased > 0 && ws.s.vegBuilt > 0);
});

test('anchors: camera, ahead + two turn points, site and job when within reach', () => {
  const { world } = fakeWorld();
  const ws = new WorldStreaming(world, () => ({ site: { runway: { x0: 0, x1: 800, z: 500 } }, job: { fields: [{ x0: 0, x1: 100, z0: 0, z1: 100 }] } }));
  ws.vel.set(0, 0, 60);
  const a = ws.anchors(new THREE.Vector3(0, 100, 0), 0.1);
  assert.equal(a.filter((x) => x.need).length, 1);
  assert.equal(a.length, 1 + 3 + 2);
  const ahead = a[1];
  assert.ok(Math.abs(ahead.z - 60 * 6) < 1e-6);
});
