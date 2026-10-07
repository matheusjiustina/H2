/**
 * Post-processing — HIGH tier only, and deliberately restrained:
 * ambient occlusion for contact depth + SMAA + ACES tone mapping.
 */
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useStore, effectiveTier } from '../app/store'

export function Effects() {
  const tier = useStore(effectiveTier)
  const isTouch = useStore((s) => s.isTouch)
  const capturing = useStore((s) => s.capturing)
  if (tier !== 'high' || isTouch || capturing) return null
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO aoRadius={0.6} distanceFalloff={0.6} intensity={1.6} quality="medium" halfRes />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  )
}
