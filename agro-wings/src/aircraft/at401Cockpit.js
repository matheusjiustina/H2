// Air Tractor AT-401B — cockpit (exterior-phase placeholder: floor, inner
// walls, seat, stick, pedals and the throttle on the cabin's anchors).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tagged, tx, rod, ball, rbox } from './model.js';

export const AT401_CK = { stick: [0, 0.02, -1.08], pedals: [0.17, 0.08, -0.55], throttle: [0.42, 0.75, -1.02] };

export function buildAT401Cockpit({ M, C, CAB, boxX }) {
  const cockpit = new THREE.Group();
  cockpit.name = 'at401-cockpit';
  const B = {};
  const add = (k, g) => (B[k] ||= []).push(tagged(g));
  const floorY = C.floorY;
  const z0 = CAB.wsB - 0.05, z1 = CAB.bPost - 0.2;
  add('interior', tx(new THREE.PlaneGeometry(0.8, z0 - z1), 0, floorY, (z0 + z1) / 2, -Math.PI / 2));
  for (const sx of [1, -1]) {
    const x = Math.min(boxX(z1, CAB.sill), boxX(z1, floorY)) - 0.02;
    add('interior', tx(new THREE.PlaneGeometry(z0 - z1, CAB.sill - floorY - 0.02), sx * x, (CAB.sill + floorY) / 2, (z0 + z1) / 2, 0, sx * Math.PI / 2, 0));
  }
  add('seat', rbox(0.46, 0.09, 0.44, 0.03, 0, C.seat[1], C.seat[2] + 0.1));
  add('seat', rbox(0.46, 0.62, 0.09, 0.03, 0, C.seat[1] + 0.33, C.seat[2] - 0.13));
  add('dark', rbox(0.9, 0.4, 0.06, 0.02, 0, CAB.sill + 0.02, CAB.wsB - 0.2));
  for (const [k, parts] of Object.entries(B)) cockpit.add(new THREE.Mesh(mergeGeometries(parts), M[k]));
  const panelMesh = cockpit.children[cockpit.children.length - 1];
  const stick = new THREE.Group();
  stick.position.set(...AT401_CK.stick);
  stick.add(new THREE.Mesh(tagged(rod([0, 0, 0], [0, 0.62, 0.05], 0.015, 8)), M.steel));
  stick.add(new THREE.Mesh(tagged(tx(new THREE.CylinderGeometry(0.02, 0.024, 0.13, 10), 0, 0.66, 0.05)), M.rubber));
  cockpit.add(stick);
  const pedals = [];
  for (const sx of [1, -1]) {
    const p = new THREE.Group();
    p.position.set(sx * AT401_CK.pedals[0], AT401_CK.pedals[1], AT401_CK.pedals[2]);
    p.add(new THREE.Mesh(tagged(rbox(0.09, 0.16, 0.02, 0.006, 0, 0, 0)), M.alu));
    cockpit.add(p);
    pedals.push(p);
  }
  const THR = AT401_CK.throttle;
  const throttle = new THREE.Group();
  throttle.position.set(...THR);
  throttle.add(new THREE.Mesh(tagged(rod([0, 0, 0], [0, 0.12, 0.03], 0.007, 6)), M.steel));
  throttle.add(new THREE.Mesh(tagged(ball([0, 0.13, 0.035], 0.02, 10)), M.gloss));
  cockpit.add(throttle);
  const valve = new THREE.Group();
  valve.position.set(-0.3, 0.3, -1.0);
  cockpit.add(valve);
  return { cockpit, stick, pedals, throttle, valve, leds: [], THR, panelMesh, pick: () => null, pickables: [], needles: [], update() {} };
}
