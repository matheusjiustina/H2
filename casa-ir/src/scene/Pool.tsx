/**
 * Organic pool — footprint vectorised from ARQ p.2 (52 m²).
 * Floor slopes from ~0.45 m at the beach side (sand, ARQ p.7) to 1.45 m at
 * the north-west corner (A-08). Tile basin with animated caustics, natural
 * stone coping, rocks on the boundary side and an almost still water surface:
 *  - EQUILIBRADO: transparent turquoise water with two layers of ripples;
 *  - FOTOREALISTA: transmissive water (IOR 1.33, depth-tinted attenuation).
 */
import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GeoBuilder } from '../architecture/builder'
import { extrudePoly, flatPoly, rockGeometry } from '../architecture/shapes'
import { POOL, ROCKS } from '../data/site'
import { SlotMeshes } from '../configurator/SlotMeshes'
import { getMat } from '../materials/library'
import { getTexture } from '../materials/textures'
import { lightState } from './timeOfDay'
import { useStore, effectiveTier } from '../app/store'

const WATER_Y = -0.07

/** Depth of the pool floor at plan position (x, z). */
function floorDepth(x: number, z: number) {
  const f = THREE.MathUtils.clamp(((11.8 - x) / 10.5) * 0.6 + ((8.3 - z) / 7.4) * 0.55 - 0.1, 0, 1)
  return 0.45 + 1.0 * THREE.MathUtils.smoothstep(f, 0, 1)
}

export function Pool() {
  const tier = useStore(effectiveTier)
  const captureHQ = useStore((s) => s.captureHQ)
  const high = tier === 'high' || captureHQ
  const { geos, water } = useMemo(() => {
    const b = new GeoBuilder()
    // basin (seen from inside), floor reshaped into a gentle slope
    const basin = extrudePoly(POOL, -1.5, 1.5)
    const pos = basin.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < -1.0) pos.setY(i, -floorDepth(pos.getX(i), pos.getZ(i)))
    }
    basin.computeVertexNormals()
    b.geo('pool_tile', basin)
    // coping along every edge
    for (let i = 0; i < POOL.length; i++) {
      const [x0, z0] = POOL[i]
      const [x1, z1] = POOL[(i + 1) % POOL.length]
      const len = Math.hypot(x1 - x0, z1 - z0)
      const ang = Math.atan2(z1 - z0, x1 - x0)
      const m = new THREE.Matrix4().compose(new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang), new THREE.Vector3(1, 1, 1))
      b.with(m, () => b.box('coping', [-len / 2 - 0.09, 0, -0.1], [len / 2 + 0.09, 0.065, 0.1]))
    }
    // natural rocks on the boundary edges (ARQ p.10 / p.13)
    ROCKS.forEach(([x, z, s], i) => {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.05, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i * 1.7, 0)), new THREE.Vector3(s, s * 0.9, s * 0.8))
      b.geo('rock', rockGeometry(i % 5), m, [s, s])
    })
    const water = flatPoly(POOL, WATER_Y)
    return { geos: b.build(), water }
  }, [])

  const waterMat = useMemo(() => {
    const n1 = getTexture('water_normal').clone()
    n1.repeat.set(0.26, 0.26)
    n1.needsUpdate = true
    const n2 = getTexture('water_normal').clone()
    n2.repeat.set(0.55, 0.55)
    n2.rotation = 1.1
    n2.needsUpdate = true
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#2bb3b2'),
      roughness: 0.035,
      metalness: 0,
      normalMap: n1,
      normalScale: new THREE.Vector2(0.18, 0.18),
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      clearcoatNormalMap: n2,
      clearcoatNormalScale: new THREE.Vector2(0.12, 0.12),
      envMapIntensity: 1.2,
      ior: 1.33,
    })
  }, [])

  // quality-dependent water model (never alters the design)
  useEffect(() => {
    const m = waterMat
    if (high) {
      m.transmission = 1
      m.thickness = 1.1
      m.attenuationColor.set('#13a3a4')
      m.attenuationDistance = 1.3
      m.color.set('#e9fbf9')
      m.transparent = false
      m.opacity = 1
      m.depthWrite = true
    } else {
      m.transmission = 0
      m.color.set('#27b0b0')
      m.transparent = true
      m.opacity = 0.8
      m.depthWrite = false
    }
    m.needsUpdate = true
  }, [high, waterMat])

  useMemo(() => {
    const tile = getMat('pool_tile')
    tile.side = THREE.BackSide
    tile.emissive.set('#36c6d2')
    tile.needsUpdate = true
  }, [])

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1)
    // almost imperceptible movement
    waterMat.normalMap!.offset.x += d * 0.008
    waterMat.normalMap!.offset.y += d * 0.005
    waterMat.clearcoatNormalMap!.offset.x -= d * 0.006
    waterMat.clearcoatNormalMap!.offset.y += d * 0.009
    const tile = getMat('pool_tile')
    tile.emissiveIntensity = lightState.night * 0.4 + lightState.sunset * 0.05
  })

  return (
    <group>
      <SlotMeshes geos={geos} selectable={null} />
      <mesh geometry={water} material={waterMat} renderOrder={3} receiveShadow userData={{ noPick: true }} />
    </group>
  )
}
