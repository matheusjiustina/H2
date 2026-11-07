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
