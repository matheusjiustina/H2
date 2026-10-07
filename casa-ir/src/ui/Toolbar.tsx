/**
 * Secondary controls: Dia/Noite · Sombras · Planta 3D · Passeio · Vista Livre ·
 * Capturar imagem · Opções · Qualidade, plus the always-visible
 * "Restaurar projeto original".
 */
import { useState } from 'react'
import { useStore, type Quality } from '../app/store'
import { captureImage } from '../utils/screenshot'
import { camerasFor } from '../data/cameras'
import { ROOM_BY_ID } from '../data/houseSpec'
import { IconCamera, IconCompare, IconMoon, IconOrbit, IconPlan, IconRestore, IconSettings, IconShadow, IconSun, IconWalk } from './icons'

export function Toolbar() {
  const night = useStore((s) => s.night)
  const shadows = useStore((s) => s.shadows)
  const plan = useStore((s) => s.plan)
  const nav = useStore((s) => s.nav)
  const mode = useStore((s) => s.mode)
  const panel = useStore((s) => s.panel)
  const quality = useStore((s) => s.quality)
  const autoTier = useStore((s) => s.autoTier)
  const currentRoom = useStore((s) => s.currentRoom)
  const set = useStore((s) => s.set)
  const goCamera = useStore((s) => s.goCamera)
  const resetAll = useStore((s) => s.resetAll)
  const changes = useStore((s) => Object.keys(s.clientConfig).length)
  const [confirm, setConfirm] = useState(false)
  const [qOpen, setQOpen] = useState(false)

  const togglePlan = () => {
    if (!plan) {
      set({ plan: true, nav: 'orbit', selectedId: null })
      goCamera('planta3d')
    } else {
      set({ plan: false })
      goCamera(mode === 'exterior' ? 'hero' : camerasFor(currentRoom ?? 'sala')[0]?.id ?? 'hero')
    }
  }
  const walk = () => {
    if (nav === 'walk') return
    set({ nav: 'walk', plan: false, selectedId: null })
    const r = currentRoom ? ROOM_BY_ID[currentRoom] : null
    if (r?.spawn) set({ walkTeleport: { x: r.spawn[0], z: r.spawn[1], yaw: r.spawn[2], ts: performance.now() } })
  }
  const orbit = () => {
    if (nav !== 'orbit') {
      set({ nav: 'orbit' })
      goCamera(currentRoom && mode === 'interior' ? camerasFor(currentRoom)[0]?.id ?? 'hero' : 'hero')
    }
  }

  return (
    <>
      <div className="toolbar" role="toolbar" aria-label="Controles">
        <button className="tool" onClick={() => set({ night: !night })} aria-pressed={night}>
          {night ? <IconMoon /> : <IconSun />}
          <span>{night ? 'Noite' : 'Dia'}</span>
        </button>
        <button className={`tool${shadows ? ' is-on' : ''}`} onClick={() => set({ shadows: !shadows })} aria-pressed={shadows}>
          <IconShadow />
          <span>Sombras</span>
        </button>
        <button className={`tool${plan ? ' is-on' : ''}`} onClick={togglePlan} aria-pressed={plan}>
          <IconPlan />
          <span>Planta 3D</span>
        </button>
        <button className={`tool${nav === 'walk' ? ' is-on' : ''}`} onClick={walk} aria-pressed={nav === 'walk'}>
          <IconWalk />
          <span>Passeio</span>
        </button>
        <button className={`tool${nav === 'orbit' && !plan ? ' is-on' : ''}`} onClick={orbit} aria-pressed={nav === 'orbit'}>
          <IconOrbit />
          <span>Vista livre</span>
        </button>
        <span className="tool-sep" />
        <button className="tool" onClick={() => captureImage()}>
          <IconCamera />
          <span>Capturar</span>
        </button>
        <button className={`tool${panel === 'opcoes' ? ' is-on' : ''}`} onClick={() => set({ panel: panel === 'opcoes' ? null : 'opcoes' })}>
          <IconCompare />
          <span>Opções</span>
        </button>
        <div className="tool-wrap">
          <button className={`tool${qOpen ? ' is-on' : ''}`} onClick={() => setQOpen(!qOpen)} aria-expanded={qOpen}>
            <IconSettings />
            <span>Qualidade</span>
          </button>
          {qOpen && (
            <div className="popover" role="menu">
              {(['auto', 'high', 'medium', 'low'] as Quality[]).map((q) => (
                <button
                  key={q}
                  role="menuitemradio"
                  aria-checked={quality === q}
                  className={quality === q ? 'is-active' : ''}
                  onClick={() => {
                    set({ quality: q })
                    setQOpen(false)
                  }}
                >
                  {{ auto: `Automática (${{ high: 'alta', medium: 'média', low: 'baixa' }[autoTier]})`, high: 'Alta', medium: 'Média', low: 'Baixa' }[q]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="restore">
        {!confirm ? (
          <button className="btn btn--restore" onClick={() => (changes ? setConfirm(true) : resetAll())}>
            <IconRestore /> Restaurar projeto original
          </button>
        ) : (
          <div className="confirm">
            <span>Restaurar todos os acabamentos do projeto?</span>
            <button
              className="btn btn--sm"
              onClick={() => {
                resetAll()
                setConfirm(false)
              }}
            >
              Restaurar
            </button>
            <button className="btn btn--sm btn--ghost" onClick={() => setConfirm(false)}>
              Cancelar
            </button>
          </div>
        )}
      </div>
    </>
  )
}
