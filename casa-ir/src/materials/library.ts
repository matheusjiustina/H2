/**
 * Runtime material library.
 *
 * One THREE material instance per slot, created lazily and *mutated in place*
 * when the configuration changes — geometry never re-renders to pick up a new
 * finish, and linked objects automatically share the same instance.
 *
 * PBR detail: every textured finish gets a colour map, a derived normal map
 * and (for wood / stone / floors / grounds) a roughness-variation map. Each
 * slot samples the procedural textures at its own offset so two elements in
 * the same finish never show the identical repeat.
 */
import * as THREE from 'three'
import { FINISHES, SLOTS, type Family, type FinishDef, type FinishId, type SlotId } from '../data/materials'
import { resolveChoice, type ConfigMap } from '../data/configuration'
import { getNormalMap, getRoughnessMap, getTexture, textureMean, type TextureKey } from './textures'

type Mat = THREE.MeshPhysicalMaterial

const mats = new Map<SlotId, Mat>()
let currentCfg: ConfigMap = {}
let lightsK = 0.22
let dayK = 1
let glassHigh = false

/** Shared uniforms for animated shader patches. */
export const sharedUniforms = { uTime: { value: 0 }, uCaustic: { value: 0.5 } }

const tmp = new THREE.Color()
const FULL_COLOUR = new Set<TextureKey>(['grass', 'sand', 'gravel', 'terrazzo', 'pebble', 'cowhide', 'granite', 'pool_tile', 'capsule_tile', 'asphalt', 'foliage'])
const NO_NORMAL = new Set<TextureKey>(['water_normal', 'foliage', 'asphalt', 'granite', 'leaf'])

const NORMAL_BY_FAMILY: Partial<Record<Family, number>> = {
  wood: 0.32,
  slats: 0.45,
  stone: 0.4,
  fabric: 0.55,
  rug: 0.85,
  rope: 0.8,
  wallcovering: 0.55,
  paint: 0.1,
  floor: 0.14,
  ground: 0.6,
}
const ROUGH_FAMILIES = new Set<Family>(['wood', 'slats', 'stone', 'floor', 'ground', 'rope'])

const WIND_SLOTS = new Set<SlotId>(['leaf', 'leaf_dark', 'leaf_light', 'leaf_olive', 'foliage'])
const CURTAIN_SLOTS = new Set<SlotId>(['tv_curtain', 'kitchen_curtain', 'gourmet_curtain', 'game_curtain', 'master_curtain'])

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967295
}

function prepMap(existing: THREE.Texture | null, base: THREE.Texture, repeat: number, offset: [number, number]) {
  let t = existing
  if (!t || t.source !== base.source) {
    t = base.clone()
    t.needsUpdate = true
  }
  t.repeat.set(repeat, repeat)
  t.offset.set(offset[0], offset[1])
  return t
}

function applyFinish(m: Mat, slot: SlotId, def: FinishDef, customColor?: string) {
  const isGlass = def.family === 'glass' && def.metalness !== 1 && (def.opacity ?? 1) < 1
  const before = `${!!m.map}|${!!m.normalMap}|${!!m.roughnessMap}|${m.transparent}|${m.transmission > 0}|${m.alphaTest > 0}`

  // colour (compensated for the mean brightness of the detail map)
  tmp.set(customColor ?? def.color)
  if (def.tex && def.color.toLowerCase() !== '#ffffff' && !FULL_COLOUR.has(def.tex)) {
    const mean = textureMean(def.tex)
    tmp.multiplyScalar(Math.min(1.9, 0.82 / mean))
  }
  m.color.copy(tmp)
  m.roughness = def.roughness
  m.metalness = def.metalness ?? 0
  m.envMapIntensity = def.envMapIntensity ?? (def.family === 'metal' || def.family === 'glass' ? 1.2 : def.family === 'stone' || def.family === 'floor' ? 0.9 : 0.8)

  // maps
  if (def.tex && def.tex !== 'water_normal') {
    const rep = 1 / (def.texScale ?? 1)
    const off: [number, number] = def.tex === 'foliage' ? [0, 0] : [hash(slot), hash(slot + '#')]
    m.map = prepMap(m.map, getTexture(def.tex), rep, off)
    const ns = def.bump ? def.bump * 0.8 : NORMAL_BY_FAMILY[def.family]
    if (ns && !NO_NORMAL.has(def.tex)) {
      m.normalMap = prepMap(m.normalMap, getNormalMap(def.tex), rep, off)
      m.normalScale.set(ns, ns)
    } else m.normalMap = null
    if (ROUGH_FAMILIES.has(def.family) && !NO_NORMAL.has(def.tex)) {
      m.roughnessMap = prepMap(m.roughnessMap, getRoughnessMap(def.tex), rep, off)
      m.roughness = Math.min(1, def.roughness / 0.9)
    } else m.roughnessMap = null
  } else {
    m.map = null
    m.normalMap = null
    m.roughnessMap = null
  }
  m.bumpMap = null
  m.alphaTest = def.tex === 'foliage' ? 0.45 : 0

  // optional lobes
  m.clearcoat = def.clearcoat ?? 0
  m.clearcoatRoughness = 0.22
  m.sheen = def.sheen ?? 0
  if (def.sheen) {
    m.sheenColor.set(customColor ?? def.color).lerp(new THREE.Color('#ffffff'), 0.35)
    m.sheenRoughness = 0.65
  }
  m.specularIntensity = def.family === 'fabric' || def.family === 'rug' ? 0.35 : 1

  // transparency / glass
  const op = def.opacity ?? 1
  if (isGlass && glassHigh && slot === 'glass') {
    // physically based thin glass: transmission + IOR + fresnel reflections
    m.transmission = 1
    m.thickness = 0.012
    m.ior = 1.5
    m.roughness = 0.02
    m.transparent = false
    m.opacity = 1
    m.color.set('#f2f7f7')
    m.depthWrite = true
  } else {
    m.transmission = 0
    m.transparent = op < 1
    m.opacity = op
    m.depthWrite = !isGlass
  }
  m.userData.fresnelGlass = isGlass && !(glassHigh && slot === 'glass')
  if (def.family === 'fabric' && op < 1) m.side = THREE.DoubleSide

  // emissive
  m.emissive.set(def.emissive ?? '#000000')
  m.userData.emissiveSlot = !!def.emissive || CURTAIN_SLOTS.has(slot)
  m.userData.finish = def
  m.emissiveIntensity = emissiveFor(slot, def)
  if (CURTAIN_SLOTS.has(slot)) m.emissive.copy(m.color)

  const after = `${!!m.map}|${!!m.normalMap}|${!!m.roughnessMap}|${m.transparent}|${m.transmission > 0}|${m.alphaTest > 0}`
  if (before !== after) m.needsUpdate = true
}

function emissiveFor(slot: SlotId, def: FinishDef) {
  if (CURTAIN_SLOTS.has(slot)) return 0.13 * dayK // daylight glowing through the linen
  if (!def.emissive) return 0
  switch (slot) {
    case 'led':
      return 0.55 + lightsK * 3.0
    case 'bulb':
      return 1.2 + lightsK * 6
    case 'lamp_shade':
      return 0.08 + lightsK * 1.5
    case 'glass_amber':
      return 0.03 + lightsK * 1.0
    default:
      return def.emissiveIntensity ?? 0
  }
}

/** Shader patches: subtle wind on foliage, slight curtain sway, pool caustics, fresnel glass. */
function patch(m: Mat, slot: SlotId) {
  const wind = WIND_SLOTS.has(slot)
  const curtain = CURTAIN_SLOTS.has(slot)
  const caustic = slot === 'pool_tile'
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = sharedUniforms.uTime
    sh.uniforms.uCaustic = sharedUniforms.uCaustic
    if (wind || curtain) {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 wpw = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #else
          vec4 wpw = modelMatrix * vec4(transformed, 1.0);
        #endif
        ${wind ? `float hh = max(0.0, wpw.y - 0.25);
          transformed.x += sin(uTime * 1.25 + wpw.x * 0.7 + wpw.z * 0.45) * 0.0045 * hh;
          transformed.z += cos(uTime * 0.95 + wpw.z * 0.6 + wpw.x * 0.3) * 0.0035 * hh;
          transformed.y += sin(uTime * 2.1 + wpw.x * 3.0 + wpw.z * 2.0) * 0.002 * min(hh, 2.0);` : ''}
        ${curtain ? `float ch = clamp(1.0 - wpw.y / 3.0, 0.0, 1.0);
          transformed += objectNormal * sin(uTime * 0.7 + wpw.x * 1.7 + wpw.z * 1.3) * 0.006 * ch;` : ''}`,
      )
    }
    if (caustic) {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldC;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldC = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldC;\nuniform float uTime;\nuniform float uCaustic;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          vec2 cp = vWorldC.xz * 1.35;
          float cc = 0.0;
          for (int i = 0; i < 3; i++) {
            cp += vec2(sin(cp.y * 1.3 + uTime * 0.55), cos(cp.x * 1.1 - uTime * 0.45)) * 0.55;
            cc += abs(sin(cp.x) + sin(cp.y));
          }
          cc = pow(max(0.0, 1.0 - cc * 0.3), 3.0);
          totalEmissiveRadiance += vec3(0.75, 0.95, 1.0) * cc * uCaustic * smoothstep(-0.15, -0.5, vWorldC.y);`,
        )
    }
    if (m.userData.fresnelGlass) {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        float frg = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 4.0);
        gl_FragColor.a = mix(gl_FragColor.a, 0.75, frg);`,
      )
    }
  }
  m.customProgramCacheKey = () => `${wind ? 'w' : ''}${curtain ? 'c' : ''}${caustic ? 'k' : ''}${m.userData.fresnelGlass ? 'g' : ''}`
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
  patch(m, slot)
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

/** Artificial-light factor (0.2 day → 1 night) and daylight factor. */
export function setLightFactors(lights: number, day: number) {
  if (Math.abs(lights - lightsK) < 1e-4 && Math.abs(day - dayK) < 1e-4) return
  lightsK = lights
  dayK = day
  sharedUniforms.uCaustic.value = 0.45 * day + 0.15
  for (const [slot, m] of mats) {
    if (!m.userData.emissiveSlot) continue
    m.emissiveIntensity = emissiveFor(slot, m.userData.finish as FinishDef)
  }
}

/** Physically based (transmissive) glass only in the photorealistic tier. */
export function setGlassQuality(high: boolean) {
  if (high === glassHigh) return
  glassHigh = high
  for (const slot of ['glass', 'glass_fluted', 'frosted', 'smoke_glass', 'glass_amber'] as SlotId[]) {
    const m = mats.get(slot)
    if (!m) continue
    const choice = resolveChoice(currentCfg, slot)
    applyFinish(m, slot, FINISHES[choice.finish], choice.color)
    m.needsUpdate = true
  }
}

export function finishOf(slot: SlotId, cfg: ConfigMap): FinishId {
  return resolveChoice(cfg, slot).finish
}
