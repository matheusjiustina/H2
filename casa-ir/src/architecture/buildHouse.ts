/**
 * Builds the complete architectural shell from `houseSpec`:
 *  - walls split around openings, with each face automatically finished
 *    according to the room it faces (or the exterior facade material);
 *  - window / door / sliding / pivot / louvered openings with frames & glass;
 *  - curtains; floors; ceilings with LED coves; roof massing.
 * Also produces 2D colliders for the walk-through mode.
 */
import * as THREE from 'three'
import { GeoBuilder } from './builder'
import { HEIGHTS, MASSING, PARAPETS, ROOMS, STONE_CLADDING, WALLS, roomAt, type BoxDef, type Opening, type RoomDef, type WallDef } from '../data/houseSpec'
import type { SlotId } from '../data/materials'

export interface Collider {
  x1: number
  z1: number
  x2: number
  z2: number
}

export interface HouseBuild {
  arch: GeoBuilder // always visible
  cut: GeoBuilder // hidden in "Planta 3D"
  glass: GeoBuilder // glass panes (no shadows, no picking)
  colliders: Collider[]
}

const FRAME: SlotId = 'external_frames'
const EPS = 0.001

function faceRoom(x: number, z: number, y: number) {
  return roomAt(x, z, y)
}

/** Maps wall-local (s along axis, y, t across) boxes to world boxes. */
function makeMapper(axis: 'x' | 'z') {
  return (s0: number, s1: number, y0: number, y1: number, t0: number, t1: number): [[number, number, number], [number, number, number]] => {
    const sa = Math.min(s0, s1)
    const sb = Math.max(s0, s1)
    const ta = Math.min(t0, t1)
    const tb = Math.max(t0, t1)
    return axis === 'x' ? [[sa, y0, ta], [sb, y1, tb]] : [[ta, y0, sa], [tb, y1, sb]]
  }
}

export function buildHouse(): HouseBuild {
  const arch = new GeoBuilder()
  const cut = new GeoBuilder()
  const glass = new GeoBuilder()
  const colliders: Collider[] = []

  const roomEdgesX = new Set<number>()
  const roomEdgesZ = new Set<number>()
  for (const r of ROOMS) for (const [x1, z1, x2, z2] of r.rects) {
    roomEdgesX.add(x1).add(x2)
    roomEdgesZ.add(z1).add(z2)
  }

  for (const w of WALLS) buildWall(w)
  for (const r of ROOMS) buildFloorAndCeiling(r)
  for (const b of MASSING) addMass(b)
  for (const b of STONE_CLADDING) addMass(b)
  for (const p of PARAPETS) addParapet(p.r, p.top, p.mat)

  return { arch, cut, glass, colliders }

  // ───────────────────────────────────────────────────────────────────────
  function addMass(b: BoxDef) {
    const target = b.cut ? cut : arch
    const m = b.mat
    target.box({ px: m, nx: m, py: m, pz: m, nz: m, ny: b.bottom ?? m }, b.min, b.max)
    if (b.solid) colliders.push({ x1: b.min[0], z1: b.min[2], x2: b.max[0], z2: b.max[2] })
  }

  function addParapet([x1, z1, x2, z2]: [number, number, number, number], top: number, mat: SlotId) {
    const y0 = HEIGHTS.slabTop
    const t = 0.15
    const f = { px: mat, nx: mat, py: mat, pz: mat, nz: mat, ny: null }
    cut.box(f, [x1, y0, z1], [x2, top, z1 + t])
    cut.box(f, [x1, y0, z2 - t], [x2, top, z2])
    cut.box(f, [x1, y0, z1 + t], [x1 + t, top, z2 - t])
    cut.box(f, [x2 - t, y0, z1 + t], [x2, top, z2 - t])
    // roof membrane (light grey gravel look) inside parapet
    cut.box({ py: 'gravel' }, [x1 + t, y0, z1 + t], [x2 - t, y0 + 0.02, z2 - t])
  }

  function buildWall(w: WallDef) {
    const [x1, z1, x2, z2] = w.r
    const axis: 'x' | 'z' = x2 - x1 >= z2 - z1 ? 'x' : 'z'
    const [a0, a1] = axis === 'x' ? [x1, x2] : [z1, z2]
    const [t0, t1] = axis === 'x' ? [z1, z2] : [x1, x2]
    const base = w.base ?? 0
    const map = makeMapper(axis)
    const ops = w.ops ?? []
    const ext: SlotId = w.ext ?? 'external_facade_secondary'

    // breakpoints along the axis
    const bp = new Set<number>([a0, a1])
    for (const o of ops) {
      bp.add(Math.max(a0, Math.min(a1, o.a)))
      bp.add(Math.max(a0, Math.min(a1, o.b)))
    }
    for (const e of axis === 'x' ? roomEdgesX : roomEdgesZ) if (e > a0 + 0.02 && e < a1 - 0.02) bp.add(e)
    const pts = [...bp].sort((p, q) => p - q)
    const opEdges = new Set<number>()
    for (const o of ops) {
      opEdges.add(o.a)
      opEdges.add(o.b)
    }

    const sideMat = (s: number, y: number, sign: -1 | 1): SlotId => {
      const t = sign < 0 ? t0 - 0.12 : t1 + 0.12
      const [x, z] = axis === 'x' ? [s, t] : [t, s]
      const r = faceRoom(x, z, y)
      return r ? r.wall : ext
    }

    for (let i = 0; i < pts.length - 1; i++) {
      const s0 = pts[i]
      const s1 = pts[i + 1]
      if (s1 - s0 < EPS) continue
      const mid = (s0 + s1) / 2
      const op = ops.find((o) => mid > o.a && mid < o.b)
      const ranges: [number, number][] = op ? [[base, op.sill], [op.top, w.h]] : [[base, w.h]]
      for (const [ya, yb] of ranges) {
        if (yb - ya < EPS) continue
        // split tall walls at the standard wall height
        const vs: [number, number][] = ya < HEIGHTS.wall - EPS && yb > HEIGHTS.wall + EPS ? [[ya, HEIGHTS.wall], [HEIGHTS.wall, yb]] : [[ya, yb]]
        for (const [y0, y1] of vs) {
          const yc = (y0 + y1) / 2
          const mMinus = sideMat(mid, yc, -1)
          const mPlus = sideMat(mid, yc, 1)
          const endA = opEdges.has(s0) || s0 === a0
          const endB = opEdges.has(s1) || s1 === a1
          const jamb = mMinus === ext || mPlus === ext ? ext : mPlus
          const target = y0 >= HEIGHTS.wall - EPS ? cut : arch
          const [mn, mx] = map(s0, s1, y0, y1, t0, t1)
          const topFace = y1 === w.h || (op && y1 === op.sill) ? jamb : null
          const botFace = op && y0 === op.top ? jamb : null
          if (axis === 'x') {
            target.box({ nz: mMinus, pz: mPlus, nx: endA ? jamb : null, px: endB ? jamb : null, py: topFace, ny: botFace }, mn, mx)
          } else {
            target.box({ nx: mMinus, px: mPlus, nz: endA ? jamb : null, pz: endB ? jamb : null, py: topFace, ny: botFace }, mn, mx)
          }
          // walk colliders: anything occupying the body height band
          if (y0 < 1.6 && y1 > 0.3) {
            colliders.push(axis === 'x' ? { x1: s0, z1: t0, x2: s1, z2: t1 } : { x1: t0, z1: s0, x2: t1, z2: s1 })
          }
        }
      }
    }

    for (const o of ops) buildOpening(w, o, axis, t0, t1, map)
  }

  function interiorSide(axis: 'x' | 'z', s: number, t0: number, t1: number, y = 1.2): { sign: -1 | 1; room: RoomDef | null } {
    const pick = (t: number) => (axis === 'x' ? faceRoom(s, t, y) : faceRoom(t, s, y))
    const minus = pick(t0 - 0.3)
    const plus = pick(t1 + 0.3)
    if (plus && (!minus || !minus.interior)) return { sign: 1, room: plus }
    if (minus) return { sign: -1, room: minus }
    return { sign: 1, room: null }
  }

  function buildOpening(_w: WallDef, o: Opening, axis: 'x' | 'z', t0: number, t1: number, map: ReturnType<typeof makeMapper>) {
    const tc = (t0 + t1) / 2
    const width = o.b - o.a
    const target = o.sill >= HEIGHTS.wall - EPS ? cut : arch
    const gtarget = glass
    const glassSlot: SlotId = o.glass ?? 'glass'
    const bx = (slot: SlotId, s0: number, s1: number, y0: number, y1: number, ta: number, tb: number, tgt = target) => {
      const [mn, mx] = map(s0, s1, y0, y1, ta, tb)
      tgt.box(slot, mn, mx)
    }
    const fw = 0.05 // frame profile width

    const frameAround = (depth: number) => {
      bx(FRAME, o.a, o.a + fw, o.sill, o.top, tc - depth / 2, tc + depth / 2)
      bx(FRAME, o.b - fw, o.b, o.sill, o.top, tc - depth / 2, tc + depth / 2)
      bx(FRAME, o.a + fw, o.b - fw, o.top - fw, o.top, tc - depth / 2, tc + depth / 2)
      if (o.sill > 0.01) bx(FRAME, o.a + fw, o.b - fw, o.sill, o.sill + fw, tc - depth / 2, tc + depth / 2)
    }
    const pane = (s0: number, s1: number, y0: number, y1: number, t: number, slot: SlotId = glassSlot) => {
      bx(slot, s0, s1, y0, y1, t - 0.006, t + 0.006, gtarget)
    }

    switch (o.kind) {
      case 'window': {
        frameAround(0.07)
        const n = Math.max(1, Math.round(width / 1.1))
        const inner0 = o.a + fw
        const inner1 = o.b - fw
        const step = (inner1 - inner0) / n
        for (let k = 1; k < n; k++) {
          const s = inner0 + step * k
          bx(FRAME, s - 0.022, s + 0.022, o.sill + fw, o.top - fw, tc - 0.035, tc + 0.035)
        }
        pane(inner0, inner1, o.sill + fw, o.top - fw, tc)
        break
      }
      case 'fixed': {
        frameAround(0.08)
        const inner0 = o.a + fw
        const inner1 = o.b - fw
        const n = Math.max(1, Math.round((inner1 - inner0) / 1.0))
        const step = (inner1 - inner0) / n
        for (let k = 1; k < n; k++) {
          const s = inner0 + step * k
          bx(FRAME, s - 0.025, s + 0.025, o.sill + fw, o.top - fw, tc - 0.04, tc + 0.04)
        }
        const h = o.top - o.sill
        if (h > 3.4) {
          const rows = Math.round(h / 2.7)
          for (let k = 1; k < rows; k++) {
            const y = o.sill + (h * k) / rows
            bx(FRAME, inner0, inner1, y - 0.025, y + 0.025, tc - 0.04, tc + 0.04)
          }
        }
        pane(inner0, inner1, o.sill + fw, o.top - fw, tc)
        // glass is not walkable
        colliders.push(axis === 'x' ? { x1: o.a, z1: t0, x2: o.b, z2: t1 } : { x1: t0, z1: o.a, x2: t1, z2: o.b })
        break
      }
      case 'slide': {
        // outer frame
        bx(FRAME, o.a, o.a + fw, 0, o.top, tc - 0.06, tc + 0.06)
        bx(FRAME, o.b - fw, o.b, 0, o.top, tc - 0.06, tc + 0.06)
        bx(FRAME, o.a + fw, o.b - fw, o.top - fw, o.top, tc - 0.06, tc + 0.06)
        bx(FRAME, o.a + fw, o.b - fw, 0, 0.03, tc - 0.06, tc + 0.06)
        const inner0 = o.a + fw
        const inner1 = o.b - fw
        const iw = inner1 - inner0
        const n = iw > 2.6 ? 4 : 2
        const pw = iw / n + 0.04
        const panel = (s0: number, t: number) => {
          const s1 = s0 + pw
          const pf = 0.045
          bx(FRAME, s0, s0 + pf, 0.03, o.top - fw, t - 0.02, t + 0.02)
          bx(FRAME, s1 - pf, s1, 0.03, o.top - fw, t - 0.02, t + 0.02)
          bx(FRAME, s0 + pf, s1 - pf, 0.03, 0.12, t - 0.02, t + 0.02)
          bx(FRAME, s0 + pf, s1 - pf, o.top - fw - pf, o.top - fw, t - 0.02, t + 0.02)
          pane(s0 + pf, s1 - pf, 0.12, o.top - fw - pf, t)
        }
        const tOut = tc - 0.025
        const tIn = tc + 0.025
        if (n === 2) {
          panel(inner0, tOut)
          panel(inner0 + pw * 0.15, tIn) // slid open over the fixed panel
        } else {
          panel(inner0, tOut)
          panel(inner1 - pw, tOut)
          panel(inner0 + pw * 0.2, tIn)
          panel(inner1 - pw * 1.2, tIn)
        }
        break
      }
      case 'door': {
        const lw = width - 0.06
        const top = o.top
        // lining / casing
        bx('door_frames', o.a, o.a + 0.03, 0, top + 0.03, t0 - 0.015, t1 + 0.015)
        bx('door_frames', o.b - 0.03, o.b, 0, top + 0.03, t0 - 0.015, t1 + 0.015)
        bx('door_frames', o.a, o.b, top, top + 0.03, t0 - 0.015, t1 + 0.015)
        const swing = o.swing ?? 1
        const tf = swing > 0 ? t1 : t0
        const sH = o.hinge === 'b' ? o.b - 0.07 : o.a + 0.03
        bx('interior_doors', sH, sH + 0.04, 0.01, top - 0.005, tf, tf + swing * lw)
        // handle
        const tH = tf + swing * (lw - 0.08)
        bx('brass', sH - 0.03, sH + 0.07, 1.02, 1.05, tH - 0.06, tH + 0.06)
        break
      }
      case 'pivot': {
        const lw = width - 0.04
        const h = o.top - 0.01
        const side = interiorSide(axis, (o.a + o.b) / 2, t0, t1).sign
        bx(FRAME, o.a, o.a + 0.02, 0, o.top, t0, t1)
        bx(FRAME, o.b - 0.02, o.b, 0, o.top, t0, t1)
        bx(FRAME, o.a, o.b, o.top - 0.02, o.top, t0, t1)
        // pivot axis 0.3 m from edge `a`, opened 72° towards the interior
        const px = o.a + 0.3
        const ang = side * 72 * (Math.PI / 180) * (axis === 'x' ? -1 : 1)
        const m = new THREE.Matrix4()
        const pivotWorld = axis === 'x' ? new THREE.Vector3(px, 0, tc) : new THREE.Vector3(tc, 0, px)
        m.makeTranslation(pivotWorld.x, 0, pivotWorld.z).multiply(new THREE.Matrix4().makeRotationY(ang))
        arch.with(m, () => {
          // leaf in local axis-aligned frame (along local x if wall axis = x, along local z otherwise)
          if (axis === 'x') {
            arch.box('front_door', [-0.28, 0.01, -0.035], [lw - 0.28, h, 0.035])
            arch.box('black_metal', [lw - 0.5, 0.5, 0.035], [lw - 0.46, 1.9, 0.07])
            arch.box('black_metal', [lw - 0.5, 0.5, -0.07], [lw - 0.46, 1.9, -0.035])
          } else {
            arch.box('front_door', [-0.035, 0.01, -0.28], [0.035, h, lw - 0.28])
            arch.box('black_metal', [0.035, 0.5, lw - 0.5], [0.07, 1.9, lw - 0.46])
            arch.box('black_metal', [-0.07, 0.5, lw - 0.5], [-0.035, 1.9, lw - 0.46])
          }
        })
        break
      }
      case 'louver':
      case 'louver2': {
        const leaves = o.kind === 'louver2' ? 2 : 1
        const lw = (width - 0.04) / leaves
        const ext = interiorSide(axis, (o.a + o.b) / 2, t0, t1).sign * -1
        const swing = o.kind === 'louver2' ? (ext as 1 | -1) : (o.swing ?? 1)
        bx(FRAME, o.a, o.a + 0.02, 0, o.top, t0, t1)
        bx(FRAME, o.b - 0.02, o.b, 0, o.top, t0, t1)
        bx(FRAME, o.a, o.b, o.top - 0.03, o.top, t0, t1)
        for (let k = 0; k < leaves; k++) {
          const hingeA = leaves === 2 ? k === 0 : o.hinge !== 'b'
          const sH = hingeA ? o.a + 0.02 : o.b - 0.06
          const tf = swing > 0 ? t1 : t0
          const tEnd = tf + swing * lw
          // stiles and rails
          bx(FRAME, sH, sH + 0.04, 0.01, o.top - 0.04, tf, tf + swing * 0.06)
          bx(FRAME, sH, sH + 0.04, 0.01, o.top - 0.04, tEnd - swing * 0.06, tEnd)
          bx(FRAME, sH, sH + 0.04, 0.01, 0.14, tf, tEnd)
          bx(FRAME, sH, sH + 0.04, o.top - 0.16, o.top - 0.04, tf, tEnd)
          for (let y = 0.2; y < o.top - 0.2; y += 0.075) bx(FRAME, sH + 0.005, sH + 0.035, y, y + 0.045, tf + swing * 0.06, tEnd - swing * 0.06)
        }
        break
      }
      case 'opening':
        break
    }

    if (o.curtain) addCurtains(o, axis, t0, t1)
  }

  function addCurtains(o: Opening, axis: 'x' | 'z', t0: number, t1: number) {
    const { sign, room } = interiorSide(axis, (o.a + o.b) / 2, t0, t1)
    if (!room) return
    const top = Math.min(room.ceilingH, HEIGHTS.salaCeiling) - 0.03
    const t = (sign > 0 ? t1 : t0) + sign * 0.14
    const width = o.b - o.a
    const pw = Math.min(1.2, Math.max(0.45, width * 0.26))
    const slot = o.curtain!
    const panels: [number, number][] = [
      [o.a - 0.18, o.a - 0.18 + pw],
      [o.b + 0.18 - pw, o.b + 0.18],
    ]
    for (const [s0, s1] of panels) {
      const g = curtainGeometry(s1 - s0, top - 0.02, 0.05)
      const m = new THREE.Matrix4()
      if (axis === 'x') m.makeTranslation(s0, 0.02, t)
      else m.makeTranslation(t, 0.02, s1).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2))
      arch.geo(slot, g, m)
      // rail
      const [mn, mx] = makeMapper(axis)(o.a - 0.25, o.b + 0.25, top - 0.02, top, t - 0.03, t + 0.03)
      arch.box('black_metal', mn, mx)
    }
  }

  function buildFloorAndCeiling(r: RoomDef) {
    const fy = r.id === 'garagem' ? HEIGHTS.garage : HEIGHTS.floor
    for (const [x1, z1, x2, z2] of r.rects) {
      const g = 0.08
      arch.box({ py: r.floor, px: r.floor, nx: r.floor, pz: r.floor, nz: r.floor }, [x1 - g, 0, z1 - g], [x2 + g, fy, z2 + g])
      if (!r.interior || !r.ceiling) continue
      const ch = r.ceilingH
      if (r.cove) {
        const band = 0.32
        const drop = 0.14
        const ceil: SlotId = r.ceiling
        // central recessed ceiling
        cut.box({ ny: ceil }, [x1, ch, z1], [x2, ch + 0.04, z2])
        // perimeter drop with LED reveal
        const bands: [number, number, number, number][] = [
          [x1, z1, x2, z1 + band],
          [x1, z2 - band, x2, z2],
          [x1, z1 + band, x1 + band, z2 - band],
          [x2 - band, z1 + band, x2, z2 - band],
        ]
        for (const [bx1, bz1, bx2, bz2] of bands) cut.box({ ny: ceil, px: ceil, nx: ceil, pz: ceil, nz: ceil }, [bx1, ch - drop, bz1], [bx2, ch - drop + 0.06, bz2])
        // LED strips (emissive) hidden in the reveal
        const e = 0.012
        cut.box('led', [x1 + band - 0.02, ch - drop + 0.06, z1 + band], [x1 + band + e, ch - drop + 0.075, z2 - band])
        cut.box('led', [x2 - band - e, ch - drop + 0.06, z1 + band], [x2 - band + 0.02, ch - drop + 0.075, z2 - band])
        cut.box('led', [x1 + band, ch - drop + 0.06, z1 + band - 0.02], [x2 - band, ch - drop + 0.075, z1 + band + e])
        cut.box('led', [x1 + band, ch - drop + 0.06, z2 - band - e], [x2 - band, ch - drop + 0.075, z2 - band + 0.02])
      } else {
        cut.box({ ny: r.ceiling }, [x1, ch, z1], [x2, ch + 0.04, z2])
      }
    }
  }
}

/** Pleated curtain panel: width × height, fold depth `amp`. Origin bottom-left. */
const curtainCache = new Map<string, THREE.BufferGeometry>()
export function curtainGeometry(width: number, height: number, amp: number) {
  const key = `${width.toFixed(2)}|${height.toFixed(2)}|${amp}`
  const hit = curtainCache.get(key)
  if (hit) return hit
  const folds = Math.max(3, Math.round(width / 0.11))
  const seg = folds * 4
  const g = new THREE.PlaneGeometry(width, height, seg, 1)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + width / 2
    const y = pos.getY(i) + height / 2
    const z = Math.sin((x / width) * folds * Math.PI * 2) * amp
    pos.setXYZ(i, x, y, z)
    uv.setXY(i, x, y)
  }
  g.computeVertexNormals()
  curtainCache.set(key, g)
  return g
}
