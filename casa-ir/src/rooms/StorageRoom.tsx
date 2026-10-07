/**
 * DEPÓSITO (INT p.33, ARQ p.2) — x 4.82–8.31 · z 15.30–16.20, accessed from
 * the south yard through louvred doors: black metal uprights with grey
 * shelves, tool boxes, coolers, bicycles hung on the wall, ladder.
 * DESPENSA (ARQ p.2, ARQ p.8/9) — x 8.46–11.70 · z 13.37–16.20: L-shaped
 * lacquer shelving (as drawn on the architectural plan); not detailed in INT.
 */
import { useMemo } from 'react'
import { Parts, PartsMeshes, useParts } from './kit'
import { PrefabInstances } from '../furniture/prefab'
import { bicycle, storageBox } from '../furniture/decor'
import { downlight } from '../furniture/fixtures'
import { addBlocker } from '../controls/colliders'
import { HEIGHTS } from '../data/houseSpec'

const F = HEIGHTS.floor

export function StorageRoom() {
  const parts = useParts((p: Parts) => {
    const s = p.of('pantry')
    // ── Depósito: metal shelving on the north wall ──
    for (let x = 4.9; x <= 8.25; x += 1.1) s.box('black_metal', [x, F, 15.32], [x + 0.03, 2.7, 15.35])
    for (let x = 4.9; x <= 8.25; x += 1.1) s.box('black_metal', [x, F, 15.68], [x + 0.03, 2.7, 15.71])
    for (const y of [0.45, 0.95, 1.45, 1.95, 2.45]) s.box('pantry_shelves', [4.86, y, 15.32], [6.9, y + 0.025, 15.72])
    // ── Despensa: L-shaped shelving (south + west walls) ──
    for (const y of [0.5, 0.95, 1.4, 1.85, 2.3]) {
      s.box('pantry_shelves', [8.48, y, 15.7], [11.68, y + 0.025, 16.18])
      s.box('pantry_shelves', [8.48, y, 13.4], [8.95, y + 0.025, 15.7])
    }
    s.box('pantry_shelves', [8.48, F, 15.7], [11.68, 0.5, 15.73])
    s.box('pantry_shelves', [8.92, F, 13.4], [8.95, 0.5, 15.7])
    // jars / boxes
    const j = p.of('')
    for (let i = 0; i < 9; i++) j.box(i % 3 ? 'frosted' : 'paper', [8.7 + i * 0.32, 0.975, 15.85], [8.92 + i * 0.32, 1.2, 16.05])
    for (let i = 0; i < 6; i++) j.box('wicker_fixed', [8.6 + i * 0.5, 1.425, 15.8], [8.95 + i * 0.5, 1.65, 16.1])
    for (let i = 0; i < 4; i++) j.box('paper', [8.55, 0.975 + 0, 13.6 + i * 0.5], [8.88, 1.25, 13.95 + i * 0.5])
  }, [])

  useMemo(() => {
    addBlocker('dep_shelf', 4.82, 15.3, 8.31, 15.75)
    addBlocker('desp_s', 8.46, 15.7, 11.7, 16.2)
    addBlocker('desp_w', 8.46, 13.37, 8.95, 15.7)
  }, [])

  return (
    <group>
      <PartsMeshes parts={parts} />
      <PrefabInstances id="dBike" build={bicycle()} items={[{ p: [7.75, F + 0.25, 15.65], r: 90 }, { p: [7.35, F + 0.05, 15.75], r: 90 }]} />
      <PrefabInstances id="dBox" build={storageBox(0.42, 0.28, 0.32, 'plastic')} items={[{ p: [5.2, 0.475, 15.5] }, { p: [5.7, 0.475, 15.5] }, { p: [6.35, 1.475, 15.5] }]} />
      <PrefabInstances id="dBox2" build={storageBox(0.4, 0.22, 0.3, 'red')} items={[{ p: [5.25, 1.475, 15.5] }, { p: [5.7, 1.475, 15.5] }]} />
      <PrefabInstances id="dBox3" build={storageBox(0.36, 0.2, 0.3, 'paper')} items={[{ p: [6.4, 0.975, 15.5] }, { p: [6.4, 1.975, 15.5] }, { p: [5.4, 1.975, 15.5] }]} />
      <PrefabInstances id="dl_s" build={downlight()} items={[{ p: [6.55, 2.79, 15.75] }, { p: [10.1, 2.79, 14.8] }]} cast={false} />
    </group>
  )
}
