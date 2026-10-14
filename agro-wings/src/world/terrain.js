// Terrain rendering: LOD chunks of the shared height grid, a far horizon ring,
// and a ground shader that draws roads, strip, apron, fields and creek banks
// analytically from the farm layout (crisp edges at any distance, no huge
// splat textures).
import * as THREE from 'three';
import { GRID_N, CELL } from './terrainData.js';
import {
  WORLD_HALF, FAR_HALF, RUNWAY, BASE, FIELDS, ROADS, CREEK,
} from './layout.js';
import { rawHeight } from './terrainData.js';

const CROP_CODE = { soy: 0, corn: 1, cotton: 2, stubble: 3, fallow: 4, pasture: 5 };

const GLSL_FUNCS = /* glsl */ `
varying vec3 vWPos;
uniform sampler2D uNoise;
uniform vec4 uFieldRect[NF];
uniform vec4 uFieldInfo[NF];
uniform vec4 uRoadSeg[NR];
uniform float uRoadW[NR];
uniform vec2 uCreek[NC];
uniform vec4 uRunway;
uniform vec4 uApron;
uniform vec4 uTaxi;
uniform float uWorldHalf;

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

vec3 grassColor(vec2 p, vec4 nA, vec4 nB, vec4 nC, vec4 nD) {
  vec3 g1 = vec3(0.090, 0.185, 0.030);
  vec3 g2 = vec3(0.190, 0.215, 0.055);
  vec3 g3 = vec3(0.060, 0.120, 0.025);
  vec3 c = mix(g1, g2, smoothstep(0.35, 0.78, nA.r));
  c = mix(c, g3, smoothstep(0.55, 0.85, nB.g) * 0.55);
  c *= 0.78 + 0.42 * nC.b;
  c *= 0.86 + 0.28 * nD.a;
  return c;
}

vec3 dirtColor(vec4 nB, vec4 nC, vec4 nD) {
  vec3 d1 = vec3(0.30, 0.036, 0.009);
  vec3 d2 = vec3(0.43, 0.078, 0.022);
  vec3 c = mix(d1, d2, smoothstep(0.3, 0.8, nC.r));
  c *= 0.85 + 0.25 * nD.b;
  return c;
}

vec3 fieldColor(vec2 p, vec4 info, float edgeIn, vec4 nA, vec4 nB, vec4 nC, vec4 nD, inout float rough) {
  float type = info.x;
  float coord = info.y < 0.5 ? p.y : p.x;
  float fade;
  float s = rows(coord, info.w > 0.0 ? info.w : 0.9, fade);
  vec3 soil = mix(vec3(0.17, 0.050, 0.022), vec3(0.25, 0.075, 0.030), nC.r);
  vec3 c;
  if (type < 2.5) {
    vec3 straw = vec3(0.34, 0.25, 0.12);
    c = mix(soil, straw, smoothstep(0.45, 0.75, nD.g) * 0.45);
    vec3 green = type < 0.5 ? vec3(0.070, 0.190, 0.030) : type < 1.5 ? vec3(0.075, 0.165, 0.030) : vec3(0.070, 0.150, 0.040);
    float cover = smoothstep(0.0, 0.7, info.z);
    c = mix(c, green * (0.85 + 0.3 * nB.r), cover * mix(0.9, s, fade * (1.0 - info.z * 0.6)));
    rough = 0.9;
  } else if (type < 3.5) {
    vec3 a = vec3(0.47, 0.37, 0.18), b = vec3(0.33, 0.24, 0.11);
    c = mix(b, a, mix(0.55, s, fade * 0.8));
    c = mix(c, soil, smoothstep(0.6, 0.85, nC.g) * 0.35);
    c *= 0.88 + 0.24 * nD.r;
    rough = 0.95;
  } else if (type < 4.5) {
    vec3 a = vec3(0.40, 0.075, 0.028), b = vec3(0.27, 0.050, 0.020);
    c = mix(b, a, mix(0.6, s, fade));
    c *= 0.82 + 0.3 * nC.b;
    rough = 1.0;
  } else {
    c = grassColor(p * 1.7, nA, nB, nC, nD) * vec3(1.05, 1.15, 1.0);
    // Cattle paths.
    c = mix(c, vec3(0.30, 0.10, 0.04), smoothstep(0.62, 0.66, nB.b) * (1.0 - smoothstep(0.66, 0.70, nB.b)) * 0.7);
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
  if (k < 0.32) c = vec3(0.070, 0.190, 0.030) * (0.85 + 0.3 * nB.g);
  else if (k < 0.45) c = vec3(0.075, 0.150, 0.028);
  else if (k < 0.55) c = vec3(0.42, 0.33, 0.16);
  else if (k < 0.63) c = vec3(0.36, 0.070, 0.026);
  else if (k < 0.82) c = vec3(0.030, 0.075, 0.018) * (0.8 + 0.4 * nC.r);
  else c = grassColor(p, nA, nB, nC, nD);
  c = mix(vec3(0.50, 0.11, 0.04), c, aaStep(9.0, edge));
  rough = 0.95;
  return c;
}

vec3 terrainColor(vec2 p, out float rough) {
  vec4 nA = texture2D(uNoise, p * 0.0021);
  vec4 nB = texture2D(uNoise, p * 0.017);
  vec4 nC = texture2D(uNoise, p * 0.13);
  vec4 nD = texture2D(uNoise, p * 0.9);
  rough = 0.95;
  if (abs(p.x) > uWorldHalf - 2.0 || abs(p.y) > uWorldHalf - 2.0) return farPatchwork(p, nA, nB, nC, nD, rough);
  vec3 col = grassColor(p, nA, nB, nC, nD);

  // Fields + carreadores.
  float dmin = 1e9;
  int imin = 0;
  for (int i = 0; i < NF; i++) {
    float d = sdBox(p, uFieldRect[i]);
    if (d < dmin) { dmin = d; imin = i; }
  }
  if (dmin < 12.0) {
    vec4 info = uFieldInfo[imin];
    float inField = 1.0 - aaStep(-0.4, dmin);
    vec3 fc = fieldColor(p, info, -dmin, nA, nB, nC, nD, rough);
    float rough2 = rough;
    // Carreador ring, slightly irregular edge.
    float ringOuter = 7.0 + (nB.g - 0.5) * 2.0;
    float ring = aaStep(0.6, dmin) * (1.0 - aaStep(ringOuter, dmin));
    vec3 dc = dirtColor(nB, nC, nD);
    col = mix(col, dc, ring);
    col = mix(col, fc, inField);
    rough = mix(0.95, rough2, inField);
  }

  // Roads with tyre ruts.
  for (int i = 0; i < NR; i++) {
    vec4 s = uRoadSeg[i];
    vec2 a = s.xy, b = s.zw;
    vec2 pa = p - a, ba = b - a;
    float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float d = length(pa - ba * t);
    float hw = uRoadW[i] * 0.5 + (nB.g - 0.5) * 1.2;
    if (d < hw + 2.0) {
      float m = 1.0 - aaStep(hw, d);
      vec3 rc = dirtColor(nB, nC, nD);
      float rut = 1.0 - smoothstep(0.25, 0.55, abs(d - 1.15));
      rc = mix(rc, rc * vec3(0.72, 0.62, 0.6), rut * 0.8);
      rc = mix(rc, rc * 1.12 + vec3(0.03, 0.015, 0.0), (1.0 - smoothstep(0.0, 0.7, d)) * 0.5);
      col = mix(col, rc, m);
      rough = mix(rough, 0.97, m);
    }
  }

  // Strip (light compacted gravel) and apron/taxiway (compacted red earth).
  float dRw = sdBox(p, uRunway);
  float dAp = min(sdBox(p, uApron), sdBox(p, uTaxi));
  float dr = min(dRw, dAp);
  if (dr < 6.0) {
    vec3 g = mix(vec3(0.30, 0.205, 0.125), vec3(0.42, 0.32, 0.21), smoothstep(0.25, 0.8, nC.r));
    vec3 ap = mix(vec3(0.30, 0.10, 0.045), vec3(0.40, 0.17, 0.08), smoothstep(0.25, 0.8, nC.r));
    g = mix(ap, g, step(dRw, dAp));
    g *= 0.9 + 0.18 * nD.g;
    float cl = abs(p.y - 0.5 * (uRunway.y + uRunway.w));
    float onRw = step(uRunway.x, p.x) * step(p.x, uRunway.z);
    g = mix(g, g * vec3(0.82, 0.74, 0.7), onRw * (1.0 - smoothstep(1.5, 6.0, cl)) * 0.55);
    g *= 1.0 - 0.25 * smoothstep(0.66, 0.8, nB.b) * (1.0 - onRw);
    float m = 1.0 - aaStep(0.0, dr + (nC.b - 0.5) * 0.6);
    col = mix(col, g, m);
    rough = mix(rough, 0.9, m);
  }

  // Creek banks: wet earth and sand.
  float dc = 1e9;
  for (int i = 0; i < NC - 1; i++) {
    vec2 a = uCreek[i], b = uCreek[i + 1];
    vec2 pa = p - a, ba = b - a;
    float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    dc = min(dc, length(pa - ba * t));
  }
  if (dc < 20.0) {
    vec3 mud = mix(vec3(0.11, 0.055, 0.03), vec3(0.32, 0.24, 0.15), smoothstep(0.4, 0.7, nC.r));
    float m = 1.0 - smoothstep(7.0, 14.0 + nC.g * 4.0, dc);
    col = mix(col, mud, m);
  }
  return col;
}
`;

export function createTerrainMaterial(noiseTex) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.0 });
  const nf = FIELDS.length;
  const segs = [];
  for (const r of ROADS) for (let i = 0; i < r.pts.length - 1; i++) segs.push({ a: r.pts[i], b: r.pts[i + 1], w: r.w });
  const nr = segs.length;
  const nc = CREEK.points.length;
  mat.defines = { NF: nf, NR: nr, NC: nc };
  const uniforms = {
    uNoise: { value: noiseTex },
    uFieldRect: { value: FIELDS.map((f) => new THREE.Vector4(f.x0, f.z0, f.x1, f.z1)) },
    uFieldInfo: {
      value: FIELDS.map((f) => {
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
    uWorldHalf: { value: WORLD_HALF },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_FUNCS)
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat tRough;\ndiffuseColor.rgb = terrainColor(vWPos.xz, tRough);')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;');
  };
  mat.customProgramCacheKey = () => 'terrain-v1';
  return mat;
}

function buildChunk(td, cx, cz, size, step) {
  const N = td.n;
  const verts = size / step + 1;
  // +4 skirt strips
  const pos = [], nrm = [], idx = [];
  const nAt = (ix, iz) => {
    const c = (i, j) => td.h[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))];
    const hx = c(ix + step, iz) - c(ix - step, iz);
    const hz = c(ix, iz + step) - c(ix, iz - step);
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
  const mat = createTerrainMaterial(noiseTex);
  const CH = 32; // cells per chunk (500 m)
  const chunks = GRID_N / CH;
  for (let j = 0; j < chunks; j++) {
    for (let i = 0; i < chunks; i++) {
      const lod = new THREE.LOD();
      const cx = i * CH, cz = j * CH;
      const levels = [[1, 0], [2, 900], [4, 1900], [8, 3200]];
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
