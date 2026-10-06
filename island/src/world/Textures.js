import * as THREE from 'three';

// Procedural material library. Each terrain layer defines
//   void layer(vec2 uv, out vec3 col, out float h, out float r)
// with col in sRGB, h height 0..1 and r roughness.

const LAYERS = {
  sand: /* glsl */ `
void layer(vec2 uv, out vec3 col, out float h, out float r) {
  float grains = pnoise(uv * 256.0, vec2(256.0)) * 0.5 + 0.5;
  float fine = pfbm(uv, 48.0, 3, 0.5) * 0.5 + 0.5;
  float mac = pfbm(uv, 3.0, 4, 0.55) * 0.5 + 0.5;
  vec2 w = vec2(pfbm(uv, 3.0, 3, 0.5), pfbm(uv + 0.37, 3.0, 3, 0.5));
  float rip = sin(2.0 * PI * (uv.x * 19.0 + uv.y * 7.0) + w.x * 6.0 + w.y * 3.0) * 0.5 + 0.5;
  rip = pow(rip, 1.7) * (0.55 + 0.45 * mac);
  h = rip * 0.4 + fine * 0.3 + grains * 0.3;
  vec3 base = mix(vec3(0.93, 0.87, 0.74), vec3(0.84, 0.76, 0.61), mac * 0.7);
  base *= 0.9 + grains * 0.18 + (fine - 0.5) * 0.1;
  float speck = step(0.94, hash1(floor(uv * 512.0)));
  base = mix(base, vec3(0.42, 0.38, 0.34), speck * 0.45);
  float pinks = step(0.975, hash1(floor(uv * 300.0) + 7.0));
  base = mix(base, vec3(0.92, 0.72, 0.68), pinks * 0.5);
  float shell = step(0.988, hash1(floor(uv * 160.0) + 3.0));
  base = mix(base, vec3(0.99, 0.97, 0.93), shell * 0.7);
  h += shell * 0.25;
  col = base;
  r = 0.93 - shell * 0.3;
}`,
  grass: /* glsl */ `
void layer(vec2 uv, out vec3 col, out float h, out float r) {
  float n1 = pfbm(uv, 6.0, 5, 0.5) * 0.5 + 0.5;
  float n2 = pfbm(uv + 0.5, 12.0, 4, 0.5) * 0.5 + 0.5;
  float blades = pnoise(vec2(uv.x * 384.0, uv.y * 96.0), vec2(384.0, 96.0)) * 0.5 + 0.5;
  float blades2 = pnoise(vec2(uv.x * 96.0 + uv.y * 96.0, uv.y * 384.0), vec2(96.0, 384.0)) * 0.5 + 0.5;
  float b = max(blades, blades2);
  vec3 g1 = vec3(0.24, 0.33, 0.10);
  vec3 g2 = vec3(0.42, 0.47, 0.17);
  vec3 dry = vec3(0.55, 0.50, 0.28);
  col = mix(g1, g2, n1);
  col = mix(col, dry, smoothstep(0.62, 0.85, n2) * 0.55);
  float soil = smoothstep(0.58, 0.8, pfbm(uv + 0.21, 10.0, 4, 0.55) * 0.5 + 0.5);
  col = mix(col, vec3(0.33, 0.26, 0.17), soil * 0.7);
  col *= 0.68 + b * 0.5;
  h = b * 0.6 * (1.0 - soil * 0.6) + n1 * 0.4;
  r = 0.86;
}`,
  forest: /* glsl */ `
vec3 leafPalette(float t) {
  if (t < 0.25) return vec3(0.42, 0.27, 0.13);
  if (t < 0.45) return vec3(0.25, 0.17, 0.09);
  if (t < 0.62) return vec3(0.55, 0.42, 0.18);
  if (t < 0.8) return vec3(0.30, 0.31, 0.12);
  return vec3(0.50, 0.22, 0.10);
}
void leafLayer(vec2 uv, float cells, float seed, inout vec3 col, inout float h, inout float top) {
  vec2 p = uv * cells;
  vec2 i = floor(p), f = fract(p);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 id = mod(i + g, vec2(cells));
    vec3 hh = hash3(id + seed);
    if (hh.z < 0.25) continue;
    vec2 c = g + hash2(id + seed * 1.7) - f;
    float a = hh.x * 6.2831;
    vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * (-c);
    float len = 0.42 + hh.y * 0.3, wid = len * (0.32 + 0.18 * hh.z);
    float sx = q.x / len;
    float halfW = wid * (1.0 - sx * sx) * (1.0 - 0.25 * sx);
    float m = step(abs(sx), 1.0) * smoothstep(halfW, halfW * 0.82, abs(q.y));
    float z = hash1(id + seed * 3.1);
    if (m > 0.0 && z > top) {
      top = z;
      vec3 lc = leafPalette(fract(hh.y * 3.7 + hh.x));
      float rib = smoothstep(0.012, 0.0, abs(q.y)) * 0.35;
      float vein = smoothstep(0.012, 0.0, abs(fract(sx * 4.0 + abs(q.y) * 6.0) - 0.5) * 0.06) * 0.15;
      lc *= 0.8 + 0.35 * hash1(floor((q + 2.0) * 40.0) + id);
      lc *= 1.0 - rib - vein;
      col = mix(col, lc, m);
      h = mix(h, 0.55 + 0.2 * z + 0.1 * (1.0 - abs(sx)), m);
    }
  }
}
void layer(vec2 uv, out vec3 col, out float h, out float r) {
  float n = pfbm(uv, 8.0, 5, 0.55) * 0.5 + 0.5;
  col = mix(vec3(0.14, 0.10, 0.07), vec3(0.24, 0.17, 0.11), n);
  h = n * 0.3;
  float top = -1.0;
  leafLayer(uv, 9.0, 1.0, col, h, top);
  leafLayer(uv, 14.0, 7.0, col, h, top);
  leafLayer(uv, 21.0, 13.0, col, h, top);
  // twigs
  vec4 v = pvoronoi(uv, 6.0, 1.0);
  float twig = smoothstep(0.03, 0.0, abs(v.y - v.x - 0.05)) * step(0.6, v.z);
  col = mix(col, vec3(0.28, 0.2, 0.13), twig * 0.8);
  h = max(h, twig * 0.7);
  r = 0.88;
}`,
  rock: /* glsl */ `
void layer(vec2 uv, out vec3 col, out float h, out float r) {
  vec2 w = vec2(pfbm(uv, 4.0, 4, 0.5), pfbm(uv + 0.71, 4.0, 4, 0.5)) * 0.08;
  float fb = pfbm(uv + w, 4.0, 7, 0.55) * 0.5 + 0.5;
  float rid = pridge(uv + w, 5.0, 6);
  vec4 vor = pvoronoi(uv + w, 7.0, 0.9);
  float crack = 1.0 - smoothstep(0.0, 0.06, vor.y - vor.x);
  vec4 vor2 = pvoronoi(uv + w * 2.0, 19.0, 1.0);
  float crack2 = 1.0 - smoothstep(0.0, 0.05, vor2.y - vor2.x);
  float strata = sin(2.0 * PI * (uv.y * 11.0 + fb * 0.6)) * 0.5 + 0.5;
  h = fb * 0.45 + rid * 0.45 + strata * 0.1 - crack * 0.35 - crack2 * 0.12;
  vec3 c1 = vec3(0.44, 0.42, 0.39);
  vec3 c2 = vec3(0.30, 0.29, 0.27);
  vec3 c3 = vec3(0.52, 0.47, 0.40);
  col = mix(c2, c1, fb);
  col = mix(col, c3, smoothstep(0.55, 0.8, rid) * 0.5);
  col = mix(col, c2 * 0.7, strata * 0.15);
  col *= 1.0 - crack * 0.45 - crack2 * 0.2;
  float lich = smoothstep(0.72, 0.8, pfbm(uv + 0.3, 16.0, 3, 0.5) * 0.5 + 0.5);
  col = mix(col, vec3(0.70, 0.62, 0.42), lich * 0.45);
  float lich2 = smoothstep(0.75, 0.82, pfbm(uv + 0.9, 24.0, 3, 0.5) * 0.5 + 0.5);
  col = mix(col, vec3(0.78, 0.78, 0.72), lich2 * 0.35);
  col *= 0.88 + 0.24 * hash1(floor(uv * 512.0));
  r = 0.78 + crack * 0.15;
}`,
  dirt: /* glsl */ `
void layer(vec2 uv, out vec3 col, out float h, out float r) {
  float n = pfbm(uv, 6.0, 5, 0.55) * 0.5 + 0.5;
  float m = pfbm(uv + 0.4, 24.0, 4, 0.5) * 0.5 + 0.5;
  col = mix(vec3(0.36, 0.26, 0.17), vec3(0.50, 0.38, 0.25), n);
  col *= 0.86 + m * 0.24;
  h = n * 0.35 + m * 0.25;
  vec4 v = pvoronoi(uv, 26.0, 1.0);
  float peb = smoothstep(0.32, 0.22, v.x) * step(0.55, v.z);
  vec3 pc = mix(vec3(0.45, 0.43, 0.40), vec3(0.62, 0.58, 0.52), v.w);
  col = mix(col, pc * (0.8 + 0.4 * (1.0 - v.x * 3.0)), peb);
  h = max(h, peb * (0.75 - v.x));
  vec4 v2 = pvoronoi(uv, 5.0, 1.0);
  float root = smoothstep(0.035, 0.0, abs(v2.y - v2.x - 0.03)) * step(0.7, v2.z);
  col = mix(col, vec3(0.30, 0.21, 0.13), root * 0.9);
  h = max(h, root * 0.6);
  r = 0.9 - peb * 0.2;
}`,
  coral: /* glsl */ `
void layer(vec2 uv, out vec3 col, out float h, out float r) {
  vec4 v = pvoronoi(uv, 9.0, 0.9);
  vec4 v2 = pvoronoi(uv + 0.13, 23.0, 1.0);
  float blob = smoothstep(0.75, 0.1, v.x);
  float blob2 = smoothstep(0.7, 0.15, v2.x);
  float fb = pfbm(uv, 8.0, 5, 0.55) * 0.5 + 0.5;
  float pores = pnoise(uv * 128.0, vec2(128.0)) * 0.5 + 0.5;
  h = blob * 0.55 + blob2 * 0.3 + fb * 0.15 - pores * 0.05;
  vec3 a = vec3(0.70, 0.50, 0.55);
  vec3 b = vec3(0.62, 0.58, 0.40);
  vec3 c = vec3(0.45, 0.52, 0.42);
  vec3 d = vec3(0.80, 0.66, 0.52);
  vec3 cc = v.z < 0.3 ? a : v.z < 0.55 ? b : v.z < 0.8 ? c : d;
  col = mix(vec3(0.66, 0.62, 0.52), cc, blob);
  col *= 0.75 + 0.3 * blob2 + 0.1 * pores;
  r = 0.85;
}`,
  mud: /* glsl */ `
void layer(vec2 uv, out vec3 col, out float h, out float r) {
  float n = pfbm(uv, 4.0, 5, 0.6) * 0.5 + 0.5;
  float m = pfbm(uv + 0.3, 16.0, 4, 0.5) * 0.5 + 0.5;
  col = mix(vec3(0.17, 0.12, 0.08), vec3(0.28, 0.21, 0.14), n);
  h = n * 0.5 + m * 0.2;
  float wet = smoothstep(0.45, 0.3, n);
  col *= 1.0 - wet * 0.25;
  r = mix(0.6, 0.25, wet);
}`,
};

export const TERRAIN_LAYER_ORDER = ['sand', 'grass', 'forest', 'rock', 'dirt', 'coral', 'mud'];

function albedoFragment(layerSrc) {
  return `${layerSrc}
void main() {
  vec3 col; float h; float r;
  layer(vUv, col, h, r);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), clamp(h, 0.0, 1.0));
}`;
}

function normalFragment(layerSrc, strength) {
  return `${layerSrc}
float H(vec2 uv) { vec3 c; float h; float r; layer(fract(uv), c, h, r); return h; }
void main() {
  vec2 e = 1.0 / uRes;
  vec3 c; float h0; float r;
  layer(vUv, c, h0, r);
  float hl = H(vUv - vec2(e.x, 0.0)), hr = H(vUv + vec2(e.x, 0.0));
  float hd = H(vUv - vec2(0.0, e.y)), hu = H(vUv + vec2(0.0, e.y));
  vec3 n = normalize(vec3((hl - hr) * ${strength.toFixed(2)}, (hd - hu) * ${strength.toFixed(2)}, 1.0));
  float avg = (H(vUv + vec2(4.0 * e.x, 0.0)) + H(vUv - vec2(4.0 * e.x, 0.0)) + H(vUv + vec2(0.0, 4.0 * e.y)) + H(vUv - vec2(0.0, 4.0 * e.y))) * 0.25;
  float ao = clamp(1.0 - (avg - h0) * 1.6, 0.35, 1.0);
  gl_FragColor = vec4(n.xy * 0.5 + 0.5, clamp(r, 0.0, 1.0), ao);
}`;
}

const NORMAL_STRENGTH = { sand: 5, grass: 7, forest: 9, rock: 14, dirt: 8, coral: 10, mud: 4 };

// ---------------------------------------------------------------- other maps
const NOISE_FRAG = /* glsl */ `
void main() {
  float a = pfbm(vUv, 4.0, 6, 0.5) * 0.5 + 0.5;
  float b = pfbm(vUv + 0.31, 8.0, 5, 0.5) * 0.5 + 0.5;
  float c = pfbm(vUv + 0.73, 16.0, 4, 0.5) * 0.5 + 0.5;
  vec4 v = pvoronoi(vUv, 8.0, 1.0);
  gl_FragColor = vec4(a, b, c, v.x);
}`;

// Tileable small wave normals (xy) + height (z) for the water surface.
const WATER_NORMAL_FRAG = /* glsl */ `
float wh(vec2 uv) {
  float h = 0.0;
  h += sin(2.0 * PI * (uv.x * 3.0 + uv.y * 1.0) + 1.3) * 0.32;
  h += sin(2.0 * PI * (uv.x * -2.0 + uv.y * 4.0) + 0.4) * 0.26;
  h += sin(2.0 * PI * (uv.x * 5.0 + uv.y * -3.0) + 2.1) * 0.18;
  h += sin(2.0 * PI * (uv.x * 7.0 + uv.y * 6.0) + 4.0) * 0.12;
  h += sin(2.0 * PI * (uv.x * -9.0 + uv.y * 4.0) + 0.9) * 0.09;
  h += sin(2.0 * PI * (uv.x * 13.0 + uv.y * -11.0) + 3.3) * 0.06;
  h += pfbm(uv, 8.0, 5, 0.55) * 0.55;
  h += pfbm(uv + 0.5, 24.0, 3, 0.5) * 0.12;
  return h;
}
void main() {
  vec2 e = 1.0 / uRes;
  float h = wh(vUv);
  float dx = (wh(vUv + vec2(e.x, 0.0)) - wh(vUv - vec2(e.x, 0.0))) / (2.0 * e.x);
  float dy = (wh(vUv + vec2(0.0, e.y)) - wh(vUv - vec2(0.0, e.y))) / (2.0 * e.y);
  vec3 n = normalize(vec3(-dx * 0.012, -dy * 0.012, 1.0));
  gl_FragColor = vec4(n.xy * 0.5 + 0.5, h * 0.25 + 0.5, 1.0);
}`;

const CAUSTICS_FRAG = /* glsl */ `
float cell(vec2 uv, float cells) {
  vec4 v = pvoronoi(uv, cells, 0.95);
  return v.y - v.x;
}
void main() {
  vec2 w = vec2(pfbm(vUv, 3.0, 3, 0.5), pfbm(vUv + 0.5, 3.0, 3, 0.5)) * 0.045;
  float e1 = cell(vUv + w, 7.0);
  float e2 = cell(vUv - w * 1.3 + 0.25, 9.0);
  float c = exp(-e1 * 18.0) * 0.75 + exp(-e2 * 22.0) * 0.5;
  c = pow(clamp(c, 0.0, 1.0), 1.4);
  gl_FragColor = vec4(vec3(c), 1.0);
}`;

const FOAM_FRAG = /* glsl */ `
void main() {
  vec4 v = pvoronoi(vUv, 18.0, 1.0);
  vec4 v2 = pvoronoi(vUv + 0.3, 42.0, 1.0);
  float bubbles = smoothstep(0.08, 0.0, v.y - v.x) * 0.7 + smoothstep(0.06, 0.0, v2.y - v2.x) * 0.5;
  float n = pfbm(vUv, 6.0, 5, 0.55) * 0.5 + 0.5;
  float foam = clamp(bubbles * 0.8 + n * 0.6 - 0.15, 0.0, 1.0);
  float streak = pfbm(vec2(vUv.x * 2.0, vUv.y * 8.0), 4.0, 4, 0.5) * 0.5 + 0.5;
  float holes = smoothstep(0.35, 0.65, v.x * 1.4);
  gl_FragColor = vec4(foam, streak, holes, n);
}`;

// Weathered wood. U along grain. Albedo sRGB in rgb, roughness in a.
const WOOD_LIB = /* glsl */ `
void wood(vec2 uv, out vec3 col, out float h, out float r) {
  vec2 w = vec2(pfbm(uv * vec2(1.0, 1.0), 4.0, 4, 0.5), 0.0);
  float rings = pfbm(vec2(uv.x * 0.5, uv.y * 8.0) + w * 0.3, 4.0, 5, 0.55);
  float grain = sin(2.0 * PI * (uv.y * 46.0 + rings * 2.4)) * 0.5 + 0.5;
  float fibre = pnoise(vec2(uv.x * 24.0, uv.y * 512.0), vec2(24.0, 512.0)) * 0.5 + 0.5;
  // knots
  vec4 kv = pvoronoi(vec2(uv.x, uv.y * 4.0), 3.0, 0.8);
  float knot = smoothstep(0.22, 0.05, kv.x) * step(0.72, kv.z);
  float knotRing = sin(kv.x * 90.0) * 0.5 + 0.5;
  vec3 light = vec3(0.62, 0.55, 0.46);
  vec3 warm = vec3(0.50, 0.37, 0.24);
  vec3 dark = vec3(0.30, 0.23, 0.17);
  col = mix(light, warm, grain * 0.55 + rings * 0.15);
  col = mix(col, dark, pow(grain, 6.0) * 0.6);
  col *= 0.86 + fibre * 0.22;
  col = mix(col, dark * (0.7 + 0.5 * knotRing), knot);
  float weather = pfbm(uv, 3.0, 4, 0.5) * 0.5 + 0.5;
  col = mix(col, vec3(0.58, 0.57, 0.55), smoothstep(0.4, 0.8, weather) * 0.45);
  float stain = smoothstep(0.62, 0.8, pfbm(uv + 0.47, 5.0, 4, 0.55) * 0.5 + 0.5);
  col *= 1.0 - stain * 0.35;
  h = grain * 0.4 + fibre * 0.4 - knot * 0.2 + (1.0 - weather) * 0.1;
  r = mix(0.72, 0.9, weather);
}
`;

const BARK_PALM = /* glsl */ `
void bark(vec2 uv, out vec3 col, out float h, out float r) {
  float jitter = pfbm(vec2(uv.x * 2.0, uv.y * 1.0), 4.0, 3, 0.5);
  float band = fract(uv.y * 26.0 + jitter * 0.6 + pfbm(vec2(uv.x, uv.y * 0.5), 6.0, 3, 0.5) * 0.25);
  float scar = smoothstep(0.0, 0.12, band) * smoothstep(1.0, 0.75, band);
  float fib = pnoise(vec2(uv.x * 160.0, uv.y * 24.0), vec2(160.0, 24.0)) * 0.5 + 0.5;
  float n = pfbm(uv, 8.0, 5, 0.55) * 0.5 + 0.5;
  col = mix(vec3(0.30, 0.27, 0.23), vec3(0.55, 0.50, 0.44), scar * 0.7 + n * 0.3);
  col *= 0.8 + fib * 0.3;
  float lich = smoothstep(0.66, 0.75, pfbm(uv + 0.2, 12.0, 3, 0.5) * 0.5 + 0.5);
  col = mix(col, vec3(0.7, 0.72, 0.65), lich * 0.35);
  h = scar * 0.7 + fib * 0.3;
  r = 0.85;
}`;

const BARK_TREE = /* glsl */ `
void bark(vec2 uv, out vec3 col, out float h, out float r) {
  vec2 w = vec2(pfbm(uv, 4.0, 3, 0.5), 0.0) * 0.06;
  float fis = pridge(vec2(uv.x * 2.0, uv.y * 0.5) + w, 6.0, 5);
  float n = pfbm(uv, 6.0, 5, 0.55) * 0.5 + 0.5;
  col = mix(vec3(0.20, 0.17, 0.14), vec3(0.46, 0.42, 0.36), fis * 0.8 + n * 0.2);
  float moss = smoothstep(0.55, 0.75, pfbm(uv + 0.6, 4.0, 4, 0.55) * 0.5 + 0.5);
  col = mix(col, vec3(0.24, 0.32, 0.12), moss * 0.6);
  float lich = smoothstep(0.7, 0.78, pfbm(uv + 0.1, 16.0, 3, 0.5) * 0.5 + 0.5);
  col = mix(col, vec3(0.72, 0.74, 0.66), lich * 0.4);
  h = fis;
  r = 0.9;
}`;

const FABRIC = /* glsl */ `
void fabric(vec2 uv, out vec3 col, out float h, out float r) {
  float N = 220.0;
  vec2 p = uv * N;
  vec2 c = floor(p);
  vec2 f = fract(p);
  float over = mod(c.x + c.y, 2.0);
  float tx = sin(f.x * PI), ty = sin(f.y * PI);
  float th = mix(tx * (0.6 + 0.4 * ty), ty * (0.6 + 0.4 * tx), over);
  float slub = pnoise(vec2(uv.x * 40.0, uv.y * 400.0), vec2(40.0, 400.0)) * 0.5 + 0.5;
  float n = pfbm(uv, 4.0, 5, 0.55) * 0.5 + 0.5;
  float stain = smoothstep(0.62, 0.78, pfbm(uv + 0.37, 3.0, 4, 0.6) * 0.5 + 0.5);
  float fade = smoothstep(0.3, 0.9, pfbm(uv + 0.11, 2.0, 3, 0.5) * 0.5 + 0.5);
  float v = 0.78 + th * 0.18 + (slub - 0.5) * 0.12 + (n - 0.5) * 0.1;
  col = vec3(v) * (1.0 - stain * 0.3) + fade * 0.08;
  col = mix(col, col * vec3(0.85, 0.78, 0.65), stain);
  h = th * 0.8 + slub * 0.2;
  r = 0.95;
}`;

function pairFragments(lib, fn, strength) {
  return [
    `${lib}\nvoid main(){ vec3 c; float h; float r; ${fn}(vUv, c, h, r); gl_FragColor = vec4(clamp(c,0.0,1.0), r); }`,
    `${lib}
float H(vec2 uv){ vec3 c; float h; float r; ${fn}(fract(uv), c, h, r); return h; }
void main(){
  vec2 e = 1.0 / uRes;
  float hl = H(vUv - vec2(e.x, 0.0)), hr = H(vUv + vec2(e.x, 0.0));
  float hd = H(vUv - vec2(0.0, e.y)), hu = H(vUv + vec2(0.0, e.y));
  vec3 n = normalize(vec3((hl - hr) * ${strength.toFixed(2)}, (hd - hu) * ${strength.toFixed(2)}, 1.0));
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
}`,
  ];
}

/** Bake every procedural texture the game needs. */
export function bakeTextures(baker, quality = 'high') {
  const terrainSize = quality === 'low' ? 512 : 1024;
  const t = {};
  t.noise = baker.bake(NOISE_FRAG, { width: 256, aniso: false });
  t.terrainAlbedo = baker.bakeArray(TERRAIN_LAYER_ORDER.map((k) => albedoFragment(LAYERS[k])), { size: terrainSize, srgb: true });
  t.terrainNormal = baker.bakeArray(TERRAIN_LAYER_ORDER.map((k) => normalFragment(LAYERS[k], NORMAL_STRENGTH[k])), { size: terrainSize });
  t.waterNormal = baker.bake(WATER_NORMAL_FRAG, { width: 512 });
  t.caustics = baker.bake(CAUSTICS_FRAG, { width: 512 });
  t.foam = baker.bake(FOAM_FRAG, { width: 512 });

  const [woodA, woodN] = pairFragments(WOOD_LIB, 'wood', 6);
  t.wood = baker.bake(woodA, { width: 1024, srgb: true });
  t.woodNormal = baker.bake(woodN, { width: 1024 });
  const [palmA, palmN] = pairFragments(BARK_PALM, 'bark', 8);
  t.barkPalm = baker.bake(palmA, { width: 512, srgb: true });
  t.barkPalmNormal = baker.bake(palmN, { width: 512 });
  const [treeA, treeN] = pairFragments(BARK_TREE, 'bark', 10);
  t.barkTree = baker.bake(treeA, { width: 512, srgb: true });
  t.barkTreeNormal = baker.bake(treeN, { width: 512 });
  const [fabA, fabN] = pairFragments(FABRIC, 'fabric', 3);
  t.fabric = baker.bake(fabA, { width: 1024, srgb: true });
  t.fabricNormal = baker.bake(fabN, { width: 1024 });
  // rock textures for standalone rock meshes (layer 3 of the terrain array as 2D)
  const [rockA, rockN] = pairFragments(LAYERS.rock.replace('void layer(', 'void rockLayer('), 'rockLayer', 14);
  t.rock = baker.bake(rockA, { width: 1024, srgb: true });
  t.rockNormal = baker.bake(rockN, { width: 1024 });

  return t;
}
