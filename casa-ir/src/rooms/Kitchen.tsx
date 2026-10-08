/**
 * COZINHA — sources: INT p.18 (plan, rotated 180°), INT p.19–23 (views), ARQ p.2.
 * Room: x 21.71–26.70 · z 11.15–16.20 · ceiling 2.80 with LED cove.
 * Layout (INT p.18 → world): L-shaped run on the south & east walls,
 * walnut island x 24.40–25.07 · z 12.39–14.62, glass-top table for 6,
 * cristaleira on the north wall, fridge + lit niche at the south-west corner.
 */
import { useMemo } from 'react'
import { Parts, PartsMeshes, clad, ledShelf, useParts, T } from './kit'
import { Prefab, PrefabInstances } from '../furniture/prefab'
import { cabinetRow, glassTopTable } from '../furniture/tables'
import { diningChair } from '../furniture/seating'
import { builtInOven, cooktop, downlight, fridge, globePendant, kitchenFaucet, sinkBasin, splitAC } from '../furniture/fixtures'
import { pothos } from '../furniture/plants'
import { vase } from '../furniture/decor'
import { addBlocker } from '../controls/colliders'
import { HEIGHTS } from '../data/houseSpec'

const X0 = 21.71
const X1 = 26.7
const Z0 = 11.15
const Z1 = 16.2
const F = HEIGHTS.floor
const CT = 0.9 // counter top

export function Kitchen() {
  const parts = useParts((p: Parts) => {
    const cab = p.of('kitchen_cabinets')
    const wood = p.of('kitchen_wood')
    const top = p.of('kitchen_counter')
    const bs = p.of('kitchen_backsplash')

    // ── South run (faces north): base cabinets x 22.70 → 26.10 ──
    cab.with(T(0, F, Z1 - 0.6, 180), () => {
      // local x is mirrored (yaw 180): world x = -local x
      cabinetRow(cab, 'cabinet_kitchen', -26.1, -25.6, 0, CT - F - 0.03, 0.6, 1, { handle: 'steel', drawers: 4, plinth: 'backsplash_kitchen' })
      cabinetRow(cab, 'cabinet_kitchen', -24.95, -23.45, 0, CT - F - 0.03, 0.6, 2, { handle: 'steel', plinth: 'backsplash_kitchen' })
    })
    // dishwasher (INT p.21) x 25.0–25.6
    cab.box('steel', [25.0, F + 0.1, Z1 - 0.6], [25.6, CT - 0.03, Z1 - 0.58])
    cab.box('screen', [25.0, F + 0.1, Z1 - 0.6], [25.6, CT - 0.03, Z1 - 0.62])
    top.ebox('counter_kitchen', [22.65, CT - 0.03, Z1 - 0.63], [26.7, CT, Z1])
    // uppers above the window (INT p.20) + walnut frieze
    cab.with(T(0, 1.95, Z1 - 0.36, 180), () => cabinetRow(cab, 'cabinet_kitchen', -26.1, -23.45, 0, 0.68, 0.36, 4, { plinth: null, handle: null }))
    wood.box('wood_kitchen', [X0, 2.63, Z1 - 0.03], [X1, 2.8, Z1])
    cab.box('led', [23.5, 1.94, Z1 - 0.34], [26.05, 1.945, Z1 - 0.32])
    // lit niche tower (INT p.20) x 22.66–23.44
    wood.box('wood_kitchen', [22.66, F, Z1 - 0.6], [23.44, 2.63, Z1 - 0.58])
    wood.box('wood_kitchen', [22.66, F, Z1 - 0.6], [22.7, 2.63, Z1])
    wood.box('wood_kitchen', [23.4, F, Z1 - 0.6], [23.44, 2.63, Z1])
    wood.box('wood_kitchen', [22.66, F, Z1 - 0.62], [23.44, 0.85, Z1])
    for (const y of [1.3, 1.75, 2.2]) ledShelf(wood, 'wood_kitchen', 22.7, 23.4, y, Z1 - 0.58, Z1 - 0.02)
    wood.box('wood_kitchen', [22.66, 2.6, Z1 - 0.62], [23.44, 2.63, Z1])
    // fridge housing above
    cab.box('cabinet_kitchen', [21.73, 2.0, Z1 - 0.68], [22.64, 2.63, Z1])

    // ── East run (faces west): counter z 13.55 → 15.60 + tall tower z 12.15 → 13.55 ──
    cab.with(T(X1 - 0.6, F, 0, -90), () => {
      // local x → world z (yaw -90: local +x → world +z)
      cabinetRow(cab, 'cabinet_kitchen', 13.55, 14.3, 0, CT - F - 0.03, 0.6, 1, { handle: 'steel', drawers: 4, plinth: 'backsplash_kitchen' })
      cabinetRow(cab, 'cabinet_kitchen', 15.1, 15.6, 0, CT - F - 0.03, 0.6, 1, { handle: 'steel', plinth: 'backsplash_kitchen' })
      cabinetRow(cab, 'cabinet_kitchen', 12.15, 13.55, 0, 2.53, 0.62, 3, { handle: 'steel', plinth: 'backsplash_kitchen' })
    })
    // oven housing under the cooktop (INT p.21); the tall run is pantry only
    cab.box('cabinet_kitchen', [X1 - 0.6, F, 14.3], [X1 - 0.02, CT - 0.03, 15.1])
    top.ebox('counter_kitchen', [X1 - 0.63, CT - 0.03, 13.55], [X1, CT, Z1 - 0.6])
    // terrazzo backsplash + hood box (INT p.19)
    clad(bs, 'backsplash_kitchen', 'e', X1, 13.55, Z1, CT, 2.63, 0.015)
    bs.box('backsplash_kitchen', [X1 - 0.55, 1.95, 14.25], [X1 - 0.015, 2.63, 15.2])
    clad(bs, 'backsplash_kitchen', 's', Z1, 25.1, X1, CT, 1.2, 0.012)
    wood.box('wood_kitchen', [X1 - 0.03, 2.63, Z0], [X1, 2.8, Z1])
    // walnut cladding on the west wall around the glass door (INT p.20 right)
    clad(wood, 'wood_kitchen', 'w', X0, Z0 + 0.02, 11.88, F, 2.8, 0.02)
    clad(wood, 'wood_kitchen', 'w', X0, 15.02, Z1 - 0.7, F, 2.8, 0.02)

    // ── Island (INT p.18/p.23) ──
    const isl = p.of('kitchen_wood')
    isl.box('backsplash_kitchen', [24.45, F, 12.44], [25.02, F + 0.1, 14.57])
    isl.box('wood_kitchen', [24.4, F + 0.1, 12.39], [25.07, CT - 0.03, 14.62])
    for (let i = 1; i < 3; i++) isl.box('rubber', [25.07, 0.3 + i * 0.2, 12.5], [25.075, 0.305 + i * 0.2, 14.5])
    top.ebox('counter_kitchen', [24.37, CT - 0.03, 12.36], [25.1, CT, 14.65])

    // ── Cristaleira on the north wall (INT p.22) x 23.05–24.85 ──
    clad(wood, 'wood_kitchen', 'n', Z0, 23.05, 24.85, F, 2.8, 0.025)
    const cr = p.of('kitchen_cabinets')
    cr.with(T(23.95, F, Z0 + 0.47, 0), () => cabinetRow(cr, 'cabinet_kitchen', -0.8, 0.8, 0, 0.75, 0.45, 4, { handle: null, plinth: 'black_metal' }))
    cr.box('cabinet_kitchen', [23.13, 0.85, Z0 + 0.025], [24.77, 0.88, Z0 + 0.5])
    // glass hutch
    cr.box('cabinet_kitchen', [23.2, 0.88, Z0 + 0.025], [24.7, 2.05, Z0 + 0.06])
    cr.box('cabinet_kitchen', [23.2, 0.88, Z0 + 0.025], [23.24, 2.05, Z0 + 0.42])
    cr.box('cabinet_kitchen', [24.66, 0.88, Z0 + 0.025], [24.7, 2.05, Z0 + 0.42])
    cr.box('cabinet_kitchen', [23.2, 2.01, Z0 + 0.025], [24.7, 2.05, Z0 + 0.42])
    for (let i = 1; i < 3; i++) cr.box('cabinet_kitchen', [23.2 + i * 0.5 - 0.015, 0.88, Z0 + 0.38], [23.2 + i * 0.5 + 0.015, 2.05, Z0 + 0.42])
    for (const y of [1.28, 1.66]) cr.box('frosted', [23.24, y, Z0 + 0.06], [24.66, y + 0.012, Z0 + 0.38])
    cr.box('glass', [23.24, 0.9, Z0 + 0.4], [24.66, 2.0, Z0 + 0.41])
  }, [])

  const chairs = useMemo(
    () => [
      ...[22.95, 23.53, 24.11].map((x) => ({ p: [x, F, 12.82] as [number, number, number], r: 0 })),
      ...[22.95, 23.53, 24.11].map((x) => ({ p: [x, F, 14.18] as [number, number, number], r: 180 })),
    ],
    [],
  )
  // five amber globes in a line over the walnut island (INT p.18 / p.23)
  const pendants = useMemo(() => [12.6, 13.05, 13.5, 13.95, 14.4].map((z) => ({ p: [24.735, 2.8, z] as [number, number, number] })), [])
  const spots = useMemo(() => {
    const s: { p: [number, number, number] }[] = []
    for (const x of [22.3, 25.9]) for (const z of [12.0, 13.6, 15.2]) s.push({ p: [x, 2.66, z] })
    return s
  }, [])

  useMemo(() => {
    addBlocker('k_south', 21.71, Z1 - 0.65, 26.7, Z1)
    addBlocker('k_east', X1 - 0.65, 12.15, X1, Z1)
    addBlocker('k_island', 24.37, 12.36, 25.1, 14.65)
    addBlocker('k_table', 22.65, 12.95, 24.4, 14.05)
    addBlocker('k_crist', 23.13, Z0, 24.77, Z0 + 0.5)
  }, [])

  return (
    <group>
      <PartsMeshes parts={parts} />
      <Prefab id="kTable" build={glassTopTable('table_kitchen', 1.7, 0.88)} position={[23.53, F, 13.5]} selectable="kitchen_table" />
      <PrefabInstances id="kChair" build={diningChair('chair_kitchen_fabric', 'walnut_fixed')} items={chairs} selectable="kitchen_chairs" />
      <Prefab id="kFridge" build={fridge()} position={[22.18, F, Z1 - 0.02]} rotation={180} />
      <Prefab id="kCooktop" build={cooktop(0.75)} position={[X1 - 0.3, CT, 14.72]} rotation={90} />
      <Prefab id="kOven" build={builtInOven(0.6, 0.6)} position={[X1 - 0.6, CT - 0.74, 14.7]} rotation={-90} />
      <Prefab id="kSink" build={sinkBasin(0.7, 0.42)} position={[24.3, CT, Z1 - 0.3]} />
      <Prefab id="kFaucet" build={kitchenFaucet('steel')} position={[24.3, CT, Z1 - 0.08]} rotation={180} />
      <Prefab id="kPothos" build={pothos(0.55)} position={[23.05, 2.23, Z1 - 0.3]} />
      <Prefab id="kVase" build={vase(0.25, 0.08)} position={[22.95, 1.33, Z1 - 0.3]} />
      <Prefab id="kAC" cut build={splitAC()} position={[X0 + 0.02, 2.4, 15.6]} rotation={90} />
      <PrefabInstances id="kPend" cut build={globePendant(0.85)} items={pendants} cast={false} />
      <PrefabInstances id="dl_k" cut build={downlight()} items={spots} cast={false} />
    </group>
  )
}

