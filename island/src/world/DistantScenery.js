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

/** Height of an island's surface at local coordinates (same formula as the mesh). */
function islandHeight(o, n, x, z) {
  const nx = x / (o.w * 0.5), nz = z / (o.d * 0.5);
  const r = Math.sqrt(nx * nx + nz * nz) * (1 + 0.25 * n.noise2(nx * 2, nz * 2));
  const base = Math.pow(clamp(1 - r, 0, 1), 1.25);
  const ridge = n.ridge2(nx * 2.2 + 3, nz * 2.2, 5);
  const spires = Math.pow(Math.max(0, n.noise2(nx * 3.5, nz * 3.5)), 2) * 0.6;
  const h = o.h * base * (0.45 + 0.75 * ridge + spires) - 30 * (1 - base);
  return r > 0.92 ? -40 : h;
}

function islandGeometry(o) {
  const n = new Noise(o.seed);
  // ~15 m between vertices is finer than a pixel at these distances
  const seg = Math.round(clamp(o.w / 15, 40, 100));
  const g = new THREE.PlaneGeometry(o.w, o.d, seg, Math.round(seg * o.d / o.w));
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const nx = x / (o.w * 0.5), nz = z / (o.d * 0.5);
    const r = Math.sqrt(nx * nx + nz * nz) * (1 + 0.25 * n.noise2(nx * 2, nz * 2));
    const base = Math.pow(clamp(1 - r, 0, 1), 1.25);
    const h = islandHeight(o, n, x, z);
    p.setY(i, h);
    const rock = smoothstep(0.55, 0.9, h / o.h) * 0.7 + (1 - base) * 0.0;
    const beach = h < 6 && h > -2 ? 1 : 0;
    const g0 = [0.07, 0.14, 0.05], rk = [0.22, 0.21, 0.19], sand = [0.6, 0.55, 0.45];
    const c = beach ? sand : [g0[0] + (rk[0] - g0[0]) * rock, g0[1] + (rk[1] - g0[1]) * rock, g0[2] + (rk[2] - g0[2]) * rock];
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // drop triangles lying entirely under deep water: the ocean hides them anyway
  const idx = g.index.array;
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (Math.max(p.getY(a), p.getY(b), p.getY(c)) > -12) keep.push(a, b, c);
  }
  g.setIndex(keep);
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
    this.noises = ISLANDS.map((o) => new Noise(o.seed));
  }

  /** Surface height of the far islands at a world point (-50 = open sea), for collisions. */
  heightAt(x, z) {
    let best = -50;
    for (let i = 0; i < ISLANDS.length; i++) {
      const o = ISLANDS[i];
      const dx = x - o.x, dz = z - o.z;
      if (Math.abs(dx) > o.w * 0.6 + o.d * 0.2 || Math.abs(dz) > o.w * 0.6 + o.d * 0.2) continue;
      // undo the mesh's rotation about Y
      const c = Math.cos(o.rot), s = Math.sin(o.rot);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) > o.w / 2 || Math.abs(lz) > o.d / 2) continue;
      best = Math.max(best, islandHeight(o, this.noises[i], lx, lz));
    }
    return best;
  }

  update() {}
}
