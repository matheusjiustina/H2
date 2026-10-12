import type { CSSProperties } from 'react'
import { FINISHES, type FinishId } from '../data/materials'
import { getTexture } from '../materials/textures'

const urlCache = new Map<string, string>()

function texUrl(key: string) {
  let u = urlCache.get(key)
  if (!u) {
    const tex = getTexture(key as never)
    const src = tex.image as HTMLCanvasElement
    const c = document.createElement('canvas')
    c.width = c.height = 96
    c.getContext('2d')!.drawImage(src, 0, 0, src.width / 3, src.height / 3, 0, 0, 96, 96)
    u = c.toDataURL('image/jpeg', 0.8)
    urlCache.set(key, u)
  }
  return u
}

/** Swatch preview: the procedural texture multiplied by the finish colour. */
export function swatchStyle(id: FinishId, custom?: string): CSSProperties {
  const f = FINISHES[id]
  const color = custom ?? f.color
  const st: CSSProperties = { backgroundColor: f.color.toLowerCase() === '#ffffff' && !custom ? f.swatch ?? '#ddd' : color }
  if (f.tex && f.tex !== 'water_normal') {
    st.backgroundImage = `url(${texUrl(f.tex)})`
    st.backgroundSize = 'cover'
    st.backgroundBlendMode = f.color.toLowerCase() === '#ffffff' && !custom ? 'normal' : 'multiply'
  }
  if (f.family === 'metal') st.backgroundImage = `linear-gradient(135deg, rgba(255,255,255,.55), rgba(255,255,255,0) 45%, rgba(0,0,0,.25))`
  return st
}
