import * as THREE from 'three';
import { addSeed, addSprout, leafGeometry, tubeGeometry } from './common.js';
import { glowSprite } from '../world/materials.js';

/** TSLA — "Voltage Vine": zig-zag graphite branches, energy pulses, a tiny coil crown. */
export function buildTSLA(rig) {
  const st = rig.stock;
  const r = rig.rng;
  rig.heights = [0.14, 0.32, 0.9, 1.35, 1.5];
  addSeed(rig, st);
  addSprout(rig, { stem: '#6b2a33', leaf: '#d8475a' });

  const trunkMat = rig.mat('#2a2e36', { metalness: 0.85, roughness: 0.28 });
  const bladeMat = rig.mat('#a51f2f', { metalness: 0.45, roughness: 0.32, side: THREE.DoubleSide, flatShading: true });
  const jointMat = rig.basic('#ff5a6b');
  const energyMat = rig.basic('#bff0ff');

  // Stage 2 — lightning-shaped trunk.
  const trunkPts = [
    [0, 0, 0],
    [0.07, 0.24, 0.0],
    [-0.06, 0.46, 0.03],
    [0.06, 0.7, -0.02],
    [-0.01, 0.92, 0],
  ];
  const trunkGeo = tubeGeometry(trunkPts, 0.03, { curve: 'sharp', segs: 40, radial: 6 });
  const trunk = rig.mesh(trunkGeo, trunkMat);
  rig.part(trunk, { stage: 2, delay: 0, dur: 1.2, kind: 'grow' });
  const pathPts = trunkGeo.userData.path.getSpacedPoints(120);

  const jointGeo = new THREE.SphereGeometry(0.038, 10, 8);
  trunkPts.slice(1, 4).forEach(([x, y, z], i) => {
    const j = rig.mesh(jointGeo, jointMat, { shadow: false });
    j.position.set(x, y, z);
    rig.part(j, { stage: 2, delay: 0.5 + i * 0.2, kind: 'pop' });
  });

  const blade = leafGeometry(0.46, 0.09, { profile: 'blade', bend: 0.04, fold: 0.5, segs: 6 });
  const bladeS = leafGeometry(0.34, 0.075, { profile: 'blade', bend: 0.03, fold: 0.5, segs: 5 });
  const yaw0 = r() * Math.PI * 2;
  [
    [0.24, 0.3, -0.55],
    [0.46, 3.3, -0.6],
    [0.6, 1.6, -0.7],
    [0.7, 4.8, -0.75],
  ].forEach(([y, yaw, tilt], i) => {
    rig.leaf(blade, bladeMat, { y, yaw: yaw0 + yaw, tilt }, { stage: 2, delay: 0.5 + i * 0.2 });
  });

  // Stage 3 — side zig-zag branches with blades, coil + orb bud.
  const branch = (pts) => {
    const [ox, oy, oz] = pts[0];
    const m = rig.mesh(
      tubeGeometry(
        pts.map(([x, y, z]) => [x - ox, y - oy, z - oz]),
        0.018,
        { curve: 'sharp', segs: 24, radial: 5 },
      ),
      trunkMat,
    );
    m.position.set(ox, oy, oz);
    return m;
  };
  const sideA = branch([
    [0.06, 0.7, -0.02],
    [0.2, 0.82, 0.02],
    [0.22, 0.98, 0.0],
    [0.32, 1.08, 0.03],
  ]);
  const sideB = branch([
    [-0.06, 0.46, 0.03],
    [-0.2, 0.6, 0.05],
    [-0.22, 0.76, 0.02],
    [-0.33, 0.86, 0.06],
  ]);
  rig.part(sideA, { stage: 3, delay: 0, kind: 'grow', dur: 1.2 });
  rig.part(sideB, { stage: 3, delay: 0.2, kind: 'grow', dur: 1.2 });
  rig.leaf(bladeS, bladeMat, { x: 0.32, y: 1.08, z: 0.03, yaw: 1.2, tilt: -0.8 }, { stage: 3, delay: 0.6 });
  rig.leaf(bladeS, bladeMat, { x: -0.33, y: 0.86, z: 0.06, yaw: -1.4, tilt: -0.7 }, { stage: 3, delay: 0.75 });

  // Helix coil
  const coilPts = [];
  for (let i = 0; i <= 60; i++) {
    const a = i * 0.42;
    coilPts.push(new THREE.Vector3(Math.cos(a) * 0.07, 0.94 + i * 0.0055, Math.sin(a) * 0.07));
  }
  const coil = rig.mesh(tubeGeometry(coilPts, 0.009, { segs: 120, radial: 5 }), rig.mat('#c98552', { metalness: 1, roughness: 0.25 }));
  rig.part(coil, { stage: 3, delay: 0.4, dur: 1.3, kind: 'grow' });
  const rod = rig.mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 6), trunkMat);
  rod.position.y = 1.1;
  rig.part(rod, { stage: 3, delay: 0.3, kind: 'pop' });

  const orb = new THREE.Group();
  orb.position.y = 1.36;
  const orbCore = rig.mesh(new THREE.SphereGeometry(0.08, 18, 14), energyMat, { shadow: false });
  const orbGlow = glowSprite(st.accent, 0.9, 0.7);
  orb.add(orbCore, orbGlow);
  rig.part(orb, { stage: 3, delay: 1.1, kind: 'bud', full: 4, budScale: 0.4 });
  rig.sparkPoints.push(orb);

  // Stage 4 — energy pulses racing up the trunk + crackling arcs.
  const pulses = [];
  const pulseGeo = new THREE.SphereGeometry(0.03, 8, 6);
  for (let i = 0; i < 3; i++) {
    const p = rig.mesh(pulseGeo, energyMat, { shadow: false });
    const g = glowSprite(st.accent, 0.22, 0.9);
    p.add(g);
    p.visible = false;
    rig.sway.add(p);
    pulses.push(p);
  }
  const arcMat = new THREE.LineBasicMaterial({ color: '#d6f6ff', transparent: true, opacity: 0.9 });
  rig.ownedMaterials.add(arcMat);
  const arcs = [0, 1].map(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(7 * 3), 3));
    const l = new THREE.Line(geo, arcMat);
    l.visible = false;
    l.frustumCulled = false;
    rig.sway.add(l);
    return l;
  });
  let arcTimer = 0;
  const growPulse = (stage) => (stage >= 4 ? 0.7 : stage >= 2 ? 0.25 : 0);

  rig.onFrame(({ t, dt, stage, readyT }) => {
    const speed = growPulse(stage);
    pulses.forEach((p, i) => {
      if (!speed || !trunk.visible || trunk.scale.y < 0.95) {
        p.visible = false;
        return;
      }
      if (stage < 4 && i > 0) {
        p.visible = false;
        return;
      }
      const u = (t * speed + i / 3) % 1;
      p.visible = true;
      p.position.copy(pathPts[Math.floor(u * (pathPts.length - 1))]);
      p.scale.setScalar(Math.sin(u * Math.PI) * 1.1 + 0.1);
    });
    orbCore.scale.setScalar(1 + Math.sin(t * 9) * 0.05);
    orbGlow.material.opacity = readyT > 0 ? 0.65 + Math.random() * 0.35 : 0.45;
    arcTimer -= dt;
    if (readyT > 0 && arcTimer <= 0) {
      arcTimer = 0.07 + Math.random() * 0.12;
      arcs.forEach((l, k) => {
        const show = Math.random() < 0.55;
        l.visible = show;
        if (!show) return;
        const a = l.geometry.attributes.position;
        const ang = Math.random() * Math.PI * 2;
        const end = new THREE.Vector3(Math.cos(ang) * 0.22, 1.2 + Math.random() * 0.1 - k * 0.1, Math.sin(ang) * 0.22);
        for (let i = 0; i < 7; i++) {
          const u = i / 6;
          const jit = i === 0 || i === 6 ? 0 : 0.035;
          a.setXYZ(
            i,
            end.x * u + (Math.random() - 0.5) * jit,
            1.36 + (end.y - 1.36) * u + (Math.random() - 0.5) * jit,
            end.z * u + (Math.random() - 0.5) * jit,
          );
        }
        a.needsUpdate = true;
      });
    } else if (readyT <= 0) arcs.forEach((l) => (l.visible = false));
  });
}
