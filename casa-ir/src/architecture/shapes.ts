import * as THREE from 'three'
import type { Poly } from '../data/site'

/** Plan polygon [x, z][] → THREE.Shape in (x, -z) so that rotateX(-90°) maps it to world XZ. */
export function polyShape(poly: Poly, holes: Poly[] = []) {
  const s = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)))
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))))
  return s
}

/** Flat polygon at height y (faces up). */
export function flatPoly(poly: Poly, y: number, holes: Poly[] = []) {
  const g = new THREE.ShapeGeometry(polyShape(poly, holes))
  g.rotateX(-Math.PI / 2)
  g.translate(0, y, 0)
  return g
}

/** Extruded polygon from y0 to y0+depth with world-metre UVs. */
export function extrudePoly(poly: Poly, y0: number, depth: number, holes: Poly[] = []) {
  const g = new THREE.ExtrudeGeometry(polyShape(poly, holes), { depth, bevelEnabled: false, curveSegments: 6 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, y0, 0)
  return g
}

export function pointInPoly(x: number, z: number, poly: Poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** Smooth a polygon with Chaikin subdivision (for organic outlines). */
export function chaikin(poly: Poly, iterations = 2): Poly {
  let p = poly
  for (let k = 0; k < iterations; k++) {
    const out: Poly = []
    for (let i = 0; i < p.length; i++) {
      const [x0, z0] = p[i]
      const [x1, z1] = p[(i + 1) % p.length]
      out.push([x0 * 0.75 + x1 * 0.25, z0 * 0.75 + z1 * 0.25], [x0 * 0.25 + x1 * 0.75, z0 * 0.25 + z1 * 0.75])
    }
    p = out
  }
  return p
}

/** Deterministic lumpy rock geometry. */
const rockCache = new Map<number, THREE.BufferGeometry>()
export function rockGeometry(seed: number) {
  const hit = rockCache.get(seed)
  if (hit) return hit
  const g = new THREE.IcosahedronGeometry(1, 2)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  let s = seed * 9301 + 49297
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  const offs = Array.from({ length: 6 }, () => [rnd() * 6, rnd() * 6, rnd() * 6])
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i)
    let d = 1
    for (const [a, b, c] of offs) d += Math.sin(v.x * a + v.y * b + v.z * c) * 0.07
    v.multiplyScalar(d)
    v.y *= 0.62
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  rockCache.set(seed, g)
  return g
}
