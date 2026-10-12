import { useStore } from '../app/store'
import { ROOM_BY_ID } from '../data/houseSpec'
import { CAMERAS } from '../data/cameras'

/** Brand + primary navigation: EXTERIOR · INTERIOR · AMBIENTES · ACABAMENTOS. */
export function TopBar() {
  const mode = useStore((s) => s.mode)
  const panel = useStore((s) => s.panel)
  const set = useStore((s) => s.set)
  const goCamera = useStore((s) => s.goCamera)
  const currentRoom = useStore((s) => s.currentRoom)
  const nav = useStore((s) => s.nav)

  const toExterior = () => {
    set({ mode: 'exterior', nav: 'orbit', plan: false, panel: null, selectedId: null })
    goCamera('hero')
  }
  const toInterior = () => {
    if (mode !== 'interior') {
      set({ mode: 'interior', plan: false, panel: 'ambientes' })
      if (nav !== 'walk') goCamera('tv_view_01')
    } else set({ panel: panel === 'ambientes' ? null : 'ambientes' })
  }
  const toggle = (p: 'ambientes' | 'acabamentos' | 'opcoes') => set({ panel: panel === p ? null : p })

  const room = currentRoom ? ROOM_BY_ID[currentRoom] : null
  const req = useStore((s) => s.cameraRequest)
  const preset = req ? CAMERAS.find((c) => c.id === req.id) : null

  return (
    <header className="topbar">
      <div className="brand" onClick={toExterior} role="button" aria-label="CASA I|R — vista principal">
        CASA <span>I|R</span>
      </div>
      <nav className="mainnav" aria-label="Navegação principal">
        <button className={mode === 'exterior' && !panel ? 'is-active' : mode === 'exterior' ? 'is-on' : ''} onClick={toExterior}>
          Exterior
        </button>
        <button className={mode === 'interior' ? 'is-on' : ''} onClick={toInterior}>
          Interior
        </button>
        <button className={panel === 'ambientes' ? 'is-active' : ''} onClick={() => toggle('ambientes')}>
          Ambientes
        </button>
        <button className={panel === 'acabamentos' ? 'is-active' : ''} onClick={() => toggle('acabamentos')}>
          Acabamentos
        </button>
      </nav>
      <div className="location">
        {room ? room.name : mode === 'exterior' ? 'Área externa' : ''}
        {preset?.source && <small>Referência: {preset.source}</small>}
      </div>
    </header>
  )
}
