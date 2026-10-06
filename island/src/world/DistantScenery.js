import * as THREE from 'three';
import { patchMaterial } from '../core/MaterialPatch.js';
import { LAYER } from '../core/Shared.js';
import { Noise, smoothstep, clamp } from '../utils/MathUtils.js';

// Far volcanic islands on the horizon. Atmospheric perspective (shared fog) makes
// them progressively bluer with distance.
const ISLANDS = [
  { x: -1500, z: -2350, w: 1400, d: 900, h: 420, seed: 3, rot: 0.3 },
  { x: 420, z: -3300, w: 1800, d: 1000, h: 300, seed: 7, rot: -0.1 },
  { x: 2300, z: -1900, w: 1100, d: 900, h: 520, seed: 11, rot: 0.8 },
  { x: 2750, z: 900, w: 1300, d: 1100, h: 260, seed: 13, rot: 1.2 },
  { x: -2700, z: 400, w: 1200, d: 1000, h: 340, seed: 17, rot: -0.6 },
  { x: -900, z: -1350, w: 260, d: 180, h: 60, seed: 19, rot: 0.2 },
];

function islandGeometry(o) {
  const n = new Noise(o.seed);
  const seg = 110;
  const g = new THREE.PlaneGeometry(o.w, o.d, seg, Math.round(seg * o.d / o.w));
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const nx = x / (o.w * 0.5), nz = z / (o.d * 0.5);
    const r = Math.sqrt(nx * nx + nz * nz) * (1 + 0.25 * n.noise2(nx * 2, nz * 2));
    const base = Math.pow(clamp(1 - r, 0, 1), 1.25);
    const ridge = n.ridge2(nx * 2.2 + 3, nz * 2.2, 5);
    const spires = Math.pow(Math.max(0, n.noise2(nx * 3.5, nz * 3.5)), 2) * 0.6;
    let h = o.h * base * (0.45 + 0.75 * ridge + spires) - 30 * (1 - base);
    if (r > 0.92) h = -40;
    p.setY(i, h);
    const rock = smoothstep(0.55, 0.9, h / o.h) * 0.7 + (1 - base) * 0.0;
    const beach = h < 6 && h > -2 ? 1 : 0;
    const g0 = [0.07, 0.14, 0.05], rk = [0.22, 0.21, 0.19], sand = [0.6, 0.55, 0.45];
    const c = beach ? sand : [g0[0] + (rk[0] - g0[0]) * rock, g0[1] + (rk[1] - g0[1]) * rock, g0[2] + (rk[2] - g0[2]) * rock];
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export class DistantScenery {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'distant';
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    patchMaterial(mat, { wet: 0, canopy: false, caustics: false, key: 'distant' });
    for (const o of ISLANDS) {
      const m = new THREE.Mesh(islandGeometry(o), mat);
      m.position.set(o.x, 0, o.z);
      m.rotation.y = o.rot;
      m.receiveShadow = false;
      m.castShadow = false;
      m.layers.set(LAYER.WORLD);
      m.layers.enable(LAYER.REFLECT_LITE);
      this.group.add(m);
    }
    scene.add(this.group);
  }

  update() {}
}
