/** Tables, islands and casegoods. Local space, origin on the floor. */
import * as THREE from 'three'
import type { GeoBuilder } from '../architecture/builder'
import type { SlotId } from '../data/materials'
import type { PrefabFn } from './prefab'

/** INT p.5: walnut pedestal side table. */
export const pedestalTable = (slot: SlotId, r = 0.22, h = 0.55): PrefabFn => (b) => {
  b.cyl(slot, 0, h - 0.035, 0, r, r, 0.035, 32)
  const g = new THREE.LatheGeometry(
    [new THREE.Vector2(0.001, 0), new THREE.Vector2(r * 0.62, 0), new THREE.Vector2(r * 0.55, 0.03), new THREE.Vector2(r * 0.22, h * 0.45), new THREE.Vector2(r * 0.18, h - 0.035), new THREE.Vector2(0.001, h - 0.035)],
    28,
  )
  b.geo(slot, g, undefined, [1.2, 1])
}

/** INT p.19: kitchen table — lacquer frame with inset glass top. */
export const glassTopTable = (frame: SlotId, w = 1.7, d = 0.88): PrefabFn => (b) => {
  const h = 0.76
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.sbox(frame, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), 0.07, h - 0.05, 0.07)
  b.sbox(frame, 0, h - 0.05, d / 2 - 0.045, w, 0.05, 0.09)
  b.sbox(frame, 0, h - 0.05, -d / 2 + 0.045, w, 0.05, 0.09)
  b.sbox(frame, w / 2 - 0.045, h - 0.05, 0, 0.09, 0.05, d - 0.18)
  b.sbox(frame, -w / 2 + 0.045, h - 0.05, 0, 0.09, 0.05, d - 0.18)
  b.sbox('smoke_glass', 0, h - 0.03, 0, w - 0.18, 0.012, d - 0.18)
}

/** INT p.24/25: long timber dining table with crossed trestle legs. */
export const trestleTable = (wood: SlotId, w = 3.6, d = 0.95): PrefabFn => (b) => {
  const h = 0.76
  b.sbox(wood, 0, h - 0.06, 0, w, 0.06, d)
  for (const x of [-w / 2 + 0.45, w / 2 - 0.45]) {
    for (const s of [-1, 1]) b.at(x, (h - 0.06) / 2, 0, 0, () => b.cbox(wood, 0, 0, 0, 0.07, 0.95, 0.09), 0, s * 38)
    b.sbox(wood, x, h - 0.12, 0, 0.09, 0.06, d - 0.15)
  }
  b.sbox(wood, 0, 0.32, 0, w - 0.9, 0.06, 0.07)
}

/** INT p.35: round black dining/game table on a conical pedestal. */
export const roundTable = (slot: SlotId, r = 0.62): PrefabFn => (b) => {
  b.cyl(slot, 0, 0.72, 0, r, r - 0.01, 0.035, 40)
  const g = new THREE.LatheGeometry([new THREE.Vector2(0.001, 0), new THREE.Vector2(0.3, 0), new THREE.Vector2(0.28, 0.06), new THREE.Vector2(0.16, 0.4), new THREE.Vector2(0.14, 0.72), new THREE.Vector2(0.001, 0.72)], 32)
  b.geo(slot, g, undefined, [1.5, 1])
}

/** ARQ p.7/10: round teak garden table. */
export const teakRoundTable = (): PrefabFn => (b) => {
  b.cyl('ext_furniture_wood', 0, 0.72, 0, 0.55, 0.55, 0.035, 36)
  b.cyl('ext_furniture_wood', 0, 0, 0, 0.04, 0.05, 0.72)
  for (let i = 0; i < 4; i++) b.at(0, 0.05, 0, i * 90 + 45, () => b.cbox('ext_furniture_wood', 0, 0, 0.22, 0.05, 0.05, 0.45))
}

/** ARQ p.7/10: white market umbrella. */
export const umbrella = (): PrefabFn => (b) => {
  b.cyl('ext_furniture_wood', 0, 0, 0, 0.025, 0.025, 2.55)
  const g = new THREE.ConeGeometry(1.45, 0.42, 8, 1, true)
  b.geo('ext_umbrella', g, new THREE.Matrix4().makeTranslation(0, 2.4, 0), [3, 1])
  for (let i = 0; i < 8; i++) b.at(0, 2.2, 0, i * 45, () => b.cbox('ext_furniture_wood', 0, 0, 0.7, 0.015, 0.015, 1.4), 18)
  b.sphere('ext_furniture_wood', 0, 2.63, 0, 0.04)
}

/** Cabinet run helper: a row of doors with 3 mm reveals on a recessed plinth. */
export function cabinetRow(b: GeoBuilder, slot: SlotId, x0: number, x1: number, y0: number, h: number, depth: number, doors: number, opts: { handle?: SlotId | null; plinth?: SlotId | null; handleV?: boolean; drawers?: number; carcass?: SlotId } = {}) {
  const carcass = opts.carcass ?? slot
  const plinth = opts.plinth === undefined ? 0.1 : opts.plinth ? 0.1 : 0
  if (opts.plinth !== null && y0 < 0.05) b.box((opts.plinth ?? 'black_metal') as SlotId, [x0 + 0.02, y0, -depth + 0.06], [x1 - 0.02, y0 + 0.1, -0.04])
  const by = y0 + (y0 < 0.05 ? plinth : 0)
  const hh = h - (by - y0)
  b.box(carcass, [x0, by, -depth], [x1, by + hh, -0.02])
  const dw = (x1 - x0) / doors
  const g = 0.003
  for (let i = 0; i < doors; i++) {
    const a = x0 + i * dw + g
    const c = x0 + (i + 1) * dw - g
    if (opts.drawers) {
      const dh = hh / opts.drawers
      for (let k = 0; k < opts.drawers; k++) {
        b.box(slot, [a, by + k * dh + g, -0.02], [c, by + (k + 1) * dh - g, 0])
        if (opts.handle) b.box(opts.handle, [(a + c) / 2 - 0.1, by + (k + 1) * dh - 0.05, 0], [(a + c) / 2 + 0.1, by + (k + 1) * dh - 0.035, 0.02])
      }
    } else {
      b.box(slot, [a, by + g, -0.02], [c, by + hh - g, 0])
      if (opts.handle) {
        const hx = i % 2 === 0 ? c - 0.05 : a + 0.05
        if (opts.handleV !== false) b.box(opts.handle, [hx - 0.008, by + hh * 0.5 - 0.12, 0], [hx + 0.008, by + hh * 0.5 + 0.12, 0.025])
        else b.box(opts.handle, [(a + c) / 2 - 0.1, by + hh - 0.06, 0], [(a + c) / 2 + 0.1, by + hh - 0.045, 0.02])
      }
    }
  }
}
