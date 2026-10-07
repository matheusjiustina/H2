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
  const quality = useStore((s) => s.quality)
  const tier = useStore(effectiveTier)
  const detected = useRef(false)

  useEffect(() => {
    if (detected.current) return
    detected.current = true
    useStore.setState({ autoTier: detectTier(gl.getContext()) })
  }, [gl])

  useEffect(() => {
    const [lo, hi] = DPR[tier]
    setDpr(Math.max(lo, Math.min(hi, window.devicePixelRatio || 1)))
  }, [tier, setDpr])

  // runtime FPS monitor (AUTO only)
  const acc = useRef({ t: 0, frames: 0, bad: 0, grace: 4 })
  useFrame((_, dt) => {
    if (quality !== 'auto') return
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
    if (fps < 28) a.bad++
    else a.bad = Math.max(0, a.bad - 1)
    if (a.bad >= 3) {
      a.bad = 0
      a.grace = 3
      const cur = useStore.getState().autoTier
      if (cur === 'high') useStore.setState({ autoTier: 'medium' })
      else if (cur === 'medium') useStore.setState({ autoTier: 'low' })
    }
  })
  return null
}
