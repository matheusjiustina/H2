/**
 * BANHO EXTERNO — sources: INT p.29 (plan), INT p.30–32 (views), ARQ p.2.
 * Room: x 11.86–13.45 · z 13.37–16.20. Door on the north wall (ARQ p.2 —
 * divergence D-01: INT shows it on the long wall; ARQ prevails).
 * Travertine porcelain throughout, white river-pebble feature walls, floating
 * travertine vanity with organic mirror, back-lit travertine shower panel.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import { Parts, PartsMeshes, clad, useParts } from './kit'
import { Prefab, PrefabInstances } from '../furniture/prefab'
import { toilet, showerHead, downlight } from '../furniture/fixtures'
import { basket, towel } from '../furniture/decor'
import { smallPlant } from '../furniture/plants'
import { addBlocker } from '../controls/colliders'
import { HEIGHTS } from '../data/houseSpec'

const X0 = 11.86
const X1 = 13.45
const Z1 = 16.2
const F = HEIGHTS.floor

export function ExternalBathroom() {
  const parts = useParts((p: Parts) => {
    const pb = p.of('extbath_pebble')
    // pebble wall behind the vanity (east wall, north part) — INT p.30
    clad(pb, 'extbath_pebble', 'e', X1, 13.42, 14.42, F, 2.7, 0.025)
    // pebble shower back wall (south) + side strip — INT p.31
    clad(pb, 'extbath_pebble', 's', Z1, X0 + 0.02, X1 - 0.02, F, 2.7, 0.025, [[12.35, 13.05, 1.5, 2.1]])
    const tr = p.of('extbath_walls')
    // back-lit travertine shower panel
    tr.box('extbath_stone', [12.1, F + 0.05, Z1 - 0.06], [12.95, 2.25, Z1 - 0.025])
    tr.box('led', [12.07, F + 0.05, Z1 - 0.045], [12.1, 2.28, Z1 - 0.03])
    tr.box('led', [12.95, F + 0.05, Z1 - 0.045], [12.98, 2.28, Z1 - 0.03])
    tr.box('led', [12.07, 2.25, Z1 - 0.045], [12.98, 2.28, Z1 - 0.03])
    // floating travertine vanity with integrated basin (INT p.30/32)
    tr.box('extbath_stone', [X1 - 0.46, 0.78, 13.5], [X1 - 0.025, 0.9, 14.32])
    tr.box('metal_dark_bowl', [X1 - 0.36, 0.9, 13.65], [X1 - 0.1, 0.902, 14.15])
    tr.box('extbath_stone', [X1 - 0.4, F, 13.5], [X1 - 0.025, F + 0.16, 14.32])
    // organic mirror + LED strip
    const mirror = p.of('')
    mirror.geo('mirror', ovalMirror(), undefined)
    tr.box('led', [X1 - 0.05, 0.9, 14.43], [X1 - 0.025, 2.7, 14.45])
    // stone shelves on the pebble wall
    for (const y of [1.35, 1.75, 2.15]) tr.box('extbath_stone', [X1 - 0.18, y, 13.42], [X1 - 0.025, y + 0.03, 13.62])
    // shower glass partition z 15.2 (x 11.86–12.95)
    p.of('').box('glass', [X0 + 0.02, F, 15.19], [12.95, 2.1, 15.2])
    p.of('').box('chrome', [X0, 2.1, 15.18], [12.95, 2.12, 15.21])
  }, [])

  const spots = useMemo(() => [14.0, 15.6].map((z) => ({ p: [12.65, 2.7, z] as [number, number, number] })), [])
  useMemo(() => {
    addBlocker('be_vanity', X1 - 0.46, 13.5, X1, 14.32)
    addBlocker('be_glass', X0, 15.18, 12.95, 15.21)
  }, [])

  return (
    <group>
      <PartsMeshes parts={parts} />
      <Prefab id="beWC" build={toilet()} position={[X1 - 0.03, F, 14.78]} rotation={-90} />
      <Prefab id="beShower" build={showerHead('chrome')} position={[12.52, 2.2, Z1 - 0.07]} rotation={180} />
      <Prefab id="beBasket1" build={basket(0.14, 0.2)} position={[X1 - 0.22, F + 0.16, 13.7]} />
      <Prefab id="beBasket2" build={basket(0.12, 0.18)} position={[X1 - 0.22, F + 0.16, 14.05]} />
      <Prefab id="bePlant" build={smallPlant()} position={[X1 - 0.12, 1.78, 13.52]} />
      <Prefab id="beTowel" build={towel(0.4, 0.7)} position={[X0 + 0.06, 1.5, 14.6]} rotation={90} />
      <PrefabInstances id="dl_be" cut build={downlight()} items={spots} cast={false} />
    </group>
  )
}

function ovalMirror() {
  const s = new THREE.Shape()
  s.absellipse(0, 0, 0.26, 0.5, 0, Math.PI * 2, false, 0.15)
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 24 })
  g.rotateY(-Math.PI / 2)
  g.translate(X1 - 0.03, 1.5, 13.92)
  return g
}
