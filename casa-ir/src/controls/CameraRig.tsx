/**
 * Orbit / preset camera rig built on camera-controls (drei <CameraControls>).
 *  - exterior: free orbit around the house with ground & distance limits
 *  - interior presets: "look around" from the preset position (pivot 0.6 m ahead)
 *  - PLANTA 3D: elevated isometric framing
 * All transitions are smooth (except the very first frame).
 */
import { useEffect, useRef } from 'react'
import { CameraControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import CameraControlsImpl from 'camera-controls'
import { useStore } from '../app/store'
import { CAMERA_BY_ID } from '../data/cameras'

const ACTION = CameraControlsImpl.ACTION

export function CameraRig() {
  const ref = useRef<CameraControlsImpl>(null)
  const req = useStore((s) => s.cameraRequest)
  const isTouch = useStore((s) => s.isTouch)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height))
  const fovTarget = useRef(40)
  const interior = useRef(false)
  const pendingPivot = useRef<{ pos: THREE.Vector3; dir: THREE.Vector3 } | null>(null)

  useEffect(() => {
    const c = ref.current
    if (!c || !req) return
    const p = CAMERA_BY_ID[req.id]
    if (!p) return
    const pos = new THREE.Vector3(...p.pos)
    const tgt = new THREE.Vector3(...p.target)
    const isInterior = p.group !== 'exterior' && p.group !== 'plan'
    interior.current = isInterior
    fovTarget.current = fitFov(p.fov ?? (isInterior ? 62 : 40), aspect, isInterior)
    configure(c, isInterior, p.group === 'plan', isTouch)
    const smooth = !req.instant
    if (isInterior) {
      const dir = tgt.clone().sub(pos).normalize()
      pendingPivot.current = { pos, dir }
      c.setLookAt(pos.x, pos.y, pos.z, tgt.x, tgt.y, tgt.z, smooth).then(() => {
        const pv = pendingPivot.current
        if (pv && pv.pos === pos) {
          const near = pos.clone().add(dir.clone().multiplyScalar(0.6))
          c.setLookAt(pos.x, pos.y, pos.z, near.x, near.y, near.z, false)
          pendingPivot.current = null
        }
      })
    } else {
      pendingPivot.current = null
      c.setLookAt(pos.x, pos.y, pos.z, tgt.x, tgt.y, tgt.z, smooth)
    }
    if (!smooth) {
      camera.fov = fovTarget.current
      camera.updateProjectionMatrix()
    }
  }, [req, camera, isTouch])

  // keep the framing when the viewport changes (e.g. phone rotation)
  useEffect(() => {
    const p = req ? CAMERA_BY_ID[req.id] : null
    if (!p) return
    const isInterior = p.group !== 'exterior' && p.group !== 'plan'
    fovTarget.current = fitFov(p.fov ?? (isInterior ? 62 : 40), aspect, isInterior)
  }, [aspect, req])

  useFrame((_, dt) => {
    if (Math.abs(camera.fov - fovTarget.current) > 0.05) {
      camera.fov = THREE.MathUtils.damp(camera.fov, fovTarget.current, 4, dt)
      camera.updateProjectionMatrix()
    }
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
