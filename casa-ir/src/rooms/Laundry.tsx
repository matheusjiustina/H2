/**
 * LAVANDERIA — sources: INT p.12 (plan, rotated 90°: top = west), INT p.13–17, ARQ p.2.
 * Room: x 26.86–29.36 · z 12.34–16.20. South sliding door opens onto the
 * banana-tree garden (INT p.13).
 * East run (INT p.14): walnut base + 2 steel tanks, front loader, top loader,
 *   sand lacquer uppers, lit open niche, walnut band, terrazzo backsplash.
 * West run (INT p.15–17): walnut wall panel with bench + hooks, sand lacquer
 *   base/drawers + granite top, uppers, tall tower.
 */
import { useMemo } from 'react'
import { Parts, PartsMeshes, clad, ledShelf, useParts, T } from './kit'
import { Prefab } from '../furniture/prefab'
import { cabinetRow } from '../furniture/tables'
import { downlight, sinkBasin, washer, faucet } from '../furniture/fixtures'
import { pothos } from '../furniture/plants'
import { basket, towel } from '../furniture/decor'
import { PrefabInstances } from '../furniture/prefab'
import { addBlocker } from '../controls/colliders'
import { HEIGHTS } from '../data/houseSpec'

const X0 = 26.86
const X1 = 29.36
const Z0 = 12.34
const Z1 = 16.2
const F = HEIGHTS.floor
const CT = 0.9

export function Laundry() {
  const parts = useParts((p: Parts) => {
    // ── East run (faces west) ──
    const base = p.of('laundry_base')
    base.with(T(X1 - 0.6, F, 0, -90), () => cabinetRow(base, 'laundry_base', 12.4, 14.9, 0, CT - F - 0.03, 0.6, 4, { handle: 'steel', plinth: 'black_metal' }))
    p.of('laundry_counter').box('laundry_counter', [X1 - 0.62, CT - 0.03, 12.36], [X1, CT, 15.5])
    clad(p.of('laundry_backsplash'), 'laundry_backsplash', 'e', X1, 12.36, 15.5, CT, 1.55, 0.012)
    const upE = p.of('laundry_upper')
    upE.with(T(X1 - 0.36, 1.65, 0, -90), () => cabinetRow(upE, 'laundry_upper', 12.4, 14.5, 0, 0.72, 0.36, 4, { handle: 'steel', plinth: null }))
    // open lit niche (INT p.14)
    upE.box('laundry_upper', [X1 - 0.36, 1.65, 14.55], [X1, 1.68, 15.45])
    upE.box('laundry_upper', [X1 - 0.36, 2.34, 14.55], [X1, 2.37, 15.45])
    upE.box('laundry_upper', [X1 - 0.36, 1.65, 14.55], [X1, 2.37, 14.58])
    upE.box('laundry_upper', [X1 - 0.36, 1.65, 15.42], [X1, 2.37, 15.45])
    ledShelf(upE, 'laundry_upper', X1 - 0.34, X1 - 0.02, 2.0, 14.58, 15.42)
    // walnut band behind/above the uppers + LED under the uppers
    const panel = p.of('laundry_panel')
    clad(panel, 'laundry_panel', 'e', X1, 12.36, Z1 - 0.02, 1.55, 2.8, 0.015)
    upE.box('led', [X1 - 0.34, 1.645, 12.42], [X1 - 0.32, 1.65, 14.48])

    // ── West run (faces east) ──
    const upW = p.of('laundry_upper')
    // walnut panel full height on the west wall (INT p.15)
    clad(panel, 'laundry_panel', 'w', X0, Z0 + 0.02, Z1 - 0.02, F, 2.8, 0.015)
    // bench + hooks z 15.45–16.18
    panel.box('laundry_panel', [X0, 0.45, 15.45], [X0 + 0.42, 0.49, 16.15])
    for (const z of [15.65, 15.95]) panel.box('brass', [X0 + 0.015, 1.65, z - 0.01], [X0 + 0.07, 1.67, z + 0.01])
    // base: 4 drawers + doors, z 13.66–15.45
    upW.with(T(X0 + 0.6, F, 0, 90), () => {
      // yaw 90: local +x → world −z, so pass negated z
      cabinetRow(upW, 'laundry_upper', -15.45, -13.66, 0, 0.45, 0.6, 4, { handle: 'steel', handleV: false, plinth: 'black_metal' })
    })
    upW.with(T(X0 + 0.6, 0.55 + F, 0, 90), () => cabinetRow(upW, 'laundry_upper', -15.45, -13.66, 0, 0.3, 0.6, 4, { handle: 'steel', drawers: 1, plinth: null }))
    p.of('laundry_counter').box('laundry_counter', [X0, CT - 0.03, 13.13], [X0 + 0.62, CT, 15.45])
    upW.with(T(X0 + 0.36, 1.65, 0, 90), () => cabinetRow(upW, 'laundry_upper', -15.4, -13.7, 0, 0.72, 0.36, 4, { handle: 'steel', plinth: null }))
    upW.box('led', [X0 + 0.32, 1.645, 13.75], [X0 + 0.34, 1.65, 15.35])
    // tall tower z 12.38–13.13
    upW.with(T(X0 + 0.62, F, 0, 90), () => cabinetRow(upW, 'laundry_upper', -13.13, -12.38, 0, 2.5, 0.62, 2, { handle: 'steel', plinth: 'black_metal' }))
    // hanging rail under the uppers
    upW.box('steel', [X0 + 0.25, 1.6, 13.8], [X0 + 0.27, 1.62, 15.3])
  }, [])

  const spots = useMemo(() => [12.9, 14.3, 15.6].map((z) => ({ p: [28.1, 2.8, z] as [number, number, number] })), [])
  useMemo(() => {
    addBlocker('l_east', X1 - 0.62, 12.36, X1, 16.15)
    addBlocker('l_west', X0, 12.38, X0 + 0.62, 15.45)
  }, [])

  return (
    <group>
      <PartsMeshes parts={parts} />
      {[13.0, 13.9].map((z) => (
        <group key={z}>
          <Prefab id="lTank" build={sinkBasin(0.5, 0.42)} position={[X1 - 0.3, CT, z]} rotation={-90} />
          <Prefab id="lFaucet" build={faucet('steel', true)} position={[X1 - 0.03, CT + 0.25, z]} rotation={-90} />
        </group>
      ))}
      <Prefab id="lFront" build={washer(true)} position={[X1 - 0.02, F, 15.2]} rotation={-90} />
      <Prefab id="lTop" build={washer(false)} position={[X1 - 0.02, F, 15.85]} rotation={-90} />
      <Prefab id="lBasket" build={basket(0.2, 0.32)} position={[X0 + 0.25, F, 15.8]} />
      <Prefab id="lTowel" build={towel(0.35, 0.8)} position={[X0 + 0.08, 1.64, 15.65]} rotation={90} />
      <Prefab id="lPothos" build={pothos(0.5)} position={[X1 - 0.18, 2.03, 15.25]} />
      <PrefabInstances id="dl_l" build={downlight()} items={spots} cast={false} />
    </group>
  )
}
