/**
 * Minimal bottom toolbar:
 *   ☀ DIA ◐ ENTARDECER ☾ NOITE · ◈ PLANTA 3D · ▶ APRESENTAÇÃO · PASSEIO ·
 *   VISTA LIVRE · ⚙ QUALIDADE · 📷 CAPTURAR · OPÇÕES
 * plus the always-visible "Restaurar projeto original".
 */
import { useEffect, useState } from 'react'
import { useStore, type Quality, type TimeOfDay } from '../app/store'
import { captureImage } from '../utils/screenshot'
import { camerasFor, SHOTS } from '../data/cameras'
import { ROOM_BY_ID } from '../data/houseSpec'
import { IconCamera, IconCompare, IconMoon, IconOrbit, IconPlan, IconPlay, IconRestore, IconSettings, IconSun, IconSunset, IconWalk } from './icons'

const TIMES: { id: TimeOfDay; label: string; icon: () => React.ReactElement }[] = [
  { id: 'dia', label: 'Dia', icon: IconSun },
  { id: 'entardecer', label: 'Entardecer', icon: IconSunset },
  { id: 'noite', label: 'Noite', icon: IconMoon },
]

const TIER_LABEL = { high: 'Fotorealista', medium: 'Equilibrado', low: 'Leve' }

export function Toolbar() {
  const time = useStore((s) => s.time)
  const shadows = useStore((s) => s.shadows)
  const plan = useStore((s) => s.plan)
  const nav = useStore((s) => s.nav)
  const mode = useStore((s) => s.mode)
  const panel = useStore((s) => s.panel)
  const quality = useStore((s) => s.quality)
  const autoTier = useStore((s) => s.autoTier)
  const currentRoom = useStore((s) => s.currentRoom)
  const presentation = useStore((s) => s.presentation)
  const set = useStore((s) => s.set)
  const goCamera = useStore((s) => s.goCamera)
  const visit = useStore((s) => s.visit)
  const resetAll = useStore((s) => s.resetAll)
  const changes = useStore((s) => Object.keys(s.clientConfig).length)
  const [confirm, setConfirm] = useState(false)
  const [open, setOpen] = useState<null | 'q' | 'cap'>(null)

  // close popovers on outside click / Escape
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      if (e instanceof PointerEvent && (e.target as HTMLElement).closest('.tool-wrap')) return
      setOpen(null)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])

  const togglePlan = () => {
    if (!plan) {
      set({ plan: true, nav: 'orbit', selectedId: null, presentation: false })
      goCamera('planta3d')
    } else {
      set({ plan: false })
      goCamera(mode === 'exterior' ? 'hero' : camerasFor(currentRoom ?? 'sala')[0]?.id ?? 'hero')
    }
  }
  const walk = () => {
    if (nav === 'walk') return
    set({ nav: 'walk', plan: false, selectedId: null, presentation: false })
    const r = currentRoom ? ROOM_BY_ID[currentRoom] : null
    if (r?.spawn) set({ walkTeleport: { x: r.spawn[0], z: r.spawn[1], yaw: r.spawn[2], ts: performance.now() } })
  }
  const orbit = () => {
    if (nav !== 'orbit') {
      set({ nav: 'orbit' })
      goCamera(currentRoom && mode === 'interior' ? camerasFor(currentRoom)[0]?.id ?? 'hero' : 'hero')
    }
  }
  const present = () => {
    if (presentation) set({ presentation: false })
    else set({ presentation: true, presentationStep: 0, panel: null, selectedId: null, plan: false, nav: 'orbit' })
  }
  const capture = (hq: boolean) => {
    setOpen(null)
    // let the popover disappear before the frame is grabbed
    requestAnimationFrame(() => captureImage(hq))
  }

  return (
    <>
      <div className="toolbar" role="toolbar" aria-label="Controles">
        <div className="tod" role="radiogroup" aria-label="Horário">
          {TIMES.map((t) => (
            <button key={t.id} role="radio" aria-checked={time === t.id} className={`tool tool--tod${time === t.id ? ' is-on' : ''}`} onClick={() => set({ time: t.id })}>
              <t.icon />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <span className="tool-sep" />
        <button className={`tool${plan ? ' is-on' : ''}`} onClick={togglePlan} aria-pressed={plan}>
          <IconPlan />
          <span>Planta 3D</span>
        </button>
        <button className={`tool${presentation ? ' is-on' : ''}`} onClick={present} aria-pressed={presentation}>
          <IconPlay />
          <span>Apresentação</span>
        </button>
        <button className={`tool${nav === 'walk' ? ' is-on' : ''}`} onClick={walk} aria-pressed={nav === 'walk'}>
          <IconWalk />
          <span>Passeio</span>
        </button>
        <button className={`tool${nav === 'orbit' && !plan && !presentation ? ' is-on' : ''}`} onClick={orbit} aria-pressed={nav === 'orbit'}>
          <IconOrbit />
          <span>Vista livre</span>
        </button>
        <span className="tool-sep" />
        <div className="tool-wrap">
          <button className={`tool${open === 'q' ? ' is-on' : ''}`} onClick={() => setOpen(open === 'q' ? null : 'q')} aria-expanded={open === 'q'}>
            <IconSettings />
            <span>Qualidade</span>
          </button>
          {open === 'q' && (
            <div className="popover" role="menu">
              <div className="popover__title">Qualidade de imagem</div>
              {(['auto', 'medium', 'high'] as Quality[]).map((q) => (
                <button
                  key={q}
                  role="menuitemradio"
                  aria-checked={quality === q}
                  className={quality === q ? 'is-active' : ''}
                  onClick={() => {
                    set({ quality: q, dprScale: 1 })
                    setOpen(null)
                  }}
                >
                  {q === 'auto' ? 'Auto' : TIER_LABEL[q as 'high' | 'medium']}
                  <small>{q === 'auto' ? `Ajusta ao aparelho · agora ${TIER_LABEL[autoTier].toLowerCase()}` : q === 'high' ? 'Reflexos, oclusão e vidro físico' : 'Fluido em qualquer computador'}</small>
                </button>
              ))}
              <div className="popover__sep" />
              <button role="menuitemcheckbox" aria-checked={shadows} className={shadows ? 'is-active' : ''} onClick={() => set({ shadows: !shadows })}>
                Sombras {shadows ? 'ligadas' : 'desligadas'}
              </button>
            </div>
          )}
        </div>
        <div className="tool-wrap">
          <button className={`tool${open === 'cap' ? ' is-on' : ''}`} onClick={() => setOpen(open === 'cap' ? null : 'cap')} aria-expanded={open === 'cap'}>
            <IconCamera />
            <span>Capturar</span>
          </button>
          {open === 'cap' && (
            <div className="popover popover--wide" role="menu">
              <div className="popover__title">Capturar imagem desta vista</div>
              <button onClick={() => capture(false)}>
                Qualidade normal<small>Resolução da tela</small>
              </button>
              <button onClick={() => capture(true)}>
                Alta qualidade<small>Até 4K, sombras e oclusão refinadas</small>
              </button>
              <div className="popover__sep" />
              <div className="popover__title">Enquadramentos</div>
              <div className="popover__grid">
                {SHOTS.map((s) => (
                  <button key={s.id} className="mini" onClick={() => visit(s.cam)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button className={`tool${panel === 'opcoes' ? ' is-on' : ''}`} onClick={() => set({ panel: panel === 'opcoes' ? null : 'opcoes' })}>
          <IconCompare />
          <span>Opções</span>
        </button>
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
