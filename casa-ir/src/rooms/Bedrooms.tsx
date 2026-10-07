/**
 * QUARTOS 01 e 02 — sources: ARQ p.2 (plan furniture), ARQ p.15 (Q01 glass door).
 * NOT DETAILED in the interior design PDF (assumption A-07): furnished with
 * what the architectural plan shows (bed, nightstands, wardrobe/desk) in
 * neutral finishes consistent with the project palette.
 */
import { useMemo } from 'react'
import { Parts, PartsMeshes, useParts, T } from './kit'
import { Prefab, PrefabInstances } from '../furniture/prefab'
import { cabinetRow } from '../furniture/tables'
import { simpleBed, loungeChair } from '../furniture/seating'
import { tableLamp, downlight } from '../furniture/fixtures'
import { rug } from '../furniture/decor'
import { addBlocker } from '../controls/colliders'
import { HEIGHTS } from '../data/houseSpec'

const F = HEIGHTS.floor

export function Bedrooms() {
  const parts = useParts((p: Parts) => {
    const j = p.of('bedroom_joinery')
    // Q01 wardrobe along the south wall (ARQ p.2) x 32.6–35.15
    j.with(T(0, F, 6.55 - 0.6, 180), () => cabinetRow(j, 'bedroom_joinery', -35.15, -32.6, 0, 2.55, 0.6, 4, { handle: 'brass', plinth: 'black_metal' }))
    // Q02 wardrobe along the east wall (ARQ p.2) z 1.85–3.70
    j.with(T(29.81 - 0.6, F, 0, -90), () => cabinetRow(j, 'bedroom_joinery', 1.85, 3.7, 0, 2.55, 0.6, 3, { handle: 'brass', plinth: 'black_metal' }))
    // headboard panels
    j.box('bedroom_joinery', [31.72, F, 2.6], [31.78, 1.3, 4.6])
    j.box('bedroom_joinery', [26.21, F, 2.6], [26.27, 1.3, 4.6])
    // nightstands
    for (const z of [2.3, 4.9]) {
      j.box('bedroom_joinery', [31.78, F + 0.1, z - 0.22], [32.22, 0.55, z + 0.22])
      j.box('bedroom_joinery', [26.27, F + 0.1, z - 0.22], [26.71, 0.55, z + 0.22])
    }
  }, [])
  const spots = useMemo(() => {
    const s: { p: [number, number, number] }[] = []
    for (const [x, z] of [[33.4, 3.0], [33.4, 5.2], [28.0, 2.6], [28.0, 4.6]]) s.push({ p: [x, 2.65, z] })
    return s
  }, [])
  useMemo(() => {
    addBlocker('q1_bed', 31.72, 2.55, 33.85, 4.65)
    addBlocker('q1_ward', 32.6, 5.95, 35.15, 6.55)
    addBlocker('q2_bed', 26.21, 2.55, 28.35, 4.65)
    addBlocker('q2_ward', 29.2, 1.85, 29.81, 3.7)
  }, [])
  return (
    <group>
      <PartsMeshes parts={parts} />
      <Prefab id="q1Rug" build={rug('rug_fixed_sand', 2.2, 2.8)} position={[33.2, F, 3.6]} cast={false} />
      <PrefabInstances id="qBed" build={simpleBed(1.6, 'bedroom_bedding', 'bedroom_joinery')} items={[{ p: [32.8, F, 3.6], r: 90 }, { p: [27.3, F, 3.6], r: 90 }]} selectable="bedroom_beds" />
      <PrefabInstances id="qLamp" build={tableLamp('brass')} items={[{ p: [32.0, 0.55, 2.3] }, { p: [32.0, 0.55, 4.9] }, { p: [26.5, 0.55, 2.3] }, { p: [26.5, 0.55, 4.9] }]} cast={false} />
      <Prefab id="q1Arm" build={loungeChair('fab_sand_fixed', 'walnut_fixed')} position={[34.6, F, 4.9]} rotation={-120} />
      <PrefabInstances id="dl_q" build={downlight()} items={spots} cast={false} />
    </group>
  )
}
