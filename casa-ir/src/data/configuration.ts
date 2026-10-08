/**
 * Client configurator — selectable objects and their material slots.
 *
 * Each selectable has a stable semantic id (never derived from mesh names).
 * `slots` lists the material slots the client may change when the object is
 * selected. Slots are only shared when objects are intentionally linked
 * (e.g. the two armchairs of the TV room).
 */
import { SLOTS, type FinishId, type SlotId } from './materials'

export interface SelectableDef {
  id: string
  label: string
  room: string // room id or 'exterior'
  slots: SlotId[]
}

const D = (id: string, label: string, room: string, ...slots: SlotId[]): SelectableDef => ({ id, label, room, slots })

export const SELECTABLES: SelectableDef[] = [
  // ── Exterior ────────────────────────────────────────────────────────────
  D('facade_primary', 'Fachada — volumes cinza fendi', 'exterior', 'external_facade_primary'),
  D('facade_secondary', 'Fachada — paredes claras', 'exterior', 'external_facade_secondary'),
  D('facade_stone', 'Revestimento em pedra', 'exterior', 'external_stone'),
  D('soffits', 'Forros de madeira externos', 'exterior', 'external_soffit'),
  D('deck', 'Deck do pátio', 'exterior', 'external_deck'),
  D('frames', 'Esquadrias', 'exterior', 'external_frames'),
  D('front_door', 'Porta pivotante de entrada', 'exterior', 'front_door'),
  D('water_tank', 'Volume da caixa d’água / sala', 'exterior', 'water_tank'),
  D('boundary', 'Muros de divisa', 'exterior', 'boundary_wall'),
  D('pergola', 'Pérgolas', 'exterior', 'pergola_frame', 'external_soffit'),
  D('pool_furniture', 'Mobiliário da piscina', 'exterior', 'ext_furniture_wood', 'ext_cushion', 'ext_umbrella'),
  D('hall_chairs', 'Poltronas do hall', 'hall', 'hall_chairs'),
  D('floor_garage', 'Piso — garagem e hall', 'garagem', 'floor_garage'),

  // ── Sala de TV ──────────────────────────────────────────────────────────
  D('tv_walls', 'Paredes — Sala de TV', 'sala', 'wall_tv_room'),
  D('tv_feature', 'Parede de linho com blocos de madeira', 'sala', 'tv_feature_wall', 'tv_wood_blocks'),
  D('tv_panel', 'Painel da TV com moldura em pedra', 'sala', 'tv_panel', 'tv_stone_frame'),
  D('tv_rack', 'Rack suspenso', 'sala', 'tv_rack_wood', 'tv_rack_top'),
  D('tv_sofa', 'Sofá — Sala de TV', 'sala', 'sofa_tv_fabric'),
  D('tv_armchairs', 'Poltronas — Sala de TV', 'sala', 'armchair_tv_fabric'),
  D('tv_side_tables', 'Mesas laterais', 'sala', 'tv_side_tables'),
  D('tv_rug', 'Tapete — Sala de TV', 'sala', 'tv_rug'),
  D('tv_curtains', 'Cortinas — Sala de TV', 'sala', 'tv_curtain'),
  D('floor_social', 'Piso — áreas sociais', 'sala', 'floor_social'),
  D('ceiling_band', 'Faixa de forro grafite', 'sala', 'ceiling_dark'),

  // ── Cozinha ─────────────────────────────────────────────────────────────
  D('kitchen_cabinets', 'Armários — Cozinha', 'cozinha', 'cabinet_kitchen'),
  D('kitchen_wood', 'Painéis e ilha em madeira — Cozinha', 'cozinha', 'wood_kitchen'),
  D('kitchen_counter', 'Bancadas — Cozinha', 'cozinha', 'counter_kitchen'),
  D('kitchen_backsplash', 'Revestimento e coifa — Cozinha', 'cozinha', 'backsplash_kitchen'),
  D('kitchen_chairs', 'Cadeiras — Cozinha', 'cozinha', 'chair_kitchen_fabric'),
  D('kitchen_table', 'Mesa — Cozinha', 'cozinha', 'table_kitchen'),
  D('kitchen_walls', 'Paredes — Cozinha', 'cozinha', 'wall_kitchen'),
  D('kitchen_curtains', 'Cortinas — Cozinha', 'cozinha', 'kitchen_curtain'),

  // ── Gourmet ─────────────────────────────────────────────────────────────
  D('gourmet_wood', 'Marcenaria em madeira — Gourmet', 'gourmet', 'wood_gourmet'),
  D('gourmet_uppers', 'Armários superiores — Gourmet', 'gourmet', 'cabinet_gourmet'),
  D('gourmet_counter', 'Bancadas e ilha — Gourmet', 'gourmet', 'stone_gourmet'),
  D('gourmet_terrazzo', 'Revestimento e churrasqueira — Gourmet', 'gourmet', 'terrazzo_gourmet'),
  D('gourmet_table', 'Mesa de jantar — Gourmet', 'gourmet', 'gourmet_table_wood'),
  D('gourmet_chairs', 'Cadeiras e banquetas — Gourmet', 'gourmet', 'gourmet_chairs'),
  D('gourmet_ceiling', 'Forro de madeira — Gourmet', 'gourmet', 'gourmet_ceiling'),
  D('gourmet_walls', 'Paredes — Gourmet', 'gourmet', 'wall_gourmet'),
  D('gourmet_curtains', 'Cortinas — Gourmet', 'gourmet', 'gourmet_curtain'),

  // ── Lavanderia ──────────────────────────────────────────────────────────
  D('laundry_base', 'Armários inferiores — Lavanderia', 'lavanderia', 'laundry_base'),
  D('laundry_upper', 'Armários superiores — Lavanderia', 'lavanderia', 'laundry_upper'),
  D('laundry_panel', 'Painel de madeira — Lavanderia', 'lavanderia', 'laundry_panel'),
  D('laundry_counter', 'Bancadas — Lavanderia', 'lavanderia', 'laundry_counter'),
  D('laundry_backsplash', 'Revestimento — Lavanderia', 'lavanderia', 'laundry_backsplash'),
  D('laundry_walls', 'Paredes — Lavanderia / Despensa', 'lavanderia', 'wall_laundry'),
  D('floor_service', 'Piso — serviço', 'lavanderia', 'floor_service'),

  // ── Sala de jogos ───────────────────────────────────────────────────────
  D('game_cabinetry', 'Marcenaria — Sala de Jogos', 'jogos', 'game_cabinetry', 'game_panel'),
  D('game_walls', 'Paredes — Sala de Jogos', 'jogos', 'game_walls'),
  D('game_sofa', 'Sofá — Sala de Jogos', 'jogos', 'game_sofa'),
  D('game_chairs', 'Cadeiras — Sala de Jogos', 'jogos', 'game_chairs'),
  D('game_table', 'Mesa redonda — Sala de Jogos', 'jogos', 'game_table'),
  D('game_rug', 'Tapete — Sala de Jogos', 'jogos', 'game_rug'),
  D('game_curtains', 'Cortinas — Sala de Jogos', 'jogos', 'game_curtain'),
  D('floor_game', 'Piso — Sala de Jogos / Depósito', 'jogos', 'floor_game'),

  // ── Banhos ──────────────────────────────────────────────────────────────
  D('socialbath_walls', 'Revestimento — Banho Social', 'bsocial', 'socialbath_stone'),
  D('socialbath_panel', 'Painel ripado — Banho Social', 'bsocial', 'socialbath_panel'),
  D('socialbath_vanity', 'Bancada e gabinete — Banho Social', 'bsocial', 'socialbath_vanity', 'socialbath_counter'),
  D('extbath_walls', 'Revestimento travertino — Banho Externo', 'banho_ext', 'extbath_stone'),
  D('extbath_pebble', 'Parede de seixos — Banho Externo', 'banho_ext', 'extbath_pebble'),
  D('masterbath_walls', 'Revestimento — Banho Master', 'suite_bath', 'masterbath_stone'),
  D('masterbath_tile', 'Revestimento 3D — Banho Master', 'suite_bath', 'masterbath_tile'),
  D('masterbath_metal', 'Metais — Banho Master', 'suite_bath', 'masterbath_metal'),
  D('pantry', 'Estantes — Despensa / Depósito', 'despensa', 'pantry_shelves'),

  // ── Suíte master ────────────────────────────────────────────────────────
  D('master_walls', 'Paredes — Suíte Master', 'suite', 'master_wall'),
  D('master_headboard', 'Painel da cabeceira', 'suite', 'master_headboard_panel', 'master_headboard_frame'),
  D('master_wood', 'Painel de madeira com porta', 'suite', 'master_wood'),
  D('master_bed', 'Cama — Suíte Master', 'suite', 'master_bed', 'master_bedding'),
  D('master_nightstands', 'Criados-mudos', 'suite', 'master_nightstand', 'master_metal'),
  D('master_rack', 'Rack com TV em pórtico', 'suite', 'master_rack', 'master_metal'),
  D('master_armchair', 'Poltrona — Suíte Master', 'suite', 'master_armchair'),
  D('master_rug', 'Tapete — Suíte Master', 'suite', 'master_rug'),
  D('master_curtains', 'Cortinas — Suíte Master', 'suite', 'master_curtain'),
  D('floor_intimate', 'Piso — área íntima', 'suite', 'floor_intimate'),

  // ── Closet ──────────────────────────────────────────────────────────────
  D('closet_wardrobes', 'Armários — Closet', 'closet', 'closet_master', 'closet_handles'),
  D('closet_niche', 'Nicho em madeira — Closet', 'closet', 'closet_wood'),
  D('closet_vanity', 'Penteadeira — Closet', 'closet', 'closet_wood', 'closet_counter'),
  D('closet_walls', 'Revestimento de parede — Closet', 'closet', 'closet_wall'),
  D('closet_chair', 'Cadeira da penteadeira', 'closet', 'closet_chair'),

  // ── Quartos 01 / 02 ─────────────────────────────────────────────────────
  D('bedroom_walls', 'Paredes — Quartos 01 e 02', 'q01', 'bedroom_walls'),
  D('bedroom_beds', 'Roupa de cama — Quartos 01 e 02', 'q01', 'bedroom_bedding'),
  D('bedroom_joinery', 'Marcenaria — Quartos 01 e 02', 'q01', 'bedroom_joinery'),

  // ── Shared ──────────────────────────────────────────────────────────────
  D('interior_doors', 'Portas internas', 'circ_intima', 'interior_doors'),
  D('circulation_walls', 'Paredes — circulações', 'circ_intima', 'wall_circulation'),
]

export const SELECTABLE_BY_ID = Object.fromEntries(SELECTABLES.map((s) => [s.id, s])) as Record<string, SelectableDef>

/** Merged architectural meshes are selectable through their slot. */
export function selectableForSlot(slot: SlotId): string | null {
  for (const s of SELECTABLES) if (s.slots[0] === slot) return s.id
  for (const s of SELECTABLES) if (s.slots.includes(slot)) return s.id
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration state
// ─────────────────────────────────────────────────────────────────────────────
export interface SlotChoice {
  finish: FinishId
  /** optional custom colour (hex) that tints the chosen finish */
  color?: string
}
export type ConfigMap = Partial<Record<SlotId, SlotChoice>>

/** ORIGINAL_PROJECT = every slot at its default finish (as specified in the PDFs). */
export const ORIGINAL_PROJECT: ConfigMap = Object.freeze({}) as ConfigMap

export function resolveChoice(cfg: ConfigMap, slot: SlotId): SlotChoice {
  return cfg[slot] ?? { finish: SLOTS[slot].finish }
}

export function isOriginal(cfg: ConfigMap, slot: SlotId) {
  const c = cfg[slot]
  return !c || (c.finish === SLOTS[slot].finish && !c.color)
}

export const CONFIG_SCHEMA_VERSION = 1

export interface SavedOption {
  name: string
  savedAt: string
  config: ConfigMap
}

export function serializeConfig(cfg: ConfigMap, name: string): string {
  return JSON.stringify({ project: 'CASA I|R', schema: CONFIG_SCHEMA_VERSION, name, savedAt: new Date().toISOString(), config: cfg }, null, 2)
}

export function parseConfig(json: string): ConfigMap | null {
  try {
    const o = JSON.parse(json)
    const cfg = (o && o.config) || o
    const out: ConfigMap = {}
    for (const [k, v] of Object.entries(cfg as Record<string, SlotChoice>)) {
      if (k in SLOTS && v && typeof v.finish === 'string') out[k as SlotId] = { finish: v.finish, color: v.color }
    }
    return out
  } catch {
    return null
  }
}
