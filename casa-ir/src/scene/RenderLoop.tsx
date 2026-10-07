import { useFrame } from '@react-three/fiber'
import { renderState } from './renderState'
import { sharedUniforms } from '../materials/library'

/**
 * Explicit render loop (priority 2, after the effect composer at priority 1):
 * renders the scene when no composer is active and reads the frame back for
 * captures in the same task, so no preserveDrawingBuffer is needed.
 */
export function RenderLoop() {
  useFrame((state) => {
    sharedUniforms.uTime.value = state.clock.elapsedTime
    renderState.scene = state.scene
    if (!renderState.composerActive) state.gl.render(state.scene, state.camera)
    if (renderState.capture) {
      const cb = renderState.capture
      renderState.capture = null
      cb(state.gl.domElement.toDataURL('image/png'))
    }
  }, 2)
  return null
}
