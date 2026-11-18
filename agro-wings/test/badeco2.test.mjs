// Badeco 2.0: the rounded crew model stays cheap, the ladder is one mesh,
// the service point registry picks a ladder only where the port is out of
// reach (measured heights), and the remarks are rare.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Badeco } from '../src/crew/badeco.js';
import { ServiceLadder } from '../src/crew/ladder.js';
import { servicePlan, REACH } from '../src/crew/servicePoints.js';
import { CrewDialogue } from '../src/crew/dialogue.js';

test('crew model: rounded parts on one shared material, at most 15 meshes; every pose animates', () => {
  const scene = new THREE.Scene();
  const b = new Badeco(scene);
  const meshes = []; b.root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  assert.ok(meshes.length <= 15, String(meshes.length));
  assert.equal(new Set(meshes.map((m) => m.material)).size, 1);
  for (const pose of ['idle', 'carry', 'reach', 'reachLow', 'reachUp', 'hold', 'crouch', 'climb', 'thumbs']) {
    b.pose = pose; b.speed = pose === 'carry' ? 1.2 : 0; b.climb = pose === 'climb' ? 1 : 0;
    for (let i = 0; i < 20; i++) b.animate(1 / 30, () => 0);
    assert.ok(Number.isFinite(b.root.position.y) && Math.abs(b.root.position.y - b.climb) < 1e-6, pose);
  }
});

test('ladder: one mesh, rebuilt only for a new height', () => {
  const L = new ServiceLadder(new THREE.Scene());
  L.build(2.6);
  const m = L.mesh;
  L.build(2.61);
  assert.equal(L.mesh, m, 'same height (to 5 cm): kept');
  L.build(1.0);
  assert.notEqual(L.mesh, m);
  assert.equal(L.group.children.length, 1);
  L.place(0, 0, 0, 0); assert.ok(L.group.visible); L.stow(); assert.ok(!L.group.visible);
});

const fakeAc = (id, F = [2, -1.5], P = [1.2, -1.5]) => ({
  type: { id, service: { local: { F, P } } },
  model: { fuelFiller: new THREE.Vector3(2, 0, -0.4), hopperPort: new THREE.Vector3(0.6, -0.2, -1) },
});
test('registry: no ladder within reach; a ladder above it; the Fire Boss on its wing walkway', () => {
  assert.equal(servicePlan(fakeAc('ipanema'), 'fuel', 1.22).ladder, null);
  const hi = servicePlan(fakeAc('x'), 'fuel', 2.6);
  assert.ok(hi.ladder && Math.abs(hi.ladder.top - (2.6 - REACH)) < 1e-9 && !hi.ladder.wing);
  const fb = servicePlan(fakeAc('at802f'), 'fuel', 2.81);
  assert.ok(fb.ladder.wing && fb.ladder.onWing.length >= 2 && Math.abs(fb.ladder.top - 2.67) < 0.02);
  const fbw = servicePlan(fakeAc('at802f'), 'liquid', 2.74);
  assert.ok(fbw.ladder.wing && fbw.ladder.onWing.at(-1)[0] < 1.3, 'to the coupler by the wing root');
  const cat = servicePlan(fakeAc('agcat'), 'fuel', 3.01);
  assert.ok(cat.ladder && !cat.ladder.wing && cat.ladder.top > 0.9 && cat.ladder.top < 1.2);
  assert.equal(servicePlan(fakeAc('agcat'), 'liquid', 1.38).ladder, null);
});

test('remarks: silent for the first minutes, never two within six minutes, events rare too', () => {
  const said = [];
  let now = 0;
  const g = { playing: true, screens: { open: null }, warnings: () => [], hud: { say: (n, l) => said.push({ t: now, l }) } };
  const d = new CrewDialogue(g);
  for (; now < 4 * 3600; now += 1) { d.update(1, true); if (now % 300 === 0) d.event('service', 'ipanema'); }
  assert.ok(said.length > 0 && said[0].t >= 6 * 60, JSON.stringify(said[0]));
  for (let i = 1; i < said.length; i++) assert.ok(said[i].t - said[i - 1].t >= 6 * 60);
  assert.ok(said.length <= 4 * 60 / 6, String(said.length));
  // Not near, in a menu: nothing.
  const d2 = new CrewDialogue({ ...g, hud: { say: () => { throw new Error('spoke'); } } });
  for (let t = 0; t < 3600; t++) d2.update(1, false);
  console.log(`  4 h near the crew: ${said.length} remarks`);
});
