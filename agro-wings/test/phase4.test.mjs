import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AircraftAssets } from '../src/aircraft/assetManager.js';

const box = () => { const g = new THREE.BoxGeometry(1, 1, 1); g.clearGroups(); return g; };

function fakeAircraft(sharedTex) {
  const root = new THREE.Group();
  const matA = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  const matGlass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.3 });
  const body = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(box(), matA);
    m.position.set(i * 2, 0.5, 0); m.castShadow = true; root.add(m); body.push(m);
  }
  const glass = new THREE.Mesh(box(), matGlass); root.add(glass);
  const cockpit = new THREE.Group();
  const ctex = new THREE.Texture(); ctex.needsUpdate = true;
  const cm = new THREE.Mesh(box(), new THREE.MeshBasicMaterial({ map: ctex }));
  const cm2 = new THREE.Mesh(box(), new THREE.MeshBasicMaterial({ map: sharedTex }));
  cockpit.add(cm, cm2); root.add(cockpit);
  const pilot = new THREE.Group(); root.add(pilot);
  cockpit.visible = false; pilot.visible = false;
  return { model: { root, cockpit, pilot }, body, glass, cm, ctex };
}

test('freeze bakes static opaque meshes, thaw restores them exactly', () => {
  const sh = new THREE.Texture();
  const a = fakeAircraft(sh), b = fakeAircraft(sh);
  const game = { fleet: { a: a, b: b } };
  const as = new AircraftAssets(game); as.register();
  a.model.root.position.set(10, 0, 5); a.model.root.updateMatrixWorld(true);
  const before = new THREE.Box3().setFromObject(a.model.root);
  assert.equal(as.freeze('a'), true);
  assert.ok(a.body.every((m) => !m.visible), 'originals hidden');
  assert.ok(a.glass.visible, 'transparent mesh stays original');
  const merged = a.model.root.children.find((c) => c.name === 'parkedMerge');
  assert.equal(merged.children.length, 1);
  assert.equal(merged.children[0].castShadow, true);
  const after = new THREE.Box3().setFromObject(a.model.root);
  assert.ok(before.min.distanceTo(after.min) < 1e-5 && before.max.distanceTo(after.max) < 1e-5, 'same extent in the world');
  assert.equal(a.body[0].matrixAutoUpdate, false);
  assert.equal(as.freeze('a'), false);
  assert.equal(as.thaw('a'), true);
  assert.ok(a.body.every((m) => m.visible && m.matrixAutoUpdate));
  assert.equal(a.model.root.children.some((c) => c.name === 'parkedMerge'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(a.model.root, 'updateMatrixWorld'), false);
});

test('GPU release covers only cockpit resources no other aircraft uses', () => {
  const sh = new THREE.Texture();
  const a = fakeAircraft(sh), b = fakeAircraft(sh);
  const as = new AircraftAssets({ fleet: { a, b } }); as.register();
  const e = as.entries.get('a');
  assert.ok(e.cockpitOnly.tex.includes(a.ctex));
  assert.ok(!e.cockpitOnly.tex.includes(sh), 'texture shared with another aircraft is kept');
  let disposed = 0; a.ctex.addEventListener('dispose', () => disposed++);
  as.freeze('a');
  assert.equal(disposed, 1);
});

test('refresh re-bakes after an option changed a mesh', () => {
  const sh = new THREE.Texture();
  const a = fakeAircraft(sh);
  const as = new AircraftAssets({ fleet: { a } }); as.register();
  as.freeze('a');
  as.thaw('a'); a.body[0].visible = false; as.freeze('a');
  const merged = a.model.root.children.find((c) => c.name === 'parkedMerge');
  assert.equal(merged.children.length, 1);
  const n = merged.children[0].geometry.attributes.position.count;
  assert.equal(n, 3 * BoxCount());
  function BoxCount() { return box().attributes.position.count; }
  as.refresh('a');
  assert.equal(as.entries.get('a').state, 'frozen');
});
