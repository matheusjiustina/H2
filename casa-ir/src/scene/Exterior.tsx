/**
 * Exterior architectural details not covered by the wall/massing builder:
 * pergolas, front glass curtain wall, LED lines, canopy downlights,
 * outdoor shower, cars, hall armchairs and the hanging chair.
 * Sources: ARQ p.2, p.4, p.5, p.6, p.8, p.9, p.10, p.14, p.16.
 */
import { useMemo } from 'react'
import { GeoBuilder } from '../architecture/builder'
import { SlotMeshes } from '../configurator/SlotMeshes'
import { HEIGHTS } from '../data/houseSpec'
import { useStore } from '../app/store'
import { Prefab, PrefabInstances } from '../furniture/prefab'
import { cylinderSpot, downlight } from '../furniture/fixtures'
import { hangingChair, wickerArmchair } from '../furniture/seating'
import { car } from '../furniture/decor'
import { addBlocker } from '../controls/colliders'

const H = HEIGHTS

export function Exterior() {
  const plan = useStore((s) => s.plan)
  const { solid, glass, pergola } = useMemo(() => {
    const solid = new GeoBuilder()
    const glass = new GeoBuilder()
    const pergola = new GeoBuilder()

    // ── Gourmet pergola over the deck (ARQ p.2 dashed line, ARQ p.6/p.14) ──
    const [px1, pz1, px2, pz2] = [8.3, 8.97, 17.85, 11.0]
    const y0 = H.wall
    const y1 = H.wall + 0.38
    pergola.box('pergola_frame', [px1, y0, pz1], [px2, y1, pz1 + 0.15])
    pergola.box('pergola_frame', [px1, y0, pz1 + 0.15], [px1 + 0.15, y1, pz2])
    pergola.box('pergola_frame', [px2 - 0.15, y0, pz1 + 0.15], [px2, y1, pz2])
    for (let x = px1 + 0.3; x < px2 - 0.2; x += 0.26) pergola.box('external_soffit', [x, y0 + 0.12, pz1 + 0.15], [x + 0.05, y0 + 0.3, pz2])
    // ── Pergola over the stone recess (ARQ p.16 slats) ──
    for (let x = 8.6; x < 13.4; x += 0.24) pergola.box('external_soffit', [x, H.wall + 0.05, 11.25], [x + 0.05, H.wall + 0.25, 13.21])
    pergola.box('pergola_frame', [8.46, H.wall, 11.25], [8.6, H.slabTop, 13.21])

    // ── Brise slats under the high slab end over the garage (ARQ p.4/p.5/p.16) ──
    for (let z = 12.35; z < 14.2; z += 0.17) pergola.box('external_facade_primary', [29.95, H.highBottom + 0.05, z], [36.15, H.highBottom + 0.3, z + 0.045])

    // ── Front glass curtain wall in front of Quarto 01 (ARQ p.4/5 — A-06) ──
    const gx0 = 35.37
    const gx1 = 35.45
    const zs = [3.3, 3.95, 4.6, 5.24]
    const ys = [0, 2.95, H.highBottom]
    for (const z of zs) solid.box('external_frames', [gx0, 0, z - 0.03], [gx1, H.highBottom, z + 0.03])
    for (const y of ys) solid.box('external_frames', [gx0, Math.max(0, y - 0.03), zs[0]], [gx1, y + 0.03, zs[zs.length - 1]])
    for (let i = 0; i < zs.length - 1; i++) {
      glass.box('glass', [gx0 + 0.035, 0.03, zs[i] + 0.03], [gx0 + 0.047, 2.92, zs[i + 1] - 0.03])
      glass.box('spandrel', [gx0 + 0.035, 2.98, zs[i] + 0.03], [gx0 + 0.047, H.highBottom - 0.03, zs[i + 1] - 0.03])
    }
    addBlocker('curtainwall', gx0, zs[0], gx1, zs[zs.length - 1])

    // ── LED line under the high slab (ARQ p.4) ──
    solid.box('led', [35.95, H.highBottom - 0.015, 1.6], [36.05, H.highBottom - 0.002, 11.9])
    // ── Front planter kerb ──
    solid.box('concrete_slab', [35.45, 0, 1.6], [37.9, 0.18, 1.7])
    solid.box('concrete_slab', [37.8, 0, 1.7], [37.9, 0.18, 6.75])
    // ── Outdoor shower on the north boundary (ARQ p.10/p.14 — A-10) ──
    solid.box('chrome', [13.68, 0, 0.24], [13.72, 2.2, 0.28])
    solid.box('chrome', [13.68, 2.18, 0.24], [13.72, 2.22, 0.55])
    solid.box('chrome', [13.55, 2.15, 0.45], [13.85, 2.17, 0.75])
    solid.box('external_deck', [12.9, 0, 0.22], [14.5, 0.1, 1.2])
    // ── Uplight housings (stone pillar, garage stone, sala frame) ──
    for (const [x, z] of [[36.3, 5.6], [36.3, 6.6], [29.7, 12.4], [29.7, 14.2], [27.1, 7.15], [27.1, 10.6], [17.0, 6.2]] as [number, number][]) {
      solid.box('black_metal', [x - 0.05, 0, z - 0.05], [x + 0.05, 0.1, z + 0.05])
      solid.box('led', [x - 0.035, 0.1, z - 0.035], [x + 0.035, 0.105, z + 0.035])
    }
    return { solid: solid.build(), glass: glass.build(), pergola: pergola.build() }
  }, [])

  useMemo(() => {
    addBlocker('car1', 30.1, 11.9, 35.0, 13.8)
    addBlocker('car2', 30.1, 14.9, 35.0, 16.8)
  }, [])

  // canopy downlights (ARQ p.5)
  const canopySpots = useMemo(() => {
    const p: { p: [number, number, number] }[] = []
    for (const x of [30.6, 32.6, 34.6]) for (const z of [12.2, 14.4, 16.6]) p.push({ p: [x, H.canopyBottom, z] })
    for (const z of [7.4, 8.9, 10.4]) p.push({ p: [34.9, H.canopyBottom, z] })
    return p
  }, [])
  const pergolaSpots = useMemo(() => [10.0, 13.2, 16.4].map((x) => ({ p: [x, H.wall + 0.3, 10.0] as [number, number, number] })), [])

  return (
    <group>
      <SlotMeshes geos={solid} bySlot />
      <SlotMeshes geos={glass} selectable={null} cast={false} receive={false} />
      <group visible={!plan}>
        <SlotMeshes geos={pergola} selectable="pergola" />
        <PrefabInstances id="downlight" build={downlight()} items={canopySpots} cast={false} />
        <PrefabInstances id="cylSpot" build={cylinderSpot(0.25)} items={pergolaSpots} cast={false} />
        <Prefab id="hangingChair" build={hangingChair('wicker_fixed', 3.0)} position={[11.05, 0.08, 12.45]} rotation={180} selectable="pool_furniture" />
      </group>
      <PrefabInstances id="wickerArm" build={wickerArmchair('hall_chairs')} items={[{ p: [34.35, 0.1, 7.35], r: 100 }, { p: [34.0, 0.1, 8.15], r: 80 }]} selectable="hall_chairs" />
      <PrefabInstances id="car" build={car()} items={[{ p: [32.6, 0.06, 12.85], r: 90 }, { p: [32.6, 0.06, 15.85], r: 90 }]} selectable={null} />
    </group>
  )
}
