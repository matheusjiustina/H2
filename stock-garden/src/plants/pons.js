import * as THREE from 'three';
import { addSeed, addSprout, tubeGeometry } from './common.js';
import { glowSprite } from '../world/materials.js';

/** PONS — "Aurum Crystal": the rare one. Gold stem, violet crystal leaves, a floating gem. */
export function buildPONS(rig) {
  const st = rig.stock;
  const r = rig.rng;
  rig.heights = [0.14, 0.32, 0.9, 1.35, 1.65];
  addSeed(rig, { color: st.color, accent: st.accent });
  addSprout(rig, { stem: '#b89350', leaf: '#b49bff', emissive: '#6a4fd6' });

  const goldMat = rig.mat('#e0b563', { metalness: 1, roughness: 0.22 });
  const crystalMat = rig.mat('#9a7bff', {
    metalness: 0.25,
    roughness: 0.12,
    emissive: '#5b3bd9',
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.9,
    flatShading: true,
  });

  // Stage 2 — golden stem with crystal shard leaves.
  const stem = rig.mesh(
    tubeGeometry(
      [
        [0, 0, 0],
        [0.05, 0.3, 0.0],
        [-0.03, 0.62, 0.03],
        [0.02, 0.98, 0],
      ],
      0.026,
      { radial: 8 },
    ),
    goldMat,
  );
  rig.part(stem, { stage: 2, delay: 0, dur: 1.3, kind: 'grow' });

  const shardLeaf = new THREE.OctahedronGeometry(0.1, 0);
  shardLeaf.scale(0.55, 0.28, 2.1);
  shardLeaf.translate(0, 0, 0.2);
  const yaw0 = r() * Math.PI * 2;
  [
    [0.3, 0, -0.35],
    [0.44, 2.1, -0.45],
    [0.6, 4.2, -0.5],
    [0.74, 1.0, -0.6],
  ].forEach(([y, yaw, tilt], i) => {
    rig.leaf(shardLeaf, crystalMat, { y, yaw: yaw0 + yaw, tilt }, { stage: 2, delay: 0.5 + i * 0.2 });
  });

  // Stage 3 — crystal cluster at the base, golden halo, gem bud.
  const baseShard = new THREE.OctahedronGeometry(0.1, 0);
  baseShard.scale(0.7, 2.2, 0.7);
  baseShard.translate(0, 0.18, 0);
  [
    [0.18, 0.05, 0.4, 1.0],
    [-0.15, 0.12, -0.35, 0.8],
    [0.02, -0.19, 0.2, 0.7],
  ].forEach(([x, z, lean, s], i) => {
    const m = rig.mesh(baseShard, crystalMat);
    m.position.set(x, -0.02, z);
    m.rotation.set(lean * Math.sign(z || 1), 0, -lean * Math.sign(x));
    m.scale.setScalar(s);
    rig.part(m, { stage: 3, delay: 0.2 + i * 0.15, kind: 'grow' });
  });
  rig.leaf(shardLeaf, crystalMat, { y: 0.94, yaw: yaw0 + 3.3, tilt: -0.8 }, { stage: 3, delay: 0.5 });
  rig.leaf(shardLeaf, crystalMat, { y: 0.96, yaw: yaw0 + 0.5, tilt: -0.85 }, { stage: 3, delay: 0.65 });

  const halo = rig.mesh(new THREE.TorusGeometry(0.2, 0.011, 8, 48), goldMat);
  halo.position.y = 1.16;
  halo.rotation.x = Math.PI / 2 - 0.3;
  rig.part(halo, { stage: 3, delay: 0.8, kind: 'pop' });

  const gem = new THREE.Group();
  gem.position.y = 1.42;
  const gemMat = rig.mat('#b79bff', {
    metalness: 0.3,
    roughness: 0.05,
    emissive: '#7a54ff',
    emissiveIntensity: 0.7,
    flatShading: true,
  });
  const gemMesh = rig.mesh(new THREE.OctahedronGeometry(0.13, 0), gemMat);
  gemMesh.scale.set(1, 1.45, 1);
  const gemGlow = glowSprite(st.accent, 0.9, 0.55);
  gem.add(gemMesh, gemGlow);
  rig.part(gem, { stage: 3, delay: 1.0, kind: 'bud', full: 4, budScale: 0.4 });
  rig.sparkPoints.push(gem);

  // Stage 4 — tiny golden sparks orbiting the gem.
  const sparkRing = new THREE.Group();
  sparkRing.position.y = 1.42;
  rig.sway.add(sparkRing);
  const sparkGeo = new THREE.OctahedronGeometry(0.022, 0);
  for (let i = 0; i < 6; i++) {
    const s = rig.mesh(sparkGeo, rig.basic('#ffe2a0'), { shadow: false });
    const a = (i / 6) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.28, Math.sin(a * 3) * 0.06, Math.sin(a) * 0.28);
    rig.part(s, { parent: sparkRing, stage: 4, delay: 0.2 + i * 0.08, kind: 'pop' });
  }

  const hueA = new THREE.Color('#7a54ff');
  const hueB = new THREE.Color('#ffb85c');
  rig.onFrame(({ t, dt, readyT }) => {
    gem.rotation.y += dt * 0.9;
    gem.position.y = 1.42 + Math.sin(t * 1.6) * 0.035;
    halo.rotation.z += dt * 0.5;
    sparkRing.rotation.y -= dt * 0.8;
    const k = (Math.sin(t * 1.1) + 1) / 2;
    gemMat.emissive.copy(hueA).lerp(hueB, readyT > 0 ? k * 0.7 : 0);
    gemMat.emissiveIntensity = readyT > 0 ? 0.9 + Math.sin(t * 2.2) * 0.25 : 0.6;
    crystalMat.emissiveIntensity = 0.4 + (readyT > 0 ? 0.25 + Math.sin(t * 2) * 0.12 : 0);
    gemGlow.material.opacity = readyT > 0 ? 0.6 + k * 0.3 : 0.4;
  });
}
