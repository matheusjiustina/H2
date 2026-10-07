/**
 * BANHO SOCIAL — sources: INT p.40 (plan, rotated: top = east), INT p.41–43, ARQ p.2.
 * Room: x 29.96–31.56 · z 1.80–5.30. Shower at the north end (window),
 * WC + vanity along the east wall, door on the south wall.
 * Finishes: beige marbled porcelain, taupe slatted panel, LED-backlit mirror,
 * brass + frosted glass sconces, beige quartz counter.
 */
import { useMemo } from 'react'
import { Parts, PartsMeshes, useParts, T } from './kit'
import { Prefab, PrefabInstances } from '../furniture/prefab'
import { cabinetRow } from '../furniture/tables'
import { toilet, vesselSink, faucet, showerHead, sconce, downlight } from '../furniture/fixtures'
import { towel } from '../furniture/decor'
import { addBlocker } from '../controls/colliders'
import { HEIGHTS } from '../data/houseSpec'

const X0 = 29.96
const X1 = 31.56
const Z0 = 1.8
const F = HEIGHTS.floor

export function SocialBathroom() {
  const parts = useParts((p: Parts) => {
    // slatted taupe panel behind the vanity (INT p.41)
    const pn = p.of('socialbath_panel')
    pn.box('socialbath_panel', [X1 - 0.02, 0.95, 3.62], [X1, 2.6, 5.25])
    for (let z = 3.66; z < 5.22; z += 0.13) pn.box('socialbath_panel', [X1 - 0.05, 0.95, z], [X1 - 0.02, 2.6, z + 0.07])
    // vanity: taupe drawers + beige quartz counter (INT p.41)
    const v = p.of('socialbath_vanity')
    v.with(T(X1 - 0.52, F + 0.18, 0, -90), () => cabinetRow(v, 'socialbath_vanity', 3.78, 5.28, 0, 0.62, 0.5, 4, { handle: 'brass', plinth: null, drawers: 1 }))
    v.box('socialbath_counter', [X1 - 0.55, 0.9, 3.75], [X1, 0.94, 5.3])
    // low ledge behind the WC (INT p.41)
    v.box('socialbath_counter', [X1 - 0.22, F, 2.85], [X1, 0.94, 3.75])
    // LED-backlit mirror
    v.box('mirror', [X1 - 0.07, 1.25, 4.05], [X1 - 0.05, 2.42, 5.12])
    v.box('led', [X1 - 0.08, 1.22, 4.02], [X1 - 0.07, 2.45, 4.04])
    v.box('led', [X1 - 0.08, 1.22, 5.13], [X1 - 0.07, 2.45, 5.15])
    v.box('led', [X1 - 0.08, 2.43, 4.04], [X1 - 0.07, 2.45, 5.13])
    // shower: glass partition with sliding door at z 2.75 + lit niche (INT p.42/43)
    const sh = p.of('socialbath_walls')
    sh.box('chrome', [X0, 2.08, 2.72], [X1, 2.1, 2.76])
    sh.box('socialbath_stone', [X0, 0.1, Z0], [X1, 0.13, 2.75])
    sh.box('led', [X0 + 0.005, 0.5, 2.0], [X0 + 0.02, 2.0, 2.02])
    for (const y of [0.85, 1.25, 1.65]) sh.box('glass', [X0, y, 2.02], [X0 + 0.14, y + 0.01, 2.6])
  }, [])

  const glassPanes = useParts((p: Parts) => {
    const g = p.of('')
    g.box('glass', [X0 + 0.02, F, 2.735], [30.8, 2.08, 2.745])
    g.box('glass', [30.75, F, 2.75], [X1 - 0.02, 2.08, 2.76])
  }, [])

  const spots = useMemo(() => [2.3, 3.4, 4.6].map((z) => ({ p: [30.76, 2.56, z] as [number, number, number] })), [])
  useMemo(() => {
    addBlocker('bs_vanity', X1 - 0.55, 3.75, X1, 5.3)
    addBlocker('bs_glass', X0, 2.73, 30.8, 2.77)
  }, [])

  return (
    <group>
      <PartsMeshes parts={parts} />
      <PartsMeshes parts={glassPanes} />
      <Prefab id="bsWC" build={toilet()} position={[X1 - 0.22, F, 3.3]} rotation={-90} />
      <Prefab id="bsSink" build={vesselSink(0.48, 0.36)} position={[X1 - 0.3, 0.94, 4.62]} rotation={-90} />
      <Prefab id="bsFaucet" build={faucet('chrome')} position={[X1 - 0.07, 0.94, 4.62]} rotation={-90} />
      <Prefab id="bsShower" build={showerHead('chrome')} position={[30.75, 2.25, Z0 + 0.02]} />
      <PrefabInstances id="bsSconce" build={sconce()} items={[{ p: [X1 - 0.05, 1.75, 3.86], r: -90 }, { p: [X1 - 0.05, 2.2, 3.86], r: -90 }]} cast={false} />
      <Prefab id="bsTowel" build={towel(0.32, 0.6)} position={[X1 - 0.12, 1.55, 5.25]} />
      <PrefabInstances id="dl_bs" build={downlight()} items={spots} cast={false} />
    </group>
  )
}
