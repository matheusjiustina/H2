/**
 * First-person walk-through.
 *  Desktop: click to capture the mouse, WASD / arrows to walk, Shift to run, Esc to release.
 *  Touch:   left virtual joystick to walk, drag anywhere else to look.
 * Collision: plan-space AABBs (walls, glass, large furniture) + pool polygon.
 */
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../app/store'
import { inPool, resolve } from './colliders'
import { walkInput } from './walkInput'
import { roomAt, HEIGHTS } from '../data/houseSpec'
import { pointInPoly } from '../architecture/shapes'
import { DECK, SAND } from '../data/site'

const EYE = 1.6
const RADIUS = 0.24

export function WalkControls() {
  const { camera, gl } = useThree()
  const isTouch = useStore((s) => s.isTouch)
  const teleport = useStore((s) => s.walkTeleport)
  const yaw = useRef(0)
  const pitch = useRef(0)
  const pos = useRef(new THREE.Vector3())
  const floorY = useRef(0)
  const locked = useRef(false)

  // initialise from the current camera
  useEffect(() => {
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    yaw.current = Math.atan2(-dir.x, -dir.z)
    pitch.current = 0
    let x = camera.position.x
    let z = camera.position.z
    const outside = x < 0.4 || x > 56 || z < -20 || z > 38 || camera.position.y > 3
    if (outside) {
      x = 39.2
      z = 9.4
      yaw.current = Math.PI / 2
    }
    pos.current.set(x, 0, z)
    const pc = camera as THREE.PerspectiveCamera
    pc.fov = 68
    pc.updateProjectionMatrix()
  }, [camera])

  useEffect(() => {
    if (!teleport) return
    pos.current.set(teleport.x, 0, teleport.z)
    yaw.current = (teleport.yaw * Math.PI) / 180
    pitch.current = 0
  }, [teleport])

  // desktop pointer lock + mouse look
  useEffect(() => {
    if (isTouch) return
    const el = gl.domElement
    const onClick = () => {
      if (!locked.current) el.requestPointerLock?.()
    }
    const onLock = () => {
      locked.current = document.pointerLockElement === el
    }
    const onMove = (e: MouseEvent) => {
      if (!locked.current) return
      yaw.current -= e.movementX * 0.0022
      pitch.current = THREE.MathUtils.clamp(pitch.current - e.movementY * 0.0022, -1.2, 1.2)
    }
    el.addEventListener('click', onClick)
    document.addEventListener('pointerlockchange', onLock)
    document.addEventListener('mousemove', onMove)
    return () => {
      el.removeEventListener('click', onClick)
      document.removeEventListener('pointerlockchange', onLock)
      document.removeEventListener('mousemove', onMove)
      if (document.pointerLockElement === el) document.exitPointerLock()
    }
  }, [gl, isTouch])

  // keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      walkInput.keys.add(e.code)
    }
    const up = (e: KeyboardEvent) => walkInput.keys.delete(e.code)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      walkInput.keys.clear()
    }
  }, [])

  // touch look: drag on the canvas
  useEffect(() => {
    if (!isTouch) return
    const el = gl.domElement
    let id: number | null = null
    let lx = 0
    let ly = 0
    const start = (e: PointerEvent) => {
      if (id !== null) return
      id = e.pointerId
      lx = e.clientX
      ly = e.clientY
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      yaw.current += (e.clientX - lx) * 0.005
      pitch.current = THREE.MathUtils.clamp(pitch.current + (e.clientY - ly) * 0.004, -1.1, 1.1)
      lx = e.clientX
      ly = e.clientY
    }
    const end = (e: PointerEvent) => {
      if (e.pointerId === id) id = null
    }
    el.addEventListener('pointerdown', start)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      el.removeEventListener('pointerdown', start)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [gl, isTouch])

  const vel = useRef(new THREE.Vector2())
  const roomTick = useRef(0)

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const k = walkInput.keys
    let fx = 0
    let fz = 0
    if (k.has('KeyW') || k.has('ArrowUp')) fz += 1
    if (k.has('KeyS') || k.has('ArrowDown')) fz -= 1
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1
    fx += walkInput.jx
    fz += walkInput.jy
    const len = Math.hypot(fx, fz)
    if (len > 1) {
      fx /= len
      fz /= len
    }
    const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? 3.4 : 1.7
    const sin = Math.sin(yaw.current)
    const cos = Math.cos(yaw.current)
    // forward = (-sin, -cos), right = (cos, -sin)
    const tx = (-sin * fz + cos * fx) * speed
    const tz = (-cos * fz - sin * fx) * speed
    vel.current.x = THREE.MathUtils.damp(vel.current.x, tx, 10, dt)
    vel.current.y = THREE.MathUtils.damp(vel.current.y, tz, 10, dt)

    const p = pos.current
    let nx = p.x + vel.current.x * dt
    let nz = p.z + vel.current.y * dt
    ;[nx, nz] = resolve(nx, nz, RADIUS)
    // pool and site limits
    if (inPool(nx, nz)) {
      nx = p.x
      nz = p.z
    }
    const onStreet = nx > 40
    nx = THREE.MathUtils.clamp(nx, 0.45, 55)
    nz = onStreet ? THREE.MathUtils.clamp(nz, -25, 40) : THREE.MathUtils.clamp(nz, 0.45, 17.6)
    p.set(nx, 0, nz)

    // floor height under the player
    const r = roomAt(nx, nz, 1)
    let fy = 0
    if (r) fy = r.id === 'garagem' ? HEIGHTS.garage : HEIGHTS.floor
    else if (pointInPoly(nx, nz, DECK)) fy = HEIGHTS.deck
    else if (pointInPoly(nx, nz, SAND)) fy = HEIGHTS.sand
    else if (nx > 40 && nx < 42.5) fy = 0.12
    floorY.current = THREE.MathUtils.damp(floorY.current, fy, 12, dt)

    camera.position.set(nx, floorY.current + EYE, nz)
    const e = new THREE.Euler(pitch.current, yaw.current, 0, 'YXZ')
    camera.quaternion.setFromEuler(e)

    roomTick.current += dt
    if (roomTick.current > 0.4) {
      roomTick.current = 0
      const id = r?.id ?? null
      if (useStore.getState().currentRoom !== id) useStore.setState({ currentRoom: id })
    }
  })

  return null
}
