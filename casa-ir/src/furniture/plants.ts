/** Procedural vegetation: palms, trees, tropical foliage, indoor plants. */
import * as THREE from 'three'
import type { GeoBuilder } from '../architecture/builder'
import type { SlotId } from '../data/materials'
import { rockGeometry } from '../architecture/shapes'
import type { PrefabFn } from './prefab'

const leafCache = new Map<string, THREE.BufferGeometry>()
/** Flat leaf blade in the XY plane, base at origin, pointing +Y. */
export function leafGeometry(len: number, wid: number, notch = 0) {
  const key = `${len}|${wid}|${notch}`
  const hit = leafCache.get(key)
  if (hit) return hit
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.bezierCurveTo(wid * 0.9, len * 0.15, wid * 0.75, len * 0.75, 0, len)
  s.bezierCurveTo(-wid * 0.75, len * 0.75, -wid * 0.9, len * 0.15, 0, 0)
  const g = new THREE.ShapeGeometry(s, 6)
  // gentle fold along the midrib
  const p = g.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    p.setZ(i, Math.abs(x) * 0.25 - Math.sin((y / len) * Math.PI) * len * 0.06 + notch * 0)
  }
  g.computeVertexNormals()
  // UV across the blade
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / (wid * 2) + 0.5, p.getY(i) / len)
  leafCache.set(key, g)
  return g
}

let seed = 1
function rnd() {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

function addLeaf(b: GeoBuilder, slot: SlotId, base: THREE.Vector3, yaw: number, pitch: number, roll: number, len: number, wid: number) {
  const m = new THREE.Matrix4().compose(base, new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ')), new THREE.Vector3(1, 1, 1))
  b.geo(slot, leafGeometry(len, wid), m)
}

/** Royal palm (ARQ p.7/p.10): smooth grey trunk, green crownshaft, arching fronds. */
export const palm = (height: number, s = 3): PrefabFn => (b) => {
  seed = s * 7919
  const trunkH = height - 1.6
  const lean = (rnd() - 0.5) * 0.05
  const segs = 8
  for (let i = 0; i < segs; i++) {
    const y = (trunkH / segs) * i
    const r0 = THREE.MathUtils.lerp(0.2, 0.13, i / segs)
    const r1 = THREE.MathUtils.lerp(0.2, 0.13, (i + 1) / segs)
    b.at(lean * y, y, 0, 0, () => b.cyl('palm_trunk', 0, 0, 0, r1, r0, trunkH / segs + 0.01, 12))
  }
  const top = new THREE.Vector3(lean * trunkH, trunkH, 0)
  b.at(top.x, top.y, 0, 0, () => b.cyl('leaf', 0, 0, 0, 0.11, 0.14, 1.1, 12))
  const crown = top.clone().add(new THREE.Vector3(0, 1.1, 0))
  const fronds = 13
  for (let f = 0; f < fronds; f++) {
    const yaw = (f / fronds) * Math.PI * 2 + rnd() * 0.3
    const up = f % 3 === 0 ? 0.9 : f % 3 === 1 ? 0.45 : 0.1
    const L = 2.4 + rnd() * 0.7
    const N = 22
    let p = crown.clone()
    let ang = up
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
    for (let i = 0; i < N; i++) {
      const t = i / N
      const step = L / N
      ang -= 0.075 + t * 0.03
      const d = dir.clone().multiplyScalar(Math.cos(ang) * step).add(new THREE.Vector3(0, Math.sin(ang) * step, 0))
      const q = p.clone().add(d)
      // rachis
      b.quad('leaf_dark', [
        [p.x - side.x * 0.015, p.y, p.z - side.z * 0.015],
        [p.x + side.x * 0.015, p.y, p.z + side.z * 0.015],
        [q.x + side.x * 0.01, q.y, q.z + side.z * 0.01],
        [q.x - side.x * 0.01, q.y, q.z - side.z * 0.01],
      ], [[0, 0], [1, 0], [1, 1], [0, 1]])
      if (t > 0.08) {
        const ll = 0.62 * Math.sin(Math.PI * Math.min(1, t * 1.05)) + 0.12
        for (const sg of [-1, 1]) {
          const tipDir = side.clone().multiplyScalar(sg * 0.75).add(dir.clone().multiplyScalar(0.55)).add(new THREE.Vector3(0, -0.45, 0)).normalize()
          const tip = p.clone().add(tipDir.multiplyScalar(ll))
          const w = 0.035
          b.quad('leaf', [
            [p.x, p.y, p.z],
            [p.x + d.x * 0.6, p.y + d.y * 0.6 + w, p.z + d.z * 0.6],
            [tip.x, tip.y, tip.z],
            [tip.x - d.x * 0.3, tip.y - d.y * 0.3, tip.z - d.z * 0.3],
          ], [[0, 0], [0.2, 0.1], [1, 1], [0.8, 0.9]])
        }
      }
      p = q
    }
  }
}

/** Rounded canopy tree (central garden / west garden, ARQ p.6/p.12). */
export const canopyTree = (scale = 1, s = 5): PrefabFn => (b) => {
  seed = s * 104729
  const h = 2.2 * scale
  b.cyl('trunk', 0, 0, 0, 0.07 * scale, 0.11 * scale, h, 10)
  const branches = 4
  for (let i = 0; i < branches; i++) {
    const yaw = (i / branches) * 360 + rnd() * 40
    b.at(0, h * 0.75, 0, yaw, () => b.cyl('trunk', 0, 0, 0, 0.03 * scale, 0.06 * scale, 1.1 * scale, 8), 35 + rnd() * 15)
  }
  const blobs = 22
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 * 3.1
    const r = (0.35 + rnd() * 0.85) * scale
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const y = h + (0.35 + rnd() * 1.2) * scale
    const sz = (0.42 + rnd() * 0.3) * scale
    b.geo('leaf_olive', rockGeometry(10 + (i % 5)), new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(), rnd() * 6, 0)), new THREE.Vector3(sz, sz * 1.25, sz)), [2, 2])
  }
  b.geo('leaf_olive', rockGeometry(17), new THREE.Matrix4().compose(new THREE.Vector3(0, h + 1.35 * scale, 0), new THREE.Quaternion(), new THREE.Vector3(1.1 * scale, 1.0 * scale, 1.1 * scale)), [2, 2])
}

/** Banana / alocasia / strelitzia clump (ARQ p.10, INT p.13). */
export const tropicalClump = (height = 1.8, s = 1, slot: SlotId = 'leaf'): PrefabFn => (b) => {
  seed = s * 3571 + 11
  const n = 7
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2 + rnd() * 0.5
    const lean = 0.15 + rnd() * 0.35
    const stemH = height * (0.45 + rnd() * 0.35)
    const base = new THREE.Vector3((rnd() - 0.5) * 0.25, 0, (rnd() - 0.5) * 0.25)
    const top = base.clone().add(new THREE.Vector3(Math.sin(yaw) * lean * stemH * 0.5, stemH, Math.cos(yaw) * lean * stemH * 0.5))
    const mid = base.clone().lerp(top, 0.5)
    const len = top.distanceTo(base)
    const m = new THREE.Matrix4().lookAt(base, top, new THREE.Vector3(0, 0, 1))
    const q = new THREE.Quaternion().setFromRotationMatrix(m).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)))
    b.geo('leaf_dark', new THREE.CylinderGeometry(0.015, 0.025, len, 5), new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)))
    addLeaf(b, i % 3 === 0 ? 'leaf_light' : slot, top, yaw, -0.35 - rnd() * 0.5, (rnd() - 0.5) * 0.4, height * (0.42 + rnd() * 0.15), height * 0.14)
  }
}

/** Monstera / philodendron mound (front planter, ARQ p.4). */
export const monstera = (s = 1): PrefabFn => (b) => {
  seed = s * 7907
  for (let i = 0; i < 11; i++) {
    const yaw = (i / 11) * Math.PI * 2 + rnd() * 0.4
    const r = 0.1 + rnd() * 0.25
    const base = new THREE.Vector3(Math.sin(yaw) * r, 0.25 + rnd() * 0.35, Math.cos(yaw) * r)
    addLeaf(b, i % 4 === 0 ? 'leaf_light' : 'leaf', base, yaw, -0.9 - rnd() * 0.5, (rnd() - 0.5) * 0.5, 0.5 + rnd() * 0.25, 0.32)
  }
}

/** Fiddle-leaf fig in a ceramic pot (INT p.7/p.11). */
export const ficus = (height = 1.7, potSlot: SlotId = 'vase'): PrefabFn => (b) => {
  seed = 4242
  b.cyl(potSlot, 0, 0, 0, 0.2, 0.15, 0.38, 20)
  b.cyl('soil', 0, 0.36, 0, 0.18, 0.18, 0.02, 16)
  b.cyl('trunk', 0, 0.37, 0, 0.02, 0.03, height - 0.5, 6)
  for (let i = 0; i < 22; i++) {
    const t = i / 22
    const y = 0.75 + t * (height - 0.85)
    const yaw = i * 2.4
    const base = new THREE.Vector3(Math.sin(yaw) * 0.05, y, Math.cos(yaw) * 0.05)
    addLeaf(b, i % 5 === 0 ? 'leaf_light' : 'leaf_dark', base, yaw, -0.6 + rnd() * 0.5, 0, 0.26 + rnd() * 0.08, 0.2)
  }
}

/** Trailing pothos for shelves (INT p.13/p.20/p.25). Hangs below y=0. */
export const pothos = (drop = 0.6): PrefabFn => (b) => {
  seed = 999
  b.cyl('vase', 0, 0, 0, 0.09, 0.07, 0.14, 14)
  for (let s = 0; s < 6; s++) {
    const yaw = (s / 6) * Math.PI * 2
    const len = drop * (0.6 + rnd() * 0.6)
    const n = 7
    for (let i = 0; i < n; i++) {
      const t = i / n
      const p = new THREE.Vector3(Math.sin(yaw) * (0.09 + t * 0.05), 0.12 - t * len, Math.cos(yaw) * (0.09 + t * 0.05))
      addLeaf(b, i % 3 ? 'leaf' : 'leaf_light', p, yaw + rnd() * 1.5, -1.2 + rnd() * 0.8, rnd() - 0.5, 0.08, 0.06)
    }
  }
}

/** Small potted plant (decor). */
export const smallPlant = (potSlot: SlotId = 'vase'): PrefabFn => (b) => {
  seed = 777
  b.cyl(potSlot, 0, 0, 0, 0.08, 0.06, 0.12, 14)
  for (let i = 0; i < 9; i++) addLeaf(b, 'leaf', new THREE.Vector3(0, 0.12, 0), (i / 9) * Math.PI * 2, -0.5 - rnd() * 0.5, 0, 0.16, 0.07)
}

/** Low shrub / ground cover blob. */
export const shrub = (r = 0.5, s = 1): PrefabFn => (b) => {
  seed = s * 31
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2
    b.geo('leaf_dark', rockGeometry(20 + i), new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * r * 0.4, r * 0.35, Math.sin(a) * r * 0.4), new THREE.Quaternion(), new THREE.Vector3(r * 0.7, r * 0.6, r * 0.7)), [1, 1])
  }
}
