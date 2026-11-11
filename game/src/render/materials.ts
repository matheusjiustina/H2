import * as THREE from 'three';

/** Shared palette, tuned to the reference: warm creams, mustard, brick, teal glass, dusty blue asphalt. */
export const PAL = {
  ink: 0x1d1a2e,
  cream: 0xf6ecd0,
  paper: 0xfbf3dc,
  asphalt: 0x6f7892,
  asphaltDark: 0x5a6280,
  sidewalk: 0xe9dfc4,
  sidewalkEdge: 0xcfc4a6,
  line: 0xf4f1e6,
  lineYellow: 0xf2c230,
  grass: 0x9cc27a,
  grassDark: 0x7fae6a,
  lawn: 0xa9d284,
  sand: 0xf0deaa,
  desert: 0xe2b272,
  desertDark: 0xc98f58,
  rock: 0xc87f4e,
  rockDark: 0xa5633f,
  dirt: 0xb99468,
  water: 0x3fa7c4,
  mustard: 0xe8b84a,
  mustardLight: 0xf2cf72,
  brick: 0xb8433a,
  brickDark: 0x8f332f,
  stone: 0xe6dcc6,
  stoneDark: 0xc9bea5,
  white: 0xf7f4ea,
  glass: 0x5f9fb0,
  glassDark: 0x3c6f86,
  glassLight: 0x8cc3cb,
  window: 0x34425e,
  windowLight: 0x9bc4d6,
  steel: 0x8b93a6,
  dark: 0x2b2e42,
  gold: 0xf2c94c,
  goldDark: 0xc9992e,
  red: 0xd43a34,
  blue: 0x2f5fa8,
  navy: 0x1e2f5c,
  teal: 0x2f8f86,
  green: 0x4c9a5a,
  wood: 0x9a6b46,
  woodDark: 0x6e4a32,
  orange: 0xee8a3a,
  pink: 0xf2a0a8,
  purple: 0x7a62a8,
  autumn: [0xe9a23b, 0xf0c04a, 0xd9722e, 0xc9523a, 0xb8894a, 0xe2b65a] as number[],
  greens: [0x7fb069, 0x8fc27a, 0x6fa35f, 0xa3c96f] as number[],
  carColors: [0xf4f1e6, 0xd43a34, 0x2f5fa8, 0x2b2e42, 0x8b93a6, 0xe8b84a, 0x4c9a5a, 0xf2a0a8, 0x7a62a8, 0xee8a3a] as number[],
  skin: [0xf2c9a0, 0xe0ac7e, 0xc68a5c, 0x9a6642, 0x6e4630, 0xf5d6b8] as number[],
};

/** Uniforms shared by every toon material (halftone screen in shadow, like comic print). */
export const shared = {
  halftone: { value: 0.16 },
  dotScale: { value: 1 / 5 },
  sunK: { value: 1 },
};

function gradientMap(): THREE.DataTexture {
  // dot(N,L) from -1..1 mapped to 6 bands: back faces get only ambient (blue-violet shade).
  const data = new Uint8Array([0, 0, 0, 118, 200, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
const GRADIENT = gradientMap();

const HALFTONE = /* glsl */ `
{
  float hLit = dot(reflectedLight.directDiffuse, vec3(1.0)) / (dot(diffuseColor.rgb, vec3(1.0)) * uSunK + 1e-4);
  vec2 hp = gl_FragCoord.xy * uDotScale;
  hp = vec2(hp.x + hp.y, hp.x - hp.y) * 0.7071;
  float hd = length(fract(hp) - 0.5);
  float hDots = 1.0 - smoothstep(0.24, 0.34, hd);
  float hShade = 1.0 - smoothstep(0.1, 0.55, hLit);
  outgoingLight *= 1.0 - hDots * hShade * uHalftone;
}
`;

export function toon(params: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ gradientMap: GRADIENT, ...params });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHalftone = shared.halftone;
    sh.uniforms.uDotScale = shared.dotScale;
    sh.uniforms.uSunK = shared.sunK;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uHalftone;\nuniform float uDotScale;\nuniform float uSunK;')
      .replace('#include <opaque_fragment>', HALFTONE + '\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'toon-halftone';
  return m;
}

export const M = {
  /** Static world geometry (vertex coloured). */
  world: toon({ vertexColors: true }),
  road: toon({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
  decal: toon({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }),
  /** Windows that light up at night. */
  glow: toon({ vertexColors: true, emissive: 0x000000 }),
  /** Characters / vehicles (vertex coloured, double sided off). */
  actor: toon({ vertexColors: true }),
  /** Instanced crowd parts – colour comes from instanceColor. */
  crowd: toon({ color: 0xffffff }),
  /** Tinted variants for vehicle wrecks etc. */
  wreck: toon({ vertexColors: true, color: 0x555560 }),
  unlitWhite: new THREE.MeshBasicMaterial({ color: 0xffffff }),
};

const basicCache = new Map<string, THREE.MeshBasicMaterial>();
export function basic(color: number, opacity = 1, additive = false): THREE.MeshBasicMaterial {
  const key = `${color}|${opacity}|${additive}`;
  let m = basicCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1 || additive,
      opacity,
      depthWrite: !(opacity < 1 || additive),
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: !additive,
    });
    basicCache.set(key, m);
  }
  return m;
}

const toonCache = new Map<number, THREE.MeshToonMaterial>();
export function toonColor(color: number): THREE.MeshToonMaterial {
  let m = toonCache.get(color);
  if (!m) {
    m = toon({ color });
    toonCache.set(color, m);
  }
  return m;
}

/** Draws text/graphics to a canvas texture (billboards, signs, flags). */
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
