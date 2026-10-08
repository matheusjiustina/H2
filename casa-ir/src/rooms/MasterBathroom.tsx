/**
 * BANHO DA SUÍTE MASTER — sources: INT p.44 (plan), INT p.55–56 (views), ARQ p.2.
 * Room: x 21.52–23.10 · z 1.80–3.90. Shower at the north end (window),
 * wall-hung WC on the east wall, door from the closet (south).
 * Large-format grey stone porcelain, taupe 3D "capsule" tiles on the shower
 * wall, lit niche, brushed brass fittings and glass partition with brass profile.
 * (The basin lives in the closet vanity — INT p.44/p.52.)
 */
import { useMemo } from 'react'
import { Parts, PartsMeshes, clad, useParts } from './kit'
import { Prefab, PrefabInstances } from '../furniture/prefab'
import { toilet, showerHead, downlight } from '../furniture/fixtures'
import { addBlocker } from '../controls/colliders'
import { HEIGHTS } from '../data/houseSpec'

const X0 = 21.52
const X1 = 23.1
const Z0 = 1.8
const F = HEIGHTS.floor

export function MasterBathroom() {
  const parts = useParts((p: Parts) => {
    const t = p.of('masterbath_tile')
    // window wall in grey stone porcelain; the 3D capsule tile only on the niche wall (INT p.55)
    clad(p.of('masterbath_walls'), 'masterbath_stone', 'n', Z0, X0 + 0.02, X1 - 0.02, F, 2.7, 0.03, [[21.8, 22.8, 1.55, 2.2]])
    clad(t, 'masterbath_tile', 'w', X0, Z0 + 0.03, 2.8, F, 2.7, 0.03)
    // lit niche with shelves on the west wall (INT p.55)
    t.box('led', [X0 + 0.03, 0.4, 2.48], [X0 + 0.04, 2.3, 2.5])
    for (const y of [0.75, 1.15, 1.55, 1.95]) t.box('masterbath_stone', [X0 + 0.03, y, 2.2], [X0 + 0.2, y + 0.025, 2.48])
    // glass partition with brass profile at z 2.80 (x 21.52–22.55)
    const m = p.of('masterbath_metal')
    m.box('masterbath_metal', [22.53, F, 2.78], [22.56, 2.25, 2.82])
    m.box('masterbath_metal', [X0, F, 2.78], [22.56, F + 0.02, 2.82])
    m.box('masterbath_metal', [X0, 2.25, 2.78], [X1, 2.28, 2.82])
    p.of('').box('glass', [X0 + 0.02, F + 0.02, 2.795], [22.53, 2.25, 2.805])
    // shower floor slab
    p.of('masterbath_walls').box('masterbath_stone', [X0, F, Z0], [X1, F + 0.02, 2.78])
  }, [])
  const spots = useMemo(() => [{ p: [22.3, 2.69, 2.3] as [number, number, number] }, { p: [22.3, 2.69, 3.4] as [number, number, number] }], [])
  useMemo(() => addBlocker('mb_glass', X0, 2.77, 22.56, 2.83), [])
  return (
    <group>
      <PartsMeshes parts={parts} />
      <Prefab id="mbWC" build={toilet()} position={[X1 - 0.02, F, 3.45]} rotation={-90} />
      <Prefab id="mbShower" build={showerHead('masterbath_metal')} position={[22.45, 2.3, Z0 + 0.04]} selectable="masterbath_metal" />
      <PrefabInstances id="dl_mb" cut build={downlight()} items={spots} cast={false} />
    </group>
  )
}
