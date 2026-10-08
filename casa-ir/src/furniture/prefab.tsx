/**
 * Prefab system: furniture is authored as a builder function in local space
 * (metres, origin on the floor), converted once into one geometry per material
 * slot and rendered either as plain meshes or as instanced meshes.
 */
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { GeoBuilder } from '../architecture/builder'
import { getMat } from '../materials/library'
import type { SlotId } from '../data/materials'
import { useStore } from '../app/store'

export type PrefabFn = (b: GeoBuilder) => void
type Geos = Map<SlotId, THREE.BufferGeometry>

const cache = new Map<string, Geos>()

export function buildPrefab(key: string, fn: PrefabFn): Geos {
  const hit = cache.get(key)
  if (hit) return hit
  const b = new GeoBuilder()
  fn(b)
  const g = b.build()
  cache.set(key, g)
  return g
}

const NO_CAST = new Set<SlotId>(['led', 'glass', 'glass_amber', 'bulb', 'lamp_shade', 'glass_fluted', 'mirror'])

interface PrefabProps {
  id: string
  build: PrefabFn
  position?: [number, number, number]
  rotation?: number // Y rotation in degrees
  scale?: number | [number, number, number]
  selectable?: string | null
  cast?: boolean
  /** ceiling-hung: hidden in PLANTA 3D */
  cut?: boolean
}

/** Single placed prefab. */
export function Prefab({ id, build, position = [0, 0, 0], rotation = 0, scale = 1, selectable = null, cast = true, cut = false }: PrefabProps) {
  const geos = useMemo(() => buildPrefab(id, build), [id, build])
  const plan = useStore((s) => s.plan)
  return (
    <group visible={!(cut && plan)} position={position} rotation={[0, (rotation * Math.PI) / 180, 0]} scale={scale} userData={{ selectable }}>
      {[...geos.entries()].map(([slot, g]) => {
        const m = getMat(slot)
        return <mesh key={slot} geometry={g} material={m} castShadow={cast && !NO_CAST.has(slot) && !m.transparent} receiveShadow userData={{ slot }} />
      })}
    </group>
  )
}

export interface Placement {
  p: [number, number, number]
  r?: number
  s?: number
}

/** Many copies of a prefab, rendered as one InstancedMesh per slot. */
export function PrefabInstances({ id, build, items, selectable = null, cast = true, cut = false }: { id: string; build: PrefabFn; items: Placement[]; selectable?: string | null; cast?: boolean; cut?: boolean }) {
  const geos = useMemo(() => buildPrefab(id, build), [id, build])
  const plan = useStore((s) => s.plan)
  return (
    <group visible={!(cut && plan)} userData={{ selectable }}>
      {[...geos.entries()].map(([slot, g]) => (
        <Inst key={slot} slot={slot} geo={g} items={items} cast={cast && !NO_CAST.has(slot)} />
      ))}
    </group>
  )
}

function Inst({ slot, geo, items, cast }: { slot: SlotId; geo: THREE.BufferGeometry; items: Placement[]; cast: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const im = ref.current
    if (!im) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    items.forEach((it, i) => {
      e.set(0, ((it.r ?? 0) * Math.PI) / 180, 0)
      q.setFromEuler(e)
      const s = it.s ?? 1
      m.compose(new THREE.Vector3(...it.p), q, new THREE.Vector3(s, s, s))
      im.setMatrixAt(i, m)
    })
    im.instanceMatrix.needsUpdate = true
    im.computeBoundingSphere()
  }, [items])
  return <instancedMesh ref={ref} args={[geo, getMat(slot), items.length]} castShadow={cast} receiveShadow userData={{ slot }} />
}
