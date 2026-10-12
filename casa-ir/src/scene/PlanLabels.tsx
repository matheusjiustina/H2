/**
 * PLANTA 3D — clickable room names floating over the dollhouse view.
 * Clicking a name opens that room's first PDF viewpoint.
 */
import { Html } from '@react-three/drei'
import { useStore } from '../app/store'
import { ROOMS } from '../data/houseSpec'
import { camerasFor } from '../data/cameras'

const LABELLED = ROOMS.filter((r) => r.menu && camerasFor(r.id).length).map((r) => {
  // label sits over the largest rectangle of the room
  const [x0, z0, x1, z1] = [...r.rects].sort((a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]))[0]
  return { id: r.id, name: r.name, pos: [(x0 + x1) / 2, 1.3, (z0 + z1) / 2] as [number, number, number] }
})

export function PlanLabels() {
  const plan = useStore((s) => s.plan)
  const capturing = useStore((s) => s.capturing)
  const visit = useStore((s) => s.visit)
  if (!plan || capturing) return null
  return (
    <>
      {LABELLED.map((r) => (
        <Html key={r.id} position={r.pos} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
          <button className="plan-label" style={{ pointerEvents: 'auto' }} onClick={() => visit(camerasFor(r.id)[0].id)}>
            {r.name}
          </button>
        </Html>
      ))}
    </>
  )
}
