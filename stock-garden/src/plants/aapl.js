import * as THREE from 'three';
import { addSeed, addSprout, leafGeometry, tubeGeometry } from './common.js';

/** AAPL — "Pearl Orchard": clean silver trunk, soft rounded canopy, glossy minimalist fruit. */
export function buildAAPL(rig) {
  const st = rig.stock;
  const r = rig.rng;
  rig.heights = [0.14, 0.32, 0.9, 1.3, 1.45];
  addSeed(rig, { color: '#e9edf2', accent: '#ffffff' });
  addSprout(rig, { stem: '#b9c6bf', leaf: '#a8dcc0' });

  const trunkMat = rig.mat('#dfe4ea', { metalness: 0.55, roughness: 0.2 });
  const leafMat = rig.mat('#a7d8bd', { roughness: 0.3, metalness: 0.05, side: THREE.DoubleSide });
  const canopyMat = rig.mat('#e3f1ea', { roughness: 0.32, metalness: 0.05 });
  const canopyMat2 = rig.mat('#c8e6d6', { roughness: 0.34, metalness: 0.05 });
  const fruitMat = rig.mat(st.accent, { roughness: 0.14, metalness: 0.08 });

  // Stage 2 — elegant S-curve trunk + round leaves.
  const trunk = rig.mesh(
    tubeGeometry(
      [
        [0, 0, 0],
        [0.05, 0.3, 0.02],
        [-0.05, 0.62, -0.02],
        [0.01, 0.98, 0],
      ],
      0.036,
      { radial: 10 },
    ),
    trunkMat,
  );
  rig.part(trunk, { stage: 2, delay: 0, dur: 1.4, kind: 'grow' });
  const leafG = leafGeometry(0.3, 0.22, { profile: 'round', bend: 0.14, fold: 0.18 });
  const yaw0 = r() * Math.PI * 2;
  [
    [0.36, 0, -0.2],
    [0.52, 2.2, -0.3],
    [0.7, 4.3, -0.35],
  ].forEach(([y, yaw, tilt], i) => {
    rig.leaf(leafG, leafMat, { y, yaw: yaw0 + yaw, tilt }, { stage: 2, delay: 0.5 + i * 0.3, dur: 1.2 });
  });

  // Stage 3 — soft topiary canopy.
  const canopyGeo = new THREE.IcosahedronGeometry(0.2, 3);
  [
    [0, 1.12, 0, 1.1, canopyMat],
    [0.19, 1.02, 0.06, 0.8, canopyMat2],
    [-0.17, 1.04, -0.05, 0.85, canopyMat2],
    [0.03, 1.0, -0.18, 0.7, canopyMat],
  ].forEach(([x, y, z, s, m], i) => {
    const c = rig.mesh(canopyGeo, m);
    c.position.set(x, y, z);
    c.scale.setScalar(s);
    rig.part(c, { stage: 3, delay: 0.1 + i * 0.2, dur: 1.2, kind: 'pop' });
  });

  // Fruit: smooth lathe profile with a tiny dimple and leaf.
  const prof = [
    [0.0, -0.068],
    [0.03, -0.07],
    [0.058, -0.052],
    [0.072, -0.015],
    [0.07, 0.025],
    [0.056, 0.056],
    [0.028, 0.068],
    [0.01, 0.058],
    [0.0, 0.05],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const fruitGeo = new THREE.LatheGeometry(prof, 22);
  const stalkGeo = new THREE.CylinderGeometry(0.005, 0.006, 0.05, 5);
  stalkGeo.translate(0, 0.07, 0);
  const tinyLeaf = leafGeometry(0.06, 0.035, { profile: 'ellipse', bend: 0.1, fold: 0.2, segs: 4 });
  const fruitSpots = [
    [0.22, 0.9, 0.12],
    [-0.2, 0.92, 0.1],
    [0.06, 0.86, 0.22],
    [-0.04, 0.95, -0.22],
  ];
  const fruits = [];
  fruitSpots.forEach(([x, y, z], i) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const f = rig.mesh(fruitGeo, fruitMat);
    const stalk = rig.mesh(stalkGeo, trunkMat, { shadow: false });
    const lf = rig.mesh(tinyLeaf, leafMat, { shadow: false });
    lf.position.y = 0.085;
    lf.rotation.set(-0.5, i, 0);
    g.add(f, stalk, lf);
    g.rotation.z = (r() - 0.5) * 0.3;
    rig.part(g, { stage: 3, delay: 0.9 + i * 0.15, kind: 'bud', full: 4, fullDelay: i * 0.12, budScale: 0.35 });
    fruits.push(g);
    rig.sparkPoints.push(g);
  });

  // Stage 4 — a quiet halo shimmering around the canopy.
  const halo = rig.mesh(
    new THREE.TorusGeometry(0.44, 0.006, 6, 64),
    rig.basic('#ffffff', { transparent: true, opacity: 0 }),
    { shadow: false },
  );
  halo.position.y = 1.05;
  halo.rotation.x = Math.PI / 2 - 0.25;
  rig.sway.add(halo);

  rig.onFrame(({ t, readyT }) => {
    fruits.forEach((f, i) => (f.rotation.x = Math.sin(t * 1.3 + i) * 0.06));
    if (readyT > 0) {
      halo.visible = true;
      halo.material.opacity = Math.min(0.55, readyT * 0.8) * (0.7 + 0.3 * Math.sin(t * 2));
      halo.rotation.z = t * 0.4;
      halo.position.y = 1.05 + Math.sin(t * 1.2) * 0.04;
    } else halo.visible = false;
  });
}
