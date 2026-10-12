/** Decorative objects. Local space, origin on the supporting surface. */
import * as THREE from 'three'
import type { SlotId } from '../data/materials'
import type { PrefabFn } from './prefab'

export const bookStack = (n = 3, w = 0.3): PrefabFn => (b) => {
  let y = 0
  const slots: SlotId[] = ['books', 'paper', 'linen_dark', 'books']
  for (let i = 0; i < n; i++) {
    const h = 0.03 + (i % 2) * 0.015
    b.at(0, y, 0, (i - 1) * 6, () => b.sbox(slots[i % slots.length], 0, 0, 0, w - i * 0.02, h, w * 0.72 - i * 0.015))
    y += h
  }
}

export const bookRow = (len = 0.5): PrefabFn => (b) => {
  let x = -len / 2
  let i = 0
  while (x < len / 2 - 0.02) {
    const t = 0.025 + ((i * 37) % 7) * 0.004
    const h = 0.2 + ((i * 53) % 9) * 0.012
    b.sbox(i % 4 === 0 ? 'linen_dark' : i % 3 === 0 ? 'paper' : 'books', x + t / 2, 0, 0, t, h, 0.16)
    x += t + 0.002
    i++
  }
}

export const vase = (h = 0.3, r = 0.1, slot: SlotId = 'vase'): PrefabFn => (b) => {
  const pts = [new THREE.Vector2(0.001, 0), new THREE.Vector2(r * 0.7, 0), new THREE.Vector2(r, h * 0.35), new THREE.Vector2(r * 0.85, h * 0.7), new THREE.Vector2(r * 0.4, h * 0.92), new THREE.Vector2(r * 0.45, h)]
  b.geo(slot, new THREE.LatheGeometry(pts, 20), undefined, [1, 1])
}

export const glassVase = (h = 0.32): PrefabFn => (b) => {
  b.cyl('frosted', 0, 0, 0, 0.07, 0.08, h, 18)
  for (let i = 0; i < 5; i++) b.at(0, h, 0, i * 70, () => b.cyl('leaf_dark', 0, 0, 0, 0.004, 0.004, 0.35), 12)
}

export const sculptureHead = (): PrefabFn => (b) => {
  b.sbox('books', 0, 0, 0, 0.2, 0.04, 0.16)
  b.cyl('black_metal', 0, 0.04, 0, 0.03, 0.04, 0.12)
  b.sphere('black_metal', 0, 0.26, 0, 0.1, 0.85, 1.2, 0.95)
}

export const candle = (): PrefabFn => (b) => {
  b.cyl('plastic', 0, 0, 0, 0.045, 0.045, 0.1, 16)
  b.cyl('paper', 0, 0.1, 0, 0.04, 0.04, 0.005, 16)
}

/** Acoustic guitar hanging on the wall (back against −Z). */
export const acousticGuitar = (): PrefabFn => (b) => {
  b.sphere('teak', 0, 0.22, 0.05, 0.2, 1, 1, 0.25)
  b.sphere('teak', 0, 0.5, 0.05, 0.155, 1, 1, 0.25)
  b.cyl('black_metal', 0, 0.36, 0.1, 0.045, 0.045, 0.003)
  b.sbox('walnut_fixed', 0, 0.6, 0.05, 0.05, 0.42, 0.025)
  b.sbox('walnut_fixed', 0, 1.02, 0.05, 0.08, 0.16, 0.025)
}

export const electricGuitar = (): PrefabFn => (b) => {
  b.rbox('red', 0, 0.22, 0.03, 0.34, 0.42, 0.045, 0.1)
  b.sbox('walnut_fixed', 0, 0.42, 0.03, 0.05, 0.5, 0.025)
  b.sbox('black_metal', 0, 0.92, 0.03, 0.07, 0.15, 0.025)
  b.sbox('offwhite_fixed', 0, 0.18, 0.055, 0.12, 0.12, 0.004)
}

/** Framed certificate / picture (back against −Z). */
export const frame = (w = 0.35, h = 0.45): PrefabFn => (b) => {
  b.box('black_metal', [-w / 2, -h / 2, 0], [w / 2, h / 2, 0.025])
  b.box('paper', [-w / 2 + 0.03, -h / 2 + 0.03, 0.025], [w / 2 - 0.03, h / 2 - 0.03, 0.027])
  b.box('books', [-w / 2 + 0.08, -h / 2 + 0.12, 0.027], [w / 2 - 0.08, h / 2 - 0.12, 0.028])
}

export const bicycle = (): PrefabFn => (b) => {
  const wheel = new THREE.TorusGeometry(0.33, 0.02, 6, 28)
  for (const z of [-0.52, 0.52]) {
    b.geo('rubber', wheel, new THREE.Matrix4().compose(new THREE.Vector3(0, 0.35, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1)))
    b.cyl('chrome', 0, 0.34, z, 0.03, 0.03, 0.02)
  }
  b.at(0, 0.6, 0, 0, () => b.cbox('red', 0, 0, 0, 0.035, 0.035, 0.75))
  b.at(0, 0.48, -0.25, 0, () => b.cbox('red', 0, 0, 0, 0.035, 0.035, 0.6), 50)
  b.at(0, 0.48, 0.25, 0, () => b.cbox('red', 0, 0, 0, 0.035, 0.035, 0.6), -50)
  b.sbox('rubber', 0, 0.86, -0.3, 0.08, 0.04, 0.24)
  b.sbox('black_metal', 0, 0.9, 0.5, 0.5, 0.025, 0.03)
}

export const storageBox = (w = 0.4, h = 0.25, d = 0.3, slot: SlotId = 'paper'): PrefabFn => (b) => {
  b.sbox(slot, 0, 0, 0, w, h, d)
}

/** Cowhide rug outline (INT p.34). Flat, centred. */
export const cowhideRug = (w = 2.2, l = 2.6): PrefabFn => (b) => {
  const s = new THREE.Shape()
  const pts: [number, number][] = [
    [0, -0.5], [0.18, -0.46], [0.22, -0.52], [0.34, -0.44], [0.3, -0.3], [0.38, -0.12], [0.5, -0.05], [0.44, 0.08], [0.36, 0.14], [0.38, 0.32], [0.48, 0.42], [0.32, 0.5], [0.16, 0.42],
    [0, 0.47], [-0.16, 0.42], [-0.32, 0.5], [-0.48, 0.42], [-0.38, 0.32], [-0.36, 0.14], [-0.44, 0.08], [-0.5, -0.05], [-0.38, -0.12], [-0.3, -0.3], [-0.34, -0.44], [-0.22, -0.52], [-0.18, -0.46],
  ]
  pts.forEach(([x, y], i) => (i ? s.lineTo(x * w, y * l) : s.moveTo(x * w, y * l)))
  const g = new THREE.ShapeGeometry(s, 4)
  g.rotateX(-Math.PI / 2)
  b.geo('game_rug', g, new THREE.Matrix4().makeTranslation(0, 0.006, 0))
}

/** Flat rug with rounded corners. */
export const rug = (slot: SlotId, w: number, l: number): PrefabFn => (b) => {
  b.rbox(slot, 0, 0.006, 0, w, 0.012, l, 0.005, 1)
}

export const basket = (r = 0.2, h = 0.3): PrefabFn => (b) => {
  const g = new THREE.CylinderGeometry(r, r * 0.85, h, 22, 1, true)
  b.geo('wicker_fixed', g, new THREE.Matrix4().makeTranslation(0, h / 2, 0), [1.5, 0.5])
  b.cyl('wicker_fixed', 0, 0, 0, r * 0.85, r * 0.85, 0.01, 22)
}

export const towel = (w = 0.5, h = 0.7): PrefabFn => (b) => {
  b.rbox('linen_white', 0, -h / 2, 0, w, h, 0.03, 0.01)
}

export const bottles = (): PrefabFn => (b) => {
  for (let i = 0; i < 3; i++) {
    b.cyl('red', i * 0.08, 0, 0, 0.03, 0.03, 0.2, 10)
    b.cyl('black_metal', i * 0.08, 0.2, 0, 0.012, 0.03, 0.08, 10)
  }
}

/** Stylised car for scale in the garage (ARQ p.2 / p.5). */
export const car = (): PrefabFn => (b) => {
  b.rbox('graphite_fixed', 0, 0.62, 0, 1.95, 0.62, 4.9, 0.18, 3)
  b.rbox('graphite_fixed', 0, 1.15, -0.25, 1.7, 0.5, 2.8, 0.22, 3)
  b.rbox('smoke_glass', 0, 1.16, -0.25, 1.72, 0.38, 2.6, 0.18, 2)
  for (const [x, z] of [[-0.9, 1.5], [0.9, 1.5], [-0.9, -1.55], [0.9, -1.55]] as [number, number][]) {
    b.at(x, 0.38, z, 0, () => b.cyl('rubber', 0, -0.13, 0, 0.38, 0.38, 0.26, 24), 0, 90)
  }
  b.box('led', [-0.85, 0.75, 2.44], [-0.45, 0.8, 2.46])
  b.box('led', [0.45, 0.75, 2.44], [0.85, 0.8, 2.46])
  b.box('red', [-0.9, 0.85, -2.46], [0.9, 0.9, -2.44])
}
