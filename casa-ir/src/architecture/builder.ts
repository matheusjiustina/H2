/**
 * GeoBuilder — accumulates geometry into one bucket per material slot.
 *
 * Architecture and furniture are authored as many small primitives but
 * rendered as **one merged mesh per material slot**, which keeps draw calls
 * low and lets the configurator recolour an entire slot instantly.
 * UVs are generated in world metres so texture scale is consistent everywhere.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { SlotId } from '../data/materials'

interface Bucket {
  pos: number[]
  nor: number[]
  uv: number[]
  idx: number[]
}

export type FaceMats = Partial<Record<'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz', SlotId | null>>

const _v = new THREE.Vector3()
const _n = new THREE.Vector3()
const _nm = new THREE.Matrix3()

export class GeoBuilder {
  buckets = new Map<SlotId, Bucket>()
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()]

  get matrix() {
    return this.stack[this.stack.length - 1]
  }

  /** Run `fn` with an additional local transform. */
  with(m: THREE.Matrix4, fn: () => void) {
    this.stack.push(this.matrix.clone().multiply(m))
    try {
      fn()
    } finally {
      this.stack.pop()
    }
  }

  /** Translate + rotate (Y, degrees) helper. */
  at(x: number, y: number, z: number, rotYDeg: number, fn: () => void, rotXDeg = 0, rotZDeg = 0) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((rotXDeg * Math.PI) / 180, (rotYDeg * Math.PI) / 180, (rotZDeg * Math.PI) / 180, 'YXZ')),
      new THREE.Vector3(1, 1, 1),
    )
    this.with(m, fn)
  }

  private bucket(slot: SlotId) {
    let b = this.buckets.get(slot)
    if (!b) {
      b = { pos: [], nor: [], uv: [], idx: [] }
      this.buckets.set(slot, b)
    }
    return b
  }

  /** Quad with corners in CCW order seen from the normal side. */
  quad(slot: SlotId, p: [number, number, number][], uvs: [number, number][]) {
    const b = this.bucket(slot)
    const m = this.matrix
    const base = b.pos.length / 3
    // normal from first triangle (local), transformed
    const a = new THREE.Vector3(...p[0])
    const e1 = new THREE.Vector3(...p[1]).sub(a)
    const e2 = new THREE.Vector3(...p[2]).sub(a)
    _n.crossVectors(e1, e2).normalize()
    _nm.getNormalMatrix(m)
    _n.applyMatrix3(_nm).normalize()
    for (let i = 0; i < 4; i++) {
      _v.set(...p[i]).applyMatrix4(m)
      b.pos.push(_v.x, _v.y, _v.z)
      b.nor.push(_n.x, _n.y, _n.z)
      b.uv.push(uvs[i][0], uvs[i][1])
    }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  /**
   * Axis-aligned box (in the current local frame) from min/max corners.
   * `mats` may be a single slot or per-face slots (null = face skipped).
   */
  box(mats: SlotId | FaceMats, min: [number, number, number], max: [number, number, number]) {
    const [x0, y0, z0] = min
    const [x1, y1, z1] = max
    const f: FaceMats = typeof mats === 'string' ? { px: mats, nx: mats, py: mats, ny: mats, pz: mats, nz: mats } : mats
    if (f.px) this.quad(f.px, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [[-z1, y0], [-z0, y0], [-z0, y1], [-z1, y1]])
    if (f.nx) this.quad(f.nx, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [[z0, y0], [z1, y0], [z1, y1], [z0, y1]])
    if (f.py) this.quad(f.py, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]])
    if (f.ny) this.quad(f.ny, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]])
    if (f.pz) this.quad(f.pz, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
    if (f.nz) this.quad(f.nz, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [[-x1, y0], [-x0, y0], [-x0, y1], [-x1, y1]])
  }

  /** Centered box helper: center (cx,cy,cz) and size (w,h,d). */
  cbox(mats: SlotId | FaceMats, cx: number, cy: number, cz: number, w: number, h: number, d: number) {
    this.box(mats, [cx - w / 2, cy - h / 2, cz - d / 2], [cx + w / 2, cy + h / 2, cz + d / 2])
  }

  /** Box resting on y (bottom at y). */
  sbox(mats: SlotId | FaceMats, cx: number, y: number, cz: number, w: number, h: number, d: number) {
    this.box(mats, [cx - w / 2, y, cz - d / 2], [cx + w / 2, y + h, cz + d / 2])
  }

  /** Merge an arbitrary geometry (indexed or not) with a local transform. */
  geo(slot: SlotId, g: THREE.BufferGeometry, local?: THREE.Matrix4, uvScale: [number, number] = [1, 1]) {
    const b = this.bucket(slot)
    const m = local ? this.matrix.clone().multiply(local) : this.matrix
    _nm.getNormalMatrix(m)
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    const nor = g.getAttribute('normal') as THREE.BufferAttribute | undefined
    const uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined
    const base = b.pos.length / 3
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(m)
      b.pos.push(_v.x, _v.y, _v.z)
      if (nor) {
        _n.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize()
        b.nor.push(_n.x, _n.y, _n.z)
      } else b.nor.push(0, 1, 0)
      if (uv) b.uv.push(uv.getX(i) * uvScale[0], uv.getY(i) * uvScale[1])
      else b.uv.push(0, 0)
    }
    const index = g.getIndex()
    if (index) for (let i = 0; i < index.count; i++) b.idx.push(base + index.getX(i))
    else for (let i = 0; i < pos.count; i++) b.idx.push(base + i)
  }

  /** Rounded box centred at (cx,cy,cz). */
  rbox(slot: SlotId, cx: number, cy: number, cz: number, w: number, h: number, d: number, r = 0.04, seg = 3) {
    const g = roundedBox(w, h, d, r, seg)
    this.geo(slot, g, new THREE.Matrix4().makeTranslation(cx, cy, cz), [w, h])
  }

  /** Cylinder standing on y (bottom at y). */
  cyl(slot: SlotId, cx: number, y: number, cz: number, rTop: number, rBot: number, h: number, seg = 24) {
    const g = cylinder(rTop, rBot, h, seg)
    this.geo(slot, g, new THREE.Matrix4().makeTranslation(cx, y + h / 2, cz), [Math.PI * 2 * Math.max(rTop, rBot), h])
  }

  sphere(slot: SlotId, cx: number, cy: number, cz: number, r: number, sx = 1, sy = 1, sz = 1, seg = 16) {
    const g = sphere(seg)
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion(), new THREE.Vector3(r * sx, r * sy, r * sz))
    this.geo(slot, g, m, [Math.PI * 2 * r, Math.PI * r])
  }

  build(): Map<SlotId, THREE.BufferGeometry> {
    const out = new Map<SlotId, THREE.BufferGeometry>()
    for (const [slot, b] of this.buckets) {
      if (!b.idx.length) continue
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2))
      g.setIndex(b.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1))
      g.computeBoundingSphere()
      g.computeBoundingBox()
      out.set(slot, g)
    }
    return out
  }
}

// ── cached primitive geometries ──────────────────────────────────────────────
const gcache = new Map<string, THREE.BufferGeometry>()
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = gcache.get(key)
  if (!g) {
    g = make()
    gcache.set(key, g)
  }
  return g
}
export const roundedBox = (w: number, h: number, d: number, r: number, seg: number) =>
  cached(`rb${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r}|${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)))
export const cylinder = (rt: number, rb: number, h: number, seg: number) =>
  cached(`cy${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg))
export const sphere = (seg: number) => cached(`sp${seg}`, () => new THREE.SphereGeometry(1, seg, Math.max(8, Math.round(seg * 0.6))))

/** Linear interpolation helper. */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
