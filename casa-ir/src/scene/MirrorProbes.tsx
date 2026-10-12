/**
 * Reflection probes for mirrors.
 * A mirror must reflect its room, not the sky: every room with mirrors gets a
 * cube camera at eye height in the middle of the room, rendered once (and
 * again after a time-of-day or finish change). The room's mirrors receive a
 * private copy of the mirror material that uses that probe as environment.
 */
import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../app/store'
import { roomAt, type RoomDef } from '../data/houseSpec'
import { getMat } from '../materials/library'

interface Probe {
  cam: THREE.CubeCamera
  rt: THREE.WebGLCubeRenderTarget
  mat: THREE.MeshPhysicalMaterial
  meshes: THREE.Mesh[]
}

function locate(box: THREE.Box3): { room: RoomDef; rect: [number, number, number, number] } | null {
  const c = box.getCenter(new THREE.Vector3())
  for (const [dx, dz] of [[0, 0], [0.15, 0], [-0.15, 0], [0, 0.15], [0, -0.15]]) {
    const r = roomAt(c.x + dx, c.z + dz, Math.min(c.y, 2.4))
    if (r) {
      const rect = r.rects.find(([x0, z0, x1, z1]) => c.x + dx >= x0 && c.x + dx <= x1 && c.z + dz >= z0 && c.z + dz <= z1) ?? r.rects[0]
      return { room: r, rect }
    }
  }
  return null
}

export function MirrorProbes() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const time = useStore((s) => s.time)
  const cfg = useStore((s) => s.clientConfig)
  const showOriginal = useStore((s) => s.showOriginal)
  // lamps follow the camera (light pool), so a room's probe is refreshed when the visitor is in it
  const room = useStore((s) => s.currentRoom)
  const probes = useRef(new Map<string, Probe>())
  const first = useRef(true)

  useEffect(() => {
    const t = window.setTimeout(
      () => {
        const base = getMat('mirror')
        // collect mirrors (merged meshes using the shared material or a probe copy)
        if (first.current) {
          scene.traverse((o) => {
            const m = o as THREE.Mesh
            if (!m.isMesh || m.material !== base) return
            const loc = locate(new THREE.Box3().setFromObject(m))
            if (!loc) return
            let p = probes.current.get(loc.room.id)
            if (!p) {
              const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter })
              const cam = new THREE.CubeCamera(0.05, 40, rt)
              const [x0, z0, x1, z1] = loc.rect
              cam.position.set((x0 + x1) / 2, 1.55, (z0 + z1) / 2)
              const mat = base.clone()
              mat.envMap = rt.texture
              mat.envMapIntensity = 1
              mat.roughness = Math.min(base.roughness, 0.03)
              p = { cam, rt, mat, meshes: [] }
              probes.current.set(loc.room.id, p)
            }
            p.meshes.push(m)
          })
        }
        // render the probes with the mirrors hidden (no feedback)
        const todo = first.current ? [...probes.current.values()] : room && probes.current.has(room) ? [probes.current.get(room)!] : []
        if (probes.current.size) first.current = false
        for (const p of probes.current.values()) p.meshes.forEach((m) => (m.visible = false))
        for (const p of todo) p.cam.update(gl, scene)
        for (const p of probes.current.values())
          p.meshes.forEach((m) => {
            m.visible = true
            m.material = p.mat
          })
      },
      first.current ? 4000 : 1600,
    )
    return () => window.clearTimeout(t)
  }, [gl, scene, time, cfg, showOriginal, room])

  useEffect(
    () => () => {
      for (const p of probes.current.values()) {
        p.rt.dispose()
        p.mat.dispose()
      }
    },
    [],
  )
  return null
}
