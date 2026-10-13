import {
  Color,
  DataTexture,
  LinearFilter,
  Material,
  MeshBasicMaterial,
  MeshToonMaterial,
  RedFormat,
  Side,
  FrontSide,
  Texture,
  UnsignedByteType,
  Vector3,
} from 'three';

/**
 * Global uniforms shared by every world material. Updated once per frame by the lighting system,
 * so one material can serve buildings, props, vegetation and terrain with a single program.
 */
export const worldUniforms = {
  uTime: { value: 0 },
  uSkyColor: { value: new Color('#bfd8ff') },
  uGroundColor: { value: new Color('#8c7a5e') },
  uHemiIntensity: { value: 0.75 },
  uNight: { value: 0 }, // 0 = day, 1 = deep night
  uGlowColor: { value: new Color('#ffcf7a') },
  uWind: { value: 1 },
  uRimColor: { value: new Color('#fff1d6') },
  uRimStrength: { value: 0.18 },
  uPlayerPos: { value: new Vector3() },
  uOverlay: { value: null as Texture | null },
  uOverlayOn: { value: 0 },
  /** Props closer than this to the camera dissolve with a screen-door dither (camera occlusion). */
  uCamFade: { value: 1.25 },
};

let gradientMap: DataTexture | null = null;

/** Soft toon ramp: readable shadow side, gentle band, warm highlight. */
export function getToonGradient(): DataTexture {
  if (gradientMap) return gradientMap;
  const W = 64;
  const data = new Uint8Array(W);
  const ss = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < W; i++) {
    const x = i / (W - 1);
    const v = 0.34 + 0.46 * ss(0.44, 0.56, x) + 0.2 * ss(0.7, 0.9, x);
    data[i] = Math.round(Math.min(1, v) * 255);
  }
  gradientMap = new DataTexture(data, W, 1, RedFormat, UnsignedByteType);
  gradientMap.minFilter = LinearFilter;
  gradientMap.magFilter = LinearFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

export interface WorldMaterialOptions {
  vertexColors?: boolean;
  color?: Color | string;
  emissiveAttr?: boolean;
  windAttr?: boolean;
  terrain?: boolean;
  /** Painterly noise variation without the overlay (roads, plazas). */
  groundNoise?: boolean;
  side?: Side;
  transparent?: boolean;
  opacity?: number;
  name?: string;
  /** Fade objects out near the camera's horizon / distance (vegetation LOD without popping). */
  distanceFade?: number;
}

const cache = new Map<string, Material>();

/**
 * The world material: MeshToonMaterial patched with
 *  - planet-aware hemisphere ambient (sky from local up = normalised world position),
 *  - subtle rim light for readable silhouettes,
 *  - optional per-vertex emissive (windows glow at night; values > 1 are always lit),
 *  - optional per-vertex wind sway (foliage, grass),
 *  - optional terrain overlay cube map (roads, plazas, mosaics painted at high resolution).
 */
export function createWorldMaterial(opts: WorldMaterialOptions = {}): MeshToonMaterial {
  const key = JSON.stringify({ ...opts, color: opts.color ? new Color(opts.color).getHexString() : undefined });
  const cached = cache.get(key);
  if (cached) return cached as MeshToonMaterial;

  const mat = new MeshToonMaterial({
    color: opts.color ? new Color(opts.color) : new Color('#ffffff'),
    vertexColors: opts.vertexColors ?? true,
    gradientMap: getToonGradient(),
    side: opts.side ?? FrontSide,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
  mat.name = opts.name ?? 'world';

  const useEmissive = !!opts.emissiveAttr;
  const useWind = !!opts.windAttr;
  const useTerrain = !!opts.terrain;
  const useNoise = useTerrain || !!opts.groundNoise;
  const fade = opts.distanceFade ?? 0;

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform float uWind;
varying vec3 vWorldPos;
varying vec3 vWorldNormalW;
${useEmissive ? 'attribute float aEmissive; varying float vEmissive;' : ''}
${useWind ? 'attribute float aWind;' : ''}
${fade > 0 ? 'uniform vec3 uPlayerPos; varying float vFade;' : ''}
`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
${useEmissive ? 'vEmissive = aEmissive;' : ''}
${
  useWind
    ? `{
  vec4 wpw = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  wpw = instanceMatrix * wpw;
#endif
  wpw = modelMatrix * wpw;
  float ph = dot(wpw.xyz, vec3(0.31, 0.27, 0.23));
  float sway = sin(uTime * 1.7 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.7) * 0.25 + sin(uTime*0.6 + ph*0.3)*0.4;
  float w = aWind * uWind;
  transformed.x += sway * w * 0.12;
  transformed.z += cos(uTime * 1.3 + ph * 1.3) * w * 0.07;
}`
    : ''
}
`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
{
  vec4 wp4 = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  wp4 = instanceMatrix * wp4;
  #endif
  wp4 = modelMatrix * wp4;
  vWorldPos = wp4.xyz;
  vec3 on = objectNormal;
  #ifdef USE_INSTANCING
  on = mat3(instanceMatrix) * on;
  #endif
  vWorldNormalW = normalize(mat3(modelMatrix) * on);
  ${fade > 0 ? `vFade = 1.0 - smoothstep(${(fade * 0.75).toFixed(2)}, ${fade.toFixed(2)}, distance(wp4.xyz, uPlayerPos));` : ''}
}
`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform float uHemiIntensity;
uniform float uNight;
uniform vec3 uGlowColor;
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uTime;
varying vec3 vWorldPos;
varying vec3 vWorldNormalW;
${useEmissive ? 'varying float vEmissive;' : ''}
${fade > 0 ? 'varying float vFade;' : ''}
${useTerrain ? 'uniform samplerCube uOverlay; uniform float uOverlayOn;' : 'uniform float uCamFade;'}
float cwHash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float cwNoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(cwHash(i+vec3(0,0,0)),cwHash(i+vec3(1,0,0)),f.x),mix(cwHash(i+vec3(0,1,0)),cwHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(cwHash(i+vec3(0,0,1)),cwHash(i+vec3(1,0,1)),f.x),mix(cwHash(i+vec3(0,1,1)),cwHash(i+vec3(1,1,1)),f.x),f.y),f.z); }
`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
${
  useNoise
    ? `{
  // Subtle painterly variation so large fields never look flat.
  float n1 = cwNoise(vWorldPos * 0.45);
  float n2 = cwNoise(vWorldPos * 2.1);
  diffuseColor.rgb *= 0.92 + 0.1 * n1 + 0.05 * n2;
}`
    : ''
}
${
  useTerrain
    ? `{
  vec3 dirW = normalize(vWorldPos);
  if (uOverlayOn > 0.5) {
    vec4 ov = textureCube(uOverlay, dirW);
    float grain = 0.95 + 0.06 * cwNoise(vWorldPos * 3.7);
    diffuseColor.rgb = diffuseColor.rgb * (1.0 - ov.a) + ov.rgb * grain; // premultiplied overlay
  }
}`
    : ''
}
${fade > 0 ? 'if (vFade < 0.02) discard;' : ''}
${
  useTerrain
    ? ''
    : `{
  // Dissolve geometry that gets between the camera and the player instead of clipping through it.
  float camD = distance(vWorldPos, cameraPosition);
  if (camD < uCamFade) {
    vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
    float bayer = mod(q.x * 4.0 + q.y * 7.0 + q.x * q.y * 3.0, 16.0) / 16.0;
    if (bayer > smoothstep(0.35, 1.0, camD / uCamFade)) discard;
  }
}`
}
`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
{
  vec3 upW = normalize(vWorldPos);
  float hemi = dot(normalize(vWorldNormalW), upW) * 0.5 + 0.5;
  vec3 amb = mix(uGroundColor, uSkyColor, hemi) * uHemiIntensity;
  reflectedLight.indirectDiffuse += amb * BRDF_Lambert(diffuseColor.rgb);
  // Rim light: brightens silhouettes facing away from the camera.
  float rim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
  reflectedLight.indirectDiffuse += uRimColor * rim * uRimStrength * diffuseColor.rgb;
}
`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
${
  useEmissive
    ? `{
  float e = vEmissive;
  if (e > 1.0) totalEmissiveRadiance += diffuseColor.rgb * (e - 1.0) * (0.6 + 0.6 * uNight);
  else totalEmissiveRadiance += uGlowColor * e * smoothstep(0.15, 0.85, uNight) * 1.25;
}`
    : ''
}
`,
      );
  };
  mat.customProgramCacheKey = () => key;
  cache.set(key, mat);
  return mat;
}

/** Unlit material for glowing things (screens, beacons, sky elements). */
export function createGlowMaterial(color: Color | string, opts: { transparent?: boolean; opacity?: number; map?: Texture } = {}): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: new Color(color),
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    map: opts.map ?? null,
    toneMapped: false,
  });
}
