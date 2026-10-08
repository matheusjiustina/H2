/**
 * SUÍTE MASTER — dormitório. sources: INT p.44 (plan, rotated 180°),
 * INT p.57–62 (views), ARQ p.2 (walls), ARQ p.7 (west portal + glass).
 * Room: x 17.85–21.37 · z 1.80–6.55 · ceiling 2.80 with LED cove.
 * Headboard wall = east wall: grey woven-fabric panels in a cream lacquer
 * frame with LED reveal; walnut panel with flush door to the closet (south).
 * West wall: curtains over the glazing, low lacquer rack with brass square
 * pulls and the TV floating in a ceiling-hung brass portal; glass door to the
 * pool deck at the north end (INT p.60).
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import { Parts, PartsMeshes, clad, useParts } from './kit'
import { Prefab, PrefabInstances } from '../furniture/prefab'
import { cabinetRow, pedestalTable } from '../furniture/tables'
import { kingBed, loungeChair } from '../furniture/seating'
import { tableLamp, tvScreen, downlight, splitAC } from '../furniture/fixtures'
import { ficus } from '../furniture/plants'
import { rug, sculptureHead, bookStack } from '../furniture/decor'
import { addBlocker } from '../controls/colliders'
import { HEIGHTS } from '../data/houseSpec'
import type { PrefabFn } from '../furniture/prefab'

const X0 = 17.85
const X1 = 21.37
const Z0 = 1.8
const Z1 = 6.55
const F = HEIGHTS.floor
const CEIL = 2.8

/** INT p.58: oval nightstand with three drawers on brass legs. */
const ovalNightstand: PrefabFn = (b) => {
  for (const [x, z] of [[-0.2, 0.1], [0.2, 0.1], [-0.2, -0.1], [0.2, -0.1]] as [number, number][]) b.cyl('master_metal', x, 0, z, 0.01, 0.01, 0.16)
  b.at(0, 0.16, 0, 0, () => {
    b.geo('master_nightstand', ovalPrism(0.29, 0.2, 0.42), undefined, [1.6, 0.6])
  })
  for (let i = 1; i < 3; i++) b.box('rubber', [-0.28, 0.16 + i * 0.14, 0.195], [0.28, 0.165 + i * 0.14, 0.2])
  for (let i = 0; i < 3; i++) b.cyl('master_metal', 0, 0.22 + i * 0.14, 0.2, 0.012, 0.012, 0.02)
}

function ovalPrism(rx: number, rz: number, h: number) {
  const s = new THREE.Shape()
  s.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0)
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 28 })
  g.rotateX(-Math.PI / 2)
  return g
}

/** INT p.60/61: lacquer TV rack with square brass pulls + TV in a brass portal. */
const masterRack = (len: number): PrefabFn => (b) => {
  cabinetRow(b, 'master_rack', -len / 2, len / 2 - 0.55, 0, 0.48, 0.45, 3, { plinth: null, handle: null })
  for (let i = 0; i < 3; i++) {
    const cx = -len / 2 + ((len - 0.55) / 3) * (i + 0.5)
    b.box('master_metal', [cx - 0.05, 0.19, 0], [cx + 0.05, 0.29, 0.015])
    b.box('master_rack', [cx - 0.36, 0.07, 0], [cx + 0.36, 0.42, 0.008])
  }
  // open end niche with books
  b.box('master_rack', [len / 2 - 0.55, 0, -0.45], [len / 2, 0.03, -0.02])
  b.box('master_rack', [len / 2 - 0.55, 0.45, -0.45], [len / 2, 0.48, -0.02])
  b.box('master_rack', [len / 2 - 0.03, 0, -0.45], [len / 2, 0.48, -0.02])
  b.box('master_rack', [len / 2 - 0.55, 0.23, -0.45], [len / 2 - 0.03, 0.25, -0.02])
  b.box('led', [-len / 2 + 0.05, -0.005, -0.3], [len / 2 - 0.05, 0.0, -0.28])
}

export function MasterSuite() {
  const parts = useParts((p: Parts) => {
    // ── Headboard wall (east) — INT p.58/59 ──
    const hb = p.of('master_headboard')
    const zc = 3.62
    const z0 = zc - 1.45
    const z1 = zc + 1.45
    hb.box('master_headboard_frame', [X1 - 0.09, F, z0], [X1, 2.62, z1])
    for (let i = 0; i < 4; i++) {
      const a = z0 + 0.12 + i * ((z1 - z0 - 0.24) / 4) + 0.008
      const c = z0 + 0.12 + (i + 1) * ((z1 - z0 - 0.24) / 4) - 0.008
      hb.box('master_headboard_panel', [X1 - 0.12, 0.2, a], [X1 - 0.09, 2.5, c])
    }
    hb.box('led', [X1 - 0.1, F, z0 - 0.03], [X1 - 0.02, 2.65, z0])
    hb.box('led', [X1 - 0.1, F, z1], [X1 - 0.02, 2.65, z1 + 0.03])
    hb.box('led', [X1 - 0.1, 2.62, z0], [X1 - 0.02, 2.65, z1])
    // walnut panel with the flush door (INT p.58)
    const wd = p.of('master_wood')
    clad(wd, 'master_wood', 'e', X1, 5.12, Z1 - 0.01, F, CEIL - 0.14, 0.025, [[5.52, 6.43, 0, 2.18]])
    // ── Rug ──
  }, [])

  const spots = useMemo(() => {
    const s: { p: [number, number, number] }[] = []
    for (const x of [18.6, 20.6]) for (const z of [2.4, 4.2, 6.0]) s.push({ p: [x, CEIL - 0.01, z] })
    return s
  }, [])

  useMemo(() => {
    addBlocker('m_bed', 19.0, 2.55, X1, 4.7)
    addBlocker('m_ns1', X1 - 0.6, 1.95, X1, 2.45)
    addBlocker('m_ns2', X1 - 0.6, 4.8, X1, 5.3)
    addBlocker('m_rack', X0, 3.1, X0 + 0.5, 6.1)
    addBlocker('m_arm', 18.6, 5.55, 19.5, 6.45)
  }, [])

  return (
    <group>
      <PartsMeshes parts={parts} />
      <Prefab id="mRug" build={rug('master_rug', 2.3, 4.3)} position={[19.75, F, 4.15]} selectable="master_rug" cast={false} />
      <Prefab id="mBed" build={kingBed('master_bed', 'master_bedding')} position={[20.12, F, 3.62]} rotation={-90} selectable="master_bed" />
      <PrefabInstances id="mNight" build={ovalNightstand} items={[{ p: [X1 - 0.33, F, 2.2], r: -90 }, { p: [X1 - 0.33, F, 5.05], r: -90 }]} selectable="master_nightstands" />
      <PrefabInstances id="mLamp" build={tableLamp('master_metal')} items={[{ p: [X1 - 0.35, F + 0.6, 2.2] }, { p: [X1 - 0.35, F + 0.6, 5.05] }]} selectable="master_nightstands" cast={false} />
      <Prefab id="mRack" build={masterRack(3.0)} position={[X0 + 0.47, F + 0.04, 4.6]} rotation={90} selectable="master_rack" />
      <TvPortal />
      <Prefab id="mArm" build={loungeChair('master_armchair', 'walnut_fixed')} position={[19.05, F, 6.0]} rotation={150} selectable="master_armchair" />
      <Prefab id="mSide" build={pedestalTable('walnut_fixed', 0.2, 0.5)} position={[18.45, F, 6.2]} />
      <Prefab id="mFicus" build={ficus(1.4)} position={[18.15, F, 5.85]} />
      <Prefab id="mHead" build={sculptureHead()} position={[X0 + 0.3, F + 0.55, 3.35]} rotation={90} />
      <Prefab id="mBooks" build={bookStack(2, 0.28)} position={[X0 + 0.25, F + 0.32, 5.85]} rotation={90} />
      <Prefab id="mAC" cut build={splitAC()} position={[20.6, 2.42, Z1 - 0.02]} rotation={180} />
      <PrefabInstances id="dl_m" cut build={downlight()} items={spots} cast={false} />
    </group>
  )
}


/** Brass portal hanging from the ceiling with the TV (INT p.60/61). */
function TvPortal() {
  const build: PrefabFn = (b) => {
    const w = 1.6
    b.box('master_metal', [-0.03, 0.95, -w / 2], [0.03, 1.0, w / 2])
    b.box('master_metal', [-0.03, 0.95, -w / 2], [0.03, CEIL - F, -w / 2 + 0.05])
    b.box('master_metal', [-0.03, 0.95, w / 2 - 0.05], [0.03, CEIL - F, w / 2])
  }
  return (
    <group>
      <Prefab id="mPortal" cut build={build} position={[X0 + 0.62, F, 4.55]} selectable="master_rack" />
      <Prefab id="mTV" build={tvScreen(1.3, 0.74)} position={[X0 + 0.64, 1.62, 4.55]} rotation={90} />
    </group>
  )
}

export const MASTER = { X0, X1, Z0, Z1 }
