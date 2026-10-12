/** DEV mode only (?dev): FPS + camera readout for authoring presets. Hidden from clients. */
import { useEffect, useState } from 'react'
import { useStore, effectiveTier } from '../app/store'

export function DevOverlay() {
  const [info, setInfo] = useState('')
  const tier = useStore(effectiveTier)
  useEffect(() => {
    let frames = 0
    let last = performance.now()
    let raf = 0
    const loop = () => {
      frames++
      const now = performance.now()
      if (now - last > 1000) {
        const st = (window as unknown as { __r3f?: { camera: { position: { x: number; y: number; z: number } }; gl: { info: { render: { calls: number; triangles: number } } } } }).__r3f
        const p = st?.camera.position
        const r = st?.gl.info.render
        setInfo(`${Math.round((frames * 1000) / (now - last))} fps · ${tier} · calls ${r?.calls ?? '-'} · tris ${r ? Math.round(r.triangles / 1000) : '-'}k · cam ${p ? `${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}` : ''}`)
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [tier])
  return <div className="dev">{info}</div>
}
