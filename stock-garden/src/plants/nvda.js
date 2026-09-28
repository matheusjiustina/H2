import * as THREE from 'three';
import { addSeed, addSprout, leafGeometry, stemGeometry } from './common.js';
import { circuitTexture } from '../world/textures.js';
import { glowSprite } from '../world/materials.js';
import { clamp, lerp } from '../utils/math.js';

/** NVDA — "Circuit Fern": angular digital leaves with light running through circuit veins. */
export function buildNVDA(rig) {
  const st = rig.stock;
  const r = rig.rng;
  rig.heights = [0.14, 0.32, 0.85, 1.35, 1.6];
  addSeed(rig, st);
  addSprout(rig, { stem: '#3d6b35', leaf: '#6fcf4a', emissive: '#4fa834' });

  const stemMat = rig.mat('#1c2620', { metalness: 0.75, roughness: 0.32 });
  const nodeMat = rig.basic('#a6ff73');
  const circuit = circuitTexture().clone();
  circuit.needsUpdate = true;
  circuit.wrapT = THREE.RepeatWrapping;
  const leafMat = rig.mat('#1d4a22', {
    emissive: '#8dff5a',
    emissiveMap: circuit,
    emissiveIntensity: 0.4,
    roughness: 0.38,
    metalness: 0.35,
    side: THREE.DoubleSide,
    flatShading: true,
  });

  // Stage 2 — growing: segmented lower stem + first angular leaves.
  const stem1 = rig.mesh(stemGeometry(0.88, 0.04, 0.028, 6), stemMat);
  rig.part(stem1, { stage: 2, delay: 0, dur: 1.3, kind: 'grow' });
  const nodeGeo = new THREE.TorusGeometry(0.036, 0.009, 6, 16);
  [0.3, 0.56, 0.8].forEach((y, i) => {
    const n = rig.mesh(nodeGeo, nodeMat, { shadow: false });
    n.rotation.x = Math.PI / 2;
    n.position.y = y;
    rig.part(n, { stage: 2, delay: 0.5 + i * 0.18, kind: 'pop' });
  });
  const bigLeaf = leafGeometry(0.46, 0.24, { profile: 'diamond', bend: 0.12, fold: 0.38, segs: 6 });
  const midLeaf = leafGeometry(0.36, 0.2, { profile: 'diamond', bend: 0.1, fold: 0.38, segs: 6 });
  const topLeaf = leafGeometry(0.24, 0.13, { profile: 'diamond', bend: 0.02, fold: 0.3, segs: 5 });
  const yaw0 = r() * Math.PI;
  [
    [0.3, 0, -0.3],
    [0.32, Math.PI, -0.28],
    [0.56, Math.PI / 2, -0.4],
    [0.58, -Math.PI / 2, -0.38],
  ].forEach(([y, yaw, tilt], i) => {
    rig.leaf(bigLeaf, leafMat, { y, yaw: yaw0 + yaw, tilt }, { stage: 2, delay: 0.45 + i * 0.22, dur: 1.2 });
  });

  // Stage 3 — mature: upper stem, second tier, chip crown bud.
  const stem2 = rig.mesh(stemGeometry(0.5, 0.028, 0.018, 6), stemMat);
  stem2.position.y = 0.86;
  rig.part(stem2, { stage: 3, delay: 0, dur: 1.1, kind: 'grow' });
  [
    [0.98, Math.PI / 4, -0.45],
    [1.0, Math.PI + Math.PI / 4, -0.45],
    [1.14, (3 * Math.PI) / 4, -0.6],
    [1.16, -Math.PI / 4, -0.6],
  ].forEach(([y, yaw, tilt], i) => {
    rig.leaf(midLeaf, leafMat, { y, yaw: yaw0 + yaw, tilt }, { stage: 3, delay: 0.3 + i * 0.18 });
  });
  for (let i = 0; i < 3; i++) {
    rig.leaf(
      topLeaf,
      leafMat,
      { y: 1.3, yaw: yaw0 + (i * Math.PI * 2) / 3, tilt: -0.95 },
      { stage: 3, delay: 0.9 + i * 0.12, closed: -1.5 },
    );
  }

  // The "chip" crown: dark glass cube wrapping a glowing core.
  const crown = new THREE.Group();
  crown.position.y = 1.47;
  const shell = rig.mesh(
    new THREE.BoxGeometry(0.17, 0.17, 0.17),
    rig.mat('#0e1a12', { metalness: 0.4, roughness: 0.08, transparent: true, opacity: 0.55 }),
  );
  const core = rig.mesh(new THREE.BoxGeometry(0.085, 0.085, 0.085), rig.basic('#b8ff8a'), { shadow: false });
  const cGlow = glowSprite(st.color, 0.7, 0.55);
  crown.add(shell, core, cGlow);
  crown.rotation.set(0.6, 0.4, 0.6);
  rig.part(crown, { stage: 3, delay: 1.1, kind: 'bud', full: 4, fullDelay: 0, budScale: 0.45 });
  rig.sparkPoints.push(crown);

  // Stage 4 — ready: tiny data cubes orbiting the crown.
  const orbit = new THREE.Group();
  orbit.position.y = 1.3;
  rig.sway.add(orbit);
  const cubeGeo = new THREE.BoxGeometry(0.045, 0.045, 0.045);
  const cubeMat = rig.basic('#b8ff8a');
  const cubes = [];
  for (let i = 0; i < 5; i++) {
    const c = rig.mesh(cubeGeo, cubeMat, { shadow: false });
    const a = (i / 5) * Math.PI * 2;
    c.position.set(Math.cos(a) * 0.36, Math.sin(a * 2) * 0.08, Math.sin(a) * 0.36);
    rig.part(c, { parent: orbit, stage: 4, delay: 0.15 + i * 0.1, kind: 'pop' });
    cubes.push(c);
  }

  // Data pulse travelling up the stem once ready.
  const pulse = rig.mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 20), rig.basic('#d4ffb0', { transparent: true }), {
    shadow: false,
  });
  pulse.rotation.x = Math.PI / 2;
  rig.sway.add(pulse);
  pulse.visible = false;

  rig.onFrame(({ t, dt, stage, readyT }) => {
    circuit.offset.y -= dt * (stage >= 4 ? 0.5 : 0.22);
    const target = stage >= 4 ? 1.1 + Math.sin(t * 3) * 0.25 : stage >= 3 ? 0.7 : 0.45;
    leafMat.emissiveIntensity = lerp(leafMat.emissiveIntensity, target, clamp(dt * 3));
    crown.rotation.y += dt * 0.6;
    core.rotation.x += dt * 1.2;
    orbit.rotation.y += dt * 0.9;
    cubes.forEach((c, i) => (c.rotation.y += dt * (1 + i * 0.3)));
    if (readyT > 0) {
      const k = (t * 0.55) % 1;
      pulse.visible = true;
      pulse.position.y = k * 1.35;
      pulse.material.opacity = Math.sin(k * Math.PI) * 0.9;
      pulse.scale.setScalar(1 - k * 0.45);
    } else pulse.visible = false;
  });
}
