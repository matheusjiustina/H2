// Terrain heights and surface types. Pure JS (no three.js) so the flight model
// and tests can query the exact same triangulated surface the renderer draws.
import { fbm, smoothstep, lerp, segDist, clamp } from '../core/math.js';
import { reliefAt } from './relief.js';
import {
  WORLD_HALF, RUNWAY, BASE, FIELDS, CREEK, ROADS, HQ, fieldAt, cropHeight,
} from './layout.js';

// Slope exaggeration of the shading normals (visual only).
export const RELIEF_SHADE = 1.9;

export const GRID_N = 512; // cells per side
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

export function rawHeight(x, z) {
  let h = baseHeight(x, z) - H0;
  const cd = creekDist(x, z);
  // Rolling country and hills in the outer zones (exactly zero over the farm
  // core). The creek keeps a calm floodplain through them.
  const rel = reliefAt(x, z);
  if (rel !== 0) h += rel * smoothstep(110, 480, cd);
  // Creek valley + channel.
  const v = 1 - smoothstep(0, CREEK.valley, cd);
  h -= CREEK.valleyDepth * v * v;
  h -= CREEK.depth * (1 - smoothstep(CREEK.width * 0.5, CREEK.width * 0.5 + 5, cd));
  // Strip + base: perfectly flat platform with a long natural blend.
  const m = rectMask(x, z, RUNWAY.x0 - 80, RUNWAY.x1 + 60, -160, 45, 220);
  h = lerp(h, 0, m);
  // Farm headquarters pad.
  const hq = rectMask(x, z, HQ.house.x - 70, -920, -430, -190, 90);
  if (hq > 0) h = lerp(h, hqLevel, hq);
  return h;
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
    if (x >= t.x0 && x <= t.x1 && z >= t.z0 && z <= t.z1) return 'runway';
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

export { creekDist, clamp };
