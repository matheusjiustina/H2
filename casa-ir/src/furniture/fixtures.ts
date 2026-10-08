/** Light fixtures, bathroom fittings and appliances. Local space. */
import * as THREE from 'three'
import type { SlotId } from '../data/materials'
import type { PrefabFn } from './prefab'

/** INT p.5–9: cluster of amber glass "drop" pendants hanging from `ceil`. */
export const dropCluster = (ceil: number): PrefabFn => (b) => {
  const drops: [number, number, number][] = [
    [0, 0.0, ceil - 1.25],
    [0.32, 0.18, ceil - 1.9],
    [-0.28, 0.24, ceil - 2.35],
    [0.05, -0.3, ceil - 2.85],
    [-0.12, 0.42, ceil - 1.55],
  ]
  b.cyl('black_metal', 0, ceil - 0.03, 0, 0.12, 0.12, 0.03)
  for (const [x, z, y] of drops) {
    b.cyl('black_metal', x, y + 0.3, z, 0.004, 0.004, ceil - y - 0.3)
    b.cyl('brass', x, y + 0.28, z, 0.025, 0.03, 0.05)
    b.sphere('glass_amber', x, y + 0.1, z, 0.16, 1, 1.25, 1, 20)
    b.sphere('bulb', x, y + 0.1, z, 0.035, 1, 1.4, 1, 10)
  }
}

/** INT p.19–23: amber glass globe pendant on a brass rod. */
export const globePendant = (drop: number): PrefabFn => (b) => {
  b.cyl('brass', 0, -0.02, 0, 0.05, 0.05, 0.02)
  b.cyl('brass', 0, -drop, 0, 0.004, 0.004, drop)
  b.sphere('glass_amber', 0, -drop - 0.08, 0, 0.09, 1, 1, 1, 18)
  b.sphere('bulb', 0, -drop - 0.08, 0, 0.03, 1, 1.3, 1, 8)
}

/** INT p.25–28: woven natural fibre cone pendant. */
export const wickerCone = (drop: number): PrefabFn => (b) => {
  b.cyl('black_metal', 0, -drop + 0.3, 0, 0.004, 0.004, drop - 0.3)
  const g = new THREE.CylinderGeometry(0.03, 0.27, 0.42, 28, 1, true)
  b.geo('wicker_fixed', g, new THREE.Matrix4().makeTranslation(0, -drop + 0.1, 0), [1.6, 0.6])
  b.sphere('bulb', 0, -drop - 0.03, 0, 0.04)
}

/** INT p.35: black drum pendant with diffuser. */
export const drumPendant = (drop: number): PrefabFn => (b) => {
  b.cyl('black_metal', 0, -drop + 0.3, 0, 0.004, 0.004, drop - 0.3)
  const g = new THREE.CylinderGeometry(0.28, 0.36, 0.26, 40, 1, true)
  b.geo('linen_dark', g, new THREE.Matrix4().makeTranslation(0, -drop + 0.15, 0), [2, 0.3])
  b.cyl('lamp_shade', 0, -drop + 0.03, 0, 0.35, 0.35, 0.01, 40)
}

/** INT p.24–27: ceiling fan with palm/rattan blades. */
export const ceilingFan = (): PrefabFn => (b) => {
  b.cyl('black_metal', 0, -0.32, 0, 0.012, 0.012, 0.32)
  b.cyl('black_metal', 0, -0.42, 0, 0.11, 0.09, 0.12)
  for (let i = 0; i < 5; i++) {
    b.at(0, -0.37, 0, i * 72, () => {
      b.cbox('black_metal', 0, 0, 0.18, 0.03, 0.012, 0.2)
      b.sphere('wicker_fixed', 0, 0, 0.55, 0.36, 0.28, 0.035, 1, 14)
    })
  }
}

/** Recessed downlight (visible trim + emissive lens). Facing down at y=0. */
export const downlight = (): PrefabFn => (b) => {
  b.cyl('black_metal', 0, -0.006, 0, 0.045, 0.045, 0.006, 16)
  b.cyl('led', 0, -0.008, 0, 0.03, 0.03, 0.003, 16)
}

/** INT p.6: cylindrical pendant spot (pergola). */
export const cylinderSpot = (drop: number): PrefabFn => (b) => {
  b.cyl('black_metal', 0, -drop, 0, 0.005, 0.005, drop)
  b.cyl('external_facade_secondary', 0, -drop - 0.2, 0, 0.055, 0.055, 0.2, 18)
  b.cyl('led', 0, -drop - 0.205, 0, 0.04, 0.04, 0.006, 16)
}

/** INT p.58: brass table lamp with white drum shade. */
export const tableLamp = (metal: SlotId): PrefabFn => (b) => {
  b.cyl(metal, 0, 0, 0, 0.07, 0.08, 0.025)
  b.cyl(metal, 0, 0.025, 0, 0.012, 0.012, 0.33)
  b.cyl(metal, 0.03, 0.025, 0, 0.006, 0.006, 0.3)
  const g = new THREE.CylinderGeometry(0.12, 0.15, 0.22, 28, 1, true)
  b.geo('lamp_shade', g, new THREE.Matrix4().makeTranslation(0, 0.43, 0), [0.9, 0.22])
  b.sphere('bulb', 0, 0.38, 0, 0.03)
}

/** INT p.41: brass wall sconce with frosted cylinder. */
export const sconce = (): PrefabFn => (b) => {
  b.cbox('brass', 0, 0, 0.01, 0.06, 0.26, 0.02)
  b.cbox('brass', 0, 0, 0.05, 0.02, 0.02, 0.08)
  b.cyl('lamp_shade', 0, -0.14, 0.1, 0.035, 0.035, 0.28, 16)
}

// ── Bathroom ──────────────────────────────────────────────────────────────
/** Wall-hung WC, back against −Z. */
export const toilet = (): PrefabFn => (b) => {
  b.rbox('ceramic', 0, 0.36, -0.1, 0.36, 0.3, 0.2, 0.06)
  const g = new THREE.SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)
  b.geo('ceramic', g, new THREE.Matrix4().compose(new THREE.Vector3(0, 0.42, 0.12), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0)), new THREE.Vector3(0.9, 0.9, 1.35)), [1, 1])
  b.rbox('ceramic', 0, 0.43, 0.1, 0.36, 0.035, 0.52, 0.03)
}

export const vesselSink = (w = 0.5, d = 0.36): PrefabFn => (b) => {
  b.rbox('ceramic', 0, 0.07, 0, w, 0.14, d, 0.04)
  b.rbox('chrome', 0, 0.141, 0, w - 0.06, 0.002, d - 0.06, 0.02)
}

/**
 * Semi-recessed basin (INT p.41): a slim ceramic rim 4 cm above the counter
 * with the bowl sunk into it. Origin at counter level; the counter needs a
 * cut-out of (w − 0.06) × (d − 0.06).
 */
export const semiRecessedSink = (w = 0.48, d = 0.36): PrefabFn => (b) => {
  const rim = 0.04
  const shape = new THREE.Shape()
  const r = 0.05
  shape.moveTo(-w / 2 + r, -d / 2)
  shape.lineTo(w / 2 - r, -d / 2)
  shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r)
  shape.lineTo(w / 2, d / 2 - r)
  shape.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2)
  shape.lineTo(-w / 2 + r, d / 2)
  shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r)
  shape.lineTo(-w / 2, -d / 2 + r)
  shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2)
  const hole = new THREE.Path()
  hole.absellipse(0, 0, w / 2 - 0.03, d / 2 - 0.03, 0, Math.PI * 2, true, 0)
  shape.holes.push(hole)
  const ring = new THREE.ExtrudeGeometry(shape, { depth: rim, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 32 })
  b.geo('ceramic', ring, new THREE.Matrix4().makeRotationX(-Math.PI / 2))
  // bowl: lathe profile traced from the rim to the centre (normals face up/in)
  const prof = [
    [1, rim],
    [0.96, rim - 0.035],
    [0.82, rim - 0.085],
    [0.55, rim - 0.115],
    [0.001, rim - 0.13],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  const bowl = new THREE.LatheGeometry(prof, 40)
  b.geo('ceramic', bowl, new THREE.Matrix4().makeScale(w / 2 - 0.03, 1, d / 2 - 0.03))
  b.cyl('chrome', 0, rim - 0.129, 0, 0.022, 0.022, 0.002, 16)
}

export const faucet = (metal: SlotId, tall = false): PrefabFn => (b) => {
  const h = tall ? 0.32 : 0.16
  b.cyl(metal, 0, 0, 0, 0.022, 0.022, h)
  b.cbox(metal, 0, h - 0.015, 0.07, 0.03, 0.025, 0.14)
}

export const showerHead = (metal: SlotId): PrefabFn => (b) => {
  b.cbox(metal, 0, 0, 0.18, 0.02, 0.02, 0.36)
  b.cbox(metal, 0, -0.015, 0.34, 0.25, 0.012, 0.25)
  b.cbox(metal, 0, -1.0, 0.03, 0.08, 0.14, 0.04)
}

// ── Appliances ────────────────────────────────────────────────────────────
export const fridge = (): PrefabFn => (b) => {
  b.sbox('steel', 0, 0, -0.33, 0.9, 1.85, 0.66)
  b.box('steel', [-0.45, 0.02, -0.01], [-0.003, 1.84, 0.02])
  b.box('steel', [0.003, 0.72, -0.01], [0.45, 1.84, 0.02])
  b.box('steel', [0.003, 0.02, -0.01], [0.45, 0.7, 0.02])
  b.box('screen', [-0.3, 1.0, 0.02], [-0.14, 1.3, 0.025])
  for (const x of [-0.04, 0.04]) b.box('steel', [x - 0.008, 0.9, 0.02], [x + 0.008, 1.6, 0.05])
}

/** Built-in oven under the cooktop (INT p.21): black glass door, steel band and bar handle. */
export const builtInOven = (w = 0.6, h = 0.6): PrefabFn => (b) => {
  b.box('screen', [-w / 2, 0, -0.02], [w / 2, h, 0.004])
  b.box('smoke_glass', [-w / 2 + 0.08, 0.1, 0.004], [w / 2 - 0.08, h - 0.2, 0.008])
  b.box('steel', [-w / 2, h - 0.11, 0.004], [w / 2, h, 0.01])
  b.box('black_metal', [-0.07, h - 0.085, 0.01], [0.07, h - 0.03, 0.012])
  b.box('steel', [-w / 2 + 0.06, h - 0.17, 0.035], [w / 2 - 0.06, h - 0.155, 0.05])
  for (const x of [-w / 2 + 0.08, w / 2 - 0.08]) b.box('steel', [x - 0.008, h - 0.17, 0.004], [x + 0.008, h - 0.155, 0.035])
}

export const washer = (front = true): PrefabFn => (b) => {
  b.sbox('appliance', 0, 0, -0.3, 0.6, 0.85, 0.6)
  if (front) {
    const r = new THREE.TorusGeometry(0.2, 0.025, 10, 32)
    b.geo('chrome', r, new THREE.Matrix4().makeTranslation(0, 0.42, 0.005))
    b.cyl('smoke_glass', 0, 0.42, 0, 0.18, 0.18, 0.01)
    b.geo('smoke_glass', new THREE.CircleGeometry(0.18, 32), new THREE.Matrix4().makeTranslation(0, 0.42, 0.012))
    b.box('screen', [-0.25, 0.74, 0.0], [0.15, 0.81, 0.005])
  } else {
    b.box('screen', [-0.27, 0.851, -0.56], [0.27, 0.86, -0.46])
    b.box('smoke_glass', [-0.22, 0.851, -0.4], [0.22, 0.856, -0.06])
  }
}

export const wineCooler = (): PrefabFn => (b) => {
  b.sbox('steel', 0, 0, -0.3, 0.6, 1.4, 0.6)
  b.box('smoke_glass', [-0.25, 0.12, 0.0], [0.25, 1.32, 0.012])
  for (let y = 0.25; y < 1.3; y += 0.13) b.box('wicker_fixed', [-0.24, y, -0.45], [0.24, y + 0.06, -0.02])
  b.box('steel', [0.2, 0.4, 0.012], [0.215, 1.1, 0.04])
}

export const cooktop = (w = 0.6): PrefabFn => (b) => {
  b.box('screen', [-w / 2, 0, -0.26], [w / 2, 0.008, 0.26])
  for (const [x, z] of [[-0.15, -0.1], [0.15, -0.1], [-0.15, 0.12], [0.15, 0.12]] as [number, number][]) {
    const t = new THREE.TorusGeometry(0.075, 0.006, 6, 24)
    b.geo('black_metal', t, new THREE.Matrix4().compose(new THREE.Vector3(x, 0.012, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1)))
  }
}

export const sinkBasin = (w = 0.6, d = 0.42): PrefabFn => (b) => {
  // flush-mounted bowl read from above: steel rim + shaded bowl surface
  const r = 0.025
  b.box('steel', [-w / 2, 0, -d / 2], [w / 2, 0.004, -d / 2 + r])
  b.box('steel', [-w / 2, 0, d / 2 - r], [w / 2, 0.004, d / 2])
  b.box('steel', [-w / 2, 0, -d / 2 + r], [-w / 2 + r, 0.004, d / 2 - r])
  b.box('steel', [w / 2 - r, 0, -d / 2 + r], [w / 2, 0.004, d / 2 - r])
  b.box('metal_dark_bowl', [-w / 2 + r, 0, -d / 2 + r], [w / 2 - r, 0.002, d / 2 - r])
  b.cyl('black_metal', 0, 0.0021, 0, 0.03, 0.03, 0.001, 12)
}

/** Pull-down kitchen faucet. Base at y=0, spout towards +Z. */
export const kitchenFaucet = (metal: SlotId): PrefabFn => (b) => {
  b.cyl(metal, 0, 0, 0, 0.025, 0.028, 0.42)
  const t = new THREE.TorusGeometry(0.11, 0.016, 8, 18, Math.PI)
  b.geo(metal, t, new THREE.Matrix4().compose(new THREE.Vector3(0, 0.42, 0.11), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1)))
  b.cyl(metal, 0, 0.26, 0.22, 0.02, 0.02, 0.16)
}

/**
 * INT p.25/26: built-in charcoal grill — black granite frame, stainless
 * lining, charcoal tray and two racks of skewers with handles at the front.
 * Origin: centre of the opening's bottom edge, front face at z = 0.
 */
export const churrasqueira = (): PrefabFn => (b) => {
  // granite frame (ring around the 0.80 × 0.54 opening)
  b.box('stone_gourmet', [-0.5, 0, -0.02], [0.5, 0.08, 0.04])
  b.box('stone_gourmet', [-0.5, 0.62, -0.02], [0.5, 0.7, 0.04])
  b.box('stone_gourmet', [-0.5, 0.08, -0.02], [-0.4, 0.62, 0.04])
  b.box('stone_gourmet', [0.4, 0.08, -0.02], [0.5, 0.62, 0.04])
  // stainless lining
  b.box('steel', [-0.4, 0.08, -0.52], [0.4, 0.62, -0.5])
  b.box('steel', [-0.4, 0.08, -0.5], [-0.39, 0.62, -0.02])
  b.box('steel', [0.39, 0.08, -0.5], [0.4, 0.62, -0.02])
  b.box('steel', [-0.4, 0.61, -0.5], [0.4, 0.62, -0.02])
  b.box('steel', [-0.4, 0.08, -0.5], [0.4, 0.09, -0.02])
  // charcoal tray
  b.box('screen', [-0.36, 0.09, -0.46], [0.36, 0.13, -0.08])
  // two racks of skewers
  for (const y of [0.3, 0.47]) {
    b.box('steel', [-0.39, y - 0.01, -0.46], [-0.37, y, -0.04])
    b.box('steel', [0.37, y - 0.01, -0.46], [0.39, y, -0.04])
    for (let i = 0; i < 5; i++) {
      const x = -0.28 + i * 0.14
      b.box('steel', [x - 0.004, y, -0.46], [x + 0.004, y + 0.008, 0.0])
      b.box('steel', [x - 0.022, y - 0.012, 0.0], [x + 0.022, y + 0.02, 0.025])
    }
  }
}

export const tvScreen = (w: number, h: number): PrefabFn => (b) => {
  b.box('black_metal', [-w / 2, -h / 2, -0.04], [w / 2, h / 2, 0])
  b.box('screen', [-w / 2 + 0.01, -h / 2 + 0.01, 0], [w / 2 - 0.01, h / 2 - 0.01, 0.004])
}

export const splitAC = (): PrefabFn => (b) => {
  b.rbox('appliance', 0, 0, 0.1, 0.9, 0.29, 0.2, 0.03)
  b.box('plastic', [-0.4, -0.15, 0.17], [0.4, -0.12, 0.2])
}
