/**
 * SALA DE TV — double-height living room.
 * sources: INT p.4 (plan), p.5–p.9 (views), p.10 (rack detail), p.11 (armchair);
 *          ARQ p.2 (walls/openings), ARQ p.6 & p.14 (tall glazing from the patio).
 * Room: x 27.87–33.26 · z 6.70–11.00 · ceiling 5.50
 */
import { useMemo } from 'react'
import { Parts, PartsMeshes, clad, useParts } from './kit'
import { Prefab, PrefabInstances } from '../furniture/prefab'
import { sofaModular, rollArmchair } from '../furniture/seating'
import { pedestalTable } from '../furniture/tables'
import { dropCluster, tvScreen, downlight } from '../furniture/fixtures'
import { ficus } from '../furniture/plants'
import { bookStack, glassVase, candle, rug } from '../furniture/decor'
import { addBlocker } from '../controls/colliders'
import { HEIGHTS } from '../data/houseSpec'

const X0 = 27.87
const X1 = 33.26
const Z0 = 6.7
const Z1 = 11.0
const CEIL = HEIGHTS.salaCeiling
const TOP = CEIL - 0.14 // underside of the cove drop

export function TvRoom() {
  const parts = useParts((p: Parts) => {
    // ── North feature wall: linen texture + walnut blocks (INT p.7, p.11) ──
    const fw = p.of('tv_feature')
    clad(fw, 'tv_feature_wall', 'n', Z0, X0 + 0.02, X1 - 0.02, HEIGHTS.floor, TOP, 0.02, [[27.98, 28.92, 0, 2.2]])
    let seed = 11
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let x = 28.45; x < X1 - 0.2; x += 0.41) {
      const n = 2 + (r() > 0.55 ? 1 : 0)
      for (let k = 0; k < n; k++) {
        const y = 1.05 + ((k + r() * 0.9) / n) * (TOP - 1.7)
        if (x < 29.0 && y < 2.6) continue
        fw.box('tv_wood_blocks', [x - 0.085, y, Z0 + 0.02], [x + 0.085, y + 0.56, Z0 + 0.05])
        fw.box('tv_wood_blocks', [x - 0.06, y + 0.03, Z0 + 0.05], [x + 0.06, y + 0.53, Z0 + 0.075])
      }
    }

    // ── South TV wall: graphite panel framed by travertine with LED (INT p.6) ──
    const tw = p.of('tv_panel')
    // graphite paint for the rest of the wall
    clad(tw, 'tv_panel', 's', Z1, X0 + 0.02, 29.5, HEIGHTS.floor, TOP, 0.012, [[27.93, 28.88, 0, 2.2]])
    clad(tw, 'tv_panel', 's', Z1, 32.95, X1 - 0.02, HEIGHTS.floor, TOP, 0.012)
    // travertine side panels
    tw.box('tv_stone_frame', [29.5, HEIGHTS.floor, Z1 - 0.05], [30.12, TOP, Z1])
    tw.box('tv_stone_frame', [32.33, HEIGHTS.floor, Z1 - 0.05], [32.95, TOP, Z1])
    // recessed graphite panel with bevelled inner frame
    tw.box('tv_panel', [30.16, 0.62, Z1 - 0.1], [32.29, TOP, Z1])
    tw.box('tv_panel', [30.36, 0.82, Z1 - 0.12], [32.09, TOP - 0.25, Z1 - 0.1])
    // LED backlight in the gaps
    tw.box('led', [30.12, 0.62, Z1 - 0.03], [30.16, TOP, Z1 - 0.01])
    tw.box('led', [32.29, 0.62, Z1 - 0.03], [32.33, TOP, Z1 - 0.01])
    tw.box('led', [30.16, 0.6, Z1 - 0.06], [32.29, 0.62, Z1 - 0.02])

    // ── Floating rack (INT p.4, p.6, p.10) x 29.20–33.20 ──
    const rk = p.of('tv_rack')
    const ry0 = 0.24
    const ry1 = 0.56
    rk.box('tv_panel', [29.2, ry0, Z1 - 0.47], [33.2, ry0 + 0.03, Z1 - 0.03]) // bottom
    rk.box('tv_panel', [29.2, ry0, Z1 - 0.47], [29.23, ry1, Z1 - 0.03]) // end
    rk.box('tv_panel', [29.85, ry0, Z1 - 0.47], [29.88, ry1, Z1 - 0.03])
    rk.box('tv_panel', [33.17, ry0, Z1 - 0.47], [33.2, ry1, Z1 - 0.03])
    const dw = (33.17 - 29.88) / 6
    for (let i = 0; i < 6; i++) {
      const a = 29.88 + i * dw + 0.003
      const c = 29.88 + (i + 1) * dw - 0.003
      rk.box('tv_rack_wood', [a, ry0 + 0.035, Z1 - 0.47], [c, ry1 - 0.005, Z1 - 0.44])
      rk.box('tv_rack_wood', [a, ry0 + 0.035, Z1 - 0.44], [c, ry1 - 0.005, Z1 - 0.05])
      rk.box('brass', [(a + c) / 2 - 0.06, ry1 - 0.08, Z1 - 0.49], [(a + c) / 2 + 0.06, ry1 - 0.06, Z1 - 0.47])
    }
    rk.box('tv_rack_top', [29.18, ry1, Z1 - 0.5], [33.22, ry1 + 0.035, Z1 - 0.02])

    // ── Graphite ceiling band with downlights along the TV wall & glazing (INT p.6/p.8) ──
    const cb = p.of('ceiling_band')
    cb.box('ceiling_dark', [X0, CEIL - 0.17, Z1 - 0.75], [X1, CEIL - 0.13, Z1])
    cb.box('ceiling_dark', [X0, CEIL - 0.17, Z0], [X0 + 0.75, CEIL - 0.13, Z1 - 0.75])

    // ── Rug ──
  }, [])

  const spots = useMemo(() => {
    const s: { p: [number, number, number] }[] = []
    for (let x = 28.35; x < 33.0; x += 1.15) s.push({ p: [x, CEIL - 0.17, Z1 - 0.38] })
    for (let z = 7.2; z < 10.2; z += 1.0) s.push({ p: [X0 + 0.38, CEIL - 0.17, z] })
    return s
  }, [])

  useMemo(() => {
    addBlocker('tv_sofa', 30.0, Z0, 33.0, 7.85)
    addBlocker('tv_chaise', 32.0, 7.8, 33.0, 8.45)
    addBlocker('tv_arm1', 28.9, 7.9, 29.75, 8.6)
    addBlocker('tv_arm2', 28.9, 8.95, 29.75, 9.65)
    addBlocker('tv_rack', 29.2, Z1 - 0.5, 33.2, Z1)
  }, [])

  return (
    <group>
      <PartsMeshes parts={parts} />
      <Prefab id="tvRug" build={rug('tv_rug', 4.0, 3.45)} position={[31.2, HEIGHTS.floor, 8.68]} selectable="tv_rug" cast={false} />
      <Prefab id="tvSofa" build={sofaModular(2.95, 1.65, 'sofa_tv_fabric')} position={[31.5, HEIGHTS.floor, Z0 + 0.58]} selectable="tv_sofa" />
      <PrefabInstances id="tvArm" build={rollArmchair('armchair_tv_fabric', 'walnut_fixed')} items={[{ p: [29.32, HEIGHTS.floor, 8.25], r: 90 }, { p: [29.32, HEIGHTS.floor, 9.3], r: 90 }]} selectable="tv_armchairs" />
      <PrefabInstances id="tvSide1" build={pedestalTable('tv_side_tables', 0.23, 0.55)} items={[{ p: [29.3, HEIGHTS.floor, 7.45] }, { p: [32.85, HEIGHTS.floor, 8.3], s: 1.05 }]} selectable="tv_side_tables" />
      <PrefabInstances id="tvSide2" build={pedestalTable('tv_side_tables', 0.19, 0.45)} items={[{ p: [29.72, HEIGHTS.floor, 7.62] }]} selectable="tv_side_tables" />
      <Prefab id="tvFicus" build={ficus(1.75)} position={[29.65, HEIGHTS.floor, 7.02]} />
      <Prefab id="tvScreen" build={tvScreen(1.46, 0.84)} position={[31.22, 1.62, Z1 - 0.12]} rotation={180} />
      <Prefab id="tvVase" build={glassVase(0.34)} position={[29.5, 0.595, Z1 - 0.26]} />
      <Prefab id="tvBooks" build={bookStack(3, 0.3)} position={[30.4, 0.595, Z1 - 0.25]} />
      <Prefab id="tvCandle" build={candle()} position={[30.5, 0.68, Z1 - 0.25]} />
      <group visible>
        <Prefab id="dropCluster" build={dropCluster(CEIL)} position={[30.55, 0, 8.85]} />
        <PrefabInstances id="dl_sala" build={downlight()} items={spots} cast={false} />
        {/* AC cassette (INT p.7) */}
        <mesh position={[32.1, CEIL - 0.13, 8.0]} userData={{ noPick: true }}>
          <boxGeometry args={[0.62, 0.02, 0.62]} />
          <meshStandardMaterial color="#efede8" roughness={0.6} />
        </mesh>
      </group>
    </group>
  )
}
