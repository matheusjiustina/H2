/**
 * 2D colliders for the walk-through (plan-space AABBs). Walls/glass come from
 * the house builder; large furniture registers itself through `addBlocker`.
 */
import { POOL } from '../data/site'
import { pointInPoly } from '../architecture/shapes'
import type { Collider } from '../architecture/buildHouse'

let walls: Collider[] = []
const blockers = new Map<string, Collider>()

export function setColliders(c: Collider[]) {
  walls = c
}

export function addBlocker(id: string, x1: number, z1: number, x2: number, z2: number) {
  blockers.set(id, { x1: Math.min(x1, x2), z1: Math.min(z1, z2), x2: Math.max(x1, x2), z2: Math.max(z1, z2) })
}

export function allColliders(): Collider[] {
  return walls.concat([...blockers.values()])
}

/** Resolve a circle (player) against all colliders; returns corrected position. */
export function resolve(x: number, z: number, r: number): [number, number] {
  let px = x
  let pz = z
  for (let iter = 0; iter < 3; iter++) {
    for (const c of walls) [px, pz] = push(px, pz, r, c)
    for (const c of blockers.values()) [px, pz] = push(px, pz, r, c)
  }
  return [px, pz]
}

function push(px: number, pz: number, r: number, c: Collider): [number, number] {
  const cx = Math.max(c.x1, Math.min(px, c.x2))
  const cz = Math.max(c.z1, Math.min(pz, c.z2))
  const dx = px - cx
  const dz = pz - cz
  const d2 = dx * dx + dz * dz
  if (d2 >= r * r) return [px, pz]
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2)
    return [cx + (dx / d) * r, cz + (dz / d) * r]
  }
  // centre inside the box: push out along the smallest axis
  const l = px - c.x1
  const rr = c.x2 - px
  const t = pz - c.z1
  const b = c.z2 - pz
  const m = Math.min(l, rr, t, b)
  if (m === l) return [c.x1 - r, pz]
  if (m === rr) return [c.x2 + r, pz]
  if (m === t) return [px, c.z1 - r]
  return [px, c.z2 + r]
}

export function inPool(x: number, z: number) {
  return pointInPoly(x, z, POOL)
}

/** Walkable area limits (lot + sidewalk/street). */
export const WALK_BOUNDS = { x1: 0.4, z1: 0.4, x2: 56, z2: 17.6 }
