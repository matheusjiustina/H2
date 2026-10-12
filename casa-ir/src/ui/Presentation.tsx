/**
 * Opening sequence and APRESENTAÇÃO tour.
 *  - Opening: after loading, a slow 3 s camera approach to the front façade,
 *    then the controls fade in.
 *  - APRESENTAÇÃO: slow guided tour (TOUR in data/cameras), stoppable at any
 *    time with the button, Esc, or by touching the scene.
 */
import { useEffect } from 'react'
import { useStore } from '../app/store'
import { TOUR } from '../data/cameras'
import { IconStop } from './icons'

export function IntroController() {
  const loaded = useStore((s) => s.progress >= 1)
  const intro = useStore((s) => s.intro)
  useEffect(() => {
    if (!loaded) return
    if (!intro) {
      const st = useStore.getState()
      if (st.cameraRequest?.id === 'intro') st.goCamera('hero', true)
      return
    }
    const t1 = window.setTimeout(() => useStore.getState().goCamera('hero', false, true), 450)
    const t2 = window.setTimeout(() => useStore.setState({ intro: false }), 3600)
    const skip = () => useStore.setState({ intro: false })
    window.addEventListener('pointerdown', skip, { once: true })
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.removeEventListener('pointerdown', skip)
    }
  }, [loaded, intro])
  return null
}

export function PresentationController() {
  const presentation = useStore((s) => s.presentation)
  const step = useStore((s) => s.presentationStep)

  useEffect(() => {
    if (!presentation) return
    const shot = TOUR[step]
    if (!shot) {
      useStore.setState({ presentation: false })
      useStore.getState().visit('hero', true)
      return
    }
    useStore.getState().visit(shot.cam, true)
    const t = window.setTimeout(() => useStore.setState({ presentationStep: step + 1 }), (shot.hold + 2.2) * 1000)
    return () => window.clearTimeout(t)
  }, [presentation, step])

  useEffect(() => {
    if (!presentation) return
    const stop = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      if (e instanceof PointerEvent && (e.target as HTMLElement).closest('.present')) return
      useStore.setState({ presentation: false })
    }
    const canvas = document.querySelector('canvas')
    canvas?.addEventListener('pointerdown', stop)
    window.addEventListener('keydown', stop)
    return () => {
      canvas?.removeEventListener('pointerdown', stop)
      window.removeEventListener('keydown', stop)
    }
  }, [presentation])
  return null
}

export function PresentationCaption() {
  const presentation = useStore((s) => s.presentation)
  const step = useStore((s) => s.presentationStep)
  if (!presentation) return null
  const shot = TOUR[Math.min(step, TOUR.length - 1)]
  return (
    <div className="present">
      <div className="present__label" key={step}>
        <span className="present__count">
          {String(Math.min(step + 1, TOUR.length)).padStart(2, '0')} / {TOUR.length}
        </span>
        {shot.label}
      </div>
      <button className="btn btn--ghost btn--sm" onClick={() => useStore.setState({ presentation: false })}>
        <IconStop /> Parar
      </button>
    </div>
  )
}
