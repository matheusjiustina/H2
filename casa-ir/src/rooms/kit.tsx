/**
 * Room authoring kit: build-time "parts" (one GeoBuilder per selectable
 * object) + helpers for wall claddings, built-in joinery, LED shelves, etc.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import { GeoBuilder } from '../architecture/builder'
import { SlotMeshes } from '../configurator/SlotMeshes'
import type { SlotId } from '../data/materials'
import { useStore } from '../app/store'

export class Parts {
  private map = new Map<string, GeoBuilder>()
  /** builder for a selectable object ('' = not selectable) */
  of(id: string) {
    let b = this.map.get(id)
    if (!b) {
      b = new GeoBuilder()
      this.map.set(id, b)
    }
    return b
  }
  build() {
    return [...this.map.entries()].map(([id, b]) => ({ id, geos: b.build() }))
  }
}

export type BuiltParts = ReturnType<Parts['build']>

export function useParts(fn: (p: Parts) => void, deps: unknown[] = []) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    const p = new Parts()
    fn(p)
    return p.build()
  }, deps)
}

export function PartsMeshes({ parts, cut = false }: { parts: BuiltParts; cut?: boolean }) {
  const plan = useStore((s) => s.plan)
  return (
    <group visible={!(cut && plan)}>
      {parts.map(({ id, geos }) => (
        <SlotMeshes key={id || '_'} geos={geos} selectable={id || null} />
      ))}
    </group>
  )
}

/** Wall cladding panel on an axis-aligned wall face.
 *  face: 'n' | 's' | 'e' | 'w' = the wall face you are LOOKING AT
 *  (e.g. 'n' = the face of the north wall, normal pointing +Z). */
export function clad(b: GeoBuilder, slot: SlotId, face: 'n' | 's' | 'e' | 'w', at: number, a0: number, a1: number, y0: number, y1: number, t = 0.02, holes: [number, number, number, number][] = []) {
  // split around rectangular holes [a0, a1, y0, y1]
  const pieces: [number, number, number, number][] = [[a0, a1, y0, y1]]
  for (const [h0, h1, hy0, hy1] of holes) {
    const next: [number, number, number, number][] = []
    for (const [p0, p1, py0, py1] of pieces) {
      if (h1 <= p0 || h0 >= p1 || hy1 <= py0 || hy0 >= py1) {
        next.push([p0, p1, py0, py1])
        continue
      }
      if (h0 > p0) next.push([p0, h0, py0, py1])
      if (h1 < p1) next.push([h1, p1, py0, py1])
      const m0 = Math.max(p0, h0)
      const m1 = Math.min(p1, h1)
      if (hy0 > py0) next.push([m0, m1, py0, hy0])
      if (hy1 < py1) next.push([m0, m1, hy1, py1])
    }
    pieces.splice(0, pieces.length, ...next)
  }
  for (const [p0, p1, py0, py1] of pieces) {
    if (face === 'n') b.box(slot, [p0, py0, at], [p1, py1, at + t])
    else if (face === 's') b.box(slot, [p0, py0, at - t], [p1, py1, at])
    else if (face === 'w') b.box(slot, [at, py0, p0], [at + t, py1, p1])
    else b.box(slot, [at - t, py0, p0], [at, py1, p1])
  }
}

/** Matrix helper: translate + yaw (degrees). */
export function T(x: number, y: number, z: number, yaw = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (yaw * Math.PI) / 180, 0)), new THREE.Vector3(1, 1, 1))
}

/** Floating shelf with an LED strip underneath. Local frame of the builder. */
export function ledShelf(b: GeoBuilder, slot: SlotId, x0: number, x1: number, y: number, z0: number, z1: number, th = 0.03) {
  b.box(slot, [x0, y, z0], [x1, y + th, z1])
  b.box('led', [x0 + 0.02, y - 0.004, z0 + 0.02], [x1 - 0.02, y, z0 + 0.035])
}
