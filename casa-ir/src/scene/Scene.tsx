import { Suspense, useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore, activeConfig } from '../app/store'
import { applyConfig } from '../materials/library'
import { Lighting } from './Lighting'
import { Sky } from './Sky'
import { Site } from './Site'
import { Pool } from './Pool'
import { House } from './House'
import { Landscaping } from './Landscaping'
import { Interior } from './Interior'
import { Pickable, SelectionHighlight } from '../configurator/Selection'
import { CameraRig } from '../controls/CameraRig'
import { WalkControls } from '../controls/WalkControls'
import { Effects } from './Effects'
import { QualityManager } from './QualityManager'
import { RoomTracker } from '../controls/RoomTracker'
import { CaptureBridge } from '../utils/screenshot'

export function Scene() {
  const nav = useStore((s) => s.nav)
  const gl = useThree((s) => s.gl)

  // configuration → materials (mutated in place, no re-render needed)
  useEffect(() => {
    applyConfig(activeConfig(useStore.getState()))
    return useStore.subscribe((s, p) => {
      if (s.clientConfig !== p.clientConfig || s.showOriginal !== p.showOriginal) applyConfig(activeConfig(s))
    })
  }, [])

  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.outputColorSpace = THREE.SRGBColorSpace
  }, [gl])

  return (
    <>
      <Sky />
      <Lighting />
      <Pickable>
        <Site />
        <Pool />
        <House />
        <Suspense fallback={null}>
          <Interior />
        </Suspense>
        <Landscaping />
      </Pickable>
      <SelectionHighlight />
      {nav === 'walk' ? <WalkControls /> : <CameraRig />}
      {nav !== 'walk' && <RoomTracker />}
      <Effects />
      <QualityManager />
      <CaptureBridge />
    </>
  )
}
