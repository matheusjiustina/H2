/**
 * Lighting rig.
 *
 *  - Sun (directional, shadowed) + hemisphere sky fill + image based lighting.
 *  - Smooth DAY ↔ NIGHT transition driven by a single `nightFactor`.
 *  - "Light pool": a FIXED number of warm point lights that are re-assigned to
 *    the architectural light anchors nearest to the camera. Keeping the light
 *    count constant avoids shader recompilation hitches while still letting
 *    every room have real light when you are in it.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import * as THREE from 'three'
import { useStore, effectiveTier } from '../app/store'
import { ROOMS, SUN, HEIGHTS } from '../data/houseSpec'
import { setNightFactor } from '../materials/library'
import { EXTERIOR_LIGHTS } from './lightAnchors'

export const lightState = { night: 0 }

const POOL_SIZE = { high: 10, medium: 7, low: 4 }

interface Anchor {
  p: THREE.Vector3
  i: number
  color: THREE.Color
  dist: number
  interior: boolean
}

const WARM = new THREE.Color('#ffc58c')
const WARM_EXT = new THREE.Color('#ffd2a0')

export function Lighting() {
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const moon = useRef<THREE.DirectionalLight>(null)
  const { scene, gl, camera } = useThree()
  const night = useStore((s) => s.night)
  const shadows = useStore((s) => s.shadows)
  const tier = useStore(effectiveTier)
  const poolSize = POOL_SIZE[tier]

  const anchors = useMemo<Anchor[]>(() => {
    const a: Anchor[] = []
    for (const r of ROOMS) for (const l of r.lights ?? []) a.push({ p: new THREE.Vector3(l[0], l[1], l[2]), i: l[3], color: WARM, dist: r.id === 'sala' ? 11 : 7.5, interior: r.interior })
    for (const l of EXTERIOR_LIGHTS) a.push({ p: new THREE.Vector3(l[0], l[1], l[2]), i: l[3], color: WARM_EXT, dist: l[4] ?? 7, interior: false })
    return a
  }, [])

  const pool = useMemo(() => Array.from({ length: poolSize }, () => {
    const l = new THREE.PointLight(WARM, 0, 7, 2)
    l.castShadow = false
    return l
  }), [poolSize])

  useEffect(() => {
    const g = new THREE.Group()
    pool.forEach((l) => g.add(l))
    scene.add(g)
    return () => {
      scene.remove(g)
      pool.forEach((l) => l.dispose())
    }
  }, [pool, scene])

  // sun direction
  const sunPos = useMemo(() => {
    const az = (SUN.azimuthDeg * Math.PI) / 180
    const el = (SUN.elevationDeg * Math.PI) / 180
    // azimuth measured from north (−Z) clockwise towards east (+X)
    return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(60)
  }, [])

  useEffect(() => {
    const s = sun.current
    if (!s) return
    const size = tier === 'high' ? 4096 : tier === 'medium' ? 2048 : 1024
    s.shadow.mapSize.set(size, size)
    s.shadow.map?.dispose()
    s.shadow.map = null as unknown as THREE.WebGLRenderTarget
    s.shadow.camera.left = -27
    s.shadow.camera.right = 27
    s.shadow.camera.top = 22
    s.shadow.camera.bottom = -22
    s.shadow.camera.near = 1
    s.shadow.camera.far = 140
    s.shadow.camera.updateProjectionMatrix()
    s.shadow.bias = -0.00025
    s.shadow.normalBias = tier === 'low' ? 0.05 : 0.025
    s.target.position.set(20, 0, 9)
    s.target.updateMatrixWorld()
  }, [tier])

  useEffect(() => {
    gl.shadowMap.enabled = shadows
    gl.shadowMap.type = tier === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap
    gl.shadowMap.needsUpdate = true
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined
      if (m) m.needsUpdate = true
    })
  }, [shadows, tier, gl, scene])

  const tick = useRef(0)
  const insideK = useRef(0)
  const assigned = useRef<(Anchor | null)[]>([])

  useFrame((_, dt) => {
    // animate night factor
    const target = night ? 1 : 0
    const nf = THREE.MathUtils.damp(lightState.night, target, 2.2, Math.min(dt, 0.3))
    const changed = Math.abs(nf - lightState.night) > 1e-4
    lightState.night = Math.abs(nf - target) < 0.002 ? target : nf
    const n = lightState.night
    if (changed) setNightFactor(n)

    if (sun.current) {
      sun.current.intensity = THREE.MathUtils.lerp(3.1, 0, n)
      sun.current.color.setRGB(1, THREE.MathUtils.lerp(0.95, 0.8, n), THREE.MathUtils.lerp(0.88, 0.7, n))
      sun.current.castShadow = shadows && n < 0.95
    }
    if (moon.current) moon.current.intensity = n * 0.22
    if (hemi.current) {
      hemi.current.intensity = THREE.MathUtils.lerp(0.42, 0.05, n)
      hemi.current.color.set('#cfe0ee').lerp(new THREE.Color('#33415a'), n)
    }
    const room = useStore.getState().currentRoom
    const inside = room ? ROOMS.find((r) => r.id === room)?.interior ?? false : false
    insideK.current = THREE.MathUtils.damp(insideK.current, inside ? 1 : 0, 2.5, Math.min(dt, 0.1))
    const k = insideK.current
    scene.environmentIntensity = THREE.MathUtils.lerp(0.62, 0.07, n) * THREE.MathUtils.lerp(1, 0.5, k)
    gl.toneMappingExposure = THREE.MathUtils.lerp(1.0, 1.25, n) * THREE.MathUtils.lerp(1, 1.12, k)

    // light pool re-assignment at ~4 Hz
    tick.current += dt
    const cam = camera.position
    if (tick.current > 0.25 || assigned.current.length !== pool.length) {
      tick.current = 0
      const ranked = anchors
        .map((a) => ({ a, d: a.p.distanceTo(cam) / (0.6 + a.i) }))
        .sort((p, q) => p.d - q.d)
        .slice(0, pool.length)
        .map((r) => r.a)
      // keep stable assignment where possible
      const next: (Anchor | null)[] = new Array(pool.length).fill(null)
      const remaining = new Set(ranked)
      assigned.current.forEach((a, i) => {
        if (a && remaining.has(a)) {
          next[i] = a
          remaining.delete(a)
        }
      })
      const rest = [...remaining]
      for (let i = 0; i < next.length; i++) if (!next[i]) next[i] = rest.shift() ?? null
      assigned.current = next
    }
    const dayInt = 0.28
    pool.forEach((l, i) => {
      const a = assigned.current[i]
      if (!a) {
        l.intensity = 0
        return
      }
      l.position.copy(a.p)
      l.distance = a.dist
      l.color.copy(a.color)
      const k = a.interior ? THREE.MathUtils.lerp(dayInt, 1, n) : n
      const targetI = a.i * 26 * k
      l.intensity = THREE.MathUtils.damp(l.intensity, targetI, 6, dt)
    })
  })

  return (
    <>
      <directionalLight ref={sun} position={sunPos.clone().add(new THREE.Vector3(20, 0, 9))} intensity={3.1} castShadow={shadows} />
      <directionalLight ref={moon} position={[-30, 40, 30]} intensity={0} color="#9fb4d8" />
      <hemisphereLight ref={hemi} args={['#cfe0ee', '#8b7e6c', 0.55]} />
      <Environment resolution={tier === 'low' ? 64 : 128} frames={1}>
        <EnvDome />
      </Environment>
    </>
  )
}

/** Gradient dome used only to generate the IBL environment map. */
function EnvDome() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {},
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
        fragmentShader: `varying vec3 vP;
          void main(){
            float h = vP.y;
            vec3 zenith = vec3(0.38,0.56,0.82);
            vec3 horizon = vec3(0.92,0.92,0.9);
            vec3 ground = vec3(0.36,0.33,0.28);
            vec3 c = h > 0.0 ? mix(horizon, zenith, pow(h, 0.6)) : mix(horizon*0.8, ground, pow(-h, 0.4));
            vec3 sunDir = normalize(vec3(-0.6, 0.67, -0.43));
            float s = pow(max(dot(normalize(vP), sunDir), 0.0), 220.0);
            c += vec3(1.0,0.93,0.82) * s * 40.0;
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    [],
  )
  return (
    <mesh material={mat} scale={50}>
      <sphereGeometry args={[1, 48, 24]} />
    </mesh>
  )
}

export const INTERIOR_FLOOR = HEIGHTS.floor
