/**
 * Lighting rig.
 *
 *  - Sun (directional, soft shadows) following DIA → ENTARDECER → NOITE.
 *  - Hemisphere sky fill + image based lighting regenerated from the same
 *    procedural sky (PMREM), so reflections always match the time of day.
 *  - "Light pool": a FIXED number of warm point lights re-assigned to the
 *    architectural light anchors (pendants, coves, spots, garden lights)
 *    nearest to the camera. A constant light count avoids shader recompiles.
 *  - Exposure balances bright exteriors and interiors (no washed-out rooms).
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore, effectiveTier, TIME_VALUE } from '../app/store'
import { ROOMS } from '../data/houseSpec'
import { setLightFactors } from '../materials/library'
import { EXTERIOR_LIGHTS } from './lightAnchors'
import { lightState, updateFactors, sunDirection, SKY_GLSL, skyUniforms, syncSkyUniforms } from './timeOfDay'

export { lightState }

const POOL_SIZE = { high: 14, medium: 8, low: 4 }

interface Anchor {
  p: THREE.Vector3
  i: number
  color: THREE.Color
  dist: number
  interior: boolean
}

const WARM = new THREE.Color('#ffcf9e') // ~3000 K
const WARM_EXT = new THREE.Color('#ffcf9c')
const SUN_DAY = new THREE.Color('#fff1df')
const SUN_SET = new THREE.Color('#ffae6b')
const HEMI_DAY = new THREE.Color('#cfe0ee')
const HEMI_SET = new THREE.Color('#e9c4a6')
const HEMI_NIGHT = new THREE.Color('#2a3550')
const _c = new THREE.Color()

export function Lighting() {
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const moon = useRef<THREE.DirectionalLight>(null)
  const { scene, gl, camera } = useThree()
  const time = useStore((s) => s.time)
  const shadows = useStore((s) => s.shadows)
  const captureHQ = useStore((s) => s.captureHQ)
  const tier = useStore(effectiveTier)
  const poolSize = POOL_SIZE[tier]

  const anchors = useMemo<Anchor[]>(() => {
    const a: Anchor[] = []
    for (const r of ROOMS) for (const l of r.lights ?? []) a.push({ p: new THREE.Vector3(l[0], l[1], l[2]), i: l[3], color: WARM, dist: r.id === 'sala' ? 11 : 6.5, interior: r.interior })
    for (const l of EXTERIOR_LIGHTS) a.push({ p: new THREE.Vector3(l[0], l[1], l[2]), i: l[3], color: WARM_EXT, dist: l[4] ?? 7, interior: false })
    return a
  }, [])

  const pool = useMemo(
    () =>
      Array.from({ length: poolSize }, () => {
        const l = new THREE.PointLight(WARM, 0, 7, 2)
        l.castShadow = false
        return l
      }),
    [poolSize],
  )

  useEffect(() => {
    const g = new THREE.Group()
    pool.forEach((l) => g.add(l))
    scene.add(g)
    return () => {
      scene.remove(g)
      pool.forEach((l) => l.dispose())
    }
  }, [pool, scene])

  // shadow quality per tier (+ temporary boost for high-quality captures)
  useEffect(() => {
    const s = sun.current
    if (!s) return
    const size = captureHQ ? 4096 : tier === 'high' ? 4096 : tier === 'medium' ? 2048 : 1024
    s.shadow.mapSize.set(size, size)
    s.shadow.map?.dispose()
    s.shadow.map = null as unknown as THREE.WebGLRenderTarget
    const half = 30
    s.shadow.camera.left = -half
    s.shadow.camera.right = half
    s.shadow.camera.top = half
    s.shadow.camera.bottom = -half
    s.shadow.camera.near = 1
    s.shadow.camera.far = 220
    s.shadow.camera.updateProjectionMatrix()
    s.shadow.bias = -0.0002
    s.shadow.normalBias = tier === 'low' ? 0.05 : 0.022
    s.shadow.radius = tier === 'high' ? 3 : 2
    s.target.position.set(20, 0, 9)
    s.target.updateMatrixWorld()
  }, [tier, captureHQ])

  useEffect(() => {
    gl.shadowMap.enabled = shadows
    gl.shadowMap.type = tier === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap
    gl.shadowMap.needsUpdate = true
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined
      if (m) m.needsUpdate = true
    })
  }, [shadows, tier, gl, scene])

  // ── procedural IBL environment (re-generated while the time changes) ──
  const env = useMemo(() => {
    const envScene = new THREE.Scene()
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: skyUniforms(),
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: `${SKY_GLSL}
        varying vec3 vP;
        void main(){ gl_FragColor = vec4(skyColor(normalize(vP), 30.0), 1.0); }`,
    })
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), mat))
    return { envScene, mat, pmrem: new THREE.PMREMGenerator(gl), rt: null as THREE.WebGLRenderTarget | null, lastT: -1 }
  }, [gl])
  useEffect(
    () => () => {
      env.rt?.dispose()
      env.pmrem.dispose()
    },
    [env],
  )

  const tick = useRef(0)
  const assigned = useRef<(Anchor | null)[]>([])
  const insideK = useRef(0)
  const tState = useRef(TIME_VALUE[useStore.getState().time])
  const sunDir = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.3)
    // ── animate the time of day (≈1.5 s between neighbouring states) ──
    const target = TIME_VALUE[time]
    let t = tState.current
    if (Math.abs(target - t) > 0.0005) {
      t = THREE.MathUtils.damp(t, target, 3.2, dt)
      if (Math.abs(target - t) < 0.002) t = target
      tState.current = t
    }
    updateFactors(t)
    const { day, sunset, night, lights } = lightState
    setLightFactors(lights, day)

    // environment map
    if (Math.abs(env.lastT - t) > 0.025 || !env.rt) {
      syncSkyUniforms(env.mat.uniforms as ReturnType<typeof skyUniforms>)
      const rt = env.pmrem.fromScene(env.envScene, 0, 0.1, 100)
      env.rt?.dispose()
      env.rt = rt
      scene.environment = rt.texture
      env.lastT = t
    }

    // sun
    sunDirection(t, sunDir)
    if (sun.current) {
      sun.current.position.set(20, 0, 9).addScaledVector(sunDir, 90)
      sun.current.intensity = 3.0 * day + 2.3 * sunset
      sun.current.color.copy(SUN_DAY).multiplyScalar(day).add(_c.copy(SUN_SET).multiplyScalar(sunset))
      if (day + sunset > 0) sun.current.color.multiplyScalar(1 / (day + sunset))
      sun.current.castShadow = shadows && night < 0.95
    }
    if (moon.current) moon.current.intensity = night * 0.2
    if (hemi.current) {
      hemi.current.intensity = 0.42 * day + 0.3 * sunset + 0.06 * night
      hemi.current.color.copy(HEMI_DAY).multiplyScalar(day).add(_c.copy(HEMI_SET).multiplyScalar(sunset)).add(_c.copy(HEMI_NIGHT).multiplyScalar(night))
    }

    // interior / exterior exposure balance
    const room = useStore.getState().currentRoom
    const inside = room ? ROOMS.find((r) => r.id === room)?.interior ?? false : false
    insideK.current = THREE.MathUtils.damp(insideK.current, inside ? 1 : 0, 2.5, dt)
    const k = insideK.current
    scene.environmentIntensity = (0.62 * day + 0.42 * sunset + 0.07 * night) * THREE.MathUtils.lerp(1, 0.55, k)
    // interiors: slightly brighter by day, lower at night so warm lamps read as pools of light
    gl.toneMappingExposure = (1.0 * day + 1.12 * sunset + 1.25 * night) * THREE.MathUtils.lerp(1, 1.1 * day + 1.0 * sunset + 0.8 * night, k)

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
    pool.forEach((l, i) => {
      const a = assigned.current[i]
      if (!a) {
        l.intensity = 0
        return
      }
      l.position.copy(a.p)
      l.distance = a.dist
      l.color.copy(a.color)
      // exterior garden/facade lights only from golden hour on
      const kk = a.interior ? lights : Math.max(0, lights - 0.35) / 0.65
      const targetI = a.i * 24 * kk
      l.intensity = THREE.MathUtils.damp(l.intensity, targetI, 6, dt)
    })
  })

  return (
    <>
      <directionalLight ref={sun} position={[60, 60, -20]} intensity={3} castShadow={shadows} />
      <directionalLight ref={moon} position={[-30, 40, 30]} intensity={0} color="#9fb4d8" />
      <hemisphereLight ref={hemi} args={['#cfe0ee', '#8b7e6c', 0.42]} />
    </>
  )
}
