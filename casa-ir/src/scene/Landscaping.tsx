/**
 * Landscaping and pool furniture — positions follow ARQ p.2 (plan),
 * p.7/p.10/p.13 (renders) and p.16 (roof view). No random filling.
 */
import { useMemo } from 'react'
import { PrefabInstances } from '../furniture/prefab'
import { palm, canopyTree, tropicalClump, monstera, shrub } from '../furniture/plants'
import { sunLounger, teakChair } from '../furniture/seating'
import { teakRoundTable, umbrella } from '../furniture/tables'
import { PALMS, TREES, TROPICAL } from '../data/site'
import { addBlocker } from '../controls/colliders'

export function Landscaping() {
  const palms = useMemo(() => PALMS.map(([x, z, h], i) => ({ p: [x, 0, z] as [number, number, number], r: i * 47, s: h / 9 })), [])
  const trees = useMemo(() => TREES.map(([x, z, s], i) => ({ p: [x, 0.0, z] as [number, number, number], r: i * 80, s })), [])
  const tropA = useMemo(() => TROPICAL.filter((_, i) => i % 2 === 0 && TROPICAL[i][0] < 30).map(([x, z, r], i) => ({ p: [x, 0.03, z] as [number, number, number], r: i * 63, s: r / 0.7 })), [])
  const tropB = useMemo(() => TROPICAL.filter((_, i) => i % 2 === 1 && TROPICAL[i][0] < 30).map(([x, z, r], i) => ({ p: [x, 0.03, z] as [number, number, number], r: i * 41 + 20, s: r / 0.7 })), [])
  const front = useMemo(() => TROPICAL.filter(([x]) => x > 30).map(([x, z, r], i) => ({ p: [x, 0.15, z] as [number, number, number], r: i * 77, s: r / 0.7 })), [])
  const shrubs = useMemo(
    () =>
      [
        [22.3, 8.4], [24.9, 9.4], [22.4, 9.5], [25.0, 8.2], // central garden ground cover
        [0.7, 9.6], [0.8, 12.4], [0.7, 15.1], [0.8, 17.2], // west garden
      ].map(([x, z], i) => ({ p: [x, 0.08, z] as [number, number, number], r: i * 30, s: 0.8 + (i % 3) * 0.15 })),
    [],
  )

  useMemo(() => {
    for (const [x, z] of PALMS) addBlocker(`palm${x}`, x - 0.25, z - 0.25, x + 0.25, z + 0.25)
    for (const [x, z] of TREES) addBlocker(`tree${x}${z}`, x - 0.2, z - 0.2, x + 0.2, z + 0.2)
    addBlocker('poolTable', 13.3, 2.9, 14.65, 4.25)
    addBlocker('loungers', 9.0, 4.3, 11.6, 6.9)
    addBlocker('garden', 21.57, 7.83, 25.69, 9.88)
  }, [])

  return (
    <group>
      <PrefabInstances id="palm" build={palm(9, 3)} items={palms} />
      <PrefabInstances id="tree" build={canopyTree(1, 5)} items={trees} />
      <PrefabInstances id="tropA" build={tropicalClump(1.9, 1, 'leaf')} items={tropA} />
      <PrefabInstances id="tropB" build={tropicalClump(1.6, 2, 'leaf_dark')} items={tropB} />
      <PrefabInstances id="monstera" build={monstera(1)} items={front} />
      <PrefabInstances id="shrub" build={shrub(0.55, 1)} items={shrubs} />
      {/* pool furniture (ARQ p.2 plan positions; ARQ p.7/p.10 styles) */}
      <PrefabInstances id="lounger" build={sunLounger()} items={[{ p: [9.75, 0.05, 5.75], r: -35 }, { p: [10.85, 0.05, 5.15], r: -35 }]} selectable="pool_furniture" />
      <PrefabInstances id="poolTable" build={teakRoundTable()} items={[{ p: [13.97, 0.05, 3.55] }]} selectable="pool_furniture" />
      <PrefabInstances
        id="teakChair"
        build={teakChair()}
        items={[0, 90, 180, 270].map((a) => ({ p: [13.97 + Math.sin((a * Math.PI) / 180) * 0.78, 0.05, 3.55 + Math.cos((a * Math.PI) / 180) * 0.78] as [number, number, number], r: a + 180 }))}
        selectable="pool_furniture"
      />
      <PrefabInstances id="umbrella" build={umbrella()} items={[{ p: [13.97, 0.05, 3.55] }]} selectable="pool_furniture" />
    </group>
  )
}
