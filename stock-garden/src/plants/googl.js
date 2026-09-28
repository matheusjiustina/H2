import * as THREE from 'three';
import { addSeed, addSprout, leafGeometry, tubeGeometry } from './common.js';
import { glowSprite } from '../world/materials.js';
import { clamp, ease, lerp } from '../utils/math.js';

/** GOOGL — "Spectrum Bloom": four-colour leaves and a blooming flower with orbiting orbs. */
export function buildGOOGL(rig) {
  const st = rig.stock;
  const r = rig.rng;
  const pal = st.palette;
  rig.heights = [0.14, 0.32, 0.85, 1.25, 1.45];
  addSeed(rig, { color: '#e8edf3', accent: pal[0] });
  addSprout(rig, { stem: '#8fb0a0', leaf: '#6fc48f' });

  const stemMat = rig.mat('#e6ebf0', { metalness: 0.4, roughness: 0.28 });
  const leafMats = pal.map((c) => rig.mat(c, { roughness: 0.35, metalness: 0.15, side: THREE.DoubleSide }));

  // Stage 2 — slim stem + four leaves, one per colour.
  const stem = rig.mesh(
    tubeGeometry(
      [
        [0, 0, 0],
        [-0.04, 0.35, 0.02],
        [0.04, 0.7, -0.02],
        [0, 1.02, 0],
      ],
      0.024,
      { radial: 8 },
    ),
    stemMat,
  );
  rig.part(stem, { stage: 2, delay: 0, dur: 1.3, kind: 'grow' });
  const leafG = leafGeometry(0.34, 0.16, { profile: 'ellipse', bend: 0.14, fold: 0.3 });
  const yaw0 = r() * Math.PI * 2;
  for (let i = 0; i < 4; i++) {
    rig.leaf(
      leafG,
      leafMats[i],
      { y: 0.28 + i * 0.12, yaw: yaw0 + i * (Math.PI / 2) + 0.3, tilt: -0.35 },
      { stage: 2, delay: 0.45 + i * 0.2 },
    );
  }

  // Stage 3 — closed flower bud (petals open further when ready).
  const head = new THREE.Group();
  head.position.y = 1.02;
  rig.sway.add(head);
  const petalG = leafGeometry(0.28, 0.22, { profile: 'petal', bend: -0.18, fold: 0.12, segs: 7 });
  const petals = [];
  for (let i = 0; i < 4; i++) {
    const m = rig.leaf(
      petalG,
      leafMats[i],
      { parent: head, yaw: yaw0 + i * (Math.PI / 2), tilt: -1.05 },
      { stage: 3, delay: 0.2 + i * 0.12, closed: -1.45, flutter: 0.4 },
    );
    petals.push(m);
  }
  const center = new THREE.Group();
  center.position.y = 0.05;
  const cMesh = rig.mesh(new THREE.SphereGeometry(0.065, 18, 14), rig.mat('#ffffff', { roughness: 0.2, emissive: '#ffffff', emissiveIntensity: 0.35 }));
  const cGlow = glowSprite('#ffffff', 0.5, 0.4);
  center.add(cMesh, cGlow);
  rig.part(center, { parent: head, stage: 3, delay: 0.7, kind: 'pop' });
  rig.sparkPoints.push(center);

  // Stage 4 — four orbs orbiting on tilted rings.
  const orbitRoot = new THREE.Group();
  orbitRoot.position.y = 1.1;
  rig.sway.add(orbitRoot);
  const orbGeo = new THREE.SphereGeometry(0.042, 14, 10);
  const orbits = pal.map((c, i) => {
    const ring = new THREE.Group();
    ring.rotation.set(0.9 + i * 0.35, i * 0.8, 0.2 * i);
    orbitRoot.add(ring);
    const orb = rig.mesh(orbGeo, rig.basic(c), { shadow: false });
    orb.position.x = 0.34;
    rig.part(orb, { parent: ring, stage: 4, delay: 0.2 + i * 0.12, kind: 'pop' });
    rig.sparkPoints.push(orb);
    return ring;
  });
  const track = rig.mesh(
    new THREE.TorusGeometry(0.34, 0.003, 4, 60),
    rig.basic('#ffffff', { transparent: true, opacity: 0.25 }),
    { shadow: false },
  );
  orbits.forEach((ring) => {
    const tr = track.clone();
    tr.rotation.x = Math.PI / 2;
    rig.part(tr, { parent: ring, stage: 4, delay: 0.1, kind: 'pop' });
  });

  rig.onFrame(({ t, dt, readyT }) => {
    const bloom = ease.outBack(clamp(readyT / 1.2), 1.4);
    if (readyT > 0) {
      petals.forEach((p, i) => (p.rotation.x = lerp(p.rotation.x, -0.25 + Math.sin(t * 1.5 + i) * 0.04, bloom)));
    }
    head.rotation.y += dt * 0.15;
    orbits.forEach((ring, i) => (ring.rotation.z += dt * (0.9 + i * 0.2)));
    cGlow.material.opacity = 0.35 + (readyT > 0 ? 0.3 + Math.sin(t * 3) * 0.1 : 0);
  });
}
