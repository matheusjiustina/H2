// Terrain rendering: LOD chunks of the shared height grid, a far horizon ring,
// and a ground shader that draws roads, strip, apron, fields and creek banks
// analytically from the farm layout (crisp edges at any distance, no huge
// splat textures).
import * as THREE from 'three';
import { ATMO_U } from './atmosphere.js';
import { GRID_N, CELL, RELIEF_SHADE } from './terrainData.js';
import {
  WORLD_HALF, FAR_HALF, RUNWAY, BASE, FIELDS, ROADS, CREEK, FARM_SITES, WATER,
} from './layout.js';
import { rawHeight } from './terrainData.js';
import { makeGroundDetail } from '../core/textures.js';
import { CUT_U, NCUT, CROP_U } from './cutState.js';

const CROP_CODE = { soy: 0, corn: 1, cotton: 2, stubble: 3, fallow: 4, pasture: 5 };

const GLSL_FUNCS = /* glsl */ `
varying vec3 vWPos;
varying float vTN; // y of the (exaggerated) terrain normal
uniform sampler2D uNoise;
uniform sampler2D uDetail;
uniform vec4 uFieldRect[NF];
uniform vec4 uFieldInfo[NF];
uniform vec4 uRoadSeg[NR];
uniform float uRoadW[NR];
uniform vec2 uCreek[NC];
uniform vec4 uRunway;
uniform vec4 uApron;
uniform vec4 uTaxi;
uniform vec2 uPad;
uniform vec2 uFuel;
uniform vec4 uSiteRw[NS];
uniform vec4 uSiteAp[NS];
uniform vec4 uSiteTx[NS];
uniform vec4 uSiteOff[NS];
uniform float uWorldHalf;
uniform vec4 uCut[NCUT];
uniform float uCropR0;
uniform float uCropTop;
uniform vec2 uStream[NSTP];
uniform vec4 uStreamBox;
uniform vec4 uPond[NPOND];
uniform float uCutKind[NCUT];

// Micro-relief written by terrainColor() and turned into a bump normal later.
float tBump = 0.0;
float tBumpK = 0.0;
float tNearC = 0.0; // crack detail fades much sooner (its texel pattern tiles)

float sdBox(vec2 p, vec4 r) {
  vec2 c = 0.5 * (r.xy + r.zw);
  vec2 h = 0.5 * (r.zw - r.xy);
  vec2 d = abs(p - c) - h;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
float aaStep(float edge, float x) {
  float w = max(fwidth(x), 1e-4);
  return smoothstep(edge - w, edge + w, x);
}
float rows(float coord, float spacing, out float fade) {
  float w = fwidth(coord) / spacing;
  fade = 1.0 - smoothstep(0.2, 0.7, w);
  return 0.5 + 0.5 * cos(6.2831853 * coord / spacing);
}
float segD(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// Ground micro-detail at two scales; 'near' fades it out as a pixel covers
// more ground (no shimmer from the air).
vec4 detailAt(vec2 p, out float near) {
  float fw = length(fwidth(p));
  near = 1.0 - smoothstep(0.025, 0.14, fw);
  tNearC = 1.0 - smoothstep(0.01, 0.045, fw);
  vec4 a = texture2D(uDetail, p * 0.42);
  vec4 b = texture2D(uDetail, p * 0.097 + 0.37);
  // Cracks only at the fine scale: a coarse crack net reads as tiling from the air.
  vec4 m = mix(b, a, 0.62);
  m.g = a.g;
  return m;
}

// Braquiária pasture: olive green, straw-dry patches, darker moist swales.
vec3 grassColor(vec2 p, vec4 nA, vec4 nB, vec4 nC, vec4 nD) {
  vec3 g1 = vec3(0.100, 0.148, 0.040);
  vec3 g2 = vec3(0.150, 0.172, 0.052);
  vec3 g3 = vec3(0.066, 0.112, 0.030);
  vec3 dry = vec3(0.255, 0.205, 0.092);
  vec3 c = mix(g1, g2, smoothstep(0.35, 0.78, nA.r));
  c = mix(c, g3, smoothstep(0.55, 0.85, nB.g) * 0.5);
  c = mix(c, dry, smoothstep(0.56, 0.9, nA.b) * 0.36 + smoothstep(0.64, 0.82, nC.g) * 0.18);
  c *= 0.82 + 0.36 * nC.b;
  c *= 0.86 + 0.26 * nD.a;
  return c;
}

// Mato Grosso red latosol, muted by dust.
vec3 dirtColor(vec4 nB, vec4 nC, vec4 nD) {
  vec3 d1 = vec3(0.235, 0.074, 0.034);
  vec3 d2 = vec3(0.350, 0.135, 0.064);
  vec3 c = mix(d1, d2, smoothstep(0.3, 0.8, nC.r));
  c *= 0.85 + 0.25 * nD.b;
  return c;
}

// Soil breakup near the camera: pebbles, cracks, grain (+ bump).
vec3 soilDetail(vec3 c, vec4 det, float near, float peb, float crack) {
  c *= mix(1.0, 0.86 + 0.28 * det.a, near);
  c = mix(c, c * 1.28 + vec3(0.03, 0.02, 0.012), det.r * peb * near);
  c = mix(c, c * 0.55, det.g * crack * tNearC);
  tBump = det.r * peb - det.g * crack * 0.6 * tNearC + det.a * 0.25;
  tBumpK = near;
  return c;
}

vec3 fieldColor(vec2 p, vec4 info, float edgeIn, vec4 nA, vec4 nB, vec4 nC, vec4 nD, inout float rough) {
  float type = info.x;
  float coord = info.y < 0.5 ? p.y : p.x;
  float fade;
  float s = rows(coord, info.w > 0.0 ? info.w : 0.9, fade);
  vec3 soil = mix(vec3(0.160, 0.058, 0.028), vec3(0.230, 0.085, 0.040), nC.r);
  vec3 c;
  if (type < 2.5) {
    // Under soy, corn and cotton: Mato Grosso latossolo (red-brown, finer
    // and darker where it is moist), straw from the last crop between the
    // rows on no-till soy and corn, clean earth on the cotton rows; the
    // plants shade the soil along each row. Far away the green cover of the
    // canopy takes over; near the camera the 3D plants are the cover.
    float sp = info.w > 0.0 ? info.w : 0.9;
    float rowD = abs(fract(coord / sp) - 0.5) * sp; // m from the row line
    vec3 soilR = mix(vec3(0.26, 0.105, 0.05), vec3(0.40, 0.17, 0.08), smoothstep(0.25, 0.8, nC.r)) * (0.86 + 0.24 * nD.b);
    float strawK = type < 1.5 ? smoothstep(0.3, 0.75, nD.g * 0.8 + nC.b * 0.4) * 0.8 : 0.1;
    vec3 straw = mix(vec3(0.40, 0.31, 0.17), vec3(0.58, 0.47, 0.29), nD.r);
    vec3 ground = mix(soilR, straw, strawK * smoothstep(0.04, 0.16, rowD));
    float under = exp(-pow(rowD / (sp * (0.16 + 0.22 * info.z)), 2.0));
    ground *= 1.0 - 0.5 * under * smoothstep(0.0, 0.6, info.z);
    // A closed canopy keeps the soil in its shade.
    ground *= 1.0 - 0.38 * smoothstep(0.55, 1.0, info.z);
    if (type > 1.5) ground = mix(ground, ground * 1.12, (1.0 - under) * smoothstep(0.1, 0.3, rowD) * 0.5); // cotton ridges
    vec3 green = type < 0.5 ? vec3(0.072, 0.150, 0.034) : type < 1.5 ? vec3(0.078, 0.140, 0.034) : vec3(0.075, 0.130, 0.042);
    float cover = smoothstep(0.0, 0.7, info.z);
    float farK = uCropR0 > 1.0 ? smoothstep(uCropR0 * 0.6, uCropR0 * 0.95, distance(vWPos, cameraPosition)) : 1.0;
    // Seen from above, the gaps between the near plants show their lower
    // leaves and shade rather than bare soil.
    float coverK = max(farK, uCropTop * 0.85);
    c = mix(ground, green * (0.85 + 0.3 * nB.r) * mix(0.75, 1.0, farK), cover * coverK * mix(0.9, s, fade * (1.0 - info.z * 0.6)));
    rough = 0.9;
  } else if (type < 3.5) {
    // Stubble (palhada) after harvest: straw rows over dark soil.
    vec3 a = vec3(0.36, 0.285, 0.14), b = vec3(0.24, 0.18, 0.085);
    c = mix(b, a, mix(0.55, s, fade * 0.8));
    c = mix(c, soil, smoothstep(0.6, 0.85, nC.g) * 0.35);
    c *= 0.88 + 0.24 * nD.r;
    rough = 0.95;
  } else if (type < 4.5) {
    // Fallow: harrowed soil furrows with sparse weeds.
    vec3 a = vec3(0.30, 0.105, 0.048), b = vec3(0.205, 0.070, 0.032);
    c = mix(b, a, mix(0.6, s, fade));
    c *= 0.82 + 0.3 * nC.b;
    c = mix(c, vec3(0.09, 0.13, 0.04), smoothstep(0.72, 0.9, nD.r) * 0.6);
    rough = 1.0;
  } else {
    c = grassColor(p * 1.7, nA, nB, nC, nD) * vec3(1.04, 1.1, 1.0);
    // Cattle paths.
    c = mix(c, vec3(0.27, 0.105, 0.05), smoothstep(0.62, 0.66, nB.b) * (1.0 - smoothstep(0.66, 0.70, nB.b)) * 0.7);
    rough = 0.95;
  }
  return c;
}

vec3 farPatchwork(vec2 p, vec4 nA, vec4 nB, vec4 nC, vec4 nD, inout float rough) {
  vec2 cell = floor((p + 13000.0) / 950.0);
  vec2 f = fract((p + 13000.0) / 950.0) * 950.0;
  vec4 h = texture2D(uNoise, cell * 0.0731 + 0.13);
  float edge = min(min(f.x, 950.0 - f.x), min(f.y, 950.0 - f.y));
  vec3 c;
  float k = h.r;
  if (k < 0.32) c = vec3(0.075, 0.150, 0.036) * (0.85 + 0.3 * nB.g);
  else if (k < 0.45) c = vec3(0.080, 0.135, 0.034);
  else if (k < 0.55) c = vec3(0.34, 0.27, 0.13);
  else if (k < 0.63) c = vec3(0.26, 0.085, 0.040);
  else if (k < 0.82) c = vec3(0.034, 0.072, 0.022) * (0.8 + 0.4 * nC.r);
  else c = grassColor(p, nA, nB, nC, nD);
  c = mix(vec3(0.36, 0.13, 0.06), c, aaStep(9.0, edge));
  rough = 0.95;
  return c;
}

// Airstrip + apron of one site (main base or a secondary farm). off: site
// offset from the main base layout; surf: 0 laterite, 1 red earth, 2 mown
// grass, 3 gravel, 4 rough red earth (forest strip: ruts, grass tufts),
// 5 pale chapada sand.
vec3 stripColor(vec3 col, inout float rough, vec2 p, vec4 rw, vec4 apr, vec4 txw, vec2 pad, vec2 fuel, vec2 off, float surf,
    vec4 nA, vec4 nB, vec4 nC, vec4 nD, vec4 det, float near) {
  float dRw = sdBox(p, rw);
  float dAp = min(sdBox(p, apr), sdBox(p, txw));
  float dr = min(dRw, dAp);
  if (dr < 8.0) {
    float zc = 0.5 * (rw.y + rw.w);
    float hwR = 0.5 * (rw.w - rw.y);
    float cl = p.y - zc + (nB.r - 0.5) * 1.6;
    vec3 lat = mix(vec3(0.285, 0.150, 0.078), vec3(0.385, 0.215, 0.120), smoothstep(0.25, 0.8, nC.r));
    if (surf > 0.5 && surf < 1.5) lat = mix(vec3(0.36, 0.17, 0.085), vec3(0.47, 0.24, 0.13), smoothstep(0.2, 0.8, nC.r)); // red earth
    if (surf > 1.5 && surf < 2.5) lat = grassColor(p, nA, nB, nC, nD) * vec3(1.16, 1.2, 0.9) * (0.86 + 0.2 * smoothstep(0.35, 0.65, abs(fract((p.y - rw.y) / 6.0) - 0.5) * 2.0)); // mown grass, mower stripes
    if (surf > 2.5 && surf < 3.5) lat = mix(vec3(0.40, 0.37, 0.33), vec3(0.55, 0.51, 0.45), smoothstep(0.2, 0.85, nD.b)); // gravel
    if (surf > 3.5 && surf < 4.5) {
      // Rough red earth: darker, wetter latosol with tufts of grass between the ruts.
      lat = mix(vec3(0.30, 0.12, 0.06), vec3(0.42, 0.19, 0.10), smoothstep(0.2, 0.8, nC.r));
      lat = mix(lat, grassColor(p, nA, nB, nC, nD) * 0.95, smoothstep(0.55, 0.8, nC.g + nB.b * 0.35) * 0.7);
    }
    if (surf > 4.5) lat = mix(vec3(0.52, 0.40, 0.27), vec3(0.66, 0.53, 0.37), smoothstep(0.2, 0.85, nC.r)); // chapada sand
    lat *= 0.9 + 0.18 * nD.g;
    float track = exp(-pow((abs(cl) - 1.55) / 0.95, 2.0));
    float ends = max(1.0 - smoothstep(10.0, 26.0, length(p - vec2(rw.x + 14.0, zc))), 1.0 - smoothstep(10.0, 26.0, length(p - vec2(rw.z - 14.0, zc))));
    track = max(track, ends * 0.8);
    float scuff = smoothstep(0.55, 0.9, nD.r) * track * (1.0 - smoothstep(60.0, 200.0, abs(p.x - rw.x - 120.0))) ;
    lat = mix(lat, lat * (surf > 1.5 && surf < 2.5 ? vec3(0.95, 0.86, 0.66) : surf > 3.5 && surf < 4.5 ? vec3(0.62, 0.55, 0.52) : vec3(0.76, 0.70, 0.68)), track * 0.65);
    lat = mix(lat, vec3(0.06, 0.05, 0.045), scuff * 0.35);
    lat = soilDetail(lat, det, near, 1.0 - track * 0.6, 0.2 * track);
    float edgeIn = hwR - abs(p.y - zc);
    float creep = 1.0 - smoothstep(0.0, 2.2 + nC.g * 2.5, edgeIn + (nD.r - 0.5) * 1.6);
    vec3 g = mix(lat, grassColor(p, nA, nB, nC, nD) * 0.92, creep * 0.75 * step(dRw, dAp));

    vec3 ap = dirtColor(nB, nC, nD) * vec3(1.06, 1.08, 1.1);
    float tx = 1.0 - smoothstep(1.2, 2.6, min(segD(p, off + vec2(-382.0, -14.0), off + vec2(-370.0, -46.0)), segD(p, off + vec2(-370.0, -46.0), pad)));
    float padWear = 1.0 - smoothstep(4.0, 11.0, length(p - pad));
    ap = mix(ap, ap * vec3(0.78, 0.72, 0.7), max(tx * 0.6, padWear * 0.45));
    float oil = smoothstep(0.62, 0.8, nC.b) * (1.0 - smoothstep(4.0, 9.0, length(p - fuel))) + smoothstep(0.7, 0.85, nD.g) * padWear * 0.5;
    ap = mix(ap, vec3(0.045, 0.035, 0.03), oil * 0.6);
    ap = soilDetail(ap, det, near, 0.6, 0.3 * (1.0 - padWear) * smoothstep(0.4, 0.7, nB.b));
    g = mix(ap, g, step(dRw, dAp));
    float m = 1.0 - aaStep(0.0, dr + (nC.b - 0.5) * 0.8);
    col = mix(col, g, m);
    rough = mix(rough, 0.92, m);
  }

  return col;
}

vec3 terrainColor(vec2 p, out float rough) {
  vec4 nA = texture2D(uNoise, p * 0.0021);
  vec4 nB = texture2D(uNoise, p * 0.017);
  vec4 nC = texture2D(uNoise, p * 0.13);
  vec4 nD = texture2D(uNoise, p * 0.9);
  rough = 0.95;
  if (abs(p.x) > uWorldHalf - 2.0 || abs(p.y) > uWorldHalf - 2.0) return farPatchwork(p, nA, nB, nC, nD, rough);
  float near;
  vec4 det = detailAt(p, near);
  vec3 col = grassColor(p, nA, nB, nC, nD);
  // Grass clumps: darker hollows and lit tops close up.
  col *= mix(1.0, 0.78 + 0.42 * det.b * det.a + 0.12 * det.a, near);
  tBump = det.b * 0.6 + det.a * 0.4;
  tBumpK = near * 0.7;

  // Slopes: grass thins out and the red soil shows through (erosion, cattle
  // tracks) on the steeper ground, mostly on the shaded-looking flanks.
  float steep = smoothstep(0.992, 0.955, vTN);
  col = mix(col, dirtColor(nB, nC, nD) * 0.92, steep * 0.34 * smoothstep(0.35, 0.7, nC.g + nA.g * 0.5));

  // Fields + carreadores. Regions: a pixel of the original 8 x 8 km map
  // looks through its fields only, one of the outer ring through the ring's
  // (fields near the border are in both ranges).
  bool outer = max(abs(p.x), abs(p.y)) > RING_IN;
  int f0 = outer ? NF_RING0 : 0, f1 = outer ? NF : NF_IN1;
  float dmin = 1e9;
  int imin = 0;
  for (int i = f0; i < f1; i++) {
    float d = sdBox(p, uFieldRect[i]);
    if (d < dmin) { dmin = d; imin = i; }
  }
  if (dmin < 14.0) {
    vec4 info = uFieldInfo[imin];
    float inField = 1.0 - aaStep(-0.4, dmin);
    // Ground the machines have worked: harvested (stubble) or tilled (dark soil).
    float worked = 0.0;
    for (int i = 0; i < NCUT; i++) {
      vec4 r = uCut[i];
      float wk = mod(uCutKind[i], 4.0);
      if (wk > 0.5 && p.x > r.x && p.x < r.z && p.y > r.y && p.y < r.w) { info.x = wk < 1.5 ? 3.0 : 4.0; info.z = 1.0; info.w = wk < 1.5 ? 0.5 : 0.9; worked = wk; }
    }
    vec3 fc = fieldColor(p, info, -dmin, nA, nB, nC, nD, rough);
    if (worked > 1.5) fc *= vec3(0.7, 0.64, 0.6);
    // Soil grain, clods and straw relief close up (bump) on cropped ground.
    if (info.x < 2.5) fc = soilDetail(fc, det, near, 0.55, 0.25);
    float rough2 = rough;
    // Carreador ring, slightly irregular edge, and a rank grass verge outside it.
    float ringOuter = 7.0 + (nB.g - 0.5) * 2.0;
    float ring = aaStep(0.6, dmin) * (1.0 - aaStep(ringOuter, dmin));
    vec3 dc = dirtColor(nB, nC, nD);
    // Two wheel tracks along the carreador.
    float tr = 1.0 - smoothstep(0.3, 0.7, abs(abs(dmin - ringOuter * 0.5) - 1.0));
    dc = mix(dc, dc * vec3(0.8, 0.74, 0.72), tr * 0.6);
    float verge = (1.0 - aaStep(ringOuter + 3.5, dmin)) * aaStep(ringOuter, dmin);
    col = mix(col, col * vec3(0.78, 0.86, 0.78), verge);
    vec3 dcd = soilDetail(dc, det, near, 0.5, 0.35);
    col = mix(col, dcd, ring);
    col = mix(col, fc, inField);
    rough = mix(0.95, rough2, inField);
  }

  // Farm roads: compacted red earth, two tyre ruts, grass in the middle of
  // the lighter-used tracks.
  for (int i = 0; i < NR; i++) {
    vec4 s = uRoadSeg[i];
    float d = segD(p, s.xy, s.zw);
    float hw = uRoadW[i] * 0.5 + (nB.g - 0.5) * 1.2;
    if (d < hw + 2.0) {
      float m = 1.0 - aaStep(hw, d);
      vec3 rc = dirtColor(nB, nC, nD);
      float rut = 1.0 - smoothstep(0.25, 0.6, abs(d - 1.2));
      rc = mix(rc, rc * vec3(0.74, 0.66, 0.64), rut * 0.75);
      rc = mix(rc, rc * 1.12 + vec3(0.025, 0.012, 0.0), (1.0 - smoothstep(0.0, 0.9, abs(d - hw + 0.6))) * 0.5);
      float mid = (1.0 - smoothstep(0.25, 0.6, d)) * step(uRoadW[i], 7.5) * smoothstep(0.4, 0.7, nC.g);
      rc = mix(rc, grassColor(p, nA, nB, nC, nD) * 0.9, mid * 0.75);
      rc = soilDetail(rc, det, near, 0.8, 0.5 * (1.0 - rut));
      col = mix(col, rc, m);
      rough = mix(rough, 0.97, m);
    }
  }

  // Airstrip: compacted laterite (cascalho) with two darker, smoother wheel
  // tracks, loose gravel between and beside them, grass creeping in at the
  // edges, worn turn-around patches at both ends and tyre scuffs where
  // aircraft touch down. Apron / taxiway: compacted red earth, oil stains at
  // the service pad, darker taxi tracks.
  col = stripColor(col, rough, p, uRunway, uApron, uTaxi, uPad, uFuel, vec2(0.0), 0.0, nA, nB, nC, nD, det, near);
  for (int i = outer ? NS_IN : 0; i < (outer ? NS : NS_IN); i++) {
    vec4 so = uSiteOff[i];
    col = stripColor(col, rough, p, uSiteRw[i], uSiteAp[i], uSiteTx[i], so.xy + uPad, so.xy + uFuel, so.xy, so.z, nA, nB, nC, nD, det, near);
  }

  // Creek banks: wet earth and sand.
  float dc = 1e9;
  for (int i = 0; i < NC - 1; i++) dc = min(dc, segD(p, uCreek[i], uCreek[i + 1]));
  if (dc < 20.0) {
    vec3 mud = mix(vec3(0.11, 0.055, 0.03), vec3(0.30, 0.22, 0.14), smoothstep(0.4, 0.7, nC.r));
    float m = 1.0 - smoothstep(7.0, 14.0 + nC.g * 4.0, dc);
    col = mix(col, mud, m);
  }
  // Stream banks and pond shores: wet earth, then lush grass.
  float ds = 1e9;
  if (sdBox(p, uStreamBox) < 30.0) for (int i = 0; i < NSTP - 1; i++) ds = min(ds, segD(p, uStream[i], uStream[i + 1]));
  for (int i = 0; i < NPOND; i++) {
    vec4 q = uPond[i];
    vec2 d = p - q.xy;
    if (dot(d, d) > q.z * q.z * 3.0) continue;
    float a = atan(d.y, d.x);
    float rr = q.z * (1.0 + 0.16 * sin(2.0 * a + q.w) + 0.09 * sin(3.0 * a + q.w * 1.7));
    ds = min(ds, abs(length(d) - rr) + 2.0);
  }
  if (ds < 30.0) {
    vec3 mud = mix(vec3(0.12, 0.07, 0.04), vec3(0.28, 0.21, 0.13), smoothstep(0.4, 0.7, nC.r));
    col = mix(col, col * vec3(0.78, 0.95, 0.7), 1.0 - smoothstep(10.0, 28.0, ds));
    col = mix(col, mud, 1.0 - smoothstep(4.0, 10.0 + nC.g * 4.0, ds));
  }
  return col;
}

// Bump from tBump (Mikkelsen's surface-gradient perturbation, as in three's
// bumpmap chunk) so pebbles, ruts and grass clumps catch the low sun.
vec3 terrainBump(vec3 surf_pos, vec3 surf_norm, float faceDirection) {
  vec2 dHdxy = vec2(dFdx(tBump), dFdy(tBump)) * 0.022 * tBumpK; // ~2 cm relief
  vec3 vSigmaX = dFdx(surf_pos);
  vec3 vSigmaY = dFdy(surf_pos);
  vec3 R1 = cross(vSigmaY, surf_norm);
  vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;

export function createTerrainMaterial(noiseTex, detailTex) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.0 });
  const nf = FIELDS.length;
  // Field order for the shader: original-map fields, the ones near the ring
  // border (in both ranges), then the ring's own (see terrainColor).
  const RING_IN = 4000, M = 30;
  const touchesIn = (f) => f.x0 - M < RING_IN && f.x1 + M > -RING_IN && f.z0 - M < RING_IN && f.z1 + M > -RING_IN;
  const touchesOut = (f) => !(f.x0 - M > -RING_IN && f.x1 + M < RING_IN && f.z0 - M > -RING_IN && f.z1 + M < RING_IN);
  const inOnly = FIELDS.filter((f) => touchesIn(f) && !touchesOut(f)), both = FIELDS.filter((f) => touchesIn(f) && touchesOut(f)), outOnly = FIELDS.filter((f) => !touchesIn(f));
  const SF = [...inOnly, ...both, ...outOnly];
  const nsIn = FARM_SITES.filter((st) => !st.farm.ring).length;
  const segs = [];
  for (const r of ROADS) if (!r.mesh) for (let i = 0; i < r.pts.length - 1; i++) segs.push({ a: r.pts[i], b: r.pts[i + 1], w: r.w });
  const nr = segs.length;
  const nc = CREEK.points.length;
  const stp = WATER.streams[0].points;
  mat.defines = {
    NF: nf, NR: nr, NC: nc, NS: FARM_SITES.length, NCUT, NSTP: stp.length, NPOND: WATER.ponds.length,
    RING_IN: RING_IN.toFixed(1), NF_IN1: inOnly.length + both.length, NF_RING0: inOnly.length, NS_IN: nsIn,
  };
  const uniforms = {
    uNoise: { value: noiseTex },
    uDetail: { value: detailTex },
    uPad: { value: new THREE.Vector2(BASE.pad.x, BASE.pad.z) },
    uFuel: { value: new THREE.Vector2(BASE.fuelTank.x, BASE.fuelTank.z) },
    uFieldRect: { value: SF.map((f) => new THREE.Vector4(f.x0, f.z0, f.x1, f.z1)) },
    uFieldInfo: {
      value: SF.map((f) => {
        const sp = { soy: 0.5, corn: 0.8, cotton: 0.9, stubble: 0.5, fallow: 0.9, pasture: 0 }[f.crop];
        return new THREE.Vector4(CROP_CODE[f.crop], f.rowAxis === 'x' ? 0 : 1, f.growth, sp);
      }),
    },
    uRoadSeg: { value: segs.map((s) => new THREE.Vector4(s.a[0], s.a[1], s.b[0], s.b[1])) },
    uRoadW: { value: segs.map((s) => s.w) },
    uCreek: { value: CREEK.points.map((p) => new THREE.Vector2(p[0], p[1])) },
    uRunway: { value: new THREE.Vector4(RUNWAY.x0, RUNWAY.z - RUNWAY.width / 2, RUNWAY.x1, RUNWAY.z + RUNWAY.width / 2) },
    uApron: { value: new THREE.Vector4(BASE.apron.x0, BASE.apron.z0, BASE.apron.x1, BASE.apron.z1) },
    uTaxi: { value: new THREE.Vector4(BASE.taxiway.x0, BASE.taxiway.z0, BASE.taxiway.x1, BASE.taxiway.z1) },
    uSiteRw: { value: FARM_SITES.map((s) => new THREE.Vector4(s.runway.x0, s.runway.z - s.runway.width / 2, s.runway.x1, s.runway.z + s.runway.width / 2)) },
    uSiteAp: { value: FARM_SITES.map((s) => new THREE.Vector4(s.apron.x0, s.apron.z0, s.apron.x1, s.apron.z1)) },
    uSiteTx: { value: FARM_SITES.map((s) => new THREE.Vector4(s.taxiway.x0, s.taxiway.z0, s.taxiway.x1, s.taxiway.z1)) },
    uSiteOff: { value: FARM_SITES.map((s) => new THREE.Vector4(s.dx, s.dz, s.runway.surface, 0)) },
    uWorldHalf: { value: WORLD_HALF },
    uCut: CUT_U.rects,
    uCropR0: CROP_U.r0,
    uCropTop: CROP_U.top,
    uStream: { value: stp.map((q) => new THREE.Vector2(q[0], q[1])) },
    uStreamBox: { value: new THREE.Vector4(Math.min(...stp.map((q) => q[0])), Math.min(...stp.map((q) => q[1])), Math.max(...stp.map((q) => q[0])), Math.max(...stp.map((q) => q[1]))) },
    uPond: { value: WATER.ponds.map((q) => new THREE.Vector4(q.x, q.z, q.r, q.ph)) },
    uCutKind: CUT_U.kinds,
    uWet: ATMO_U.wet,
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying float vTN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTN = normal.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWet;\n' + GLSL_FUNCS)
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat tRough;\ndiffuseColor.rgb = terrainColor(vWPos.xz, tRough);\n'
        + '// Rain-soaked ground: darker, glossier (bare soil and roads most).\n'
        + 'diffuseColor.rgb *= 1.0 - uWet * mix(0.22, 0.4, smoothstep(0.75, 0.95, tRough));\ntRough = mix(tRough, tRough * 0.55, uWet);')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = terrainBump(-vViewPosition, normal, faceDirection);');
  };
  mat.customProgramCacheKey = () => 'terrain-v6';
  return mat;
}

function buildChunk(td, cx, cz, size, step) {
  const N = td.n;
  const verts = size / step + 1;
  // +4 skirt strips
  const pos = [], nrm = [], idx = [];
  const nAt = (ix, iz) => {
    const c = (i, j) => td.h[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))];
    const hx = (c(ix + step, iz) - c(ix - step, iz)) * RELIEF_SHADE;
    const hz = (c(ix, iz + step) - c(ix, iz - step)) * RELIEF_SHADE;
    const l = Math.hypot(hx, 2 * CELL * step, hz);
    return [-hx / l, (2 * CELL * step) / l, -hz / l];
  };
  for (let j = 0; j < verts; j++) {
    for (let i = 0; i < verts; i++) {
      const ix = cx + i * step, iz = cz + j * step;
      pos.push(-WORLD_HALF + ix * CELL, td.h[iz * N + ix], -WORLD_HALF + iz * CELL);
      nrm.push(...nAt(ix, iz));
    }
  }
  for (let j = 0; j < verts - 1; j++) {
    for (let i = 0; i < verts - 1; i++) {
      const a = j * verts + i, d = a + 1, b = a + verts, c = b + 1;
      idx.push(a, b, d, b, c, d);
    }
  }
  // Skirts hide cracks between LOD levels.
  const edge = (list) => {
    const base = pos.length / 3;
    for (const v of list) {
      pos.push(pos[v * 3], pos[v * 3 + 1] - 6, pos[v * 3 + 2]);
      nrm.push(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]);
    }
    for (let k = 0; k < list.length - 1; k++) {
      const a = list[k], b = list[k + 1], a2 = base + k, b2 = base + k + 1;
      idx.push(a, a2, b, b, a2, b2, a, b, a2, b, b2, a2);
    }
  };
  const top = [], bottom = [], left = [], right = [];
  for (let i = 0; i < verts; i++) {
    top.push(i); bottom.push((verts - 1) * verts + i); left.push(i * verts); right.push(i * verts + verts - 1);
  }
  edge(top); edge(bottom); edge(left); edge(right);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export function createTerrain(td, noiseTex) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const mat = createTerrainMaterial(noiseTex, makeGroundDetail(256));
  const CH = 48; // cells per chunk (750 m)
  const chunks = GRID_N / CH;
  for (let j = 0; j < chunks; j++) {
    for (let i = 0; i < chunks; i++) {
      const lod = new THREE.LOD();
      const cx = i * CH, cz = j * CH;
      // (Distances from the chunk centre: a 750 m chunk keeps its finest
      // level until its near edge is ~700 m away, as the 500 m chunks did.)
      const levels = [[1, 0], [2, 1075], [4, 2125], [8, 4325]];
      for (const [step, dist] of levels) {
        const m = new THREE.Mesh(buildChunk(td, cx, cz, CH, step), mat);
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        lod.addLevel(m, dist, 0.15);
      }
      // LOD distance is measured from the chunk centre.
      const center = new THREE.Vector3(-WORLD_HALF + (cx + CH / 2) * CELL, 0, -WORLD_HALF + (cz + CH / 2) * CELL);
      lod.position.copy(center);
      for (const l of lod.levels) l.object.position.set(-center.x, 0, -center.z), l.object.updateMatrix();
      lod.updateMatrix();
      lod.matrixAutoUpdate = false;
      lod.autoUpdate = true;
      group.add(lod);
    }
  }
  group.add(createFarRing(mat));
  return { group, material: mat };
}

function createFarRing(mat) {
  const step = 500;
  const n = (FAR_HALF * 2) / step;
  const pos = [], idx = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = -FAR_HALF + i * step, z = -FAR_HALF + j * step;
      let h = rawHeight(x, z) * 1.6;
      const inside = Math.abs(x) < WORLD_HALF && Math.abs(z) < WORLD_HALF;
      const onEdge = Math.abs(x) <= WORLD_HALF && Math.abs(z) <= WORLD_HALF && !inside;
      if (inside) h = -60;
      else if (onEdge) h = rawHeight(x, z) - 0.4;
      // Fall off very slowly toward the horizon so the edge never shows.
      h -= Math.max(0, Math.hypot(x, z) - 9000) * 0.004;
      pos.push(x, h, z);
    }
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, d = a + 1, b = a + n + 1, c = b + 1;
    idx.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.name = 'farRing';
  m.receiveShadow = false;
  return m;
}
