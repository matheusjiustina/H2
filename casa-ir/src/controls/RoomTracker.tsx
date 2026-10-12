import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../app/store'
import { roomAt } from '../data/houseSpec'

/** Tracks which room the camera is in (orbit / preset mode). */
export function RoomTracker() {
  const t = useRef(0)
  useFrame(({ camera }, dt) => {
    t.current += dt
    if (t.current < 0.4) return
    t.current = 0
    const p = camera.position
    const r = p.y < 6 ? roomAt(p.x, p.z, p.y) : null
    const id = r?.id ?? null
    const st = useStore.getState()
    if (st.currentRoom !== id) {
      const mode = r?.interior ? 'interior' : r ? st.mode : st.plan ? st.mode : 'exterior'
      useStore.setState({ currentRoom: id, mode })
    }
  })
  return null
}
