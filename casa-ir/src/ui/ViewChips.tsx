import { useStore } from '../app/store'
import { camerasFor } from '../data/cameras'

const EXTERIOR_MAIN = ['hero', 'fachada_frontal', 'fachada_posterior', 'patio_interno', 'piscina', 'vista_superior', 'lateral_norte', 'lateral_sul', 'aerea', 'fachada_frontal_02', 'fachada_posterior_02', 'fachada_posterior_03', 'patio_piscina']

/** Contextual camera presets (exterior façades or the current room's PDF views). */
export function ViewChips() {
  const mode = useStore((s) => s.mode)
  const nav = useStore((s) => s.nav)
  const plan = useStore((s) => s.plan)
  const panel = useStore((s) => s.panel)
  const req = useStore((s) => s.cameraRequest)
  const currentRoom = useStore((s) => s.currentRoom)
  const goCamera = useStore((s) => s.goCamera)
  if (nav === 'walk' || plan) return null

  const roomCams = currentRoom ? camerasFor(currentRoom) : []
  const list = roomCams.length ? roomCams : mode === 'exterior' ? EXTERIOR_MAIN.map((id) => camerasFor('exterior').find((c) => c.id === id)!).filter(Boolean) : []
  if (!list.length) return null
  return (
    <div className={`chips${panel ? ' chips--shift' : ''}`} role="toolbar" aria-label="Vistas">
      {list.map((c) => (
        <button key={c.id} className={req?.id === c.id ? 'chip is-active' : 'chip'} onClick={() => goCamera(c.id)} title={c.source ? `Referência: ${c.source}` : undefined}>
          {c.label}
        </button>
      ))}
    </div>
  )
}
