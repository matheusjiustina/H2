import * as THREE from 'three';
import { U, GLSL_UNIFORMS, GLSL_COMMON, LAYER } from '../core/Shared.js';

const G = 9.81;

// Gerstner wave set: [dirX, dirZ, wavelength, steepness, swell(1)/wind(0)]
const WAVES = [
  [-0.22, 1.0, 46.0, 0.075, 1],
  [0.38, 1.0, 29.0, 0.065, 1],
  [-0.72, 0.69, 13.5, 0.075, 1],
  [0.9, 0.44, 8.2, 0.07, 0],
  [0.18, -1.0, 4.7, 0.06, 0],
  [-0.95, -0.31, 2.8, 0.05, 0],
];
const NW = WAVES.length;
for (const w of WAVES) {
  const l = Math.hypot(w[0], w[1]);
  w[0] /= l; w[1] /= l;
}

const WAVE_GLSL = /* glsl */ `
uniform vec4 uWaves[${NW}];
uniform float uWaveSwell[${NW}];
uniform float uWaveScale;
uniform float uWindWaves;

float waveAmp(int i, float energy) {
  float k = 6.2831853 / uWaves[i].z;
  float a = uWaves[i].w / k;
  float s = uWaveSwell[i] > 0.5 ? energy : mix(0.45, 1.0, energy) * uWindWaves;
  return a * s * uWaveScale;
}

// Gerstner displacement at grid position p. lodSpacing attenuates sub-sampled waves.
vec3 gerstner(vec2 p, float energy, float lodSpacing) {
  vec3 d = vec3(0.0);
  for (int i = 0; i < ${NW}; i++) {
    vec2 D = uWaves[i].xy;
    float L = uWaves[i].z;
    float k = 6.2831853 / L;
    float c = sqrt(${G.toFixed(2)} / k);
    float a = waveAmp(i, energy) * smoothstep(lodSpacing * 2.0, lodSpacing * 4.0, L);
    float f = k * (dot(D, p) - c * uTime);
    float cf = cos(f);
    d.x += D.x * a * cf;
    d.z += D.y * a * cf;
    d.y += a * sin(f);
  }
  return d;
}

// analytic normal of the Gerstner surface
vec3 gerstnerNormal(vec2 p, float energy, float lodSpacing, out float crest) {
  vec3 n = vec3(0.0, 1.0, 0.0);
  crest = 0.0;
  for (int i = 0; i < ${NW}; i++) {
    vec2 D = uWaves[i].xy;
    float L = uWaves[i].z;
    float k = 6.2831853 / L;
    float c = sqrt(${G.toFixed(2)} / k);
    float a = waveAmp(i, energy) * smoothstep(lodSpacing * 2.0, lodSpacing * 4.0, L);
    float f = k * (dot(D, p) - c * uTime);
    float wa = k * a;
    float cf = cos(f), sf = sin(f);
    n.x -= D.x * wa * cf;
    n.z -= D.y * wa * cf;
    n.y -= wa * sf;
    crest += wa * sf;
  }
  return normalize(n);
}

float swash(vec2 p, float shore) {
  float m = 1.0 - smoothstep(0.0, 14.0, abs(shore));
  return 0.075 * sin(uTime * 0.62 + shore * 0.35 + sin(p.x * 0.05) * 1.3) * m;
}
`;

const OCEAN_VERT = /* glsl */ `
${GLSL_UNIFORMS}
${GLSL_COMMON}
${WAVE_GLSL}
uniform vec3 uCenter;
uniform sampler2D uRipples;
uniform vec4 uRippleArea;
varying vec3 vWorld;
varying vec2 vGrid;
varying float vViewZ;
varying float vLod;
varying vec4 vTerr;
void main() {
  vec2 grid = position.xz + uCenter.xz;
  float r = length(position.xz);
  float spacing = 0.036 * r + 0.3;
  vec4 td = textureLod(uTerrainData, terrainUV(grid), 0.0);
  vec3 d = gerstner(grid, td.a, spacing);
  d.y += swash(grid, td.b);
  vec2 ruv = (grid - uRippleArea.xy) / uRippleArea.z + 0.5;
  // ripples only shade the water right around the eye: lifting the surface there (a swimmer's
  // own splashes) would put it over the camera, which the CPU height query can't see
  if (ruv.x > 0.0 && ruv.y > 0.0 && ruv.x < 1.0 && ruv.y < 1.0) d.y += textureLod(uRipples, ruv, 0.0).r * 0.6 * smoothstep(0.7, 3.0, r);
  vec3 wp = vec3(grid.x, uWaterLevel, grid.y) + d;
  vWorld = wp;
  vGrid = grid;
  vLod = spacing;
  vTerr = td;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const OCEAN_FRAG = /* glsl */ `
${GLSL_UNIFORMS}
${GLSL_COMMON}
${WAVE_GLSL}
uniform sampler2D uRefraction;
uniform sampler2D uReflection;
uniform mat4 uReflMatrix;
uniform float uHasReflection; // planar reflection weight (0 = analytic sky only)
uniform vec2 uResolution;
uniform sampler2D uNormalMap;
uniform sampler2D uFoamTex;
uniform sampler2D uRipples;
uniform vec4 uRippleArea;
uniform float uDetailLayers;
uniform float uFar;
uniform vec4 uBoat; // x, z, heading, active
varying vec3 vWorld;
varying vec2 vGrid;
varying float vViewZ;
varying float vLod;
varying vec4 vTerr;

vec2 rainRipples(vec2 p) {
  vec2 acc = vec2(0.0);
  for (int layer = 0; layer < 2; layer++) {
    float sc = layer == 0 ? 1.6 : 2.3;
    vec2 q = p * sc + float(layer) * 13.7;
    vec2 cell = floor(q);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 c = cell + vec2(float(x), float(y));
      vec2 h = w_hash22(c);
      float t = fract(uTime * (0.9 + h.x * 0.6) + h.y);
      vec2 center = c + 0.15 + h * 0.7;
      vec2 dv = q - center;
      float d = length(dv);
      float radius = t * 0.75;
      float ring = sin((d - radius) * 26.0) * smoothstep(0.12, 0.0, abs(d - radius)) * (1.0 - t) * (1.0 - t);
      acc += dv / max(d, 1e-3) * ring;
    }
  }
  return acc * 0.22;
}

void main() {
  vec3 P = vWorld;
  vec2 grid = vGrid;
  vec3 toCam = cameraPosition - P;
  float distCam = length(toCam);
  vec3 V = toCam / distCam;
  bool below = uUnderwater > 0.5;
  // keep the water out of the skiff's hull
  if (uBoat.w > 0.5 && !below) {
    vec2 bd = P.xz - uBoat.xy;
    float bc = cos(uBoat.z), bs = sin(uBoat.z);
    float lz = bd.x * bs + bd.y * bc;
    float lx = bd.x * bc - bd.y * bs;
    float bt = (lz + 2.2) / 4.4;
    if (bt > 0.02 && bt < 0.97) {
      float hb = 0.76 * pow(sin(3.14159 * (0.25 + 0.75 * bt)), 0.75) - 0.05;
      if (abs(lx) < hb) discard;
    }
  }
  vec4 td = terrainData(grid);
  float energy = td.a;
  float depthV = max(P.y - td.r, 0.0);
  float shore = td.b;

  // ----- normal: analytic gerstner + scrolling detail + rain + interaction ripples
  float crest;
  vec3 N = gerstnerNormal(grid, energy, vLod * 0.35, crest);
  vec2 wd = uWind.xy;
  float wind = uWind.z;
  float far = smoothstep(30.0, 600.0, distCam);
  // break up the regular swell seen from the air: the slope strength wanders in broad patches
  // (shading only - the displaced surface the physics reads is untouched)
  float macro = texture2D(uNoiseTex, grid * 0.0021 + wd * uTime * 0.002).r * 0.6 + texture2D(uNoiseTex, grid * 0.0047 - wd * uTime * 0.003 + 0.4).g * 0.4;
  N.xz *= mix(0.4, 1.3, macro) * (1.0 - far * 0.45);
  N = normalize(N);
  vec2 n1 = texture2D(uNormalMap, grid * 0.045 + wd * uTime * 0.022).xy * 2.0 - 1.0;
  vec2 n2 = texture2D(uNormalMap, grid * 0.13 + vec2(-wd.y, wd.x) * uTime * 0.04 + 0.37).xy * 2.0 - 1.0;
  vec2 det = n1 * 0.55 + n2 * 0.45;
  if (uDetailLayers > 2.5) {
    vec2 n3 = texture2D(uNormalMap, grid * 0.37 - wd * uTime * 0.07 + 0.71).xy * 2.0 - 1.0;
    det += n3 * 0.3 * (1.0 - far);
  }
  float detStrength = (0.42 + wind * 0.85) * mix(1.0, 0.35, far) * mix(0.55, 1.0, smoothstep(0.0, 2.5, depthV));
  det *= detStrength;
  // a broad, slow layer that reads at altitude
  det += (texture2D(uNormalMap, grid * 0.009 + wd * uTime * 0.005 + 0.13).xy * 2.0 - 1.0) * 0.32 * far * (0.6 + wind);
  if (uRain > 0.01) det += rainRipples(grid) * uRain * (1.0 - far) * 1.3;
  vec2 ruv = (grid - uRippleArea.xy) / uRippleArea.z + 0.5;
  float simFoam = 0.0;
  if (ruv.x > 0.0 && ruv.y > 0.0 && ruv.x < 1.0 && ruv.y < 1.0) {
    float tx = uRippleArea.w;
    vec4 rc = texture2D(uRipples, ruv);
    float hx = texture2D(uRipples, ruv + vec2(tx, 0.0)).r - texture2D(uRipples, ruv - vec2(tx, 0.0)).r;
    float hz = texture2D(uRipples, ruv + vec2(0.0, tx)).r - texture2D(uRipples, ruv - vec2(0.0, tx)).r;
    det -= vec2(hx, hz) * 9.0;
    simFoam = rc.b;
  }
  N = normalize(vec3(N.x + det.x, N.y, N.z + det.y));
  vec3 Ngeo = N;
  if (below) N = -N;

  vec3 L = normalize(uSunDir);
  float NdV = max(dot(N, V), 0.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  fresnel = min(fresnel, mix(0.9, 0.62, smoothstep(60.0, 700.0, distCam)));

  // ----- refraction
  vec2 suv = gl_FragCoord.xy / uResolution;
  float edgeFade = clamp(depthV * 1.5, 0.0, 1.0);
  vec2 offs = N.xz * 0.045 * edgeFade * (1.0 - far * 0.8);
  vec4 refr = texture2D(uRefraction, suv + offs);
  if (refr.a < vViewZ - 0.05) refr = texture2D(uRefraction, suv);
  vec4 refr0 = texture2D(uRefraction, suv);
  float sceneZ = refr.a;
  float thicknessZ = max(sceneZ - vViewZ, 0.0);
  float pathLen = min(thicknessZ * distCam / max(vViewZ, 1e-3), 400.0);
  if (refr.a > 9000.0) pathLen = 400.0;

  vec3 absorb = vec3(0.39, 0.085, 0.062) * (1.0 + uRain * 0.6);
  vec3 T = exp(-absorb * pathLen);
  float dmix = smoothstep(0.3, 22.0, depthV);
  vec3 shallowCol = vec3(0.02, 0.5, 0.47);
  vec3 midCol = vec3(0.0, 0.22, 0.38);
  vec3 deepCol = vec3(0.0, 0.045, 0.15);
  vec3 scatter = mix(shallowCol, midCol, smoothstep(0.0, 0.35, dmix));
  scatter = mix(scatter, deepCol, smoothstep(0.25, 1.0, dmix));
  vec3 lightIn = uAmbient * 0.75 + uSunColor * max(L.y, 0.0) * 0.16 * cloudShadowAt(P);
  vec3 inscatter = scatter * lightIn;
  // light through thin wave crests (sub surface scattering)
  float sss = pow(clamp(dot(V, -L), 0.0, 1.0), 4.0) * clamp(crest * 3.0 + 0.2, 0.0, 1.0) * (below ? 0.0 : 1.0);
  inscatter += vec3(0.05, 0.4, 0.33) * uSunColor * sss * 0.18 * energy;
  vec3 body = refr.rgb * T + inscatter * (1.0 - T);

  // ----- reflection
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = skyWithClouds(R, P);
  if (uHasReflection > 0.0 && !below) {
    vec4 pr = uReflMatrix * vec4(P.x, uWaterLevel, P.z, 1.0);
    vec2 ruv2 = pr.xy / pr.w + (N.xz - vec2(0.0)) * 0.05 * (1.0 - far * 0.7);
    ruv2 = clamp(ruv2, vec2(0.001), vec2(0.999));
    // blend toward the analytic sky for very distorted / far samples, and when the eye is
    // too close to the waves for the mirrored camera to line up with them
    refl = mix(refl, texture2D(uReflection, ruv2).rgb, (1.0 - far * 0.15) * uHasReflection);
  }

  // ----- sun specular (GGX)
  vec3 H = normalize(V + L);
  float NdH = max(dot(N, H), 0.0);
  float rough = mix(0.035, 0.11, wind) + far * 0.09 + uRain * 0.06;
  float a2 = rough * rough;
  float dd = NdH * NdH * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159 * dd * dd);
  float spec = D * fresnel * 0.25 * max(dot(N, L), 0.0) / max(NdV, 0.1);
  vec3 sunSpec = uSunColor * spec * cloudShadowAt(P) * (below ? 0.0 : 1.0);

  vec3 col = mix(body, refl, fresnel) + sunSpec;

  // ----- foam
  vec2 fuv = grid * 0.16;
  vec4 f1 = texture2D(uFoamTex, fuv + vec2(uTime * 0.012, uTime * 0.008));
  vec4 f2 = texture2D(uFoamTex, fuv * 0.47 - vec2(uTime * 0.01, -uTime * 0.006));
  float pattern = f1.r * 0.6 + f2.r * 0.55;
  float sw = swash(grid, shore);
  // shoreline foam bands moving landward
  float bands = sin(-shore * 1.25 - uTime * 1.1 + f2.a * 5.0) * 0.5 + 0.5;
  // calm lagoon shallows keep only a thin lace at the waterline; exposed shores get a wide surf band
  float shoreFoam = (1.0 - smoothstep(0.0, 0.18 + energy * 1.2, depthV)) * (0.35 + 0.65 * bands) * mix(0.45, 1.0, smoothstep(0.05, 0.35, energy));
  float edgeLine = (1.0 - smoothstep(0.0, 0.07, depthV)) * step(0.0, sw + 0.03);
  // waves breaking over the reef crest (shallow but energetic water)
  float reef = smoothstep(1.6, 0.25, depthV) * smoothstep(0.24, 0.55, energy) * smoothstep(-5.0, -0.1, td.r);
  float breaking = reef * smoothstep(-0.2, 0.5, crest * 2.2 + sin(dot(grid, vec2(0.05, 0.22)) - uTime * 0.9) * 0.6);
  // whitecaps on open water in strong wind
  float caps = smoothstep(0.42, 0.75, crest) * energy * smoothstep(0.55, 1.0, wind) * 1.3;
  float foam = max(max(shoreFoam * 0.75, edgeLine), max(breaking, caps));
  foam = clamp(foam * smoothstep(0.25, 0.75, pattern + foam * 0.3), 0.0, 1.0);
  foam = max(foam, smoothstep(0.05, 0.6, simFoam * pattern * 1.6));
  vec3 foamCol = (uAmbient * 0.95 + uSunColor * max(L.y, 0.0) * 0.35 * cloudShadowAt(P)) * vec3(0.93, 0.97, 1.0);
  col = mix(col, foamCol, foam * 0.92 * (below ? 0.4 : 1.0));

  // ----- soft intersection with the shore (no hard line)
  float soft = smoothstep(0.0, 0.18, thicknessZ);
  col = mix(refr0.rgb, col, max(soft, foam * 0.5));

  if (below) {
    // looking up at the surface from underwater: Snell's window + total internal reflection
    float cosI = max(dot(V, -Ngeo), 0.0);
    float window = smoothstep(0.63, 0.7, cosI);
    vec3 above = texture2D(uRefraction, suv + Ngeo.xz * 0.08).rgb;
    vec3 tir = uUnderwaterColor * 0.6;
    col = mix(tir, above * vec3(0.7, 0.92, 0.95) + uSunColor * spec * 0.2, window);
    col += vec3(0.6, 0.9, 1.0) * foam * 0.15;
  }

  col = applyAtmosphere(col, P);
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * Ocean surface: camera-centred polar grid with Gerstner swell attenuated by the
 * terrain (reef sheltered lagoon), refraction with depth absorption, planar reflection,
 * foam, rain ripples and an interactive ripple simulation. Exposes a CPU height query
 * matching the vertex displacement for buoyancy.
 */
export class Ocean {
  constructor({ terrainData, textures, ripples, quality = 'high' }) {
    this.td = terrainData;
    this.ripples = ripples;
    this.waveScale = 1;
    this.windWaves = 1;

    const wavesU = WAVES.map((w) => new THREE.Vector4(w[0], w[1], w[2], w[3]));
    const swellU = WAVES.map((w) => w[4]);
    this.uniforms = {
      ...U,
      uWaves: { value: wavesU },
      uWaveSwell: { value: swellU },
      uWaveScale: { value: 1 },
      uWindWaves: { value: 1 },
      uCenter: { value: new THREE.Vector3() },
      uRefraction: { value: null },
      uReflection: { value: null },
      uReflMatrix: { value: new THREE.Matrix4() },
      uHasReflection: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uNormalMap: { value: textures.waterNormal },
      uFoamTex: { value: textures.foam },
      uDetailLayers: { value: 3 },
      uFar: { value: 5000 },
      uBoat: { value: new THREE.Vector4(0, 0, 0, 0) },
      ...ripples.uniforms,
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: OCEAN_VERT,
      fragmentShader: OCEAN_FRAG,
      uniforms: this.uniforms,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this._buildGrid(quality), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYER.WATER);
    this.mesh.renderOrder = -1;
    this.quality = quality;
  }

  _buildGrid(quality) {
    const segs = quality === 'low' ? 128 : quality === 'medium' ? 192 : 256;
    const rings = quality === 'low' ? 140 : 180;
    const b = 0.0355 * (180 / rings);
    const a = 9.86;
    const radii = [0];
    for (let i = 1; i <= rings; i++) radii.push(a * (Math.exp(b * i) - 1));
    const pos = [];
    const idx = [];
    pos.push(0, 0, 0);
    for (let i = 1; i <= rings; i++) {
      for (let s = 0; s < segs; s++) {
        const ang = (s / segs) * Math.PI * 2;
        pos.push(Math.cos(ang) * radii[i], 0, Math.sin(ang) * radii[i]);
      }
    }
    for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
    for (let i = 1; i < rings; i++) {
      const r0 = 1 + (i - 1) * segs, r1 = 1 + i * segs;
      for (let s = 0; s < segs; s++) {
        const s1 = (s + 1) % segs;
        idx.push(r0 + s, r0 + s1, r1 + s);
        idx.push(r0 + s1, r1 + s1, r1 + s);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    return geo;
  }

  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    this.mesh.geometry.dispose();
    this.mesh.geometry = this._buildGrid(q);
    this.uniforms.uDetailLayers.value = q === 'low' ? 2 : 3;
  }

  setPassInputs({ refraction, reflection, reflectionFade = 1, reflectionMatrix, resolution, far }) {
    this.uniforms.uRefraction.value = refraction;
    this.uniforms.uReflection.value = reflection;
    this.uniforms.uHasReflection.value = reflection ? Math.min(Math.max(reflectionFade, 0), 1) : 0;
    this.uniforms.uReflMatrix.value.copy(reflectionMatrix);
    this.uniforms.uResolution.value.copy(resolution);
    this.uniforms.uFar.value = far;
  }

  update(camera, waveScale, windStrength) {
    this.waveScale = waveScale;
    this.windWaves = 0.7 + windStrength * 0.8;
    this.uniforms.uWaveScale.value = this.waveScale;
    this.uniforms.uWindWaves.value = this.windWaves;
    this.uniforms.uCenter.value.set(camera.position.x, 0, camera.position.z);
  }

  // ------------------------------------------------------------------ CPU queries
  _amp(i, energy) {
    const w = WAVES[i];
    const k = (Math.PI * 2) / w[2];
    const a = w[3] / k;
    const s = w[4] ? energy : (0.45 + 0.55 * energy) * this.windWaves;
    return a * s * this.waveScale;
  }

  _displace(x, z, t, out) {
    const energy = this.td.energyAt(x, z);
    let dx = 0, dy = 0, dz = 0;
    for (let i = 0; i < NW; i++) {
      const w = WAVES[i];
      const k = (Math.PI * 2) / w[2];
      const c = Math.sqrt(G / k);
      const a = this._amp(i, energy);
      const f = k * (w[0] * x + w[1] * z - c * t);
      const cf = Math.cos(f);
      dx += w[0] * a * cf;
      dz += w[1] * a * cf;
      dy += a * Math.sin(f);
    }
    const shore = this.td.shoreAt(x, z);
    const m = 1 - Math.min(1, Math.max(0, Math.abs(shore) / 14));
    const sm = m * m * (3 - 2 * m);
    dy += 0.075 * Math.sin(t * 0.62 + shore * 0.35 + Math.sin(x * 0.05) * 1.3) * sm;
    out.x = dx; out.y = dy; out.z = dz;
    return out;
  }

  /** Water surface height at world (x,z) – inverts the horizontal Gerstner displacement. */
  heightAt(x, z, t = U.uTime.value) {
    const d = this._tmp || (this._tmp = { x: 0, y: 0, z: 0 });
    let px = x, pz = z;
    for (let i = 0; i < 3; i++) {
      this._displace(px, pz, t, d);
      px = x - d.x;
      pz = z - d.z;
    }
    this._displace(px, pz, t, d);
    return U.uWaterLevel.value + d.y;
  }

  /** Sum of the wave amplitudes at (x,z): how far the surface can stray from the mean level. */
  amplitudeAt(x, z) {
    const energy = this.td.energyAt(x, z);
    let a = 0;
    for (let i = 0; i < NW; i++) a += this._amp(i, energy);
    return a;
  }

  /** Approximate surface normal at (x,z). */
  normalAt(x, z, out = new THREE.Vector3(), t = U.uTime.value) {
    const e = 0.6;
    const hx0 = this.heightAt(x - e, z, t), hx1 = this.heightAt(x + e, z, t);
    const hz0 = this.heightAt(x, z - e, t), hz1 = this.heightAt(x, z + e, t);
    return out.set(hx0 - hx1, 2 * e, hz0 - hz1).normalize();
  }

  /** Water depth (surface minus terrain) at (x,z). */
  depthAt(x, z) { return this.heightAt(x, z) - this.td.heightAt(x, z); }
}
