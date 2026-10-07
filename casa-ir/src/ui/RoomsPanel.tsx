import { useStore } from '../app/store'
import { ROOM_BY_ID } from '../data/houseSpec'
import { CAMERA_BY_ID, camerasFor } from '../data/cameras'
import { IconClose } from './icons'

/** Exterior "places" are groups of façade / landscape camera presets. */
const EXTERIOR: { id: string; name: string; cams: string[]; source: string }[] = [
  { id: 'x_fachada', name: 'Fachada', cams: ['fachada_frontal', 'fachada_frontal_02', 'hero', 'lateral_norte', 'lateral_sul'], source: 'ARQ p.4 · p.5 · p.11 · p.12 · p.15' },
  { id: 'x_piscina', name: 'Piscina', cams: ['piscina', 'fachada_posterior', 'fachada_posterior_02'], source: 'ARQ p.7 · p.8 · p.10' },
  { id: 'x_patio', name: 'Pátio interno', cams: ['patio_interno'], source: 'ARQ p.6' },
  { id: 'x_aerea', name: 'Vista aérea', cams: ['aerea', 'vista_superior'], source: 'ARQ p.13 · p.16' },
]

const GROUPS: { title: string; rooms: string[] }[] = [
  { title: 'Social', rooms: ['hall', 'sala', 'cozinha', 'gourmet', 'jogos'] },
  { title: 'Serviço', rooms: ['lavanderia', 'deposito', 'banho_ext', 'despensa', 'garagem'] },
  { title: 'Íntimo', rooms: ['suite', 'closet', 'suite_bath', 'q01', 'q02', 'bsocial'] },
]

/** AMBIENTES — guided navigation: exterior places and every room of the plan. */
export function RoomsPanel() {
  const set = useStore((s) => s.set)
  const visit = useStore((s) => s.visit)
  const nav = useStore((s) => s.nav)
  const currentRoom = useStore((s) => s.currentRoom)
  const req = useStore((s) => s.cameraRequest)
  const mobile = () => window.matchMedia('(max-width: 760px)').matches

  const openRoom = (roomId: string, camId?: string) => {
    const room = ROOM_BY_ID[roomId]
    if (nav === 'walk' && room.spawn) {
      set({ mode: room.interior ? 'interior' : 'exterior', plan: false })
      set({ walkTeleport: { x: room.spawn[0], z: room.spawn[1], yaw: room.spawn[2], ts: performance.now() } })
      return
    }
    const cam = camId ?? camerasFor(roomId)[0]?.id
    if (cam) visit(cam)
    if (mobile()) set({ panel: null })
  }
  const openPlace = (cam: string) => {
    visit(cam)
    if (mobile()) set({ panel: null })
  }

  const activeExterior = EXTERIOR.find((x) => req && x.cams.includes(req.id))

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
        <section className="group">
          <div className="group__title">Exterior</div>
          {EXTERIOR.map((x) => {
            const active = activeExterior?.id === x.id && nav !== 'walk'
            return (
              <div key={x.id} className={`room${active ? ' is-active' : ''}`}>
                <button className="room__name" onClick={() => openPlace(x.cams[0])}>
                  <span>{x.name}</span>
                </button>
                {active && x.cams.length > 1 && (
                  <div className="room__views">
                    {x.cams.map((id) => (
                      <button key={id} className={req?.id === id ? 'mini is-active' : 'mini'} onClick={() => openPlace(id)}>
                        {CAMERA_BY_ID[id].label}
                      </button>
                    ))}
                  </div>
                )}
                {active && <div className="room__src">Fontes: {x.source}</div>}
              </div>
            )
          })}
        </section>
        {GROUPS.map((g) => (
          <section key={g.title} className="group">
            <div className="group__title">{g.title}</div>
            {g.rooms.map((id) => {
              const r = ROOM_BY_ID[id]
              const cams = camerasFor(id)
              const active = currentRoom === id && !activeExterior
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
        <p className="hint">
          Dica: ative <b>Passeio</b> para caminhar livremente pela casa, ou <b>Apresentação</b> para um tour guiado.
        </p>
      </div>
    </aside>
  )
}
