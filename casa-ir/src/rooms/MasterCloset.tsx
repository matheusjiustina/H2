/**
 * CLOSET DA SUÍTE MASTER — sources: INT p.44 (plan, rotated 180°), INT p.45–54, ARQ p.2.
 * Room: x 23.25–26.06 · z 1.80–6.55 (+ L-part x 21.52–23.25 · z 4.05–6.55).
 * U-shaped greige wardrobes with raised panels + square brass pulls, central
 * walnut niche with lit shelves and drawers (east wall), mirrored doors at
 * the end (north), freestanding walnut vanity with quartz top, vessel basin and
 * a ceiling-hung brass ring mirror with LED; marble-pattern wallcovering and a
 * rectangular LED profile in the ceiling.
 */
import { useMemo } from 'react'
import { Parts, PartsMeshes, useParts } from './kit'
import { Prefab, PrefabInstances } from '../furniture/prefab'
import { tubChair } from '../furniture/seating'
import { vesselSink, faucet, downlight } from '../furniture/fixtures'
import { rug, vase } from '../furniture/decor'
import { addBlocker } from '../controls/colliders'
import { HEIGHTS } from '../data/houseSpec'
import type { GeoBuilder } from '../architecture/builder'
import * as THREE from 'three'

const F = HEIGHTS.floor
const TOP = 2.55

/** Raised-panel wardrobe doors along an axis. face: direction the doors face. */
function wardrobe(b: GeoBuilder, face: 'w' | 'e' | 's', fixed: number, a0: number, a1: number, depth: number, doors: number, door: 'closet_master' | 'mirror' = 'closet_master') {
  const dw = (a1 - a0) / doors
  for (let i = 0; i < doors; i++) {
    const s0 = a0 + i * dw + 0.003
    const s1 = a0 + (i + 1) * dw - 0.003
    const sm = (s0 + s1) / 2
    const hx = i % 2 === 0 ? s1 - 0.08 : s0 + 0.08
    if (face === 'w') {
      b.box('closet_master', [fixed - depth, F, s0], [fixed, TOP, s1])
      b.box(door, [fixed - depth - 0.012, F + 0.08, s0 + 0.05], [fixed - depth, TOP - 0.08, s1 - 0.05])
      b.box('closet_handles', [fixed - depth - 0.03, 1.12, hx - 0.035], [fixed - depth - 0.012, 1.19, hx + 0.035])
    } else if (face === 'e') {
      b.box('closet_master', [fixed, F, s0], [fixed + depth, TOP, s1])
      b.box(door, [fixed + depth, F + 0.08, s0 + 0.05], [fixed + depth + 0.012, TOP - 0.08, s1 - 0.05])
      b.box('closet_handles', [fixed + depth + 0.012, 1.12, hx - 0.035], [fixed + depth + 0.03, 1.19, hx + 0.035])
    } else {
      b.box('closet_master', [s0, F, fixed], [s1, TOP, fixed + depth])
      b.box(door, [s0 + 0.05, F + 0.08, fixed + depth], [s1 - 0.05, TOP - 0.08, fixed + depth + 0.012])
      if (door !== 'mirror') b.box('closet_handles', [sm - 0.035, 1.12, fixed + depth + 0.012], [sm + 0.035, 1.19, fixed + depth + 0.03])
    }
  }
}

export function MasterCloset() {
  const parts = useParts((p: Parts) => {
    const w = p.of('closet_wardrobes')
    // east wall (faces west) z 2.77–5.44 with the walnut niche z 3.64–4.52
    wardrobe(w, 'w', 26.06, 2.77, 3.62, 0.6, 2)
    wardrobe(w, 'w', 26.06, 4.54, 5.44, 0.6, 2)
    // north wall (faces south) x 23.30–26.06: mirrored doors in the centre (INT p.45)
    wardrobe(w, 's', 1.8, 23.3, 23.95, 0.6, 1)
    wardrobe(w, 's', 1.8, 23.95, 25.45, 0.6, 2, 'mirror')
    wardrobe(w, 's', 1.8, 25.45, 26.06, 0.6, 1)
    // west side next to the bath (faces east) z 2.77–4.03
    wardrobe(w, 'e', 23.25, 2.77, 4.03, 0.6, 2)
    // top bulkhead
    w.box('closet_master', [23.25, TOP, 1.8], [26.06, 2.8, 2.4])
    w.box('closet_master', [25.46, TOP, 2.4], [26.06, 2.8, 5.44])
    w.box('closet_master', [23.25, TOP, 2.4], [23.85, 2.8, 4.03])

    // central walnut niche (INT p.46/48)
    const n = p.of('closet_niche')
    n.box('closet_wood', [26.03, F, 3.62], [26.06, TOP, 4.54])
    n.box('closet_wood', [25.46, F, 3.62], [26.06, TOP, 3.66])
    n.box('closet_wood', [25.46, F, 4.5], [26.06, TOP, 4.54])
    n.box('closet_wood', [25.46, TOP - 0.03, 3.62], [26.06, TOP, 4.54])
    for (let i = 0; i < 4; i++) n.box('closet_wood', [25.48 - 0.0, F + i * 0.15 + 0.01, 3.67], [25.5, F + (i + 1) * 0.15 - 0.005, 4.49])
    n.box('closet_wood', [25.5, F, 3.66], [26.03, F + 0.6, 4.5])
    for (const y of [1.05, 1.45, 1.85, 2.2]) {
      n.box('closet_wood', [25.5, y, 3.66], [26.03, y + 0.025, 4.5])
      n.box('led', [25.52, y - 0.004, 3.68], [25.54, y, 4.48])
    }
    // decor in the niche: bags & boxes
    n.box('leather', [25.62, 1.475, 3.8], [25.9, 1.7, 4.05])
    n.box('caramel_fixed', [25.62, 1.475, 4.12], [25.9, 1.7, 4.36])
    for (let i = 0; i < 3; i++) n.box('wicker_fixed', [25.62, 1.875, 3.72 + i * 0.26], [25.9, 2.0, 3.92 + i * 0.26])

    // freestanding vanity (INT p.52–54): walnut + quartz, x 22.75–23.82 · z 4.08–5.40
    const v = p.of('closet_vanity')
    v.box('closet_wood', [22.8, F, 4.1], [23.75, 0.76, 4.16])
    v.box('closet_wood', [22.8, F, 5.34], [23.75, 0.76, 5.4])
    v.box('closet_wood', [22.8, 0.5, 4.16], [23.75, 0.76, 4.8])
    for (let i = 0; i < 3; i++) v.box('rubber', [23.75, 0.55 + i * 0.07, 4.18], [23.752, 0.553 + i * 0.07, 4.78])
    v.box('closet_wood', [22.75, F, 4.16], [22.8, 0.76, 5.34])
    v.box('closet_counter', [22.74, 0.76, 4.06], [23.84, 0.8, 5.42])
    // ceiling-hung brass ring mirror with LED (INT p.52)
    const ring = new THREE.TorusGeometry(0.42, 0.025, 10, 48)
    v.geo('closet_handles', ring, new THREE.Matrix4().compose(new THREE.Vector3(23.3, 1.62, 4.6), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), new THREE.Vector3(1, 1.15, 1)))
    v.geo('mirror', new THREE.CircleGeometry(0.4, 48), new THREE.Matrix4().compose(new THREE.Vector3(23.31, 1.62, 4.6), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), new THREE.Vector3(1, 1.15, 1)))
    v.geo('mirror', new THREE.CircleGeometry(0.4, 48), new THREE.Matrix4().compose(new THREE.Vector3(23.29, 1.62, 4.6), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)), new THREE.Vector3(1, 1.15, 1)))
    v.box('closet_handles', [23.29, 2.1, 4.17], [23.31, 2.8, 4.19])
    v.box('closet_handles', [23.29, 2.1, 5.01], [23.31, 2.8, 5.03])

    // rectangular LED profile in the ceiling (INT p.45)
    const c = p.of('')
    c.box('led', [23.95, 2.785, 2.6], [25.35, 2.79, 2.62])
    c.box('led', [23.95, 2.785, 5.38], [25.35, 2.79, 5.4])
    c.box('led', [23.95, 2.785, 2.6], [23.97, 2.79, 5.4])
    c.box('led', [25.33, 2.785, 2.6], [25.35, 2.79, 5.4])
  }, [])

  const spots = useMemo(() => [{ p: [22.4, 2.79, 5.3] as [number, number, number] }, { p: [23.3, 2.79, 6.1] as [number, number, number] }], [])
  useMemo(() => {
    addBlocker('c_east', 25.46, 2.77, 26.06, 5.44)
    addBlocker('c_north', 23.25, 1.8, 26.06, 2.4)
    addBlocker('c_west', 23.25, 2.77, 23.85, 4.03)
    addBlocker('c_vanity', 22.74, 4.06, 23.84, 5.42)
  }, [])

  return (
    <group>
      <PartsMeshes parts={parts} />
      <Prefab id="cRug" build={rug('linen_white', 1.3, 2.4)} position={[24.65, F, 4.05]} cast={false} />
      <Prefab id="cChair" build={tubChair('closet_chair')} position={[24.15, F, 4.75]} rotation={-90} selectable="closet_chair" />
      <Prefab id="cSink" build={vesselSink(0.42, 0.34)} position={[23.4, 0.8, 4.35]} rotation={90} />
      <Prefab id="cFaucet" build={faucet('closet_handles', true)} position={[22.98, 0.8, 4.35]} rotation={90} />
      <Prefab id="cVase" build={vase(0.16, 0.06, 'paper')} position={[23.4, 0.8, 5.15]} />
      <PrefabInstances id="dl_c" cut build={downlight()} items={spots} cast={false} />
    </group>
  )
}
