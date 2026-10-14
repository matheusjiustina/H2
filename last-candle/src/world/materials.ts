import * as THREE from "three";
import * as T from "./textures";

/** Central material library. Shared instances = fewer shader programs and state changes. */
export interface MaterialLib {
  floor: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  wallLow: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  woodDark: THREE.MeshStandardMaterial;
  woodMid: THREE.MeshStandardMaterial;
  laminate: THREE.MeshStandardMaterial;
  beige: THREE.MeshStandardMaterial;
  beigeOld: THREE.MeshStandardMaterial;
  black: THREE.MeshStandardMaterial;
  darkGrey: THREE.MeshStandardMaterial;
  grey: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  frame: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  divider: THREE.MeshStandardMaterial;
  fabricRed: THREE.MeshStandardMaterial;
  fabricBlue: THREE.MeshStandardMaterial;
  fabricGreen: THREE.MeshStandardMaterial;
  couch: THREE.MeshStandardMaterial;
  cork: THREE.MeshStandardMaterial;
  whiteboard: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  cable: THREE.MeshStandardMaterial;
  plant: THREE.MeshStandardMaterial;
  plantDry: THREE.MeshStandardMaterial;
  terracotta: THREE.MeshStandardMaterial;
  screenOff: THREE.MeshStandardMaterial;
  lampShade: THREE.MeshStandardMaterial;
  bulb: THREE.MeshStandardMaterial;
  fluo: THREE.MeshStandardMaterial;
  ledRed: THREE.MeshStandardMaterial;
  ledGreen: THREE.MeshStandardMaterial;
  ledAmber: THREE.MeshStandardMaterial;
  paper: THREE.MeshStandardMaterial;
  cardboard: THREE.MeshStandardMaterial;
  tape: THREE.MeshStandardMaterial;
  keyboardOld: THREE.MeshStandardMaterial;
  keyboardMech: THREE.MeshStandardMaterial;
  mousepad: THREE.MeshStandardMaterial;
  fridgeBody: THREE.MeshStandardMaterial;
  neonWarm: THREE.MeshStandardMaterial;
  /** Soft warm LED strip (focal accents). */
  ledWarm: THREE.MeshStandardMaterial;
  /** Additive mirror layer for glass: only the environment / light reflections show. */
  reflect: THREE.MeshStandardMaterial;
}

let lib: MaterialLib | null = null;

const std = (color: string, roughness = 0.8, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

export function materials(): MaterialLib {
  if (lib) return lib;
  const floorTex = T.floorTiles();
  const wallTex = T.plaster("#84878a", 0.05);
  const wallLowTex = T.plaster("#2c2b29", 0.08);
  lib = {
    floor: std("#ffffff", 0.62, 0, { map: floorTex }),
    wall: std("#ffffff", 0.92, 0, { map: wallTex }),
    wallLow: std("#ffffff", 0.85, 0, { map: wallLowTex }),
    ceiling: std("#ffffff", 0.95, 0, { map: T.ceilingTex() }),
    concrete: std("#ffffff", 0.9, 0, { map: T.concreteTex() }),
    woodDark: std("#ffffff", 0.6, 0, { map: T.woodTex("#3b2a1d") }),
    woodMid: std("#ffffff", 0.65, 0, { map: T.woodTex("#5b412b", "rgba(30,18,8,0.3)") }),
    laminate: std("#ffffff", 0.55, 0, { map: T.laminateTex() }),
    beige: std("#cbbf9f", 0.55),
    beigeOld: std("#b9a983", 0.6),
    black: std("#17171a", 0.5),
    darkGrey: std("#2d2e31", 0.6),
    grey: std("#6d6e70", 0.7),
    metal: std("#8a8c8f", 0.45, 0.6),
    chrome: std("#c9ccd0", 0.25, 0.9),
    frame: std("#232427", 0.5, 0.4),
    glass: new THREE.MeshPhysicalMaterial({
      color: "#9fb3bf",
      roughness: 0.08,
      metalness: 0,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    divider: std("#5d6065", 0.9),
    fabricRed: std("#ffffff", 0.95, 0, { map: T.fabricTex("#6e2b28") }),
    fabricBlue: std("#ffffff", 0.95, 0, { map: T.fabricTex("#2b3b55") }),
    fabricGreen: std("#ffffff", 0.95, 0, { map: T.fabricTex("#3a4a35") }),
    couch: std("#ffffff", 0.95, 0, { map: T.fabricTex("#6a4b33") }),
    cork: std("#ffffff", 0.95, 0, { map: T.corkTex() }),
    whiteboard: std("#f1f1ec", 0.35),
    rubber: std("#1b1b1d", 0.9),
    cable: std("#151515", 0.7),
    plant: std("#3e6b3a", 0.8),
    plantDry: std("#7a7440", 0.85),
    terracotta: std("#8a4a30", 0.85),
    screenOff: std("#0c0f12", 0.3),
    lampShade: std("#2f3236", 0.6, 0.3),
    bulb: std("#fff2d0", 0.5, 0, { emissive: new THREE.Color("#ffd9a0"), emissiveIntensity: 2.2 }),
    fluo: std("#f4f6f2", 0.5, 0, { emissive: new THREE.Color("#e8f0ff"), emissiveIntensity: 1.6 }),
    ledRed: std("#ff3b30", 0.5, 0, { emissive: new THREE.Color("#ff3b30"), emissiveIntensity: 2 }),
    ledGreen: std("#30ff7a", 0.5, 0, { emissive: new THREE.Color("#30ff7a"), emissiveIntensity: 2 }),
    ledAmber: std("#ffb020", 0.5, 0, { emissive: new THREE.Color("#ffb020"), emissiveIntensity: 2 }),
    paper: std("#efeadf", 0.9),
    cardboard: std("#a47c4e", 0.9),
    tape: std("#d6b54a", 0.7),
    keyboardOld: std("#ffffff", 0.7, 0, { map: T.keyboardTex(false) }),
    keyboardMech: std("#ffffff", 0.5, 0, { map: T.keyboardTex(true) }),
    mousepad: std("#1d2128", 0.95),
    fridgeBody: std("#d8d6cf", 0.45, 0.1),
    neonWarm: std("#ffb15c", 0.4, 0, { emissive: new THREE.Color("#ff9a3c"), emissiveIntensity: 2.4 }),
    ledWarm: std("#ffd6a0", 0.4, 0, { emissive: new THREE.Color("#ffc27a"), emissiveIntensity: 1.5 }),
    reflect: new THREE.MeshStandardMaterial({ color: "#ffffff", metalness: 1, roughness: 0.06, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 0.22 }),
  };
  return lib;
}

/** Cache of plain colored materials (characters, props). */
const colorCache = new Map<string, THREE.MeshStandardMaterial>();
export function colorMat(color: string, roughness = 0.75, metalness = 0): THREE.MeshStandardMaterial {
  const k = `${color}|${roughness}|${metalness}`;
  let m = colorCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    colorCache.set(k, m);
  }
  return m;
}

/** Stylized toon material used for characters and hands. */
let gradient: THREE.DataTexture | null = null;
const toonCache = new Map<string, THREE.MeshToonMaterial>();
export function toonMat(color: string): THREE.MeshToonMaterial {
  if (!gradient) {
    const data = new Uint8Array([70, 70, 70, 255, 140, 140, 140, 255, 205, 205, 205, 255, 255, 255, 255, 255]);
    gradient = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  let m = toonCache.get(color);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: gradient });
    toonCache.set(color, m);
  }
  return m;
}

export function texMat(tex: THREE.Texture, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, ...opts });
}
