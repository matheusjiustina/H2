/**
 * The architectural shell (walls, openings, floors, ceilings, roofs, massing).
 * Rendered as merged meshes per material slot; roofs/ceilings/upper volumes
 * live in a separate group hidden by "PLANTA 3D".
 */
import { useMemo } from 'react'
import { buildHouse } from '../architecture/buildHouse'
import { SlotMeshes } from '../configurator/SlotMeshes'
import { useStore } from '../app/store'
import { setColliders } from '../controls/colliders'
import { Exterior } from './Exterior'

export function House() {
  const plan = useStore((s) => s.plan)
  const built = useMemo(() => {
    const h = buildHouse()
    setColliders(h.colliders)
    return { arch: h.arch.build(), cut: h.cut.build(), glass: h.glass.build() }
  }, [])

  return (
    <group>
      <SlotMeshes geos={built.arch} bySlot />
      <group visible={!plan}>
        <SlotMeshes geos={built.cut} bySlot />
      </group>
      <SlotMeshes geos={built.glass} selectable={null} cast={false} receive={false} />
      <Exterior />
    </group>
  )
}
