import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { useEffect } from 'react'
import { Scene } from '../scene/Scene'
import { useStore } from './store'
import { preloadTextures, setTextureBaseSize } from '../materials/textures'
import { UI } from '../ui/UI'

export function App() {
  const ready = useStore((s) => s.ready)
  useEffect(() => {
    let cancelled = false
    const touch = useStore.getState().isTouch
    setTextureBaseSize(touch ? 512 : 1024)
    preloadTextures((d, t) => {
      if (!cancelled) useStore.setState({ progress: (d / t) * 0.7, progressLabel: 'Gerando materiais…' })
    }).then(() => {
      if (!cancelled) useStore.setState({ progress: 0.75, progressLabel: 'Montando a arquitetura…', ready: true })
    })
    return () => {
      cancelled = true
    }
  }, [])
  return (
    <div className="app">
      {ready && (
        <Canvas
          className="canvas"
          shadows
          dpr={[1, 1.5]}
          gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false, toneMapping: THREE.ACESFilmicToneMapping }}
          camera={{ fov: 38, near: 0.05, far: 1500, position: [55, 8.5, 27] }}
          onCreated={(state) => {
            ;(window as unknown as { __r3f: unknown }).__r3f = state
            requestAnimationFrame(() => requestAnimationFrame(() => useStore.setState({ progress: 1, progressLabel: 'Pronto' })))
          }}
        >
          <Scene />
        </Canvas>
      )}
      <UI />
    </div>
  )
}
