import { useMemo } from 'react'
import * as THREE from 'three'
import { getMat } from '../materials/library'
import { selectableForSlot } from '../data/configuration'
import type { SlotId } from '../data/materials'

const NO_SHADOW_CAST = new Set<SlotId>(['led', 'glass', 'glass_fluted', 'glass_amber', 'bulb', 'lamp_shade', 'mirror'])
const NO_PICK = new Set<SlotId>(['glass', 'glass_fluted', 'led', 'bulb'])

interface Props {
  geos: Map<SlotId, THREE.BufferGeometry>
  /** explicit selectable id for all meshes; otherwise resolved per slot */
  selectable?: string | null
  /** resolve selectable from slot (architecture) */
  bySlot?: boolean
  cast?: boolean
  receive?: boolean
}

/** Renders one mesh per material slot. */
export function SlotMeshes({ geos, selectable, bySlot, cast = true, receive = true }: Props) {
  const items = useMemo(() => [...geos.entries()], [geos])
  return (
    <>
      {items.map(([slot, g]) => {
        const sel = selectable !== undefined ? selectable : bySlot ? selectableForSlot(slot) : null
        const m = getMat(slot)
        const transparent = m.transparent
        return (
          <mesh
            key={slot}
            geometry={g}
            material={m}
            castShadow={cast && !NO_SHADOW_CAST.has(slot) && !transparent}
            receiveShadow={receive && !transparent}
            userData={{ selectable: sel, slot, noPick: NO_PICK.has(slot) }}
            renderOrder={transparent ? 2 : 0}
          />
        )
      })}
    </>
  )
}
