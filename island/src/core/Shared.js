import * as THREE from 'three';

// Render layers
export const LAYER = {
  WORLD: 0, // opaque, appears in planar reflections
  DETAIL: 1, // opaque, main view only (grass, small props, view model)
  WATER: 2,
  FX: 3, // transparent effects drawn after water
  REFLECT_LITE: 4, // subset reflected on medium quality (sky, terrain, distant land)
  VIEWMODEL: 5, // first person hands / held items, drawn last over a cleared depth buffer
};

/**
 * Global uniforms shared by reference across every world material so time of day,
 * weather and wind propagate without touching individual materials.
 */
export const U = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() }, // light direction (sun or moon)
  uSunColor: { value: new THREE.Color(3, 2.9, 2.7) }, // direct light radiance
  uSunDisk: { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() }, // actual sun position (for sky)
  uMoonDir: { value: new THREE.Vector3(-0.3, 0.6, -0.4).normalize() },
  uSkyZenith: { value: new THREE.Color(0.08, 0.25, 0.62) },
  uSkyHorizon: { value: new THREE.Color(0.55, 0.75, 0.92) },
  uSkyGround: { value: new THREE.Color(0.12, 0.13, 0.1) },
  uSunGlow: { value: new THREE.Color(1.0, 0.85, 0.6) },
  uSunsetColor: { value: new THREE.Color(0, 0, 0) },
  uFogColor: { value: new THREE.Color(0.6, 0.75, 0.88) },
  uFogSunColor: { value: new THREE.Color(1.0, 0.9, 0.7) },
  uFogDensity: { value: 0.00032 },
  uFogHeightFalloff: { value: 0.011 },
  uAmbient: { value: new THREE.Color(0.4, 0.5, 0.6) }, // average sky irradiance (for custom shaders)
  uNight: { value: 0 },
  uWind: { value: new THREE.Vector4(0.8, -0.6, 0.35, 0.5) }, // dir.xz, strength 0..1, gustiness
  uWetness: { value: 0 },
  uRain: { value: 0 },
  uLightning: { value: 0 },
  uWaterLevel: { value: 0 },
  uTerrainData: { value: null },
  uTerrainSplatB: { value: null },
  uTerrainUV: { value: new THREE.Vector4(1 / 1024, 1 / 1024, 0.5, 0.5) },
  uNoiseTex: { value: null },
  uCausticsTex: { value: null },
  uCloudCover: { value: 0.35 },
  uCloudOffset: { value: new THREE.Vector2(0, 0) },
  uCloudShadow: { value: 0.55 },
  uCloudLit: { value: new THREE.Color(1, 1, 1) },
  uCloudDark: { value: new THREE.Color(0.55, 0.6, 0.7) },
  uUnderwater: { value: 0 },
  uUnderwaterColor: { value: new THREE.Color(0.02, 0.2, 0.24) },
  uPlayerPos: { value: new THREE.Vector3() },
  uShelter: { value: new THREE.Vector4(-3.6, 1.0, 3.6, 7.8) }, // xmin, zmin, xmax, zmax (roof footprint)
  uShelterY: { value: new THREE.Vector2(2.3, 4.6) }, // floor .. roof height
  uExposure: { value: 1 },
};

// ---------------------------------------------------------------------------
// GLSL library injected into world shaders.
// ---------------------------------------------------------------------------
export const GLSL_UNIFORMS = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSunDisk;
uniform vec3 uMoonDir;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
uniform vec3 uSunGlow;
uniform vec3 uSunsetColor;
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform float uFogDensity;
uniform float uFogHeightFalloff;
uniform vec3 uAmbient;
uniform float uNight;
uniform vec4 uWind;
uniform float uWetness;
uniform float uRain;
uniform float uLightning;
uniform float uWaterLevel;
uniform sampler2D uTerrainData;
uniform sampler2D uTerrainSplatB;
uniform vec4 uTerrainUV;
uniform sampler2D uNoiseTex;
uniform sampler2D uCausticsTex;
uniform float uCloudCover;
uniform vec2 uCloudOffset;
uniform float uCloudShadow;
uniform vec3 uCloudLit;
uniform vec3 uCloudDark;
uniform float uUnderwater;
uniform vec3 uUnderwaterColor;
uniform vec3 uPlayerPos;
uniform vec4 uShelter;
uniform vec2 uShelterY;
`;

export const GLSL_COMMON = /* glsl */ `
#ifndef WORLD_COMMON
#define WORLD_COMMON
float w_hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 w_hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec2 terrainUV(vec2 xz) { return xz * uTerrainUV.xy + uTerrainUV.zw; }
vec4 terrainData(vec2 xz) { return texture2D(uTerrainData, terrainUV(xz)); }

float shelterMask(vec3 wp) {
  // 0 under the camp roof, 1 outside
  vec2 a = smoothstep(uShelter.xy - 0.15, uShelter.xy + 0.35, wp.xz) * (1.0 - smoothstep(uShelter.zw - 0.35, uShelter.zw + 0.15, wp.xz));
  float inside = a.x * a.y * step(wp.y, uShelterY.y - 0.05) * step(uShelterY.x - 0.6, wp.y);
  return 1.0 - inside;
}

// Cloud layer shared by sky, cloud shadows and reflections. p in kilometres.
float cloudDensity(vec2 p) {
  vec2 q = p + uCloudOffset;
  float n = texture2D(uNoiseTex, q * 0.11).r * 0.55
          + texture2D(uNoiseTex, q * 0.29 + vec2(0.31, 0.17)).g * 0.30
          + texture2D(uNoiseTex, q * 0.83 - uCloudOffset * 0.6).b * 0.15;
  float cov = clamp(uCloudCover, 0.0, 1.0);
  float lo = mix(0.78, 0.18, cov);
  return smoothstep(lo, lo + mix(0.18, 0.4, cov), n);
}
const float CLOUD_HEIGHT = 1.6; // km

float cloudShadowAt(vec3 wp) {
  vec3 L = normalize(uSunDir);
  float t = (CLOUD_HEIGHT * 1000.0 - wp.y) / max(L.y, 0.08);
  vec2 p = (wp.xz + L.xz * t) * 0.001;
  float d = cloudDensity(p);
  return 1.0 - uCloudShadow * smoothstep(0.05, 0.75, d);
}

// Analytic sky radiance (without clouds / sun disc).
vec3 skyRadiance(vec3 dir) {
  float y = dir.y;
  float yy = max(y, 0.0);
  vec3 col = mix(uSkyHorizon, uSkyZenith, pow(yy, 0.42));
  col = mix(col, uFogColor, exp(-yy * 14.0) * 0.55);
  float mu = max(dot(dir, uSunDisk), 0.0);
  col += uSunGlow * (pow(mu, 10.0) * 0.28 + pow(mu, 120.0) * 0.6);
  col += uSunsetColor * pow(mu, 2.5) * exp(-yy * 7.0);
  col += vec3(0.6, 0.65, 0.8) * uLightning * 0.8;
  return col;
}

vec3 skyWithClouds(vec3 dir, vec3 origin) {
  vec3 col = skyRadiance(dir);
  if (dir.y > 0.012) {
    float t = (CLOUD_HEIGHT * 1000.0 - origin.y) / dir.y;
    vec2 p = (origin.xz + dir.xz * t) * 0.001;
    float d = cloudDensity(p);
    vec3 L = normalize(uSunDisk);
    float dl = cloudDensity(p + L.xz * 0.06);
    float lit = clamp(0.55 + (d - dl) * 2.5, 0.0, 1.0);
    vec3 cc = mix(uCloudDark, uCloudLit, lit);
    float mu = max(dot(dir, L), 0.0);
    cc += uSunGlow * pow(mu, 8.0) * (1.0 - d) * 0.8;
    float fade = smoothstep(0.012, 0.18, dir.y);
    col = mix(col, cc, d * fade);
  }
  return col;
}

// Height based atmospheric perspective / underwater fog.
vec3 applyAtmosphere(vec3 col, vec3 wp) {
  vec3 rd = wp - cameraPosition;
  float dist = length(rd);
  rd /= max(dist, 1e-4);
  if (uUnderwater > 0.5) {
    float f = 1.0 - exp(-dist * 0.075);
    vec3 trans = exp(-dist * vec3(0.24, 0.07, 0.055));
    return mix(col * trans, uUnderwaterColor, f);
  }
  float k = uFogHeightFalloff;
  float h0 = max(cameraPosition.y, -2.0);
  float dy = rd.y * dist;
  float fogInt = uFogDensity * exp(-k * h0) * dist;
  if (abs(dy) > 0.01) fogInt *= (1.0 - exp(-k * dy)) / (k * dy);
  vec3 f = 1.0 - exp(-fogInt * vec3(0.72, 0.86, 1.08));
  float mu = max(dot(rd, uSunDisk), 0.0);
  vec3 fc = mix(uFogColor, uFogSunColor, pow(mu, 6.0));
  return col * (1.0 - f) + fc * f;
}

// Caustic intensity at a submerged world position.
float causticsAt(vec3 wp) {
  float depth = uWaterLevel - wp.y;
  vec3 L = normalize(uSunDir);
  vec2 p = wp.xz + L.xz / max(L.y, 0.25) * depth;
  float s = 0.11;
  float a = texture2D(uCausticsTex, p * s + vec2(uTime * 0.021, uTime * 0.013)).r;
  float b = texture2D(uCausticsTex, p * s * 1.37 - vec2(uTime * 0.017, -uTime * 0.024)).r;
  float c = min(a, b);
  return c * c * 3.2;
}
#endif
`;

export const GLSL_WIND = /* glsl */ `
#ifndef WORLD_WIND
#define WORLD_WIND
// Returns a world space offset for a vegetation vertex.
// root: instance origin (world), wp: vertex world pos, w: (bend, flutter, phase, branch)
vec3 windOffset(vec3 root, vec3 wp, vec3 wn, vec4 w, float freq, float amp, float fFreq, float fAmp) {
  vec2 dir = normalize(uWind.xy + 1e-5);
  float strength = uWind.z;
  float gust = texture2D(uNoiseTex, root.xz * 0.0035 - dir * uTime * 0.028).r;
  gust = mix(0.6, 0.35 + gust * 1.3, uWind.w);
  float s = strength * gust;
  float ph = w.z * 6.2831 + dot(root.xz, vec2(0.131, 0.173));
  float osc = sin(uTime * freq + ph) * 0.4 + sin(uTime * freq * 0.53 + ph * 1.7) * 0.25 + 0.55;
  vec3 off = vec3(dir.x, 0.0, dir.y) * s * osc * w.x * amp;
  off += vec3(-dir.y, 0.0, dir.x) * sin(uTime * freq * 1.31 + ph * 2.3) * s * w.x * amp * 0.28;
  float fl = sin(uTime * fFreq + ph * 3.0 + dot(wp, vec3(1.7, 1.3, 2.1))) + 0.5 * sin(uTime * fFreq * 2.3 + dot(wp, vec3(3.1, 2.0, 1.4)));
  off += wn * fl * w.y * fAmp * (0.25 + s * 1.2);
  // branch level sway
  off.y += sin(uTime * freq * 1.9 + ph * 4.0) * w.w * amp * 0.12 * (0.3 + s);
  return off;
}
#endif
`;

export function bindShared(shader, names = null) {
  const keys = names || Object.keys(U);
  for (const k of keys) shader.uniforms[k] = U[k];
}
