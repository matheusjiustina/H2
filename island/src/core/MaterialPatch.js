import * as THREE from 'three';
import { U, GLSL_UNIFORMS, GLSL_COMMON, GLSL_WIND } from './Shared.js';

// Wind profiles: [frequency, bend amplitude, flutter frequency, flutter amplitude]
export const WIND_PROFILES = {
  grass: [1.9, 0.22, 4.2, 0.03],
  plant: [1.15, 0.14, 3.3, 0.04],
  palm: [0.42, 0.8, 1.7, 0.13],
  tree: [0.33, 0.3, 2.1, 0.045],
  cloth: [2.4, 0.06, 5.2, 0.1],
};

// Sun loop of lights_fragment_begin with cloud shadow + captured sun radiance.
const LIGHTS_BEGIN = (() => {
  let src = THREE.ShaderChunk.lights_fragment_begin;
  src = src.replace(
    'getSunLightInfo( sunLight, directLight );',
    'getSunLightInfo( sunLight, directLight );\n\t\tdirectLight.color *= _cloudSh;',
  );
  // capture the shadowed sun radiance right before it is applied (sun loop only)
  const sunIdx = src.indexOf('getSunLightInfo( sunLight, directLight );');
  const reIdx = src.indexOf('RE_Direct(', sunIdx);
  src = `${src.slice(0, reIdx)}_sunLit = directLight.color;\n\t\t${src.slice(reIdx)}`;
  return src;
})();

const WIND_VERTEX = /* glsl */ `
vec3 transformed = vec3( position );
#ifdef WIND_ENABLED
{
  #ifdef USE_INSTANCING
    mat4 _inst = modelMatrix * instanceMatrix;
  #else
    mat4 _inst = modelMatrix;
  #endif
  vec3 _root = _inst[3].xyz;
  vec3 _wp = (_inst * vec4(position, 1.0)).xyz;
  mat3 _m3 = mat3(_inst);
  vec3 _wn = normalize(_m3 * normal);
  vec3 _off = windOffset(_root, _wp, _wn, aWind, WIND_FREQ, WIND_AMP, WIND_FFREQ, WIND_FAMP);
  float _s2 = max(dot(_m3[0], _m3[0]), 1e-4);
  transformed += (transpose(_m3) * _off) / _s2;
}
#endif
`;

const GRASS_NORMAL = /* glsl */ `
float _gc = cos(aParams.x), _gs = sin(aParams.x);
vec3 objectNormal = vec3(_gc * normal.x + _gs * normal.z, normal.y, -_gs * normal.x + _gc * normal.z);
#ifdef USE_TANGENT
  vec3 objectTangent = vec3( tangent.xyz );
#endif
`;

const GRASS_VERTEX = /* glsl */ `
vec3 _gp = position * aOffset.w;
_gp = vec3(_gc * _gp.x + _gs * _gp.z, _gp.y, -_gs * _gp.x + _gc * _gp.z);
// gentle per instance lean
_gp.xz += aParams.z * _gp.y * vec2(_gc, _gs) * 0.35;
float _gdist = distance(aOffset.xz, cameraPosition.xz);
float _gfade = 1.0 - smoothstep(uGrassFade.x, uGrassFade.y, _gdist);
_gp *= _gfade;
vec3 transformed = _gp + aOffset.xyz;
{
  vec3 _wn = normalize(objectNormal);
  vec4 _w = aWind;
  vec3 _off = windOffset(aOffset.xyz, transformed, _wn, _w, WIND_FREQ, WIND_AMP, WIND_FFREQ, WIND_FAMP);
  vec2 _pd = transformed.xz - uPlayerPos.xz;
  float _pl = length(_pd);
  float _push = (1.0 - smoothstep(0.2, 1.0, _pl)) * _w.x * step(abs(transformed.y - uPlayerPos.y), 1.6);
  _off.xz += _pd / max(_pl, 1e-3) * _push * 0.34;
  _off.y -= _push * 0.2;
  transformed += _off * aOffset.w;
}
`;

const WORLD_POS_VERTEX = /* glsl */ `
{
  vec4 _wpos = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    _wpos = instanceMatrix * _wpos;
  #endif
  vWPos = (modelMatrix * _wpos).xyz;
}
#ifdef DEPTH_HACK
  gl_Position.z = gl_Position.z * 0.1 - gl_Position.w * 0.9;
#endif
`;

const FRAG_START = /* glsl */ `
float _cloudSh = 1.0;
vec3 _sunLit = vec3(0.0);
#ifdef WORLD_CLOUDS
  _cloudSh = cloudShadowAt(vWPos);
#endif
`;

const FOLIAGE_ALPHA = /* glsl */ `
#ifdef USE_ALPHATEST
  #if defined(FOLIAGE) && defined(USE_MAP)
  {
    vec2 _dx = dFdx(vMapUv * uMapSize), _dy = dFdy(vMapUv * uMapSize);
    float _mip = max(0.0, 0.5 * log2(max(dot(_dx, _dx), dot(_dy, _dy))));
    diffuseColor.a *= 1.0 + _mip * 0.3;
  }
  #endif
  if ( diffuseColor.a < alphaTest ) discard;
#endif
`;

const WETNESS = /* glsl */ `
#ifdef WORLD_WET
{
  vec3 _wn = inverseTransformDirection(normal, viewMatrix);
  float _up = smoothstep(-0.2, 0.7, _wn.y);
  float _wet = uWetness * mix(0.35, 1.0, _up) * shelterMask(vWPos) * uPorosity;
  diffuseColor.rgb *= mix(1.0, 0.55, _wet);
  roughnessFactor = mix(roughnessFactor, max(0.07, roughnessFactor * 0.3), _wet);
}
#endif
`;

const AFTER_LIGHTS = /* glsl */ `
#ifdef WORLD_TRANSLUCENCY
{
  vec3 _sv = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float _back = pow(clamp(dot(geometryViewDir, -_sv), 0.0, 1.0), 3.0);
  float _thru = clamp(dot(-geometryNormal, _sv), 0.0, 1.0);
  reflectedLight.directDiffuse += _sunLit * diffuseColor.rgb * (_back * 0.9 + _thru * 0.35) * uTranslucency;
}
#endif
#ifdef WORLD_CAUSTICS
if (vWPos.y < uWaterLevel + 0.25 && uSunDir.y > 0.0) {
  float _depth = uWaterLevel - vWPos.y;
  float _c = causticsAt(vWPos) * smoothstep(-0.2, 0.35, _depth) * exp(-_depth * 0.09);
  vec3 _wn2 = inverseTransformDirection(normal, viewMatrix);
  reflectedLight.directDiffuse += _sunLit * diffuseColor.rgb * _c * (0.35 + 0.65 * max(_wn2.y, 0.0)) * 0.55;
}
#endif
`;

const AFTER_AO = /* glsl */ `
#ifdef WORLD_CANOPY
{
  vec4 _td = terrainData(vWPos.xz);
  float _canopy = texture2D(uTerrainSplatB, terrainUV(vWPos.xz)).g;
  float _above = vWPos.y - _td.r;
  float _occ = _canopy * (1.0 - smoothstep(2.0, 16.0, _above));
  float _ao = 1.0 - 0.55 * _occ;
  reflectedLight.indirectDiffuse *= _ao;
  // light filtered through the leaves: a soft green fill keeps the understory readable
  reflectedLight.indirectDiffuse += diffuseColor.rgb * uAmbient * vec3(0.5, 0.78, 0.36) * 0.32 * _occ;
  reflectedLight.indirectSpecular *= _ao;
  reflectedLight.directDiffuse *= mix(1.0, 0.85, _occ);
}
#endif
`;

const FOG_REPLACE = /* glsl */ `
#ifdef WORLD_FOG
  if (vWPos.y < uWaterLevel && uUnderwater < 0.5) {
    float _d = uWaterLevel - vWPos.y;
    gl_FragColor.rgb *= exp(-_d * vec3(0.22, 0.055, 0.04));
  }
  gl_FragColor.rgb = applyAtmosphere(gl_FragColor.rgb, vWPos);
#endif
`;

/**
 * Inject the world lighting model into a built-in three material.
 * Options:
 *  wind: 'grass'|'plant'|'palm'|'tree'|'cloth'
 *  translucency (0..1), wet (porosity 0..1), caustics, canopy, clouds, fog
 *  foliage (alpha coverage + no normal flip), depthHack (view model), grassInstanced
 *  uniforms (extra), vertex/fragment hooks: fn(shader)
 */
export function patchMaterial(material, opts = {}) {
  const o = {
    wind: null, translucency: 0, wet: 0.8, caustics: true, canopy: true, clouds: true, fog: true,
    foliage: false, depthHack: false, grassInstanced: false, noFlip: false, key: '', ...opts,
  };
  const defines = material.defines || (material.defines = {});
  if (o.wind) {
    const p = WIND_PROFILES[o.wind];
    defines.WIND_ENABLED = '';
    defines.WIND_FREQ = p[0].toFixed(3);
    defines.WIND_AMP = p[1].toFixed(3);
    defines.WIND_FFREQ = p[2].toFixed(3);
    defines.WIND_FAMP = p[3].toFixed(3);
    if (o.wind === 'grass') defines.WIND_GRASS = '';
  }
  if (o.translucency > 0) defines.WORLD_TRANSLUCENCY = '';
  if (o.wet > 0) defines.WORLD_WET = '';
  if (o.caustics) defines.WORLD_CAUSTICS = '';
  if (o.canopy) defines.WORLD_CANOPY = '';
  if (o.clouds) defines.WORLD_CLOUDS = '';
  if (o.fog) defines.WORLD_FOG = '';
  if (o.foliage) defines.FOLIAGE = '';
  if (o.depthHack) defines.DEPTH_HACK = '';

  const extra = {
    uTranslucency: { value: o.translucency },
    uPorosity: { value: o.wet },
    uMapSize: { value: new THREE.Vector2(512, 512) },
    uGrassFade: { value: new THREE.Vector2(40, 55) },
    ...(o.uniforms || {}),
  };
  material.userData.patchUniforms = extra;
  if (material.map && material.map.image) {
    const img = material.map.image;
    extra.uMapSize.value.set(img.width || 512, img.height || 512);
  }

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, extra);
    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;

    vs = vs.replace('#include <common>', `#include <common>
${GLSL_UNIFORMS}
${GLSL_COMMON}
${GLSL_WIND}
uniform vec2 uGrassFade;
attribute vec4 aWind;
${o.grassInstanced ? 'attribute vec4 aOffset;\nattribute vec4 aParams;' : ''}
varying vec3 vWPos;`);
    if (o.grassInstanced) {
      vs = vs.replace('#include <beginnormal_vertex>', GRASS_NORMAL);
      vs = vs.replace('#include <begin_vertex>', GRASS_VERTEX);
    } else {
      vs = vs.replace('#include <begin_vertex>', WIND_VERTEX);
    }
    vs = vs.replace('#include <project_vertex>', `#include <project_vertex>\n${WORLD_POS_VERTEX}`);

    fs = fs.replace('#include <common>', `#include <common>
${GLSL_UNIFORMS}
${GLSL_COMMON}
uniform float uTranslucency;
uniform float uPorosity;
uniform vec2 uMapSize;
varying vec3 vWPos;`);
    fs = fs.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FRAG_START}`);
    fs = fs.replace('#include <alphatest_fragment>', FOLIAGE_ALPHA);
    if (o.foliage || o.noFlip) {
      fs = fs.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifndef FLAT_SHADED\nnormal = normalize(vNormal);\n#endif');
    }
    fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${WETNESS}`);
    fs = fs.replace('#include <lights_fragment_begin>', LIGHTS_BEGIN);
    fs = fs.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${AFTER_LIGHTS}`);
    fs = fs.replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${AFTER_AO}`);
    fs = fs.replace('#include <fog_fragment>', FOG_REPLACE);

    shader.vertexShader = vs;
    shader.fragmentShader = fs;
    if (o.vertex) o.vertex(shader);
    if (o.fragment) o.fragment(shader);
  };
  const key = `world|${o.wind}|${o.translucency > 0}|${o.wet > 0}|${o.caustics}|${o.canopy}|${o.clouds}|${o.fog}|${o.foliage}|${o.depthHack}|${o.grassInstanced}|${o.noFlip}|${o.key}`;
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
  return material;
}

/** Depth material (shadow casting) with matching wind deformation and alpha test. */
export function makeDepthMaterial({ wind = null, map = null, alphaTest = 0.5, grassInstanced = false } = {}) {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: map ? alphaTest : 0, side: THREE.DoubleSide });
  const defines = (mat.defines = {});
  if (wind) {
    const p = WIND_PROFILES[wind];
    defines.WIND_ENABLED = '';
    defines.WIND_FREQ = p[0].toFixed(3);
    defines.WIND_AMP = p[1].toFixed(3);
    defines.WIND_FFREQ = p[2].toFixed(3);
    defines.WIND_FAMP = p[3].toFixed(3);
  }
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, { uGrassFade: { value: new THREE.Vector2(40, 55) } });
    let vs = shader.vertexShader;
    vs = vs.replace('#include <common>', `#include <common>
${GLSL_UNIFORMS}
${GLSL_COMMON}
${GLSL_WIND}
uniform vec2 uGrassFade;
attribute vec4 aWind;
${grassInstanced ? 'attribute vec4 aOffset;\nattribute vec4 aParams;' : ''}`);
    if (grassInstanced) {
      vs = vs.replace('#include <begin_vertex>', `${GRASS_NORMAL}\n${GRASS_VERTEX}`);
    } else {
      vs = vs.replace('#include <begin_vertex>', WIND_VERTEX);
    }
    shader.vertexShader = vs;
  };
  mat.customProgramCacheKey = () => `depth|${wind}|${!!map}|${grassInstanced}`;
  return mat;
}
