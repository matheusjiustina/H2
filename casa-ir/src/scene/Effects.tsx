/**
 * Post-processing — FOTOREALISTA tier (and high-quality captures) only,
 * deliberately restrained for an architectural-visualisation look:
 *  - N8AO ambient occlusion for contact shadows (furniture meets the floor);
 *  - bloom with a high threshold so only real light sources glow;
 *  - ACES Filmic tone mapping; MSAA for clean edges.
 * No lens dirt, chromatic aberration, vignette or sharpening.
 */
import { useEffect } from 'react'
import { Bloom, EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useStore, effectiveTier } from '../app/store'
import { renderState } from './renderState'

export function Effects() {
  const tier = useStore(effectiveTier)
  const isTouch = useStore((s) => s.isTouch)
  const captureHQ = useStore((s) => s.captureHQ)
  const on = captureHQ || (tier === 'high' && !isTouch)
  useEffect(() => {
    renderState.composerActive = on
    return () => {
      renderState.composerActive = false
    }
  }, [on])
  if (!on) return null
  return (
    <EffectComposer multisampling={captureHQ ? 8 : 4} enableNormalPass={false}>
      <N8AO aoRadius={0.55} distanceFalloff={0.55} intensity={1.35} quality={captureHQ ? 'ultra' : 'high'} halfRes={!captureHQ} />
      <Bloom mipmapBlur luminanceThreshold={1.05} luminanceSmoothing={0.2} intensity={0.3} radius={0.62} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
