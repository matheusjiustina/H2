/**
 * Runtime material library.
 *
 * One THREE material instance per slot, created lazily and *mutated in place*
 * when the configuration changes — geometry never needs to re-render to pick
 * up a new finish, and linked objects automatically share the same instance.
 */
import * as THREE from 'three'
import { FINISHES, SLOTS, type FinishDef, type FinishId, type SlotId } from '../data/materials'
import { resolveChoice, type ConfigMap } from '../data/configuration'
import { getTexture, textureMean } from './textures'

type Mat = THREE.MeshPhysicalMaterial

const mats = new Map<SlotId, Mat>()
let currentCfg: ConfigMap = {}
let nightFactor = 0

const tmp = new THREE.Color()
const FULL_COLOUR = new Set(['grass', 'sand', 'gravel', 'terrazzo', 'pebble', 'cowhide', 'granite', 'pool_tile', 'capsule_tile', 'asphalt'])

function applyFinish(m: Mat, slot: SlotId, def: FinishDef, customColor?: string) {
  const isGlass = def.family === 'glass' && def.metalness !== 1 && (def.opacity ?? 1) < 1
  // colour (compensated for the mean brightness of the detail map)
  tmp.set(customColor ?? def.color)
  if (def.tex && def.color.toLowerCase() !== '#ffffff' && !FULL_COLOUR.has(def.tex)) {
    const mean = textureMean(def.tex)
    tmp.multiplyScalar(Math.min(1.9, 0.82 / mean))
  }
  m.color.copy(tmp)
  m.roughness = def.roughness
  m.metalness = def.metalness ?? 0
  m.envMapIntensity = def.envMapIntensity ?? (def.family === 'metal' || def.family === 'glass' ? 1.2 : 0.85)

  // maps
  const hadMap = !!m.map
  const hadBump = !!m.bumpMap
  if (def.tex) {
    const base = getTexture(def.tex)
    let map = m.map
    if (!map || map.source !== base.source) {
      map = base.clone()
      map.needsUpdate = true
    }
    const s = 1 / (def.texScale ?? 1)
    map.repeat.set(s, s)
    m.map = def.tex === 'water_normal' ? null : map
    if (def.bump) {
      m.bumpMap = map
      m.bumpScale = def.bump * 1.5
    } else m.bumpMap = null
  } else {
    m.map = null
    m.bumpMap = null
  }

  // optional lobes
  m.clearcoat = def.clearcoat ?? 0
  m.clearcoatRoughness = 0.25
  m.sheen = def.sheen ?? 0
  if (def.sheen) {
    m.sheenColor.set(customColor ?? def.color).lerp(new THREE.Color('#ffffff'), 0.4)
    m.sheenRoughness = 0.6
  }

  // transparency
  const op = def.opacity ?? 1
  m.transparent = op < 1
  m.opacity = op
  m.depthWrite = !isGlass
  m.side = def.family === 'fabric' && op < 1 ? THREE.DoubleSide : m.side

  // emissive
  m.emissive.set(def.emissive ?? '#000000')
  m.userData.baseEmissive = def.emissiveIntensity ?? 0
  m.userData.emissiveSlot = !!def.emissive
  m.emissiveIntensity = emissiveFor(slot, def)

  if (hadMap !== !!m.map || hadBump !== !!m.bumpMap) m.needsUpdate = true
  m.userData.finish = def
}

function emissiveFor(slot: SlotId, def: FinishDef) {
  if (!def.emissive) return 0
  const base = def.emissiveIntensity ?? 0
  switch (slot) {
    case 'led':
      return 0.9 + nightFactor * 2.6
    case 'bulb':
      return 2 + nightFactor * 5
    case 'lamp_shade':
      return 0.15 + nightFactor * 1.4
    case 'glass_amber':
      return 0.05 + nightFactor * 0.9
    default:
      return base
  }
}

export function getMat(slot: SlotId): Mat {
  let m = mats.get(slot)
  if (m) return m
  m = new THREE.MeshPhysicalMaterial()
  m.name = slot
  const choice = resolveChoice(currentCfg, slot)
  applyFinish(m, slot, FINISHES[choice.finish] ?? FINISHES[SLOTS[slot].finish], choice.color)
  const fam = (FINISHES[SLOTS[slot].finish] as FinishDef).family
  if (fam === 'fabric' || fam === 'plant' || fam === 'rope') m.side = THREE.DoubleSide
  mats.set(slot, m)
  return m
}

export function applyConfig(cfg: ConfigMap) {
  currentCfg = cfg
  for (const [slot, m] of mats) {
    const choice = resolveChoice(cfg, slot)
    const def = FINISHES[choice.finish] ?? FINISHES[SLOTS[slot].finish]
    applyFinish(m, slot, def, choice.color)
  }
}

export function setNightFactor(f: number) {
  nightFactor = f
  for (const [slot, m] of mats) {
    if (!m.userData.emissiveSlot) continue
    m.emissiveIntensity = emissiveFor(slot, m.userData.finish as FinishDef)
  }
}

export function finishOf(slot: SlotId, cfg: ConfigMap): FinishId {
  return resolveChoice(cfg, slot).finish
}

/** Generic helper used by procedural props that need a one-off material. */
const extra = new Map<string, THREE.MeshStandardMaterial>()
export function plainMat(color: string, roughness = 0.8, metalness = 0) {
  const key = `${color}|${roughness}|${metalness}`
  let m = extra.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness })
    extra.set(key, m)
  }
  return m
}
