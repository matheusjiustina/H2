/**
 * SALA DE JOGOS / ESCRITÓRIO — sources: INT p.34 (plan), INT p.35–39 (views),
 * ARQ p.2 (walls/openings), ARQ p.8/p.12 (exterior).
 * Room: x 4.82–8.31 · z 11.15–15.15 · ceiling 2.80.
 * Divergence D-03 (see PDF_AUDIT): the INT plan shows glass on 3 sides; the
 * ARQ plan has a solid south wall (shared with the depósito). The built-in
 * taupe joinery (lit travertine niche + desk with keyboard, guitar niche, tall
 * doors) is therefore placed on that solid south wall; the guitar/certificate
 * wall and the bouclé loveseat sit on the west wall next to the window.
 */
import { useMemo } from 'react'
import { Parts, PartsMeshes, clad, ledShelf, useParts } from './kit'
import { Prefab, PrefabInstances } from '../furniture/prefab'
import { roundTable, pedestalTable } from '../furniture/tables'
import { shellChair, officeChair, boucleLoveseat } from '../furniture/seating'
import { drumPendant, splitAC, downlight } from '../furniture/fixtures'
import { cowhideRug, acousticGuitar, electricGuitar, frame, bookRow, bookStack, vase } from '../furniture/decor'
import { pothos, smallPlant } from '../furniture/plants'
import { addBlocker } from '../controls/colliders'
import { HEIGHTS } from '../data/houseSpec'

const X0 = 4.82
const X1 = 8.31
const Z1 = 15.15
const F = HEIGHTS.floor
const D = 0.45
const TOP = 2.62

export function GameRoom() {
  const parts = useParts((p: Parts) => {
    const c = p.of('game_cabinetry')
    const zf = Z1 - D // front plane
    // carcass back + top
    c.box('game_cabinetry', [X0, TOP, zf], [X1, 2.8, Z1])
    // ── lit niche with travertine back + desk (INT p.35/37/38) x 6.90–8.25 ──
    clad(c, 'game_panel', 's', Z1, 6.9, 8.28, F, TOP, 0.02)
    c.box('game_cabinetry', [6.86, F, zf], [6.9, TOP, Z1])
    c.box('game_cabinetry', [8.27, F, zf], [8.31, TOP, Z1])
    c.box('game_cabinetry', [6.9, 0.74, zf - 0.08], [8.27, 0.78, Z1 - 0.02]) // desk
    c.box('game_cabinetry', [6.9, 0.98, Z1 - 0.32], [8.27, 1.0, Z1 - 0.02]) // keyboard shelf
    for (const y of [1.4, 1.8, 2.2]) ledShelf(c, 'game_cabinetry', 6.9, 8.27, y, Z1 - 0.32, Z1 - 0.02)
    // ── guitar niche column x 5.95–6.86 ──
    const door = (x0: number, x1: number, y0: number, y1: number) => {
      c.box('game_cabinetry', [x0 + 0.003, y0 + 0.003, zf - 0.02], [x1 - 0.003, y1 - 0.003, zf])
      c.box('game_cabinetry', [x0, y0, zf], [x1, y1, Z1])
    }
    door(6.4, 6.86, F, TOP)
    door(5.95, 6.4, F, 0.95)
    door(5.95, 6.4, 1.95, TOP)
    c.box('game_cabinetry', [5.95, 0.95, Z1 - 0.02], [6.4, 1.95, Z1])
    c.box('game_cabinetry', [5.95, 0.95, zf], [5.97, 1.95, Z1])
    c.box('game_cabinetry', [6.38, 0.95, zf], [6.4, 1.95, Z1])
    c.box('led', [5.97, 1.93, zf + 0.02], [6.38, 1.95, zf + 0.04])
    door(5.45, 5.95, F, TOP)
    // small lit niches column x 4.82–5.45 (INT p.35 right)
    door(X0, 5.45, F, 0.85)
    door(X0, 5.45, 1.25, 2.15)
    c.box('game_cabinetry', [X0, 0.85, Z1 - 0.02], [5.45, 1.25, Z1])
    c.box('game_cabinetry', [X0, 2.15, Z1 - 0.02], [5.45, TOP, Z1])
    c.box('led', [X0 + 0.02, 1.23, zf + 0.02], [5.43, 1.25, zf + 0.04])
    c.box('led', [X0 + 0.02, TOP - 0.02, zf + 0.02], [5.43, TOP, zf + 0.04])
    // keyboard on the desk shelf (INT p.38)
    const k = p.of('')
    k.box('rubber', [7.05, 1.0, Z1 - 0.3], [8.12, 1.07, Z1 - 0.1])
    k.box('paper', [7.07, 1.07, Z1 - 0.29], [8.1, 1.075, Z1 - 0.18])
    k.box('appliance', [7.6, 0.78, Z1 - 0.32], [7.95, 0.8, Z1 - 0.1]) // laptop
    // linear LED lines in the ceiling (INT p.35/36)
    k.box('led', [X0 + 0.2, 2.785, 12.35], [X1 - 0.2, 2.79, 12.38])
    k.box('led', [X0 + 0.2, 2.785, 13.95], [X1 - 0.2, 2.79, 13.98])
  }, [])

  const chairs = useMemo(
    () => [0, 60, 120, 180, 240, 300].map((a) => {
      const r = (a * Math.PI) / 180
      return { p: [6.4 + Math.sin(r) * 0.82, F, 12.9 + Math.cos(r) * 0.82] as [number, number, number], r: a + 180 }
    }),
    [],
  )
  const frames = useMemo(() => {
    const f: { p: [number, number, number]; r: number }[] = []
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) f.push({ p: [X0 + 0.01, 0.95 + i * 0.42, 12.0 + j * 0.42], r: 90 })
    return f
  }, [])
  const spots = useMemo(() => [[5.6, 11.7], [7.5, 11.7]].map(([x, z]) => ({ p: [x, 2.79, z] as [number, number, number] })), [])

  useMemo(() => {
    addBlocker('j_cab', X0, Z1 - D - 0.08, X1, Z1)
    addBlocker('j_table', 5.65, 12.15, 7.15, 13.65)
    addBlocker('j_sofa', X0, 11.6, X0 + 0.85, 12.95)
  }, [])

  return (
    <group>
      <PartsMeshes parts={parts} />
      <Prefab id="jRug" build={cowhideRug(2.3, 2.6)} position={[6.4, F, 12.95]} rotation={90} selectable="game_rug" cast={false} />
      <Prefab id="jTable" build={roundTable('game_table', 0.62)} position={[6.4, F, 12.9]} selectable="game_table" />
      <PrefabInstances id="jChair" build={shellChair('game_chairs')} items={chairs} selectable="game_chairs" />
      <Prefab id="jOffice" build={officeChair()} position={[7.55, F, 14.2]} rotation={180} />
      <Prefab id="jSofa" build={boucleLoveseat('game_sofa')} position={[X0 + 0.45, F, 12.28]} rotation={90} selectable="game_sofa" />
      <PrefabInstances id="jSide" build={pedestalTable('walnut_fixed', 0.2, 0.52)} items={[{ p: [5.15, F, 11.45] }, { p: [5.45, F, 11.6], s: 0.85 }]} />
      <Prefab id="jPendant" cut build={drumPendant(1.05)} position={[6.4, 2.8, 12.9]} selectable={null} />
      <PrefabInstances id="jGuitar" build={acousticGuitar()} items={[{ p: [X0 + 0.02, 1.55, 11.55], r: 90 }, { p: [X0 + 0.02, 0.62, 11.55], r: 90 }]} />
      <Prefab id="jElectric" build={electricGuitar()} position={[6.17, 1.0, Z1 - 0.2]} rotation={180} />
      <PrefabInstances id="jFrames" build={frame(0.34, 0.36)} items={frames} />
      <Prefab id="jAC" cut build={splitAC()} position={[X0 + 0.02, 2.45, 12.3]} rotation={90} />
      <Prefab id="jBooks" build={bookRow(0.55)} position={[7.9, 1.83, Z1 - 0.17]} rotation={180} />
      <Prefab id="jBooks2" build={bookStack(3, 0.26)} position={[7.35, 1.43, Z1 - 0.17]} />
      <Prefab id="jVase" build={vase(0.22, 0.07, 'linen_dark')} position={[7.0, 2.23, Z1 - 0.17]} />
      <Prefab id="jPothos" build={pothos(0.6)} position={[7.1, 2.23, Z1 - 0.2]} />
      <Prefab id="jPlant" build={smallPlant()} position={[5.13, 2.15, Z1 - 0.22]} />
      <PrefabInstances id="dl_j" cut build={downlight()} items={spots} cast={false} />
    </group>
  )
}
