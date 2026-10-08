/**
 * CASA I|R — dimensional specification.
 *
 * Coordinate system (metres):
 *   X → east (towards the street), Z → south (down on the plan), Y → up.
 *   Origin = north-west corner of the lot on ARQ p.2.
 *
 * Every number below was measured on the architectural floor plan
 * (ARQ p.2, 58.27 px/m) and cross-checked against the red interior
 * dimensions printed on the plan. Heights are deduced from the renders
 * (no sections exist in the PDFs) — see docs/PDF_AUDIT.md §2.4 / §6.
 */
import type { SlotId } from './materials'

export const LOT = { w: 40, d: 18 }
export const WALL_T = 0.15

export const HEIGHTS = {
  floor: 0.1, // finished interior floor
  deck: 0.08,
  sand: 0.05,
  garage: 0.06,
  wall: 2.95, // top of standard walls = underside of roof slab
  ceiling: 2.8, // gypsum ceiling in rooms (A-02)
  slabTop: 3.25,
  parapet: 3.7, // (A-03)
  canopyBottom: 3.25, // garage + hall canopy (ARQ p.4/5)
  canopyTop: 4.2,
  salaCeiling: 5.5, // double height living room (A-04)
  salaTop: 5.9,
  highBottom: 5.9, // high cantilevered slab (ARQ p.4/5/11)
  highTop: 7.1,
  doorTop: 2.15,
  slideTop: 2.45,
  boundaryWall: 2.4,
  tankTop: 5.0,
  jogosParapet: 3.9,
}

// ─────────────────────────────────────────────────────────────────────────────
// Rooms
// ─────────────────────────────────────────────────────────────────────────────
export type Rect = [x1: number, z1: number, x2: number, z2: number]

export interface RoomDef {
  id: string
  name: string
  rects: Rect[]
  floor: SlotId
  wall: SlotId
  ceiling?: SlotId | null
  ceilingH: number
  /** perimeter LED cove (sanca) */
  cove?: boolean
  /** interior (true) or covered exterior */
  interior: boolean
  /** shown in the room navigation menu */
  menu?: boolean
  /** detailed in the interior design PDF */
  detailed?: boolean
  /** traceability */
  sources: string[]
  /** spawn point for walk mode [x, z, yawDeg] */
  spawn?: [number, number, number]
  /** warm light anchors (x, y, z, intensity) used by the light pool */
  lights?: [number, number, number, number][]
}

const R = (d: RoomDef) => d

export const ROOMS: RoomDef[] = [
  // ── Bloco íntimo ────────────────────────────────────────────────────────
  R({ id: 'suite', name: 'Suíte Master', rects: [[17.85, 1.8, 21.37, 6.55]], floor: 'floor_intimate', wall: 'master_wall', ceiling: 'ceiling', ceilingH: 2.8, cove: true, interior: true, menu: true, detailed: true,
    sources: ['ARQ p.2', 'INT p.44', 'INT p.57', 'INT p.58', 'INT p.59', 'INT p.60', 'INT p.61', 'INT p.62'], spawn: [19.2, 5.6, 0], lights: [[19.6, 2.6, 4.2, 1]] }),
  R({ id: 'suite_bath', name: 'Banho Master', rects: [[21.52, 1.8, 23.1, 3.9]], floor: 'masterbath_stone', wall: 'masterbath_stone', ceiling: 'ceiling', ceilingH: 2.7, interior: true, menu: true, detailed: true,
    sources: ['ARQ p.2', 'INT p.44', 'INT p.55', 'INT p.56'], spawn: [22.3, 3.5, 180], lights: [[22.3, 2.5, 2.9, 0.5]] }),
  R({ id: 'closet', name: 'Closet Master', rects: [[23.25, 1.8, 26.06, 6.55], [21.52, 4.05, 23.25, 6.55]], floor: 'floor_intimate', wall: 'closet_wall', ceiling: 'ceiling', ceilingH: 2.8, interior: true, menu: true, detailed: true,
    sources: ['ARQ p.2', 'INT p.44', 'INT p.45–54'], spawn: [24.6, 6.0, 0], lights: [[24.6, 2.6, 3.8, 0.8]] }),
  R({ id: 'q02', name: 'Quarto 02', rects: [[26.21, 1.8, 29.81, 5.3]], floor: 'floor_intimate', wall: 'bedroom_walls', ceiling: 'ceiling', ceilingH: 2.8, cove: true, interior: true, menu: true,
    sources: ['ARQ p.2 (sem projeto de interiores — A-07)'], spawn: [29.3, 4.9, 30], lights: [[28.0, 2.6, 3.5, 0.8]] }),
  R({ id: 'bsocial', name: 'Banho Social', rects: [[29.96, 1.8, 31.56, 5.3]], floor: 'socialbath_stone', wall: 'socialbath_stone', ceiling: 'ceiling', ceilingH: 2.7, cove: true, interior: true, menu: true, detailed: true,
    sources: ['ARQ p.2', 'INT p.40', 'INT p.41', 'INT p.42', 'INT p.43'], spawn: [30.75, 5.0, 0], lights: [[30.75, 2.5, 3.4, 0.6]] }),
  R({ id: 'q01', name: 'Quarto 01', rects: [[31.72, 1.8, 35.2, 6.55]], floor: 'floor_intimate', wall: 'bedroom_walls', ceiling: 'ceiling', ceilingH: 2.8, cove: true, interior: true, menu: true,
    sources: ['ARQ p.2', 'ARQ p.15 (sem projeto de interiores — A-07)'], spawn: [32.3, 6.0, 30], lights: [[33.5, 2.6, 4.0, 0.8]] }),
  R({ id: 'circ_intima', name: 'Circulação Íntima', rects: [[26.21, 5.45, 31.56, 6.55]], floor: 'floor_intimate', wall: 'wall_circulation', ceiling: 'ceiling', ceilingH: 2.8, interior: true, menu: false,
    sources: ['ARQ p.2'], spawn: [27.0, 6.0, 90], lights: [[28.8, 2.6, 6.0, 0.5]] }),

  // ── Social ──────────────────────────────────────────────────────────────
  R({ id: 'sala', name: 'Sala de TV', rects: [[27.87, 6.7, 33.26, 11.0]], floor: 'floor_social', wall: 'wall_tv_room', ceiling: 'ceiling', ceilingH: HEIGHTS.salaCeiling, cove: true, interior: true, menu: true, detailed: true,
    sources: ['ARQ p.2', 'ARQ p.4', 'ARQ p.6', 'INT p.4', 'INT p.5–11'], spawn: [32.6, 9.0, 90], lights: [[30.6, 4.2, 8.9, 1.6], [30.6, 2.2, 8.9, 0.8]] }),
  R({ id: 'hall', name: 'Hall de Entrada', rects: [[33.41, 6.7, 36.0, 11.15]], floor: 'floor_garage', wall: 'external_facade_primary', ceiling: 'external_soffit', ceilingH: HEIGHTS.canopyBottom, interior: false, menu: true,
    sources: ['ARQ p.2', 'ARQ p.4', 'ARQ p.5'], spawn: [37.5, 9.4, 90], lights: [[34.7, 3.0, 8.8, 0.8]] }),

  // ── Serviço / lazer ─────────────────────────────────────────────────────
  R({ id: 'jogos', name: 'Sala de Jogos', rects: [[4.82, 11.15, 8.31, 15.15]], floor: 'floor_game', wall: 'game_walls', ceiling: 'ceiling', ceilingH: 2.8, cove: true, interior: true, menu: true, detailed: true,
    sources: ['ARQ p.2', 'ARQ p.12', 'INT p.34–39'], spawn: [7.9, 12.0, 120], lights: [[6.55, 2.5, 13.1, 1]] }),
  R({ id: 'deposito', name: 'Depósito', rects: [[4.82, 15.3, 8.31, 16.2]], floor: 'floor_game', wall: 'wall_laundry', ceiling: 'ceiling', ceilingH: 2.8, interior: true, menu: true, detailed: true,
    sources: ['ARQ p.2', 'INT p.33'], spawn: [6.5, 17.2, 0], lights: [[6.5, 2.5, 15.75, 0.4]] }),
  R({ id: 'despensa', name: 'Despensa', rects: [[8.46, 13.37, 11.7, 16.2]], floor: 'floor_service', wall: 'wall_laundry', ceiling: 'ceiling', ceilingH: 2.8, interior: true, menu: true,
    sources: ['ARQ p.2', 'ARQ p.8', 'ARQ p.9'], spawn: [11.0, 13.8, 200], lights: [[10.1, 2.5, 14.8, 0.5]] }),
  R({ id: 'banho_ext', name: 'Banho Externo', rects: [[11.86, 13.37, 13.45, 16.2]], floor: 'extbath_stone', wall: 'extbath_stone', ceiling: 'ceiling', ceilingH: 2.7, interior: true, menu: true, detailed: true,
    sources: ['ARQ p.2', 'INT p.29', 'INT p.30', 'INT p.31', 'INT p.32'], spawn: [12.35, 13.7, 180], lights: [[12.65, 2.4, 14.8, 0.5]] }),
  R({ id: 'gourmet', name: 'Área Gourmet', rects: [[13.61, 11.15, 21.55, 16.2]], floor: 'floor_social', wall: 'wall_gourmet', ceiling: 'gourmet_ceiling', ceilingH: 2.95, interior: true, menu: true, detailed: true,
    sources: ['ARQ p.2', 'ARQ p.7', 'ARQ p.14', 'INT p.18', 'INT p.24–28'], spawn: [20.6, 11.9, 120], lights: [[15.7, 2.5, 13.7, 1], [19.0, 2.5, 13.7, 1]] }),
  R({ id: 'cozinha', name: 'Cozinha', rects: [[21.71, 11.15, 26.7, 16.2]], floor: 'floor_social', wall: 'wall_kitchen', ceiling: 'ceiling', ceilingH: 2.8, cove: true, interior: true, menu: true, detailed: true,
    sources: ['ARQ p.2', 'INT p.18', 'INT p.19–23'], spawn: [24.2, 11.6, 180], lights: [[24.73, 2.25, 13.5, 0.9], [22.9, 2.5, 13.6, 0.55]] }),
  R({ id: 'circ_servico', name: 'Circulação de Serviço', rects: [[26.86, 11.15, 29.36, 12.19]], floor: 'floor_service', wall: 'wall_circulation', ceiling: 'ceiling', ceilingH: 2.8, interior: true,
    sources: ['ARQ p.2'], lights: [[28.1, 2.5, 11.7, 0.3]] }),
  R({ id: 'lavanderia', name: 'Lavanderia', rects: [[26.86, 12.34, 29.36, 16.2]], floor: 'floor_service', wall: 'wall_laundry', ceiling: 'ceiling', ceilingH: 2.8, interior: true, menu: true, detailed: true,
    sources: ['ARQ p.2', 'INT p.12–17'], spawn: [27.4, 12.8, 180], lights: [[28.1, 2.5, 14.3, 0.7]] }),
  R({ id: 'garagem', name: 'Garagem', rects: [[29.5, 11.15, 36.0, 17.84]], floor: 'floor_garage', wall: 'garage_walls', ceiling: 'external_soffit', ceilingH: HEIGHTS.canopyBottom, interior: false, menu: true,
    sources: ['ARQ p.2', 'ARQ p.4', 'ARQ p.5', 'ARQ p.11'], spawn: [35.0, 15.5, 60], lights: [[32.7, 3.0, 14.4, 0.7]] }),
]

export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r])) as Record<string, RoomDef>

export function roomAt(x: number, z: number, y = 1): RoomDef | null {
  for (const r of ROOMS) {
    if (y > r.ceilingH + 0.05) continue
    for (const [x1, z1, x2, z2] of r.rects) {
      if (x >= x1 && x <= x2 && z >= z1 && z <= z2) return r
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Walls
// ─────────────────────────────────────────────────────────────────────────────
export type OpeningKind =
  | 'door' // interior hinged door (rendered open)
  | 'pivot' // front pivot door
  | 'slide' // sliding glass door (half open, walkable)
  | 'window' // window with sill
  | 'fixed' // fixed full glass (not walkable)
  | 'louver' // louvered timber door (rendered open)
  | 'louver2' // double louvered door (closed)
  | 'opening' // plain void

export interface Opening {
  a: number // start along wall axis (absolute coordinate)
  b: number // end
  sill: number
  top: number
  kind: OpeningKind
  /** glass slot override (e.g. fluted glass) */
  glass?: SlotId
  /** door hinge side: 'a' or 'b', swing direction: +1 or -1 (towards + or - normal) */
  hinge?: 'a' | 'b'
  swing?: 1 | -1
  curtain?: SlotId
  /** curtains drawn across the whole opening (e.g. behind the suite TV, INT p.60) */
  curtainClosed?: boolean
}

export interface WallDef {
  r: Rect // [x1, z1, x2, z2] footprint
  h: number
  base?: number
  ops?: Opening[]
  /** exterior face material (default external_facade_secondary) */
  ext?: SlotId
  /** room id override for faces with no room (e.g. garden walls) */
  tag?: string
}

const H = HEIGHTS
const W = (r: Rect, h: number, ops: Opening[] = [], ext?: SlotId): WallDef => ({ r, h, ops, ext })
const win = (a: number, b: number, sill = 1.0, top = 2.2, extra: Partial<Opening> = {}): Opening => ({ a, b, sill, top, kind: 'window', ...extra })
const slide = (a: number, b: number, top = H.slideTop, extra: Partial<Opening> = {}): Opening => ({ a, b, sill: 0, top, kind: 'slide', ...extra })
const door = (a: number, b: number, hinge: 'a' | 'b' = 'a', swing: 1 | -1 = 1, top = H.doorTop): Opening => ({ a, b, sill: 0, top, kind: 'door', hinge, swing })

export const WALLS: WallDef[] = [
  // ── Bloco íntimo — envoltória ───────────────────────────────────────────
  // North facade (white part, then taupe under the high block)
  W([17.7, 1.65, 29.7, 1.8], H.wall, [
    win(18.2, 19.6, 0.95, 2.2), // suíte
    win(21.8, 22.8, 1.55, 2.2), // banho suíte
    win(27.0, 29.0, 0.95, 2.2), // quarto 02
  ]),
  W([29.7, 1.65, 35.35, 1.8], H.wall, [
    win(30.4, 31.1, 1.55, 2.2), // banho social
    slide(32.6, 34.4), // quarto 01 (ARQ p.15)
  ], 'external_facade_primary'),
  // West facade of the suite (glass towards pool deck — INT p.60, ARQ p.7)
  W([17.7, 1.65, 17.85, 6.7], H.wall, [
    slide(2.0, 3.0), // door to the pool deck (INT p.60)
    { a: 3.1, b: 6.4, sill: 0, top: H.slideTop, kind: 'fixed', curtain: 'master_curtain', curtainClosed: true }, // closed behind the TV (INT p.60)
  ]),
  // South facade (patio): closet windows, corridor glass door
  W([17.7, 6.55, 27.7, 6.7], H.wall, [
    win(22.8, 23.5, 0.55, 2.45, { curtain: 'master_curtain' }),
    win(24.58, 25.3, 0.55, 2.45, { curtain: 'master_curtain' }),
    slide(26.27, 27.1),
  ]),
  // South wall shared with the double-height living room
  W([27.7, 6.55, 33.41, 6.7], H.salaTop, [door(28.0, 28.9, 'a', -1)], 'external_facade_primary'),
  W([33.41, 6.55, 35.35, 6.7], H.wall, [], 'external_facade_primary'),
  // East facade (behind the front glass curtain wall)
  W([35.2, 1.65, 35.35, 6.7], H.wall, [{ a: 3.3, b: 5.24, sill: 0, top: 2.8, kind: 'opening' }], 'external_facade_primary'),

  // ── Bloco íntimo — divisórias ───────────────────────────────────────────
  W([21.37, 1.8, 21.52, 6.55], H.wall, [door(5.55, 6.4, 'b', 1)]), // suíte | banho+closet
  W([21.52, 3.9, 23.25, 4.05], H.wall, [door(21.6, 22.4, 'a', -1)]), // banho | closet
  W([23.1, 1.8, 23.25, 3.9], H.wall), // banho | closet
  W([26.06, 1.8, 26.21, 6.55], H.wall, [door(5.6, 6.45, 'b', -1)]), // closet | Q02/circ
  W([29.81, 1.8, 29.96, 5.3], H.wall), // Q02 | banho social
  W([31.56, 1.8, 31.72, 6.55], H.wall, [door(5.6, 6.45, 'b', -1)]), // BS/circ | Q01
  W([26.21, 5.3, 31.56, 5.45], H.wall, [door(28.9, 29.7, 'b', 1), door(30.65, 31.4, 'a', 1)]), // Q02/BS | circ

  // ── Sala (pé-direito duplo) ─────────────────────────────────────────────
  W([27.7, 6.7, 27.87, 11.0], H.salaTop, [{ a: 7.4, b: 10.3, sill: 0, top: H.salaCeiling, kind: 'fixed', curtain: 'tv_curtain' }], 'external_facade_primary'),
  W([33.26, 6.7, 33.41, 11.0], H.salaTop, [
    { a: 7.45, b: 8.55, sill: 0, top: 3.1, kind: 'fixed', curtain: 'tv_curtain' },
    { a: 8.74, b: 10.13, sill: 0, top: 3.1, kind: 'pivot' },
    { a: 8.0, b: 10.0, sill: 4.15, top: 5.35, kind: 'fixed', glass: 'glass_fluted' },
  ], 'external_facade_primary'),
  W([27.7, 11.0, 33.41, 11.15], H.salaTop, [door(27.95, 28.85, 'a', 1)], 'external_facade_primary'),
  W([33.41, 11.0, 34.42, 11.15], H.canopyBottom, [], 'external_facade_primary'),

  // ── Bloco de serviço — envoltória ──────────────────────────────────────
  // Jogos block (taupe volume)
  W([4.67, 11.0, 8.46, 11.15], H.wall, [slide(5.9, 7.9, H.slideTop, { curtain: 'game_curtain' })], 'external_facade_primary'),
  W([4.67, 11.15, 4.82, 16.35], H.wall, [win(13.05, 14.75, 0.9, 2.3, { curtain: 'game_curtain' })], 'external_facade_primary'),
  W([8.31, 11.15, 8.46, 13.21], H.wall, [slide(11.3, 13.1, H.slideTop, { curtain: 'game_curtain' })], 'external_facade_primary'),
  W([8.31, 13.21, 8.46, 16.35], H.wall, [], 'external_facade_primary'),
  W([4.82, 15.15, 8.31, 15.3], H.wall), // jogos | depósito
  // Despensa + banho externo (stone recess — ARQ p.8/9)
  W([8.46, 13.21, 13.45, 13.37], H.wall, [
    { a: 10.4, b: 11.55, sill: 0, top: H.doorTop, kind: 'louver', hinge: 'a', swing: 1 },
    { a: 11.95, b: 12.75, sill: 0, top: H.doorTop, kind: 'louver', hinge: 'b', swing: -1 }, // opens outwards (ARQ p.2 / INT p.30),
  ], 'external_stone'),
  W([11.7, 13.37, 11.86, 16.2], H.wall), // despensa | banho ext
  // Gourmet west wall (sliding door to the deck recess)
  W([13.45, 11.0, 13.61, 16.35], H.wall, [slide(11.3, 13.1, H.slideTop, { curtain: 'gourmet_curtain' })]),
  // North facade — gourmet / cozinha
  W([13.61, 11.0, 21.55, 11.15], H.wall, [
    slide(13.7, 17.55, 2.6),
    slide(18.05, 19.95, 2.6),
  ]),
  W([21.55, 11.0, 26.86, 11.15], H.wall, [
    slide(21.85, 23.05, H.slideTop, { curtain: 'kitchen_curtain' }),
    slide(24.85, 26.55, H.slideTop, { curtain: 'kitchen_curtain' }),
  ]),
  W([26.86, 11.0, 27.7, 11.15], H.wall),
  // South facade
  W([4.67, 16.2, 8.46, 16.35], H.wall, [{ a: 5.2, b: 7.8, sill: 0, top: H.doorTop, kind: 'louver2' }], 'external_facade_primary'),
  W([8.46, 16.2, 29.36, 16.35], H.wall, [
    win(12.35, 13.05, 1.5, 2.1), // banho externo
    win(13.85, 15.1, 1.1, 2.2), // gourmet
    win(16.95, 18.3, 1.2, 1.8), // gourmet — pia
    win(23.6, 25.0, 1.2, 1.85), // cozinha — pia
    slide(27.15, 28.55), // lavanderia
  ]),
  // ── Bloco de serviço — divisórias ───────────────────────────────────────
  W([21.55, 11.15, 21.71, 16.2], H.wall, [{ a: 11.9, b: 15.0, sill: 0, top: H.slideTop, kind: 'slide' }]), // gourmet | cozinha (vidro)
  W([26.7, 11.15, 26.86, 16.2], H.wall, [door(11.3, 12.1, 'a', 1)]), // cozinha | circ/lav
  W([26.86, 12.19, 29.36, 12.34], H.wall, [door(27.0, 27.8, 'a', 1)]), // circ | lavanderia
  // Garage west wall (lavanderia | garagem)
  W([29.36, 11.15, 29.5, 17.84], H.canopyBottom, [], 'garage_walls'),
  W([29.36, 11.0, 33.41, 11.15], H.canopyBottom, [], 'garage_walls'),
]

// ─────────────────────────────────────────────────────────────────────────────
// Exterior massing (roof slabs, parapets, canopies, frames)
// ─────────────────────────────────────────────────────────────────────────────
export interface BoxDef {
  min: [number, number, number]
  max: [number, number, number]
  mat: SlotId
  /** per-face override: bottom face material (e.g. wood soffit) */
  bottom?: SlotId
  /** hidden in PLANTA 3D (cut-away) */
  cut?: boolean
  /** collider for walk mode */
  solid?: boolean
}

const B = (min: [number, number, number], max: [number, number, number], mat: SlotId, extra: Partial<BoxDef> = {}): BoxDef => ({ min, max, mat, cut: true, ...extra })

export const MASSING: BoxDef[] = [
  // Bedroom wing roof slab + parapet (x ≤ 29.7: below the high block)
  B([17.7, H.wall, 1.65], [29.7, H.slabTop, 6.7], 'external_facade_primary'),
  // Service wing roof
  B([13.45, H.wall, 11.0], [29.36, H.slabTop, 16.35], 'external_facade_primary'),
  B([27.7, H.wall, 11.0], [29.36, H.slabTop, 11.15], 'external_facade_primary'),
  // Jogos block roof
  B([4.67, H.wall, 11.0], [8.46, H.slabTop, 16.35], 'external_facade_primary'),
  // Water tank volume above despensa / banho externo (ARQ p.8/12/16)
  B([8.46, H.wall, 13.21], [13.45, H.tankTop, 16.35], 'water_tank'),
  // Pergola over the stone recess (ARQ p.16) — beams
  B([8.46, H.wall, 11.0], [13.45, H.slabTop, 11.25], 'external_facade_primary'),
  // Sala — light roof volume (x 27.7 → 29.7) and walls above roofs are part of WALLS
  B([27.7, H.salaTop, 6.55], [29.7, H.salaTop + 0.3, 11.15], 'water_tank'),
  // High block: solid mass above Q01/BS + slab
  B([29.7, H.wall, 1.65], [35.35, H.highBottom, 6.55], 'external_facade_primary'),
  B([29.7, H.highBottom, 1.5], [36.4, H.highTop, 12.0], 'external_facade_primary', { bottom: 'external_soffit' }),
  // High slab pergola end (frame) over the garage — ARQ p.4/16
  B([29.7, H.highBottom + 0.35, 12.0], [36.4, H.highTop, 12.25], 'external_facade_primary'),
  B([29.7, H.highBottom + 0.35, 14.25], [36.4, H.highTop, 14.5], 'external_facade_primary'),
  B([29.7, H.highBottom + 0.35, 12.0], [29.95, H.highTop, 14.5], 'external_facade_primary'),
  B([36.15, H.highBottom + 0.35, 12.0], [36.4, H.highTop, 14.5], 'external_facade_primary'),
  // Front frame pillar (chamfered on plan; simplified to a box) — ARQ p.2 hatch x 35.37–36.38
  B([35.37, 0, 1.5], [36.4, H.highBottom, 3.3], 'external_facade_primary', { cut: false, solid: true }),
  // Upper recessed volume above the hall (sala east wall above canopy is a wall); north return
  // Garage + hall canopy (low slab)
  // (split so it never crosses the double-height living room)
  B([33.41, H.canopyBottom, 6.7], [36.0, H.canopyTop, 17.84], 'external_facade_primary', { bottom: 'external_soffit' }),
  B([29.36, H.canopyBottom, 11.15], [33.41, H.canopyTop, 17.84], 'external_facade_primary', { bottom: 'external_soffit' }),
  B([35.35, H.canopyBottom, 5.24], [36.0, H.canopyTop, 6.7], 'external_facade_primary', { bottom: 'external_soffit' }),
  // Garage south wall (= lot boundary, full canopy height — ARQ p.11)
  B([29.36, 0, 17.84], [36.0, H.canopyBottom, 17.99], 'external_facade_primary', { cut: false, solid: true }),
  // Sala frame pillars towards the patio (ARQ p.2 hatches)
  B([27.28, 0, 6.92], [27.7, H.salaTop, 7.4], 'external_facade_primary', { cut: false, solid: true }),
  B([27.28, 0, 10.31], [27.7, H.salaTop, 10.98], 'external_facade_primary', { cut: false, solid: true }),
  B([27.28, H.salaTop - 0.45, 6.92], [27.7, H.salaTop, 10.98], 'external_facade_primary'),
  // Hall pillars (ARQ p.2 hatches x 33.34–33.86)
  B([33.41, 0, 10.19], [33.86, H.canopyBottom, 11.08], 'external_facade_primary', { cut: false, solid: true }),
  // Suite west portal frame (ARQ p.2 hatch x 17.14–17.70, ARQ p.7)
  B([17.14, 0, 5.43], [17.7, H.parapet, 7.02], 'external_facade_primary', { cut: false, solid: true }),
  B([17.14, 0, 1.5], [17.7, H.parapet, 1.95], 'external_facade_primary', { cut: false, solid: true }),
  B([17.14, H.wall - 0.25, 1.5], [17.7, H.parapet, 7.02], 'external_facade_primary', { bottom: 'external_soffit' }),
  // Jogos NW pillar (ARQ p.2 hatch)
  B([4.67, 0, 10.36], [5.3, H.jogosParapet, 11.0], 'external_facade_primary', { cut: false, solid: true }),
]

/** Parapet rings (outer face taupe) drawn above the roof slabs. */
export const PARAPETS: { r: Rect; top: number; mat: SlotId }[] = [
  { r: [17.7, 1.65, 29.7, 6.7], top: H.parapet, mat: 'external_facade_primary' },
  { r: [13.45, 11.0, 29.36, 16.35], top: H.parapet, mat: 'external_facade_primary' },
  { r: [4.67, 11.0, 8.46, 16.35], top: H.jogosParapet, mat: 'external_facade_primary' },
]

/** Front stone pillar + tall glass curtain wall + stone recess claddings. */
export const STONE_CLADDING: BoxDef[] = [
  // front stone pillar (ARQ p.4/p.5)
  B([35.37, 0, 5.24], [36.2, H.highBottom, 7.05], 'external_stone', { cut: false, solid: true }),
  // garage back wall stone (ARQ p.5)
  B([29.5, 0.06, 11.15], [29.56, H.canopyBottom, 15.2], 'external_stone', { cut: false }),
  // outdoor shower panel on north boundary (ARQ p.10/14)
  B([12.9, 0, 0.15], [14.5, 2.4, 0.22], 'external_stone', { cut: false }),
]

// ─────────────────────────────────────────────────────────────────────────────
// Boundary walls
// ─────────────────────────────────────────────────────────────────────────────
export const BOUNDARY: Rect[] = [
  [0, 0, 40, 0.15], // north
  [0, 0.15, 0.15, 18], // west
  [0, 17.85, 29.36, 18], // south (garage wall continues it)
  [36, 17.85, 40, 18],
]

// ─────────────────────────────────────────────────────────────────────────────
// Sun (A-01: plan top = north; southern hemisphere → sun to the north).
// DIA: sun from the north-east, front façade lit as in ARQ p.4/p.5.
// ENTARDECER: low sun from the west-north-west (see scene/timeOfDay.ts).
// ─────────────────────────────────────────────────────────────────────────────
export const SUN = { azimuthDeg: 58, elevationDeg: 50 }

export const HOUSE_CENTER: [number, number, number] = [20, 2, 9]
