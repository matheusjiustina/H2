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
  /** Cool colour added to the shaded side of every surface (illustrated, hue-shifted shadows). */
  uShadowTint: { value: new Color('#3f4f96').multiplyScalar(0.55) },
  /** 0 = flat painted look off, 1 = full drawn texture (ground patches, leaf strokes). */
  uDrawn: { value: 1 },
};

let gradientMap: DataTexture | null = null;

/** Cel ramp: two flat tones with a crisp terminator, plus a faint highlight band (illustrated look). */
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
    const v = 0.44 + 0.46 * ss(0.47, 0.53, x) + 0.1 * ss(0.8, 0.86, x);
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
${useWind ? 'attribute float aWind; varying float vWindW;' : ''}
${fade > 0 ? 'uniform vec3 uPlayerPos; varying float vFade;' : ''}
`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
${useEmissive ? 'vEmissive = aEmissive;' : ''}
${useWind ? 'vWindW = aWind;' : ''}
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
${useWind ? 'varying float vWindW;' : ''}
uniform vec3 uShadowTint;
uniform float uDrawn;
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
  useTerrain
    ? `{
  // Drawn ground: flat patches of sun-bleached and shaded ground with inked borders, the way a
  // background painter blocks in a field, plus small pebble/tuft specks and strata on steep slopes.
  if (uDrawn > 0.001) {
  vec3 wp = vWorldPos;
  float camD = distance(wp, cameraPosition);
  float near = 1.0 - smoothstep(26.0, 70.0, camD);
  float n = cwNoise(wp * 0.17) * 0.62 + cwNoise(wp * 0.53 + 7.3) * 0.38;
  float aw = fwidth(n) * 1.1 + 0.0015;
  float bleach = smoothstep(0.645 - aw, 0.645 + aw, n);
  float shade = 1.0 - smoothstep(0.315 - aw, 0.315 + aw, n);
  vec3 base = diffuseColor.rgb;
  vec3 bleachCol = base * vec3(1.16, 1.12, 0.86) + vec3(0.05, 0.04, 0.0);
  vec3 shadeCol = base * vec3(0.74, 0.84, 0.86);
  base = mix(base, bleachCol, bleach * uDrawn);
  base = mix(base, shadeCol, shade * uDrawn);
  float rim = 1.0 - smoothstep(0.0, aw * 1.5, abs(n - 0.645));
  base = mix(base, base * vec3(0.5, 0.52, 0.6), rim * 0.8 * near * uDrawn);
  // Specks: little pebbles and tufts drawn as dots.
  float sp = cwNoise(wp * 3.1 + 11.0);
  float sw = fwidth(sp) * 1.2 + 0.002;
  float speck = smoothstep(0.83 - sw, 0.83 + sw, sp) * near;
  base = mix(base, base * vec3(0.62, 0.66, 0.6), speck * 0.7 * uDrawn);
  // Strata strokes on steep ground (cliffs, cuttings).
  float slope = 1.0 - clamp(dot(normalize(vWorldNormalW), normalize(wp)), 0.0, 1.0);
  float st = cwNoise(vec3(wp.x * 0.6, length(wp) * 3.2, wp.z * 0.6));
  float stw = fwidth(st) * 1.2 + 0.002;
  float strata = (1.0 - smoothstep(0.0, stw, abs(st - 0.55))) * smoothstep(0.32, 0.5, slope) * near;
  base = mix(base, base * vec3(0.48, 0.46, 0.5), strata * 0.85 * uDrawn);
  diffuseColor.rgb = base;
  }
}`
    : useNoise
      ? `{
  // Paved surfaces: flat repair patches with inked rims and hairline cracks, drawn near the camera.
  float n1 = cwNoise(vWorldPos * 0.45);
  float n2 = cwNoise(vWorldPos * 2.1);
  diffuseColor.rgb *= 0.96 + 0.05 * n1 + 0.03 * n2;
  float near = 1.0 - smoothstep(18.0, 45.0, distance(vWorldPos, cameraPosition));
  float pn = cwNoise(vWorldPos * 0.33 + 3.1);
  float pw = fwidth(pn) * 1.1 + 0.002;
  float patch_ = smoothstep(0.75 - pw, 0.75 + pw, pn);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.86, 0.87, 0.9), patch_ * uDrawn);
  float pr = 1.0 - smoothstep(0.0, pw * 1.3, abs(pn - 0.75));
  float cn = cwNoise(vWorldPos * 1.6 + 9.0);
  float cw = fwidth(cn) * 1.1 + 0.002;
  float crack = (1.0 - smoothstep(0.0, cw, abs(cn - 0.5))) * smoothstep(0.55, 0.75, cwNoise(vWorldPos * 0.21 + 1.7));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.58, 0.59, 0.63), max(pr * 0.4, crack * 0.6) * near * uDrawn);
}`
      : ''
}
${
  useWind
    ? `if (vWindW > 0.2 && uDrawn > 0.001) {
  // Foliage: inked leaf-cluster contours (narrow bands of a noise field read as drawn leaf edges).
  float camD = distance(vWorldPos, cameraPosition);
  float near = 1.0 - smoothstep(22.0, 60.0, camD);
  float m = cwNoise(vWorldPos * 4.2);
  float mw = fwidth(m) * 1.15 + 0.002;
  float stroke = 1.0 - smoothstep(0.0, mw, abs(m - 0.62));
  float stroke2 = 1.0 - smoothstep(0.0, mw, abs(m - 0.36));
  float leafy = smoothstep(0.2, 0.45, vWindW);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.42, 0.5, 0.48), max(stroke, stroke2 * 0.6) * 0.8 * near * leafy * uDrawn);
  diffuseColor.rgb *= 1.0 + (step(0.62, m) * 0.07 - step(m, 0.36) * 0.06) * leafy * uDrawn;
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
    // Paths are painted as flat shapes with an inked border instead of soft airbrushed blends.
    float a = ov.a;
    float aw = fwidth(a) * 0.9 + 0.012;
    float shape = smoothstep(0.4 - aw, 0.4 + aw, a);
    vec3 ovCol = ov.rgb / max(a, 0.02);
    vec3 soft = diffuseColor.rgb * (1.0 - a) + ov.rgb * grain;
    vec3 flat_ = mix(diffuseColor.rgb, ovCol * grain, shape);
    diffuseColor.rgb = mix(soft, flat_, uDrawn);
    float border = (1.0 - smoothstep(0.0, aw * 1.4, abs(a - 0.4))) * (1.0 - smoothstep(30.0, 70.0, distance(vWorldPos, cameraPosition)));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.56, 0.52, 0.5), border * 0.7 * uDrawn);
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
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
${
  useWind
    ? `if (vWindW > 0.2 && uDrawn > 0.001) {
  vec3 q = vWorldPos * 1.9;
  vec3 pn = vec3(cwNoise(q), cwNoise(q + 17.1), cwNoise(q + 31.7)) - 0.5;
  normal = normalize(normal + pn * 1.25 * smoothstep(0.2, 0.45, vWindW) * uDrawn);
}`
    : ''
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
  #if NUM_DIR_LIGHTS > 0
  // Hue-shifted shadows: the less sun a surface receives, the more cool tint it takes.
  float sunI = max(dot(directionalLights[0].color, vec3(0.3333)), 1e-3);
  float lit = clamp(dot(reflectedLight.directDiffuse, vec3(0.3333)) / (max(dot(diffuseColor.rgb, vec3(0.3333)), 1e-3) * sunI * RECIPROCAL_PI), 0.0, 1.0);
  reflectedLight.indirectDiffuse += uShadowTint * diffuseColor.rgb * (1.0 - lit);
  #endif
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
