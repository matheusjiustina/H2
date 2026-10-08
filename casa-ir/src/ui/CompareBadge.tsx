import { useRef } from 'react'
import { useStore } from '../app/store'

/**
 * COMPARAR — "Projeto Original × Opção do Cliente" switch (only when there
 * are changes) plus "segure para ver o original": the original is shown only
 * while the button is held.
 */
export function CompareBadge() {
  const changes = useStore((s) => Object.keys(s.clientConfig).length)
  const showOriginal = useStore((s) => s.showOriginal)
  const active = useStore((s) => s.activeOption)
  const set = useStore((s) => s.set)
  const held = useRef(false)
  if (!changes) return null
  const down = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    if (!useStore.getState().showOriginal) {
      held.current = true
      set({ showOriginal: true })
    }
  }
  const up = () => {
    if (held.current) set({ showOriginal: false })
    held.current = false
  }
  return (
    <div className="compare" role="group" aria-label="Comparar">
      <button className={showOriginal ? 'is-active' : ''} onClick={() => set({ showOriginal: true })}>
        Projeto Original
      </button>
      <button className={!showOriginal ? 'is-active' : ''} onClick={() => set({ showOriginal: false })}>
        {active ? `Opção 0${active}` : 'Opção do Cliente'}
      </button>
      <button className="hold" onPointerDown={down} onPointerUp={up} onPointerCancel={up} onContextMenu={(e) => e.preventDefault()} title="Segure para ver o projeto original">
        Segure: original
      </button>
    </div>
  )
}
