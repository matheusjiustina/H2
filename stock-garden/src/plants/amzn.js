import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { addSeed, addSprout, leafGeometry, stemGeometry } from './common.js';
import { lerp } from '../utils/math.js';

/** AMZN — "Cargo Bush": sturdy trunk, broad canopy and little futuristic parcels as fruit. */
export function buildAMZN(rig) {
  const st = rig.stock;
  const r = rig.rng;
  rig.heights = [0.14, 0.32, 0.75, 1.1, 1.2];
  addSeed(rig, st);
  addSprout(rig, { stem: '#6a5a3c', leaf: '#5aa878' });

  const barkMat = rig.mat('#5a4633', { metalness: 0.45, roughness: 0.5, flatShading: true });
  const leafMat = rig.mat('#2d6a4b', { roughness: 0.62, side: THREE.DoubleSide, flatShading: true });
  const leafMat2 = rig.mat('#3b7f59', { roughness: 0.6, side: THREE.DoubleSide, flatShading: true });
  const boxMat = rig.mat('#d89a58', { roughness: 0.62, metalness: 0.05 });
  const bandMats = [];

  // Stage 2 — thick trunk, three branches, broad leaves.
  const trunk = rig.mesh(stemGeometry(0.66, 0.1, 0.06, 7), barkMat);
  rig.part(trunk, { stage: 2, delay: 0, dur: 1.2, kind: 'grow' });
  const branchGeo = stemGeometry(0.34, 0.04, 0.024, 6);
  const yaw0 = r() * Math.PI * 2;
  const branchEnds = [];
  for (let i = 0; i < 3; i++) {
    const piv = new THREE.Group();
    piv.position.y = 0.5 + i * 0.05;
    piv.rotation.y = yaw0 + (i * Math.PI * 2) / 3;
    rig.sway.add(piv);
    const b = rig.mesh(branchGeo, barkMat);
    b.rotation.x = 0.85;
    rig.part(b, { parent: piv, stage: 2, delay: 0.4 + i * 0.15, kind: 'grow' });
    branchEnds.push(piv);
  }
  const broad = leafGeometry(0.4, 0.34, { profile: 'round', bend: 0.18, fold: 0.22, segs: 7 });
  const broadS = leafGeometry(0.32, 0.28, { profile: 'round', bend: 0.2, fold: 0.22, segs: 6 });
  for (let i = 0; i < 5; i++) {
    rig.leaf(
      broad,
      i % 2 ? leafMat : leafMat2,
      { y: 0.62 + (i % 2) * 0.05, yaw: yaw0 + (i * Math.PI * 2) / 5, tilt: -0.15 },
      { stage: 2, delay: 0.7 + i * 0.14 },
    );
  }

  // Stage 3 — upper canopy dome.
  for (let i = 0; i < 6; i++) {
    rig.leaf(
      broadS,
      i % 2 ? leafMat2 : leafMat,
      { y: 0.84 + (i % 3) * 0.04, yaw: yaw0 + 0.4 + (i * Math.PI * 2) / 6, tilt: -0.55 },
      { stage: 3, delay: 0.1 + i * 0.12 },
    );
  }
  for (let i = 0; i < 3; i++) {
    rig.leaf(
      broadS,
      leafMat2,
      { y: 1.0, yaw: yaw0 + (i * Math.PI * 2) / 3, tilt: -1.0 },
      { stage: 3, delay: 0.8 + i * 0.1, closed: -1.5 },
    );
  }

  // Parcels hanging from the canopy.
  const boxGeo = new RoundedBoxGeometry(0.13, 0.11, 0.13, 2, 0.018);
  const bandGeo = new THREE.BoxGeometry(0.134, 0.02, 0.134);
  const stringGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4);
  stringGeo.translate(0, -0.06, 0);
  const parcels = [];
  const spots = 5;
  for (let i = 0; i < spots; i++) {
    const a = yaw0 + 0.3 + (i / spots) * Math.PI * 2;
    const rad = 0.3 + (i % 2) * 0.05;
    const hang = new THREE.Group();
    hang.position.set(Math.cos(a) * rad, 0.82 - (i % 2) * 0.05, Math.sin(a) * rad);
    const str = rig.mesh(stringGeo, barkMat, { shadow: false });
    const box = rig.mesh(boxGeo, boxMat);
    box.position.y = -0.17;
    box.rotation.y = r() * 1.5;
    const bm = rig.basic(st.accent);
    bandMats.push(bm);
    const band = rig.mesh(bandGeo, bm, { shadow: false });
    band.position.y = -0.17;
    band.rotation.y = box.rotation.y;
    hang.add(str, box, band);
    rig.part(hang, { stage: 3, delay: 0.9 + i * 0.12, kind: 'bud', full: 4, fullDelay: i * 0.1, budScale: 0.4 });
    parcels.push(hang);
    rig.sparkPoints.push(box);
  }

  const dim = new THREE.Color('#1f6e66');
  const lit = new THREE.Color(st.accent);
  const warm = new THREE.Color('#ffd08a');
  rig.onFrame(({ t, readyT, agitation }) => {
    parcels.forEach((p, i) => {
      p.rotation.z = Math.sin(t * 1.7 + i * 1.3) * (0.07 + agitation * 0.4);
      p.rotation.x = Math.cos(t * 1.3 + i) * (0.05 + agitation * 0.3);
    });
    bandMats.forEach((m, i) => {
      if (readyT > 0) {
        const k = Math.max(0, Math.sin(t * 3 - i * 0.9));
        m.color.copy(lit).lerp(warm, k * 0.8);
      } else m.color.copy(dim).lerp(lit, lerp(0.2, 0.5, (Math.sin(t * 1.5 + i) + 1) / 2));
    });
  });
}
