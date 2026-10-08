/**
 * Orbit / preset camera rig built on camera-controls (drei <CameraControls>).
 *  - exterior: free orbit around the house with ground & distance limits
 *  - interior presets: "look around" from the preset position (pivot 0.6 m ahead)
 *  - PLANTA 3D: elevated isometric framing
 *  - moving between rooms (or in/out of the house) is a short fade cut, never
 *    a flight through walls; exterior moves are smooth camera flights
 *  - slow cinematic moves for the opening and the APRESENTAÇÃO tour, with a
 *    gentle drift while each shot is held
 *  - VER DETALHE: orbit around a selected object, VOLTAR À VISTA restores
 *  - two-point perspective at eye level: the camera is kept level and the
 *    lens is shifted instead (vertical lines stay vertical, as in archviz
 *    photography)
 */
import { useEffect, useRef } from 'react'
import { CameraControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import CameraControlsImpl from 'camera-controls'
import { useStore } from '../app/store'
import { CAMERA_BY_ID, type CameraPreset } from '../data/cameras'
import { roomAt } from '../data/houseSpec'

const ACTION = CameraControlsImpl.ACTION
const SMALL_ROOMS = new Set(['bsocial', 'suite_bath', 'banho_ext', 'lavanderia', 'deposito', 'despensa'])
const FADE_MS = 420

const isInteriorPreset = (p: CameraPreset) => p.group !== 'exterior' && p.group !== 'plan'

/** Realistic interior lenses: about 20–24 mm full-frame equivalent. */
function presetFov(p: CameraPreset) {
  if (!isInteriorPreset(p)) return p.fov ?? 40
  return Math.min(p.fov ?? 58, SMALL_ROOMS.has(p.group) ? 68 : 60)
}

export function CameraRig() {
  const ref = useRef<CameraControlsImpl>(null)
  const req = useStore((s) => s.cameraRequest)
  const focus = useStore((s) => s.focusRequest)
  const returnReq = useStore((s) => s.returnRequest)
  const presentation = useStore((s) => s.presentation)
  const isTouch = useStore((s) => s.isTouch)
  const plan = useStore((s) => s.plan)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height))
  const fovTarget = useRef(40)
  const interior = useRef(false)
  const lastGroup = useRef<string | null>(null)
  const pendingPivot = useRef<{ pos: THREE.Vector3; dir: THREE.Vector3 } | null>(null)
  const saved = useRef<{ pos: THREE.Vector3; tgt: THREE.Vector3; interior: boolean; plan: boolean; fov: number } | null>(null)
  const fadeTimer = useRef<number | undefined>(undefined)
  const driftTimer = useRef<number | undefined>(undefined)

  // ── preset requests ───────────────────────────────────────────────────
  useEffect(() => {
    const c = ref.current
    if (!c || !req) return
    const p = CAMERA_BY_ID[req.id]
    if (!p) return
    saved.current = null
    window.clearTimeout(fadeTimer.current)
    window.clearTimeout(driftTimer.current)
    const pos = new THREE.Vector3(...p.pos)
    const tgt = new THREE.Vector3(...p.target)
    const isInterior = isInteriorPreset(p)
    const from = lastGroup.current
    lastGroup.current = p.group
    const outdoor = (g: string | null) => g === null || g === 'exterior' || g === 'plan'
    // crossing walls → fade cut; open-air moves → smooth flight
    const cut = !req.instant && from !== null && from !== p.group && !(outdoor(from) && outdoor(p.group))
    const slow = !!req.slow

    const apply = (smooth: boolean) => {
      interior.current = isInterior
      fovTarget.current = fitFov(presetFov(p), aspect, isInterior)
      configure(c, isInterior, p.group === 'plan', isTouch)
      c.smoothTime = slow ? 1.5 : 0.55
      let done: Promise<void>
      if (isInterior) {
        const dir = tgt.clone().sub(pos).normalize()
        pendingPivot.current = { pos, dir }
        done = c.setLookAt(pos.x, pos.y, pos.z, tgt.x, tgt.y, tgt.z, smooth).then(() => {
          const pv = pendingPivot.current
          if (pv && pv.pos === pos) {
            const near = pos.clone().add(dir.clone().multiplyScalar(0.6))
            c.setLookAt(pos.x, pos.y, pos.z, near.x, near.y, near.z, false)
            pendingPivot.current = null
          }
        })
      } else {
        pendingPivot.current = null
        done = c.setLookAt(pos.x, pos.y, pos.z, tgt.x, tgt.y, tgt.z, smooth)
      }
      if (!smooth) {
        camera.fov = fovTarget.current
        camera.updateProjectionMatrix()
      }
      done.then(() => {
        if (useStore.getState().cameraRequest !== req) return
        c.smoothTime = 0.55
        if (useStore.getState().presentation) drift(c, pos, tgt, isInterior)
      })
    }

    if (cut) {
      useStore.setState({ fading: true })
      fadeTimer.current = window.setTimeout(() => {
        apply(false)
        // wait one frame for the new view before revealing it
        requestAnimationFrame(() => requestAnimationFrame(() => useStore.setState({ fading: false })))
      }, FADE_MS)
    } else {
      useStore.setState({ fading: false })
      apply(!req.instant)
    }
    return () => window.clearTimeout(fadeTimer.current)
  }, [req, camera, isTouch])

  /** Subtle movement while a presentation shot is held. */
  const drift = (c: CameraControlsImpl, pos: THREE.Vector3, tgt: THREE.Vector3, isInterior: boolean) => {
    driftTimer.current = window.setTimeout(() => {
      if (!useStore.getState().presentation) return
      const fwd = tgt.clone().sub(pos).setY(0).normalize()
      c.smoothTime = 5.5
      if (isInterior) {
        const p2 = pos.clone().addScaledVector(fwd, 0.4)
        const n2 = p2.clone().addScaledVector(tgt.clone().sub(pos).normalize(), 0.6)
        c.setLookAt(p2.x, p2.y, p2.z, n2.x, n2.y, n2.z, true)
      } else {
        const side = new THREE.Vector3(-fwd.z, 0, fwd.x)
        const p2 = pos.clone().addScaledVector(side, 1.6).addScaledVector(fwd, 0.8)
        c.setLookAt(p2.x, p2.y, p2.z, tgt.x, tgt.y, tgt.z, true)
      }
    }, 150)
  }

  useEffect(() => {
    const c = ref.current
    if (!presentation && c) {
      window.clearTimeout(driftTimer.current)
      c.smoothTime = 0.55
    }
  }, [presentation])

  // ── VER DETALHE / VOLTAR À VISTA ──────────────────────────────────────
  useEffect(() => {
    const c = ref.current
    if (!c || !focus) return
    const pos = c.getPosition(new THREE.Vector3())
    const tgt = c.getTarget(new THREE.Vector3())
    if (!saved.current) saved.current = { pos, tgt, interior: interior.current, plan, fov: fovTarget.current }
    const center = new THREE.Vector3(...focus.center)
    const dir = center.clone().sub(pos)
    dir.y = Math.min(dir.y, -0.12 * dir.length())
    dir.normalize()
    const fov = Math.min(fovTarget.current, 50)
    const dist = THREE.MathUtils.clamp((focus.radius / Math.sin(THREE.MathUtils.degToRad(fov / 2))) * 0.85, 0.7, 9)
    const p2 = center.clone().addScaledVector(dir, -dist)
    // indoors: the detail view never leaves the room (camera kept 0.35 m off the walls)
    const room = pos.y < 6 ? roomAt(pos.x, pos.z, pos.y) : null
    let bounds: THREE.Box3 | undefined
    if (room?.interior) {
      const rect = room.rects.find(([x0, z0, x1, z1]) => pos.x >= x0 && pos.x <= x1 && pos.z >= z0 && pos.z <= z1) ?? room.rects[0]
      const [x0, z0, x1, z1] = rect
      bounds = new THREE.Box3(new THREE.Vector3(x0 + 0.35, 0.6, z0 + 0.35), new THREE.Vector3(x1 - 0.35, room.ceilingH - 0.3, z1 - 0.35))
      bounds.clampPoint(p2, p2)
    } else p2.y = Math.max(p2.y, 0.5)
    interior.current = false
    fovTarget.current = fov
    configure(c, false, false, isTouch)
    c.minDistance = 0.35
    c.maxDistance = Math.max(p2.distanceTo(center) * 1.6, 2)
    if (bounds) {
      // orbiting around the object stays inside the room as well
      c.setBoundary(bounds.clone().expandByScalar(0.3).union(new THREE.Box3().setFromCenterAndSize(center, new THREE.Vector3(0.1, 0.1, 0.1))))
      c.boundaryEnclosesCamera = true
    } else c.setBoundary(undefined)
    c.setLookAt(p2.x, p2.y, p2.z, center.x, center.y, center.z, true)
    useStore.setState({ focusActive: true })
  }, [focus, isTouch])

  useEffect(() => {
    const c = ref.current
    const s = saved.current
    if (!c || !returnReq || !s) return
    saved.current = null
    interior.current = s.interior
    fovTarget.current = s.fov
    configure(c, s.interior, s.plan, isTouch)
    c.setLookAt(s.pos.x, s.pos.y, s.pos.z, s.tgt.x, s.tgt.y, s.tgt.z, true)
    useStore.setState({ focusActive: false })
  }, [returnReq, isTouch])

  // keep the framing when the viewport changes (e.g. phone rotation)
  useEffect(() => {
    const p = req ? CAMERA_BY_ID[req.id] : null
    if (!p || saved.current) return
    fovTarget.current = fitFov(presetFov(p), aspect, isInteriorPreset(p))
  }, [aspect, req])

  const _p = useRef(new THREE.Vector3())
  const _t = useRef(new THREE.Vector3())
  const _d = useRef(new THREE.Vector3())
  useFrame((_, dt) => {
    if (Math.abs(camera.fov - fovTarget.current) > 0.05) camera.fov = THREE.MathUtils.damp(camera.fov, fovTarget.current, 4, dt)
    camera.updateProjectionMatrix()
    // two-point perspective (runs after camera-controls' own update)
    const c = ref.current
    if (!c || plan) return
    const p = c.getPosition(_p.current, false)
    const t = c.getTarget(_t.current, false)
    if (p.y > 7) return
    const fwd = _d.current.copy(t).sub(p).normalize()
    const pitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1))
    const k = 1 - THREE.MathUtils.smoothstep(Math.abs(pitch), 0.3, 0.5)
    if (k <= 0) return
    const pitch2 = pitch * (1 - k)
    const h = Math.hypot(fwd.x, fwd.z) || 1
    fwd.set((fwd.x / h) * Math.cos(pitch2), Math.sin(pitch2), (fwd.z / h) * Math.cos(pitch2))
    camera.position.copy(p)
    camera.lookAt(p.x + fwd.x, p.y + fwd.y, p.z + fwd.z)
    camera.projectionMatrix.elements[9] = Math.tan(pitch - pitch2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
  })

  return <CameraControls ref={ref} makeDefault smoothTime={0.55} draggingSmoothTime={0.12} />
}

/**
 * Presets are authored for a 16:9 frame. On narrower (portrait) screens keep
 * most of the horizontal field of view so façades and rooms stay readable.
 */
function fitFov(vFov: number, aspect: number, interior: boolean) {
  const ref = 16 / 9
  if (aspect >= ref * 0.85) return vFov
  const h = 2 * Math.atan(Math.tan((vFov * Math.PI) / 360) * ref)
  const v = (2 * Math.atan(Math.tan(h / 2) / aspect) * 180) / Math.PI
  return Math.min(v, interior ? 88 : 72)
}

function configure(c: CameraControlsImpl, interior: boolean, plan: boolean, touch: boolean) {
  if (interior) {
    c.minDistance = 0.3
    c.maxDistance = 0.9
    c.minPolarAngle = 0.25
    c.maxPolarAngle = Math.PI - 0.25
    c.azimuthRotateSpeed = -0.45
    c.polarRotateSpeed = -0.45
    c.mouseButtons.left = ACTION.ROTATE
    c.mouseButtons.right = ACTION.NONE
    c.mouseButtons.wheel = ACTION.NONE
    c.touches.one = ACTION.TOUCH_ROTATE
    c.touches.two = ACTION.NONE
    c.touches.three = ACTION.NONE
    c.setBoundary(undefined)
  } else {
    c.minDistance = plan ? 8 : 2.5
    c.maxDistance = 110
    c.minPolarAngle = 0.0
    c.maxPolarAngle = plan ? Math.PI * 0.42 : Math.PI * 0.495
    c.azimuthRotateSpeed = 1
    c.polarRotateSpeed = 1
    c.mouseButtons.left = ACTION.ROTATE
    c.mouseButtons.right = ACTION.TRUCK
    c.mouseButtons.wheel = ACTION.DOLLY
    c.touches.one = ACTION.TOUCH_ROTATE
    c.touches.two = touch ? ACTION.TOUCH_DOLLY_TRUCK : ACTION.TOUCH_DOLLY_TRUCK
    c.touches.three = ACTION.TOUCH_TRUCK
    c.setBoundary(new THREE.Box3(new THREE.Vector3(-12, 0, -12), new THREE.Vector3(58, 12, 30)))
    c.boundaryEnclosesCamera = false
  }
  c.dollyToCursor = !interior
}
