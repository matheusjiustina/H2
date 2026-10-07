import { useStore } from '../app/store'
import { ROOM_BY_ID } from '../data/houseSpec'
import { camerasFor } from '../data/cameras'
import { IconClose } from './icons'

const GROUPS: { title: string; rooms: string[] }[] = [
  { title: 'Social', rooms: ['sala', 'cozinha', 'gourmet', 'hall'] },
  { title: 'Íntima', rooms: ['suite', 'closet', 'suite_bath', 'bsocial', 'q01', 'q02'] },
  { title: 'Lazer e serviço', rooms: ['jogos', 'lavanderia', 'banho_ext', 'despensa', 'deposito', 'garagem'] },
]

/** AMBIENTES — guided room navigation with the curated PDF viewpoints. */
export function RoomsPanel() {
  const set = useStore((s) => s.set)
  const goCamera = useStore((s) => s.goCamera)
  const nav = useStore((s) => s.nav)
  const currentRoom = useStore((s) => s.currentRoom)
  const req = useStore((s) => s.cameraRequest)

  const openRoom = (roomId: string, camId?: string) => {
    const room = ROOM_BY_ID[roomId]
    set({ mode: 'interior', plan: false })
    if (nav === 'walk' && room.spawn) {
      set({ walkTeleport: { x: room.spawn[0], z: room.spawn[1], yaw: room.spawn[2], ts: performance.now() } })
      return
    }
    const cam = camId ?? camerasFor(roomId)[0]?.id
    if (cam) goCamera(cam)
    if (window.matchMedia('(max-width: 760px)').matches) set({ panel: null })
  }

  return (
    <aside className="panel" aria-label="Ambientes">
      <div className="panel__head">
        <div>
          <div className="eyebrow">Navegação guiada</div>
          <h2>Ambientes</h2>
        </div>
        <button className="icon-btn" onClick={() => set({ panel: null })} aria-label="Fechar">
          <IconClose />
        </button>
      </div>
      <div className="panel__body">
        {GROUPS.map((g) => (
          <section key={g.title} className="group">
            <div className="group__title">{g.title}</div>
            {g.rooms.map((id) => {
              const r = ROOM_BY_ID[id]
              const cams = camerasFor(id)
              const active = currentRoom === id
              return (
                <div key={id} className={`room${active ? ' is-active' : ''}`}>
                  <button className="room__name" onClick={() => openRoom(id)}>
                    <span>{r.name}</span>
                    {!r.detailed && r.interior && <em>planta arquitetônica</em>}
                  </button>
                  {active && cams.length > 1 && nav !== 'walk' && (
                    <div className="room__views">
                      {cams.map((c) => (
                        <button key={c.id} className={req?.id === c.id ? 'mini is-active' : 'mini'} onClick={() => openRoom(id, c.id)}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {active && <div className="room__src">Fontes: {r.sources.join(' · ')}</div>}
                </div>
              )
            })}
          </section>
        ))}
        <p className="hint">Dica: ative <b>Passeio</b> para caminhar livremente pela casa.</p>
      </div>
    </aside>
  )
}
