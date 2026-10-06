import * as THREE from 'three';

// Fullscreen triangle shared by every pass.
const TRI = new THREE.BufferGeometry();
TRI.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
TRI.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export class FullscreenPass {
  constructor(fragmentShader, uniforms = {}, opts = {}) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: FS_VERT,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
      ...opts,
    });
    this.mesh = new THREE.Mesh(TRI, this.material);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.uniforms = this.material.uniforms;
  }

  render(renderer, target, clear = true) {
    renderer.setRenderTarget(target);
    if (clear) renderer.clear(true, false, false);
    renderer.render(this.scene, this.camera);
  }

  dispose() { this.material.dispose(); }
}

const DEPTH_LIB = /* glsl */ `
uniform float uNear;
uniform float uFar;
float linearDepth(float d) { return (uNear * uFar) / ((uFar - uNear) * d - uFar) * -1.0; }
`;

// --- refraction copy: colour + linear depth -------------------------------------------
export const CopyRefractionFrag = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
varying vec2 vUv;
${DEPTH_LIB}
void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  float d = texture2D(tDepth, vUv).r;
  gl_FragColor = vec4(c, d >= 1.0 ? 1e4 : linearDepth(d));
}`;

// --- SAO style ambient occlusion -------------------------------------------------------
export const SSAOFrag = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform vec2 uProj; // P00, P11
uniform float uRadius;
uniform float uIntensity;
uniform float uAspect;
varying vec2 vUv;
${DEPTH_LIB}
vec3 viewPos(vec2 uv) {
  float z = linearDepth(texture2D(tDepth, uv).r);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * z / uProj.x, ndc.y * z / uProj.y, -z);
}
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float d0 = texture2D(tDepth, vUv).r;
  if (d0 >= 1.0) { gl_FragColor = vec4(1.0); return; }
  vec3 p = viewPos(vUv);
  if (-p.z < 0.45 || -p.z > 220.0) { gl_FragColor = vec4(1.0); return; }
  vec3 pr = viewPos(vUv + vec2(uTexel.x, 0.0)), pl = viewPos(vUv - vec2(uTexel.x, 0.0));
  vec3 pu = viewPos(vUv + vec2(0.0, uTexel.y)), pd = viewPos(vUv - vec2(0.0, uTexel.y));
  vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl;
  vec3 dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
  vec3 n = normalize(cross(dx, dy));
  float radius = uRadius * (1.0 + smoothstep(10.0, 80.0, -p.z) * 3.0);
  float ssR = radius * uProj.y / -p.z * 0.5;
  ssR = min(ssR, 0.12);
  float a0 = rand(vUv * 731.0) * 6.2831;
  float sum = 0.0;
  const int N = 12;
  for (int i = 0; i < N; i++) {
    float alpha = (float(i) + 0.5) / float(N);
    float ang = alpha * 7.0 * 6.2831 + a0;
    vec2 off = vec2(cos(ang), sin(ang) * uAspect) * ssR * alpha;
    vec3 q = viewPos(vUv + off);
    vec3 v = q - p;
    float vv = dot(v, v);
    float vn = dot(v, n);
    float f = max(radius * radius - vv, 0.0);
    sum += f * f * f * max((vn - 0.02 * radius) / (0.01 + vv), 0.0);
  }
  float r6 = pow(radius, 6.0);
  float ao = max(0.0, 1.0 - sum * uIntensity * 5.0 / (r6 * float(N)));
  gl_FragColor = vec4(vec3(ao), 1.0);
}`;

export const BlurAOFrag = /* glsl */ `
uniform sampler2D tAO;
uniform sampler2D tDepth;
uniform vec2 uDir;
varying vec2 vUv;
${DEPTH_LIB}
void main() {
  float z0 = linearDepth(texture2D(tDepth, vUv).r);
  float sum = 0.0, wsum = 0.0;
  for (int i = -4; i <= 4; i++) {
    vec2 uv = vUv + uDir * float(i);
    float z = linearDepth(texture2D(tDepth, uv).r);
    float w = exp(-float(i * i) / 12.0) * exp(-abs(z - z0) / (0.05 * z0 + 0.05) * 2.0);
    sum += texture2D(tAO, uv).r * w;
    wsum += w;
  }
  gl_FragColor = vec4(vec3(sum / max(wsum, 1e-4)), 1.0);
}`;

export const ApplyAOFrag = /* glsl */ `
uniform sampler2D tAO;
uniform float uStrength;
varying vec2 vUv;
void main() {
  float ao = texture2D(tAO, vUv).r;
  gl_FragColor = vec4(vec3(mix(1.0, ao, uStrength)), 1.0);
}`;

// --- Bloom ---------------------------------------------------------------------------------
export const BloomDownFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uFirst;
varying vec2 vUv;
vec3 s(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 karis(vec3 c) { return c / (1.0 + luma(c) * 0.25); }
void main() {
  vec3 a = s(vec2(-2, 2)), b = s(vec2(0, 2)), c = s(vec2(2, 2));
  vec3 d = s(vec2(-2, 0)), e = s(vec2(0, 0)), f = s(vec2(2, 0));
  vec3 g = s(vec2(-2, -2)), h = s(vec2(0, -2)), i = s(vec2(2, -2));
  vec3 j = s(vec2(-1, 1)), k = s(vec2(1, 1)), l = s(vec2(-1, -1)), m = s(vec2(1, -1));
  vec3 col;
  if (uFirst > 0.5) {
    col = karis(e) * 0.125 + (karis(a) + karis(c) + karis(g) + karis(i)) * 0.03125 + (karis(b) + karis(d) + karis(f) + karis(h)) * 0.0625 + (karis(j) + karis(k) + karis(l) + karis(m)) * 0.125;
    float lum = luma(col);
    float knee = uThreshold * 0.6;
    float soft = clamp(lum - uThreshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-4);
    float contrib = max(soft, lum - uThreshold) / max(lum, 1e-4);
    col *= contrib;
    col = min(col, vec3(60.0));
  } else {
    col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export const BloomUpFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uRadius;
varying vec2 vUv;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += (texture2D(tSrc, vUv + vec2(-t.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(t.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, -t.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, t.y)).rgb) * 2.0;
  c += texture2D(tSrc, vUv + vec2(-t.x, -t.y)).rgb + texture2D(tSrc, vUv + vec2(t.x, -t.y)).rgb + texture2D(tSrc, vUv + vec2(-t.x, t.y)).rgb + texture2D(tSrc, vUv + vec2(t.x, t.y)).rgb;
  gl_FragColor = vec4(c / 16.0, 1.0);
}`;

// --- Composite: exposure, bloom, filmic tone map, grade, underwater, vignette ---------------
export const CompositeFrag = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform vec3 uWhite;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uVignette;
uniform float uTime;
uniform float uUnderwater; // 0..1 camera submersion
uniform vec4 uNearY; // world y of near plane corners: bl, br, tl, tr
uniform float uWaterY;
uniform float uFlash;
uniform vec2 uTexel;
uniform float uGrain;
varying vec2 vUv;

vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 ACESFilmic(vec3 color) {
  const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color = ACESInputMat * color;
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  // per pixel: is this pixel's near plane point below the water surface?
  float nearY = mix(mix(uNearY.x, uNearY.y, uv.x), mix(uNearY.z, uNearY.w, uv.x), uv.y);
  float wobble = sin(uv.x * 22.0 + uTime * 2.3) * 0.004 + sin(uv.x * 7.0 - uTime * 1.3) * 0.006;
  float sub = smoothstep(0.004, -0.004, nearY - (uWaterY + wobble));
  sub = max(sub, step(0.99, uUnderwater));
  if (sub > 0.0) {
    uv += vec2(sin(uv.y * 28.0 + uTime * 2.1), cos(uv.x * 24.0 + uTime * 1.7)) * 0.0018 * sub;
  }
  vec3 col = texture2D(tScene, uv).rgb;
  col += texture2D(tBloom, uv).rgb * uBloom;
  col *= uExposure * (1.0 + uFlash);
  col *= uWhite;
  if (sub > 0.0) {
    vec3 uw = col * vec3(0.55, 0.9, 1.0);
    col = mix(col, uw, sub);
  }
  col = ACESFilmic(col);
  col = toSRGB(col);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSaturation);
  col = (col - 0.5) * uContrast + 0.5;
  col += uShadowTint * (1.0 - smoothstep(0.0, 0.45, l)) * (1.0 - smoothstep(0.0, 0.05, -l));
  col += uHighlightTint * smoothstep(0.55, 1.0, l);
  // waterline meniscus
  float line = exp(-abs(nearY - uWaterY) * 900.0) * (1.0 - step(0.99, uUnderwater));
  col = mix(col, col * 0.55 + vec3(0.05, 0.1, 0.12), line * 0.6);
  vec2 vc = vUv - 0.5;
  float vig = 1.0 - dot(vc, vc) * uVignette * (1.0 + sub * 1.5);
  col *= vig;
  col += (hash(vUv * 1000.0 + fract(uTime)) - 0.5) * uGrain;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// --- FXAA (Lottes, quality preset 12 style) + light sharpening ----------------------------
export const FXAAFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uSharpen;
uniform float uEnabled;
varying vec2 vUv;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec3 rgbM = texture2D(tSrc, vUv).rgb;
  vec3 result = rgbM;
  if (uEnabled > 0.5) {
    vec3 rgbNW = texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
    vec3 rgbNE = texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb;
    vec3 rgbSW = texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
    vec3 rgbSE = texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb;
    float lumaNW = lum(rgbNW), lumaNE = lum(rgbNE), lumaSW = lum(rgbSW), lumaSE = lum(rgbSE), lumaM = lum(rgbM);
    float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
    float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
    vec2 dir = vec2(-((lumaNW + lumaNE) - (lumaSW + lumaSE)), ((lumaNW + lumaSW) - (lumaNE + lumaSE)));
    float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * 0.125), 1.0 / 128.0);
    float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
    dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * uTexel;
    vec3 rgbA = 0.5 * (texture2D(tSrc, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tSrc, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tSrc, vUv + dir * -0.5).rgb + texture2D(tSrc, vUv + dir * 0.5).rgb);
    float lumaB = lum(rgbB);
    result = (lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB;
  }
  if (uSharpen > 0.0) {
    vec3 n = texture2D(tSrc, vUv + vec2(0.0, uTexel.y)).rgb + texture2D(tSrc, vUv - vec2(0.0, uTexel.y)).rgb
           + texture2D(tSrc, vUv + vec2(uTexel.x, 0.0)).rgb + texture2D(tSrc, vUv - vec2(uTexel.x, 0.0)).rgb;
    vec3 blur = n * 0.25;
    result = clamp(result + (result - blur) * uSharpen, 0.0, 1.0);
  }
  gl_FragColor = vec4(result, 1.0);
}`;

export const CopyFrag = /* glsl */ `
uniform sampler2D tSrc;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(tSrc, vUv); }`;
