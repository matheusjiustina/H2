/**
 * Adaptive quality.
 *  AUTO: conservative initial guess from the device (GPU string, memory,
 *  cores, touch/screen) then a runtime FPS monitor that steps down (never up
 *  more than once) to keep interaction smooth.
 *  HIGH / MEDIUM / LOW: fixed tiers (DPR, shadow map, post-processing).
 */
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useStore, effectiveTier, type Tier } from '../app/store'

export const DPR: Record<Tier, [number, number]> = { high: [1, 2], medium: [1, 1.5], low: [0.75, 1] }

export function detectTier(gl: WebGLRenderingContext | WebGL2RenderingContext): Tier {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const mem = nav.deviceMemory ?? 8
  const cores = navigator.hardwareConcurrency ?? 4
  const touch = matchMedia('(pointer: coarse)').matches
  let renderer = ''
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    renderer = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) as string
  } catch {
    /* ignore */
  }
  const r = renderer.toLowerCase()
  const weakGpu = /mali|adreno [1-5]|powervr|intel\(r\) (hd|uhd) graphics [0-9]{3}\b|swiftshader|llvmpipe|software/.test(r)
  const strongGpu = /nvidia|geforce|rtx|radeon rx|apple m[1-9]|apple gpu/.test(r)
  if (touch) return mem >= 6 && !weakGpu ? 'medium' : 'low'
  if (weakGpu || mem <= 4 || cores <= 4) return 'low'
  if (strongGpu && mem >= 8) return 'high'
  return 'medium'
}

export function QualityManager() {
  const gl = useThree((s) => s.gl)
  const setDpr = useThree((s) => s.setDpr)
  const tier = useStore(effectiveTier)
  const dprScale = useStore((s) => s.dprScale)
  const capturing = useStore((s) => s.capturing)
  const detected = useRef(false)

  useEffect(() => {
    if (detected.current) return
    detected.current = true
    useStore.setState({ autoTier: detectTier(gl.getContext()) })
  }, [gl])

  useEffect(() => {
    if (capturing) return // the capture sets its own resolution
    const [lo, hi] = DPR[tier]
    setDpr(Math.max(0.6, Math.max(lo, Math.min(hi, window.devicePixelRatio || 1)) * dprScale))
  }, [tier, dprScale, capturing, setDpr])

  /**
   * Runtime safeguard (every mode): when the frame rate drops, first lower the
   * render resolution, then (AUTO only) the effects tier. Geometry, finishes
   * and lighting design are never simplified. Resolution recovers when there
   * is headroom again.
   */
  const acc = useRef({ t: 0, frames: 0, bad: 0, good: 0, grace: 4 })
  useFrame((_, dt) => {
    const st = useStore.getState()
    if (st.capturing || document.hidden || st.fading) return
    const a = acc.current
    a.t += dt
    a.frames++
    if (a.t < 1.5) return
    const fps = a.frames / a.t
    a.t = 0
    a.frames = 0
    if (a.grace > 0) {
      a.grace--
      return
    }
    if (fps < 28) {
      a.bad++
      a.good = 0
    } else if (fps > 52) {
      a.good++
      a.bad = Math.max(0, a.bad - 1)
    } else {
      a.bad = Math.max(0, a.bad - 1)
      a.good = 0
    }
    if (a.bad >= 3) {
      a.bad = 0
      a.grace = 3
      if (st.dprScale > 0.72) useStore.setState({ dprScale: Math.round((st.dprScale - 0.15) * 100) / 100 })
      else if (st.quality === 'auto') {
        if (st.autoTier === 'high') useStore.setState({ autoTier: 'medium', dprScale: 1 })
        else if (st.autoTier === 'medium') useStore.setState({ autoTier: 'low', dprScale: 1 })
      }
    } else if (a.good >= 5 && st.dprScale < 1) {
      a.good = 0
      a.grace = 2
      useStore.setState({ dprScale: Math.min(1, Math.round((st.dprScale + 0.15) * 100) / 100) })
    }
  })
  return null
}
