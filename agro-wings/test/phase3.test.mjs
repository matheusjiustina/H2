import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { freezeStatic } from '../src/world/staticFreeze.js';

test('freezeStatic: identity subtree is computed once and then skipped', () => {
  const scene = new THREE.Scene();
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  m.position.set(3, 2, 1);
  g.add(m); scene.add(g);
  assert.equal(freezeStatic(g), true);
  scene.updateMatrixWorld(true);
  assert.deepEqual(m.matrixWorld.elements.slice(12, 15), [3, 2, 1]);
  assert.equal(m.matrixAutoUpdate, false);
  // a later change is NOT picked up by the per-frame update (static by contract)
  m.position.set(9, 9, 9);
  scene.updateMatrixWorld();
  assert.deepEqual(m.matrixWorld.elements.slice(12, 15), [3, 2, 1]);
  assert.equal(freezeStatic(g), false); // idempotent
});

test('freezeStatic: refuses a moved group', () => {
  const scene = new THREE.Scene();
  const g = new THREE.Group();
  g.position.set(1, 0, 0);
  scene.add(g);
  assert.equal(freezeStatic(g), false);
  assert.equal(g.__frozen, undefined);
});

// ---- World optimisation (phase 3 revision, 2026-11) ----------------------
import { lruGet, lruTrim } from '../src/world/lru.js';
import { cellLevel } from '../src/world/vegetation.js';

test('lru: used entries move to the back, trimming drops the least recently used', () => {
  const m = new Map([['a', 1], ['b', 2], ['c', 3], ['d', 4]]);
  assert.equal(lruGet(m, 'a'), 1);
  assert.equal(lruGet(m, 'zz'), undefined);
  assert.deepEqual([...m.keys()], ['b', 'c', 'd', 'a']);
  const dropped = [];
  assert.equal(lruTrim(m, 2, 2, (v, k) => dropped.push(k)), 2);
  assert.deepEqual(dropped, ['b', 'c']);
  assert.deepEqual([...m.keys()], ['d', 'a']);
  assert.equal(lruTrim(m, 5), 0);
  // batch trimming: over 3 → down to 1
  const n = new Map([[1, 1], [2, 2], [3, 3], [4, 4]]);
  assert.equal(lruTrim(n, 3, 1), 3);
  assert.deepEqual([...n.keys()], [4]);
});

test('vegetation LOD hysteresis is one-sided: never less detail than the plain distances', () => {
  const near = 800, far = 1800, H = 30;
  const plain = (d) => (d < near ? 1 : d < far ? 2 : 0);
  for (let d = 0; d < 2000; d += 7) {
    for (const prev of [undefined, 0, 1, 2]) {
      const l = cellLevel(d, near, far, prev, H);
      // detail order: 1 (near) > 2 (far) > 0 (hidden)
      const rank = (x) => (x === 1 ? 2 : x === 2 ? 1 : 0);
      assert.ok(rank(l) >= rank(plain(d)), `d=${d} prev=${prev}`);
      if (prev === undefined || prev === 0) assert.equal(l, plain(d));
      if (d >= near + H) assert.notEqual(l, 1);
      if (d >= far + H) assert.equal(l, 0);
    }
  }
});

test('vegetation LOD hysteresis: a camera hovering at a boundary does not flip the cell', () => {
  const near = 800, far = 1800, H = 30;
  for (const edge of [near, far]) {
    let lvl;
    const seen = new Set();
    // approach, then wobble ±10 m around the switch distance
    for (let d = edge - 40; d <= edge - 5; d += 5) lvl = cellLevel(d, near, far, lvl, H);
    for (let i = 0; i < 40; i++) { lvl = cellLevel(edge + (i % 2 ? 10 : -10), near, far, lvl, H); seen.add(lvl); }
    assert.equal(seen.size, 1, `edge ${edge}: ${[...seen]}`);
  }
});
