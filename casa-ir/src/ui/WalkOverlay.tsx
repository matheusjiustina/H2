/** Walk-through overlay: instructions (desktop) or virtual joystick (touch). */
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../app/store'
import { walkInput } from '../controls/walkInput'

export function WalkOverlay() {
  const nav = useStore((s) => s.nav)
  const isTouch = useStore((s) => s.isTouch)
  const set = useStore((s) => s.set)
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    const f = () => setLocked(!!document.pointerLockElement)
    document.addEventListener('pointerlockchange', f)
    return () => document.removeEventListener('pointerlockchange', f)
  }, [])
  if (nav !== 'walk') return null
  return (
    <>
      {!isTouch && !locked && (
        <div className="walk-hint">
          <b>Passeio</b>
          <span>Clique na cena para olhar com o mouse · W A S D para caminhar · Shift para acelerar · mire em um objeto e clique para personalizar · Esc para liberar o cursor</span>
        </div>
      )}
      {!isTouch && locked && <div className="crosshair" />}
      {isTouch && <Joystick />}
      <button className="btn btn--exit" onClick={() => set({ nav: 'orbit' })}>
        Sair do passeio
      </button>
    </>
  )
}

function Joystick() {
  const base = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  useEffect(() => () => {
    walkInput.jx = 0
    walkInput.jy = 0
  }, [])
  const R = 52
  const update = (cx: number, cy: number) => {
    const r = base.current!.getBoundingClientRect()
    let dx = cx - (r.left + r.width / 2)
    let dy = cy - (r.top + r.height / 2)
    const l = Math.hypot(dx, dy)
    if (l > R) {
      dx = (dx / l) * R
      dy = (dy / l) * R
    }
    setKnob({ x: dx, y: dy })
    walkInput.jx = dx / R
    walkInput.jy = -dy / R
  }
  const end = () => {
    setKnob({ x: 0, y: 0 })
    walkInput.jx = 0
    walkInput.jy = 0
  }
  return (
    <div
      ref={base}
      className="joystick"
      onPointerDown={(e) => {
        e.stopPropagation()
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        update(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => e.buttons && update(e.clientX, e.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="joystick__knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      <span className="joystick__label">Mover</span>
    </div>
  )
}
