/**
 * Procedural seating — all authored in local space, origin on the floor,
 * front facing +Z. Proportions taken from the INT renders.
 */
import * as THREE from 'three'
import type { GeoBuilder } from '../architecture/builder'
import type { SlotId } from '../data/materials'
import type { PrefabFn } from './prefab'

const D2R = Math.PI / 180

/** Curved band (segment of a cylinder) used for chair backs. */
function band(b: GeoBuilder, slot: SlotId, r: number, h: number, arcDeg: number, y: number, z: number, thick = 0.035) {
  const g = new THREE.CylinderGeometry(r, r, h, 20, 1, false, Math.PI - (arcDeg * D2R) / 2, arcDeg * D2R)
  // outer + inner shells for thickness
  b.geo(slot, g, new THREE.Matrix4().makeTranslation(0, y + h / 2, z + r), [r * 2, h])
  const gi = new THREE.CylinderGeometry(r - thick, r - thick, h, 20, 1, true, Math.PI - (arcDeg * D2R) / 2, arcDeg * D2R)
  b.geo(slot, gi, new THREE.Matrix4().makeTranslation(0, y + h / 2, z + r), [r * 2, h])
}

function torusArc(b: GeoBuilder, slot: SlotId, R: number, tube: number, arcDeg: number, m: THREE.Matrix4) {
  const g = new THREE.TorusGeometry(R, tube, 8, 28, arcDeg * D2R)
  b.geo(slot, g, m, [R * 3, tube * 6])
}

/** INT p.4/p.7: low modular sofa in off-white linen with chaise on the right. */
export const sofaModular = (len: number, chaise: number, slot: SlotId): PrefabFn => (b) => {
  const d = 1.05
  const baseH = 0.22
  b.rbox(slot, 0, baseH / 2 + 0.03, 0, len, baseH, d, 0.05)
  b.sbox('black_metal', 0, 0, 0, len - 0.2, 0.03, d - 0.2)
  const mods = Math.max(2, Math.round((len - (chaise > 0 ? 1.0 : 0)) / 0.95))
  const seatLen = len - (chaise > 0 ? 1.0 : 0)
  const mw = seatLen / mods
  for (let i = 0; i < mods; i++) {
    const x = -len / 2 + mw * (i + 0.5)
    b.rbox(slot, x, baseH + 0.03 + 0.1, 0.1, mw - 0.02, 0.2, d - 0.22, 0.07)
    b.rbox(slot, x, baseH + 0.03 + 0.2 + 0.2, -d / 2 + 0.14, mw - 0.03, 0.42, 0.24, 0.09)
  }
  if (chaise > 0) {
    const x0 = len / 2 - 1.0
    const cw = 1.0
    const cz = (chaise - d) / 2
    b.rbox(slot, x0 + cw / 2, baseH / 2 + 0.03, cz, cw, baseH, chaise, 0.05)
    b.rbox(slot, x0 + cw / 2, baseH + 0.03 + 0.1, cz + 0.06, cw - 0.02, 0.2, chaise - 0.15, 0.07)
    b.rbox(slot, x0 + cw / 2, baseH + 0.03 + 0.4, -d / 2 + 0.14, cw - 0.03, 0.42, 0.24, 0.09)
    b.rbox(slot, len / 2 - 0.1, baseH + 0.03 + 0.28, cz + 0.12, 0.2, 0.36, chaise - 0.3, 0.08) // side bolster
  }
  // loose cushions
  b.at(-len / 2 + 0.55, baseH + 0.5, -d / 2 + 0.33, 8, () => b.rbox(slot, 0, 0, 0, 0.5, 0.42, 0.13, 0.06), -12)
  b.at(-len / 2 + 1.2, baseH + 0.5, -d / 2 + 0.33, -6, () => b.rbox('linen_white', 0, 0, 0, 0.46, 0.4, 0.12, 0.06), -12)
}

/** INT p.11: bouclé armchair with rolled back and curved walnut arm. */
export const rollArmchair = (fabric: SlotId, wood: SlotId): PrefabFn => (b) => {
  b.rbox(fabric, 0, 0.2, 0.02, 0.74, 0.4, 0.74, 0.18, 4)
  b.rbox(fabric, 0, 0.44, 0.06, 0.62, 0.1, 0.6, 0.05)
  // rolled back cushions
  for (const [y, z] of [[0.6, -0.26], [0.83, -0.27]] as [number, number][]) {
    const g = new THREE.CapsuleGeometry(0.11, 0.42, 6, 14)
    b.geo(fabric, g, new THREE.Matrix4().compose(new THREE.Vector3(0, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), new THREE.Vector3(1, 1, 1)), [0.7, 0.5])
  }
  // walnut hoop arm (around the back, down at the front)
  const R = 0.38
  torusArc(b, wood, R, 0.022, 180, new THREE.Matrix4().compose(new THREE.Vector3(0, 0.62, -0.02), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1)))
  for (const s of [-1, 1]) {
    b.at(s * R, 0.62, 0.12, 0, () => b.cbox(wood, 0, 0, 0, 0.044, 0.044, 0.28))
    torusArc(b, wood, 0.08, 0.022, 90, new THREE.Matrix4().compose(new THREE.Vector3(s * R, 0.54, 0.26), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1)))
    b.at(s * R, 0.0, 0.34, 0, () => b.sbox(wood, 0, 0, 0, 0.044, 0.54, 0.044))
  }
}

/** INT p.19/20: upholstered dining chair with curved back and walnut legs. */
export const diningChair = (fabric: SlotId, wood: SlotId): PrefabFn => (b) => {
  b.rbox(fabric, 0, 0.47, 0.02, 0.48, 0.07, 0.46, 0.03)
  band(b, fabric, 0.3, 0.26, 120, 0.63, -0.26, 0.04)
  for (const [x, z] of [[-0.2, 0.19], [0.2, 0.19], [-0.19, -0.17], [0.19, -0.17]] as [number, number][]) {
    b.at(x, 0, z, 0, () => b.cyl(wood, 0, 0, 0, 0.016, 0.012, 0.45), z < 0 ? 6 : -4)
  }
  b.at(-0.21, 0.5, -0.2, 0, () => b.cyl(wood, 0, 0, 0, 0.012, 0.012, 0.22), 10)
  b.at(0.21, 0.5, -0.2, 0, () => b.cyl(wood, 0, 0, 0, 0.012, 0.012, 0.22), 10)
}

/** INT p.24/25: dining chair with olive nautical rope seat/back and timber frame. */
export const ropeChair = (rope: SlotId, wood: SlotId): PrefabFn => (b) => {
  for (const [x, z, h] of [[-0.22, 0.2, 0.46], [0.22, 0.2, 0.46], [-0.22, -0.2, 0.82], [0.22, -0.2, 0.82]] as [number, number, number][]) {
    b.at(x, 0, z, 0, () => b.sbox(wood, 0, 0, 0, 0.035, h, 0.035), z < 0 ? 5 : -3)
  }
  b.sbox(wood, 0, 0.42, 0, 0.48, 0.03, 0.44)
  b.rbox(rope, 0, 0.455, 0.0, 0.44, 0.025, 0.4, 0.012)
  // woven horseshoe back wrapping into the arms (INT p.24–p.28)
  band(b, rope, 0.25, 0.17, 220, 0.6, -0.25, 0.02)
  torusArc(b, wood, 0.25, 0.012, 220, new THREE.Matrix4().compose(new THREE.Vector3(0, 0.775, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, (-90 - 110) * D2R)), new THREE.Vector3(1, 1, 1)))
  b.sbox(wood, 0, 0.12, 0, 0.44, 0.025, 0.025)
}

export const ropeStool = (rope: SlotId, wood: SlotId): PrefabFn => (b) => {
  for (const [x, z] of [[-0.21, 0.19], [0.21, 0.19], [-0.21, -0.19], [0.21, -0.19]] as [number, number][]) {
    b.at(x, 0, z, 0, () => b.sbox(wood, 0, 0, 0, 0.035, z < 0 ? 1.0 : 0.76, 0.035), x < 0 ? -3 : 3)
  }
  b.sbox(wood, 0, 0.3, 0.19, 0.44, 0.03, 0.03)
  b.sbox(wood, 0, 0.3, -0.19, 0.44, 0.03, 0.03)
  b.sbox(wood, 0, 0.72, 0, 0.46, 0.04, 0.42)
  b.rbox(rope, 0, 0.765, 0, 0.42, 0.03, 0.38, 0.012)
  band(b, rope, 0.24, 0.15, 210, 0.88, -0.24, 0.02)
}

/** INT p.35: black shell chair on slim legs. */
export const shellChair = (shell: SlotId): PrefabFn => (b) => {
  // upholstered seat + rounded shell wrapping into the arms (INT p.35–p.37)
  b.rbox(shell, 0, 0.455, 0.02, 0.5, 0.08, 0.47, 0.04, 4)
  band(b, shell, 0.255, 0.34, 210, 0.47, -0.255, 0.045)
  for (const [x, z] of [[-0.2, 0.18], [0.2, 0.18], [-0.2, -0.16], [0.2, -0.16]] as [number, number][]) {
    b.at(x, 0, z, 0, () => b.cyl('black_metal', 0, 0, 0, 0.011, 0.009, 0.45), z < 0 ? 8 : -6, x < 0 ? -4 : 4)
  }
}

/** INT p.38: high-back swivel office chair. */
export const officeChair = (): PrefabFn => (b) => {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    b.at(Math.sin(a) * 0.15, 0.05, Math.cos(a) * 0.15, (a * 180) / Math.PI, () => b.cbox('chrome', 0, 0, 0, 0.04, 0.03, 0.3))
    b.sphere('rubber', Math.sin(a) * 0.29, 0.03, Math.cos(a) * 0.29, 0.03)
  }
  b.cyl('chrome', 0, 0.05, 0, 0.025, 0.025, 0.4)
  b.rbox('leather', 0, 0.5, 0, 0.5, 0.09, 0.48, 0.04)
  b.at(0, 0.55, -0.22, 0, () => b.rbox('leather', 0, 0.32, 0, 0.46, 0.66, 0.08, 0.04), -8)
}

/** INT p.39: rounded bouclé loveseat. */
export const boucleLoveseat = (slot: SlotId): PrefabFn => (b) => {
  b.rbox(slot, 0, 0.2, 0.04, 1.35, 0.4, 0.82, 0.2, 4)
  b.rbox(slot, 0.05, 0.53, -0.27, 1.22, 0.42, 0.26, 0.13, 4)
  b.rbox(slot, -0.55, 0.5, 0.02, 0.25, 0.36, 0.78, 0.12, 4)
  b.rbox(slot, 0.08, 0.44, 0.1, 1.0, 0.1, 0.56, 0.05)
}

/** INT p.61/62: caramel lounge armchair with timber legs. */
export const loungeChair = (fabric: SlotId, wood: SlotId): PrefabFn => (b) => {
  for (const [x, z] of [[-0.3, 0.27], [0.3, 0.27], [-0.3, -0.27], [0.3, -0.27]] as [number, number][]) {
    b.at(x, 0, z, 0, () => b.cyl(wood, 0, 0, 0, 0.018, 0.012, 0.28), z > 0 ? -10 : 10, x < 0 ? 8 : -8)
  }
  b.rbox(fabric, 0, 0.34, 0.03, 0.72, 0.14, 0.72, 0.05)
  b.rbox(fabric, 0, 0.45, 0.08, 0.6, 0.1, 0.58, 0.04)
  b.at(0, 0.42, -0.31, 0, () => b.rbox(fabric, 0, 0.27, 0, 0.7, 0.56, 0.12, 0.05), -14)
  for (const s of [-1, 1]) b.rbox(fabric, s * 0.34, 0.52, 0.0, 0.08, 0.22, 0.62, 0.035)
}

/** INT p.52: bouclé tub chair on champagne metal legs. */
export const tubChair = (fabric: SlotId): PrefabFn => (b) => {
  b.rbox(fabric, 0, 0.48, 0.02, 0.5, 0.1, 0.48, 0.04)
  band(b, fabric, 0.27, 0.3, 210, 0.52, -0.27, 0.06)
  for (const [x, z] of [[-0.19, 0.17], [0.19, 0.17], [-0.19, -0.17], [0.19, -0.17]] as [number, number][]) {
    b.at(x, 0, z, 0, () => b.cyl('brass', 0, 0, 0, 0.008, 0.008, 0.47), z > 0 ? -7 : 7, x < 0 ? 5 : -5)
  }
}

/** ARQ p.4: natural fibre armchair on the entrance hall. */
export const wickerArmchair = (slot: SlotId): PrefabFn => (b) => {
  band(b, slot, 0.34, 0.45, 230, 0.32, -0.34, 0.05)
  b.cyl(slot, 0, 0, 0, 0.3, 0.27, 0.42)
  b.rbox('ext_cushion', 0, 0.45, 0.02, 0.56, 0.08, 0.54, 0.04)
  b.rbox('ext_cushion', 0, 0.62, -0.22, 0.46, 0.3, 0.1, 0.05)
}

/** ARQ p.8/9: hanging egg chair suspended from the pergola. */
export const hangingChair = (slot: SlotId, height: number): PrefabFn => (b) => {
  const g = new THREE.SphereGeometry(0.55, 24, 16, Math.PI * 0.15, Math.PI * 1.7, 0.15 * Math.PI, 0.75 * Math.PI)
  b.geo(slot, g, new THREE.Matrix4().compose(new THREE.Vector3(0, 0.95, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), new THREE.Vector3(1, 1.05, 0.9)), [2, 1.5])
  b.rbox('ext_cushion', 0, 0.62, 0.05, 0.62, 0.1, 0.56, 0.04)
  b.rbox('ext_cushion', 0, 0.9, -0.25, 0.5, 0.35, 0.12, 0.05)
  b.cyl('black_metal', 0, 1.5, 0, 0.012, 0.012, height - 1.5)
}

/** ARQ p.7/10: double teak sun lounger with off-white cushion. */
export const sunLounger = (): PrefabFn => (b) => {
  b.sbox('ext_furniture_wood', 0, 0.06, 0, 0.75, 0.2, 2.0)
  for (const [x, z] of [[-0.33, 0.95], [0.33, 0.95], [-0.33, -0.95], [0.33, -0.95]] as [number, number][]) b.sbox('ext_furniture_wood', x, 0, z, 0.06, 0.08, 0.06)
  b.rbox('ext_cushion', 0, 0.32, 0.25, 0.7, 0.1, 1.4, 0.04)
  b.at(0, 0.3, -0.55, 0, () => {
    b.sbox('ext_furniture_wood', 0, 0, 0.3, 0.72, 0.04, 0.62)
    b.rbox('ext_cushion', 0, 0.09, 0.3, 0.7, 0.1, 0.6, 0.04)
  }, -35)
}

/** ARQ p.7/10: teak garden chair. */
export const teakChair = (): PrefabFn => (b) => {
  for (const [x, z, h] of [[-0.22, 0.2, 0.45], [0.22, 0.2, 0.45], [-0.22, -0.2, 0.86], [0.22, -0.2, 0.86]] as [number, number, number][]) {
    b.at(x, 0, z, 0, () => b.sbox('ext_furniture_wood', 0, 0, 0, 0.04, h, 0.04), z < 0 ? 6 : 0)
  }
  for (let i = 0; i < 5; i++) b.sbox('ext_furniture_wood', 0, 0.42, -0.18 + i * 0.09, 0.48, 0.025, 0.07)
  for (let i = 0; i < 4; i++) b.at(0, 0.55 + i * 0.08, -0.23, 0, () => b.cbox('ext_furniture_wood', 0, 0, 0, 0.46, 0.05, 0.02), 0)
  for (const s of [-1, 1]) b.sbox('ext_furniture_wood', s * 0.24, 0.62, 0, 0.05, 0.03, 0.46)
}

/** Master suite king bed (INT p.57–59). */
export const kingBed = (bed: SlotId, bedding: SlotId): PrefabFn => (b) => {
  const w = 1.93
  const l = 2.03
  // upholstered base
  b.rbox(bed, 0, 0.17, 0, w + 0.08, 0.26, l + 0.04, 0.04)
  b.sbox('black_metal', 0, 0, 0, w - 0.2, 0.04, l - 0.2)
  // headboard with soft wings (INT p.59)
  b.rbox(bed, 0, 0.75, -l / 2 - 0.05, w + 0.16, 1.1, 0.14, 0.06)
  b.at(-w / 2 - 0.06, 0.75, -l / 2 + 0.03, 20, () => b.rbox(bed, 0, 0, 0, 0.16, 1.05, 0.14, 0.06))
  b.at(w / 2 + 0.06, 0.75, -l / 2 + 0.03, -20, () => b.rbox(bed, 0, 0, 0, 0.16, 1.05, 0.14, 0.06))
  // mattress + sheet
  b.rbox('linen_white', 0, 0.4, 0.02, w, 0.22, l - 0.02, 0.06)
  // duvet (folded back at the top, draped at the foot)
  b.rbox(bedding, 0, 0.53, 0.32, w + 0.12, 0.07, l - 0.62, 0.035)
  b.rbox(bedding, 0, 0.38, l / 2 - 0.0, w + 0.12, 0.34, 0.05, 0.02)
  for (const s of [-1, 1]) b.rbox(bedding, s * (w / 2 + 0.05), 0.38, 0.32, 0.05, 0.34, l - 0.62, 0.02)
  b.rbox('linen_white', 0, 0.535, -0.12, w + 0.1, 0.06, 0.38, 0.03)
  // pillows
  for (const s of [-1, 1]) {
    b.at(s * 0.47, 0.66, -l / 2 + 0.28, 0, () => b.rbox('linen_white', 0, 0, 0, 0.78, 0.2, 0.3, 0.08), -55)
    b.at(s * 0.45, 0.68, -l / 2 + 0.43, 0, () => b.rbox(bedding, 0, 0, 0, 0.6, 0.42, 0.14, 0.07), -18)
  }
  b.at(0, 0.62, -l / 2 + 0.6, 0, () => b.rbox('linen_dark', 0, 0, 0, 0.42, 0.26, 0.12, 0.05), -15)
  // throw across the foot
  b.rbox('linen_dark', 0.25, 0.575, 0.62, w + 0.16, 0.025, 0.5, 0.01)
}

/** Simple queen/single bed for Quartos 01/02 (not detailed in INT — A-07). */
export const simpleBed = (w: number, bedding: SlotId, frame: SlotId): PrefabFn => (b) => {
  const l = 2.0
  b.sbox(frame, 0, 0.05, 0, w + 0.06, 0.28, l + 0.04)
  b.sbox(frame, 0, 0.0, -l / 2 - 0.04, w + 0.12, 1.05, 0.08)
  b.rbox('linen_white', 0, 0.44, 0.02, w, 0.22, l - 0.02, 0.05)
  b.rbox(bedding, 0, 0.56, 0.3, w + 0.08, 0.06, l - 0.6, 0.03)
  for (let i = 0; i < Math.round(w / 0.7); i++) {
    const x = -w / 2 + (w / Math.round(w / 0.7)) * (i + 0.5)
    b.at(x, 0.66, -l / 2 + 0.3, 0, () => b.rbox('linen_white', 0, 0, 0, 0.6, 0.18, 0.28, 0.07), -50)
  }
}
