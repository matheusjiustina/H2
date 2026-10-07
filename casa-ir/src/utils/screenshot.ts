/**
 * "CAPTURAR IMAGEM" — renders the current view at high resolution (up to 4K
 * wide) without any UI or selection highlight and downloads a PNG.
 */
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../app/store'

type CaptureFn = () => Promise<void>
let captureImpl: CaptureFn | null = null

export function captureImage() {
  return captureImpl ? captureImpl() : Promise.resolve()
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)))

export function CaptureBridge() {
  const { gl, scene, camera, size } = useThree()
  useEffect(() => {
    captureImpl = async () => {
      useStore.setState({ capturing: true })
      await nextFrame()
      await nextFrame()
      const prev = gl.getPixelRatio()
      const scale = Math.min(3840 / size.width, 2.5, 4096 / size.height)
      gl.setPixelRatio(Math.max(prev, scale))
      gl.setSize(size.width, size.height, false)
      const cam = camera as THREE.PerspectiveCamera
      gl.render(scene, cam)
      const url = gl.domElement.toDataURL('image/png')
      gl.setPixelRatio(prev)
      gl.setSize(size.width, size.height, false)
      useStore.setState({ capturing: false })
      const st = useStore.getState()
      const label = st.showOriginal ? 'projeto-original' : st.activeOption ? `opcao-0${st.activeOption}` : 'personalizado'
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
      const a = document.createElement('a')
      a.href = url
      a.download = `CASA-IR_${label}_${stamp}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      st.notify('Imagem capturada')
    }
    return () => {
      captureImpl = null
    }
  }, [gl, scene, camera, size])
  return null
}
