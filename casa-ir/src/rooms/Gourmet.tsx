/**
 * ÁREA GOURMET — sources: INT p.18 (plan, rotated 180°), INT p.24–28 (views),
 * ARQ p.2 (openings), ARQ p.7/p.14 (exterior).
 * Room: x 13.61–21.55 · z 11.15–16.20 · wooden ceiling at 2.95.
 * South run (east → west): lit shelves, wine cooler, walnut base run with
 * cooktop + sink, terrazzo backsplash with LED shelves, churrasqueira column.
 * Organic black-granite island with 3 stools, 10-seat trestle table.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import { Parts, PartsMeshes, clad, ledShelf, useParts, T } from './kit'
import { Prefab, PrefabInstances } from '../furniture/prefab'
import { cabinetRow, trestleTable } from '../furniture/tables'
import { ropeChair, ropeStool } from '../furniture/seating'
import { ceilingFan, churrasqueira, cooktop, kitchenFaucet, sinkBasin, tvScreen, wickerCone, wineCooler } from '../furniture/fixtures'
import { pothos } from '../furniture/plants'
import { vase, bottles } from '../furniture/decor'
import { addBlocker } from '../controls/colliders'
import { extrudePoly, chaikin } from '../architecture/shapes'
import { HEIGHTS } from '../data/houseSpec'
import type { Poly } from '../data/site'

const X1 = 21.55
const Z0 = 11.15
const Z1 = 16.2
const F = HEIGHTS.floor
const CT = 0.9
const CEIL = 2.95

/** Island outline traced from INT p.18 (world plan coords). */
const ISLAND: Poly = chaikin(
  [
    [16.72, 13.35],
    [16.72, 14.22],
    [15.9, 14.5],
    [15.1, 14.42],
    [14.78, 13.95],
    [14.9, 13.35],
    [15.35, 12.98],
    [15.95, 12.98],
  ],
  3,
)

export function Gourmet() {
  const parts = useParts((p: Parts) => {
    const wood = p.of('gourmet_wood')
    const up = p.of('gourmet_uppers')
    const top = p.of('gourmet_counter')
    const tz = p.of('gourmet_terrazzo')

    // ── South run: base cabinets x 16.50 → 20.55 (faces north) ──
    wood.with(T(0, F, Z1 - 0.6, 180), () => cabinetRow(wood, 'wood_gourmet', -20.55, -16.5, 0, CT - F - 0.03, 0.6, 7, { handle: null, plinth: 'terrazzo_gourmet' }))
    top.ebox('stone_gourmet', [16.45, CT - 0.03, Z1 - 0.63], [20.58, CT, Z1])
    // terrazzo backsplash between counter and frieze
    clad(tz, 'terrazzo_gourmet', 's', Z1, 16.45, 20.58, CT, 2.6, 0.015, [[16.95, 18.3, 1.2, 1.8]])
    // floating LED shelves above the window (INT p.26)
    for (const y of [1.95, 2.36]) ledShelf(up, 'cabinet_gourmet', 16.55, 19.35, y, Z1 - 0.3, Z1 - 0.015)
    // upper cabinets above the cooktop
    up.with(T(0, 1.68, Z1 - 0.36, 180), () => cabinetRow(up, 'cabinet_gourmet', -20.55, -19.4, 0, 0.92, 0.36, 3, { plinth: null, handle: null }))
    up.box('led', [19.42, 1.675, Z1 - 0.34], [20.53, 1.68, Z1 - 0.32])
    // walnut frieze under the wooden ceiling
    wood.box('wood_gourmet', [16.45, 2.6, Z1 - 0.38], [21.55, CEIL, Z1])
    // tall unit above the wine cooler + open shelf column (INT p.26 left)
    up.with(T(0, 1.95, Z1 - 0.6, 180), () => cabinetRow(up, 'cabinet_gourmet', -21.15, -20.55, 0, 0.65, 0.6, 2, { plinth: null, handle: null }))
    up.box('cabinet_gourmet', [21.15, F, Z1 - 0.4], [21.19, 2.6, Z1])
    up.box('cabinet_gourmet', [21.5, F, Z1 - 0.4], [21.55, 2.6, Z1])
    up.box('cabinet_gourmet', [21.15, F, Z1 - 0.03], [21.55, 2.6, Z1])
    for (const y of [0.45, 0.9, 1.35, 1.8, 2.25]) ledShelf(up, 'cabinet_gourmet', 21.19, 21.5, y, Z1 - 0.38, Z1 - 0.03, 0.025)

    // ── Churrasqueira column x 15.40–16.45 (INT p.25/26) ──
    // column built around the grill opening (x 15.52–16.32, y 1.03–1.57, 0.5 m deep)
    const GY0 = 1.03
    const GY1 = 1.57
    tz.box('terrazzo_gourmet', [15.4, F, Z1 - 0.85], [15.52, CEIL, Z1])
    tz.box('terrazzo_gourmet', [16.32, F, Z1 - 0.85], [16.45, CEIL, Z1])
    tz.box('terrazzo_gourmet', [15.52, F, Z1 - 0.85], [16.32, GY0, Z1])
    tz.box('terrazzo_gourmet', [15.52, GY1, Z1 - 0.85], [16.32, CEIL, Z1])
    tz.box('terrazzo_gourmet', [15.52, GY0, Z1 - 0.33], [16.32, GY1, Z1])
    // (grill insert rendered as a prefab)

    // ── TV wall on the solid north bay (INT p.27 — A-13) ──
    up.box('led', [20.05, 0.9, Z0 + 0.01], [21.25, 0.905, Z0 + 0.03])

    // ── Organic island (INT p.18/p.27/p.28) ──
    const isl = p.of('gourmet_counter')
    isl.geo('stone_gourmet', extrudePoly(ISLAND, 1.0, 0.04))
    const inner = ISLAND.map(([x, z]) => [15.75 + (x - 15.75) * 0.92, 13.75 + (z - 13.75) * 0.9] as [number, number])
    const base = p.of('gourmet_wood')
    base.geo('wood_gourmet', extrudePoly(inner, F + 0.1, 1.0 - F - 0.1))
    const plinth = inner.map(([x, z]) => [15.75 + (x - 15.75) * 0.96, 13.75 + (z - 13.75) * 0.96] as [number, number])
    p.of('gourmet_terrazzo').geo('terrazzo_gourmet', extrudePoly(plinth, F, 0.1))
  }, [])

  const chairs = useMemo(
    () => [
      ...[17.0, 17.75, 18.5, 19.25, 20.0].map((x) => ({ p: [x, F, 13.02] as [number, number, number], r: 0 })),
      ...[17.0, 17.75, 18.5, 19.25, 20.0].map((x) => ({ p: [x, F, 14.53] as [number, number, number], r: 180 })),
    ],
    [],
  )
  const stools = useMemo(() => {
    const c = new THREE.Vector2(15.75, 13.75)
    return [
      [16.25, 12.62],
      [15.45, 12.72],
      [14.62, 13.2],
    ].map(([x, z]) => ({ p: [x, F, z] as [number, number, number], r: (Math.atan2(c.x - x, c.y - z) * 180) / Math.PI }))
  }, [])
  const cones = useMemo(() => [[15.25, 13.95], [15.75, 13.68], [16.25, 13.42]].map(([x, z]) => ({ p: [x, CEIL, z] as [number, number, number] })), [])
  const fans = useMemo(() => [{ p: [17.6, CEIL, 13.78] as [number, number, number] }, { p: [19.6, CEIL, 13.78] as [number, number, number] }], [])

  useMemo(() => {
    addBlocker('g_south', 16.45, Z1 - 0.65, X1, Z1)
    addBlocker('g_column', 15.4, Z1 - 0.85, 16.45, Z1)
    addBlocker('g_island', 14.78, 12.98, 16.72, 14.5)
    addBlocker('g_table', 16.75, 13.1, 20.4, 14.45)
  }, [])

  return (
    <group>
      <PartsMeshes parts={parts} />
      <Prefab id="gTable" build={trestleTable('gourmet_table_wood', 3.62, 0.92)} position={[18.55, F, 13.78]} selectable="gourmet_table" />
      <PrefabInstances id="gChair" build={ropeChair('gourmet_chairs', 'teak_fixed')} items={chairs} selectable="gourmet_chairs" />
      <PrefabInstances id="gStool" build={ropeStool('gourmet_chairs', 'teak_fixed')} items={stools} selectable="gourmet_chairs" />
      <Prefab id="gWine" build={wineCooler()} position={[20.85, F, Z1 - 0.02]} rotation={180} />
      <Prefab id="gGrill" build={churrasqueira()} position={[15.92, 0.95, Z1 - 0.85]} rotation={180} />
      <Prefab id="gCooktop" build={cooktop(0.6)} position={[19.9, CT, Z1 - 0.3]} />
      <Prefab id="gSink" build={sinkBasin(0.6, 0.42)} position={[17.65, CT, Z1 - 0.3]} />
      <Prefab id="gFaucet" build={kitchenFaucet('black_metal')} position={[17.65, CT, Z1 - 0.08]} rotation={180} />
      <Prefab id="gTV" build={tvScreen(1.2, 0.98)} position={[20.65, 1.55, Z0 + 0.06]} />
      <Prefab id="gPothos1" build={pothos(0.6)} position={[16.75, 2.395, Z1 - 0.15]} />
      <Prefab id="gPothos2" build={pothos(0.5)} position={[21.33, 1.83, Z1 - 0.2]} />
      <Prefab id="gVase" build={vase(0.26, 0.08, 'linen_dark')} position={[18.2, 1.98, Z1 - 0.15]} />
      <Prefab id="gBottles" build={bottles()} position={[21.25, 0.93, Z1 - 0.2]} />
      <PrefabInstances id="gCone" cut build={wickerCone(1.25)} items={cones} cast={false} />
      <PrefabInstances id="gFan" cut build={ceilingFan()} items={fans} />
    </group>
  )
}
