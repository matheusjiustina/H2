/**
 * Organic pool — footprint vectorised from ARQ p.2 (52 m²), depth 1.40 m (A-08).
 * Basin with tile, natural stone coping, rocks on the boundary side and an
 * animated, subtly rippled water surface.
 */
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GeoBuilder } from '../architecture/builder'
import { extrudePoly, flatPoly, rockGeometry } from '../architecture/shapes'
import { POOL, ROCKS } from '../data/site'
import { SlotMeshes } from '../configurator/SlotMeshes'
import { getMat } from '../materials/library'
import { getTexture } from '../materials/textures'
import { lightState } from './Lighting'

const DEPTH = 1.4
const WATER_Y = -0.07

export function Pool() {
  const { geos, water } = useMemo(() => {
    const b = new GeoBuilder()
    // basin (seen from inside)
    b.geo('pool_tile', extrudePoly(POOL, -DEPTH - 0.05, DEPTH + 0.05))
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
    const n = getTexture('water_normal').clone()
    n.repeat.set(0.28, 0.28)
    n.needsUpdate = true
    const m = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#47b9c1'),
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.72,
      normalMap: n,
      normalScale: new THREE.Vector2(0.28, 0.28),
      envMapIntensity: 1.25,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      depthWrite: false,
    })
    return m
  }, [])

  useMemo(() => {
    const tile = getMat('pool_tile')
    tile.side = THREE.BackSide
    tile.emissive.set('#36c6d2')
    tile.needsUpdate = true
  }, [])

  useFrame((_, dt) => {
    const n = waterMat.normalMap!
    n.offset.x += dt * 0.012
    n.offset.y += dt * 0.007
    const tile = getMat('pool_tile')
    tile.emissiveIntensity = lightState.night * 0.45
    waterMat.color.set('#47b9c1').lerp(new THREE.Color('#1d6f7a'), lightState.night * 0.5)
  })

  return (
    <group>
      <SlotMeshes geos={geos} selectable={null} />
      <mesh geometry={water} material={waterMat} renderOrder={3} receiveShadow userData={{ noPick: true }} />
    </group>
  )
}
