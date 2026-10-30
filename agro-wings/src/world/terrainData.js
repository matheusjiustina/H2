// Terrain heights and surface types. Pure JS (no three.js) so the flight model
// and tests can query the exact same triangulated surface the renderer draws.
import { fbm, smoothstep, lerp, segDist, clamp } from '../core/math.js';
import { reliefAt, ringReliefAt } from './relief.js';
import {
  WORLD_HALF, RUNWAY, BASE, FIELDS, CREEK, ROADS, HQ, fieldAt, cropHeight, FARM_SITES, stripLevel, WATER, pondRadius,
} from './layout.js';

// Slope exaggeration of the shading normals (visual only).
export const RELIEF_SHADE = 1.9;

export const GRID_N = 768; // cells per side
export const CELL = (WORLD_HALF * 2) / GRID_N; // 15.625 m

function creekDist(x, z) {
  const p = CREEK.points;
  let d = 1e9;
  for (let i = 0; i < p.length - 1; i++) {
    const s = segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]);
    if (s < d) d = s;
  }
  return d;
}

function polyDist(pts, x, z) {
  let d = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const s = segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (s < d) d = s;
  }
  return d;
}

// Nearest point of a polyline: distance, segment index, parameter on it.
const _pn = { d: 0, i: 0, t: 0 };
function polyNearest(pts, x, z, out) {
  out.d = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < out.d) { out.d = d; out.i = i; out.t = t; }
  }
  return out;
}

function rectMask(x, z, x0, x1, z0, z1, fall) {
  const dx = Math.max(x0 - x, 0, x - x1);
  const dz = Math.max(z0 - z, 0, z - z1);
  const d = Math.hypot(dx, dz);
  return 1 - smoothstep(0, fall, d);
}

function baseHeight(x, z) {
  let h = 10 * fbm(x / 2600 + 3.1, z / 2600 - 1.7, 4) + 3.2 * fbm(x / 650 - 7.2, z / 650 + 2.4, 3);
  // A gentle swell under the corn talhão so the work height keeps changing.
  h += 5.5 * Math.exp(-((x + 10) ** 2 + (z - 500) ** 2) / (2 * 190 ** 2));
  h -= 3 * Math.exp(-((x - 120) ** 2 + (z - 300) ** 2) / (2 * 140 ** 2));
  return h;
}

const H0 = baseHeight(-100, -40);

// Bounding boxes for quick rejects: beyond them the creek's relief fade,
// valley and channel, or a stream's valley, are exactly zero.
const CREEK_X = [Math.min(...CREEK.points.map((p) => p[0])) - 480, Math.max(...CREEK.points.map((p) => p[0])) + 480];
for (const st of WATER.streams) {
  const xs = st.points.map((p) => p[0]), zs = st.points.map((p) => p[1]);
  st.box = [Math.min(...xs) - st.valley, Math.max(...xs) + st.valley, Math.min(...zs) - st.valley, Math.max(...zs) + st.valley];
}

// Natural ground before the farm pads (strip/base platforms, HQ pad).
function naturalHeight(x, z) {
  let h = baseHeight(x, z) - H0;
  const cd = x < CREEK_X[0] || x > CREEK_X[1] ? 1e9 : creekDist(x, z);
  // Rolling country and hills in the outer zones (exactly zero over the farm
  // core). The creek keeps a calm floodplain through them.
  const rel = reliefAt(x, z) + ringReliefAt(x, z);
  if (rel !== 0) h += rel * smoothstep(110, 480, cd);
  // Creek valley + channel.
  const v = 1 - smoothstep(0, CREEK.valley, cd);
  h -= CREEK.valleyDepth * v * v;
  h -= CREEK.depth * (1 - smoothstep(CREEK.width * 0.5, CREEK.width * 0.5 + 5, cd));
  // Streams: a shallow valley and the channel, cut below a water level that
  // only falls downstream.
  for (const st of WATER.streams) {
    const b = st.box;
    if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue;
    const q = polyNearest(st.points, x, z, _pn);
    if (q.d > st.valley || !st.levels) continue;
    const v2 = 1 - smoothstep(0, st.valley, q.d);
    h -= st.valleyDepth * v2 * v2;
    const L = lerp(st.levels[q.i], st.levels[q.i + 1], q.t);
    // (The channel is widened over the 15.6 m terrain grid so the water reads.)
    const bed = L - st.depth + (st.depth + 0.9) * smoothstep(st.width * 0.5, st.width * 0.5 + 12, q.d);
    h = Math.min(h, lerp(bed, h, smoothstep(st.width * 0.5 + 12, st.width * 0.5 + 26, q.d)));
  }
  // Ponds: a bowl under the water level, a gentle bank around it.
  for (const p of WATER.ponds) {
    const dx = x - p.x, dz = z - p.z;
    if (Math.abs(dx) > p.r * 2.6 || Math.abs(dz) > p.r * 2.6 || p.level === undefined) continue;
    const d = Math.hypot(dx, dz) / pondRadius(p, Math.atan2(dz, dx));
    if (d < 1) h = Math.min(h, p.level - 0.15 - p.depth * (1 - d * d));
    else if (d < 2.2) h = lerp(Math.min(h, p.level + 0.35 + (d - 1) * 1.2), h, smoothstep(1, 2.2, d));
  }
  return h;
}

// Stream water levels at its points: under the natural ground (with the
// valley), never rising downstream.
for (const st of WATER.streams) {
  const lv = [];
  for (let i = 0; i < st.points.length; i++) {
    const [x, z] = st.points[i];
    let mn = 1e9;
    for (const [ox, oz] of [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]]) mn = Math.min(mn, naturalHeight(x + ox, z + oz));
    lv.push(Math.min(mn - st.valleyDepth - 0.5, i ? lv[i - 1] : 1e9));
  }
  st.levels = lv;
}

// Pond levels: just under the lowest point of the rim.
for (const p of WATER.ponds) {
  let mn = 1e9;
  for (let a = 0; a < Math.PI * 2; a += 0.1) mn = Math.min(mn, naturalHeight(p.x + Math.cos(a) * pondRadius(p, a) * 1.12, p.z + Math.sin(a) * pondRadius(p, a) * 1.12));
  p.level = mn - 0.5;
}

export function rawHeight(x, z) {
  let h = naturalHeight(x, z);
  // Strip + base: perfectly flat platform with a long natural blend.
  const m = rectMask(x, z, RUNWAY.x0 - 80, RUNWAY.x1 + 60, -160, 45, 220);
  h = lerp(h, 0, m);
  // Farm headquarters pad.
  const hq = rectMask(x, z, HQ.house.x - 70, -920, -430, -190, 90);
  if (hq > 0) h = lerp(h, hqLevel, hq);
  // Secondary farm strips and service areas: a platform at the site level
  // (a graded strip rises east), blended into the land around it.
  for (const s of FARM_SITES) {
    const r = s.runway;
    if (x < r.x0 - 340 || x > r.x1 + 300 || z < r.z - 400 || z > r.z + 280) continue;
    const ms = rectMask(x, z, r.x0 - 80, r.x1 + 40, r.z - 160, r.z + 40, s.farm.blend ?? 160);
    if (ms > 0) h = lerp(h, stripLevel(s, x, z), ms);
  }
  return h;
}
// Site level: mean natural ground under the strip and its apron (outer-ring
// farms: fitted along the strip's grade and bank, so a sloping strip follows
// its hillside instead of standing on a long fill).
for (const s of FARM_SITES) {
  let sum = 0, n = 0;
  const tilt = s.farm.ring ? { ...s, y0: 0 } : null;
  for (let x = s.runway.x0 - 60; x <= s.runway.x1; x += 20) for (let z = s.runway.z - 140; z <= s.runway.z + 30; z += 20) { sum += naturalHeight(x, z) - (tilt ? stripLevel(tilt, x, z) : 0); n++; }
  s.y0 = Math.round((sum / n) * 10) / 10;
}
let hqLevel = 0;
hqLevel = (() => {
  // Evaluate once without the HQ term to get a natural pad level.
  let s = 0, n = 0;
  for (let x = -1300; x <= -940; x += 60) for (let z = -400; z <= -220; z += 60) {
    s += baseHeight(x, z) - H0; n++;
  }
  return s / n;
})();

export class TerrainData {
  constructor() {
    const N = GRID_N + 1;
    this.n = N;
    this.h = new Float32Array(N * N);
    for (let iz = 0; iz < N; iz++) {
      const z = -WORLD_HALF + iz * CELL;
      for (let ix = 0; ix < N; ix++) {
        const x = -WORLD_HALF + ix * CELL;
        this.h[iz * N + ix] = rawHeight(x, z);
      }
    }
    this.creekLevelCache = new Map();
  }

  // Height on the triangulated grid (matches the rendered mesh exactly).
  heightAt(x, z) {
    const N = this.n;
    let fx = (x + WORLD_HALF) / CELL, fz = (z + WORLD_HALF) / CELL;
    if (fx < 0 || fz < 0 || fx >= GRID_N || fz >= GRID_N) return rawHeight(x, z) - 0.5;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    fx -= ix; fz -= iz;
    const i = iz * N + ix;
    const a = this.h[i], d = this.h[i + 1], b = this.h[i + N], c = this.h[i + N + 1];
    // Cells are split along the b-d diagonal (see terrain mesh builder).
    if (fx + fz <= 1) return a + (d - a) * fx + (b - a) * fz;
    return c + (b - c) * (1 - fx) + (d - c) * (1 - fz);
  }

  normalAt(x, z, out = { x: 0, y: 1, z: 0 }) {
    const e = 1.5;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const l = Math.hypot(hx, 2 * e, hz);
    out.x = -hx / l; out.y = (2 * e) / l; out.z = -hz / l;
    return out;
  }

  // Normal used for shading only: the slope is exaggerated so gentle relief
  // reads from the air (the physical normal above is untouched).
  visualNormalAt(x, z, out = { x: 0, y: 1, z: 0 }) {
    const e = 1.5;
    const hx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) * RELIEF_SHADE;
    const hz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) * RELIEF_SHADE;
    const l = Math.hypot(hx, 2 * e, hz);
    out.x = -hx / l; out.y = (2 * e) / l; out.z = -hz / l;
    return out;
  }

  // Creek water surface (sits below the banks).
  waterLevel(x, z) {
    for (const p of WATER.ponds) {
      const dx = x - p.x, dz = z - p.z;
      if (Math.abs(dx) < p.r * 1.3 && Math.abs(dz) < p.r * 1.3 && Math.hypot(dx, dz) < pondRadius(p, Math.atan2(dz, dx)) * 1.02) return p.level;
    }
    for (const st of WATER.streams) {
      const q = polyNearest(st.points, x, z, _pn);
      if (q.d < st.width * 0.5 + 10) return lerp(st.levels[q.i], st.levels[q.i + 1], q.t);
    }
    const cd = creekDist(x, z);
    if (cd > CREEK.width * 0.5 + 6) return -1e9;
    // Bank height approximated from the uncarved terrain.
    const bank = this.heightAt(x, z) + CREEK.depth * (1 - smoothstep(CREEK.width * 0.5, CREEK.width * 0.5 + 5, cd));
    return bank - 1.0;
  }

  // Top of whatever the wheels or spray would meet: crop canopy over a field.
  surfaceTop(x, z) {
    const f = fieldAt(x, z);
    return this.heightAt(x, z) + (f ? cropHeight(f) : 0);
  }

  // Ground type for rolling resistance / bumps / dust.
  surfaceAt(x, z) {
    if (x >= RUNWAY.x0 && x <= RUNWAY.x1 && Math.abs(z - RUNWAY.z) <= RUNWAY.width / 2) return 'runway';
    const a = BASE.apron, t = BASE.taxiway;
    if (x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1) return 'runway';
    // Second helipad (Bell 206), gravel slab on the grass east of the apron.
    const h2 = BASE.helipad2;
    if (Math.abs(x - h2.x) <= 7.5 && Math.abs(z - h2.z) <= 7.5) return 'runway';
    if (x >= t.x0 && x <= t.x1 && z >= t.z0 && z <= t.z1) return 'runway';
    for (const s of FARM_SITES) {
      const r = s.runway;
      if (x < r.x0 - 60 || x > r.x1 + 10 || z < r.z - 120 || z > r.z + 20) continue;
      // Grass, rough red earth and loose chapada sand roll like grass.
      if (x >= r.x0 && x <= r.x1 && Math.abs(z - r.z) <= r.width / 2) return r.surface === 2 || r.surface >= 4 ? 'grass' : 'dirt';
      const a2 = s.apron, t2 = s.taxiway;
      if ((x >= a2.x0 && x <= a2.x1 && z >= a2.z0 && z <= a2.z1) || (x >= t2.x0 && x <= t2.x1 && z >= t2.z0 && z <= t2.z1)) return 'dirt';
      if (Math.abs(x - s.helipad2.x) <= 7.5 && Math.abs(z - s.helipad2.z) <= 7.5) return 'dirt';
    }
    for (const r of ROADS) {
      for (let i = 0; i < r.pts.length - 1; i++) {
        if (segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]) < r.w / 2) return 'dirt';
      }
    }
    const f = fieldAt(x, z);
    if (f) {
      if (f.crop === 'pasture') return 'grass';
      if (f.crop === 'fallow' || f.crop === 'stubble') return 'dirt';
      return 'crop';
    }
    // Carreadores: 8 m dirt ring around every field.
    for (const g of FIELDS) {
      const dx = Math.max(g.x0 - x, 0, x - g.x1), dz = Math.max(g.z0 - z, 0, z - g.z1);
      if (dx + dz > 0 && Math.max(dx, dz) < 8) return 'dirt';
    }
    return 'grass';
  }
}

export { creekDist, polyDist, clamp, naturalHeight };
