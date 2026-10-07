import * as THREE from 'three';
import {
  Noise, smoothstep, lerp, clamp, catmullRom, smax, saturate,
} from '../utils/MathUtils.js';
import {
  WORLD, COASTLINE, REEF, REEF_CHANNEL, ISLET, CAMP, PATHS, MOUNTAINS, WATERFALL, VIEWPOINT, PIER,
} from './Layout.js';

const INF = 1e20;

// --- Felzenszwalb & Huttenlocher exact squared euclidean distance transform ---
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

/** In-place 2D EDT. grid: 0 at seeds, INF elsewhere. Returns sqrt distances (cells). */
function edt2d(grid, w, h) {
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = Math.sqrt(d[x]);
  }
  return grid;
}

function blur(src, w, h, radius, passes = 1) {
  let a = src, b = new Float32Array(src.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      let acc = 0, cnt = 0;
      for (let x = -radius; x <= radius; x++) { const xx = clamp(x, 0, w - 1); acc += a[y * w + xx]; cnt++; }
      for (let x = 0; x < w; x++) {
        b[y * w + x] = acc / cnt;
        const xo = clamp(x - radius, 0, w - 1), xi = clamp(x + radius + 1, 0, w - 1);
        acc += a[y * w + xi] - a[y * w + xo];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0, cnt = 0;
      for (let y = -radius; y <= radius; y++) { const yy = clamp(y, 0, h - 1); acc += b[yy * w + x]; cnt++; }
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / cnt;
        const yo = clamp(y - radius, 0, h - 1), yi = clamp(y + radius + 1, 0, h - 1);
        acc += b[yi * w + x] - b[yo * w + x];
      }
    }
  }
  return a;
}

/** Scanline-fill a polygon into a Uint8 mask. */
function rasterPolygon(poly, w, h, toGrid) {
  const mask = new Uint8Array(w * h);
  const pts = poly.map((p) => toGrid(p[0], p[1]));
  const xs = [];
  for (let y = 0; y < h; y++) {
    xs.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y)) xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k])), x1 = Math.min(w - 1, Math.floor(xs[k + 1]));
      for (let x = x0; x <= x1; x++) mask[y * w + x] = 1;
    }
  }
  return mask;
}

function rasterPolyline(pts, w, h, toGrid, grid) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = toGrid(pts[i][0], pts[i][1]);
    const [bx, by] = toGrid(pts[i + 1][0], pts[i + 1][1]);
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2) + 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = Math.round(ax + (bx - ax) * t), y = Math.round(ay + (by - ay) * t);
      if (x >= 0 && y >= 0 && x < w && y < h) grid[y * w + x] = 0;
    }
  }
}

/**
 * CPU side description of the terrain: heights, distance fields, material splats and
 * water related masks. Everything the GPU uses is mirrored in data textures so that
 * gameplay queries (collisions, buoyancy, placement) match what is rendered.
 */
export class TerrainData {
  constructor() {
    this.size = WORLD.size;
    this.res = WORLD.res;
    this.cell = this.size / (this.res - 1);
    this.half = this.size / 2;
    this.noise = new Noise(7);
    this.noiseB = new Noise(91);
    const N = this.res * this.res;
    this.heights = new Float32Array(N);
    this.coast = new Float32Array(N); // signed distance to island coastline (m, + inland)
    this.reefDist = new Float32Array(N);
    this.pathDist = new Float32Array(N);
    this.shoreDist = new Float32Array(N); // signed distance to waterline (m, + on land)
    this.lagoon = new Float32Array(N);
    this.energy = new Float32Array(N); // wave energy multiplier
    this.slope = new Float32Array(N);
    this.splatA = new Uint8Array(N * 4); // sand, grass, soil/litter, rock
    this.splatB = new Uint8Array(N * 4); // path, canopy, coral, mud
  }

  toGrid = (x, z) => [(x + this.half) / this.cell, (z + this.half) / this.cell];

  async generate(progress = () => {}) {
    const { res } = this;
    const w = res, h = res;
    const toGrid = this.toGrid;
    const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

    // 1. Coast signed distance field.
    this.coastPoly = catmullRom(COASTLINE, 10, true);
    const inside = rasterPolygon(this.coastPoly, w, h, toGrid);
    const gOut = new Float64Array(w * h), gIn = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) { gOut[i] = inside[i] ? 0 : INF; gIn[i] = inside[i] ? INF : 0; }
    edt2d(gOut, w, h);
    edt2d(gIn, w, h);
    for (let i = 0; i < w * h; i++) {
      this.coast[i] = (inside[i] ? gIn[i] - 0.5 : -(gOut[i] - 0.5)) * this.cell;
    }
    blur(this.coast, w, h, 2, 2);
    progress(0.15);
    await yieldFrame();

    // 2. Reef distance + lagoon polygon.
    this.reefLine = catmullRom(REEF, 8, false);
    const gReef = new Float64Array(w * h).fill(INF);
    rasterPolyline(this.reefLine, w, h, toGrid, gReef);
    edt2d(gReef, w, h);
    for (let i = 0; i < w * h; i++) this.reefDist[i] = gReef[i] * this.cell;
    const lagoonPoly = this.reefLine.concat([[0, 200]]);
    const lagoonIn = rasterPolygon(lagoonPoly, w, h, toGrid);

    // 3. Paths.
    this.pathLines = PATHS.map((p) => ({ width: p.width, pts: catmullRom(p.points, 8, false) }));
    const gPath = new Float64Array(w * h).fill(INF);
    for (const p of this.pathLines) rasterPolyline(p.pts, w, h, toGrid, gPath);
    edt2d(gPath, w, h);
    for (let i = 0; i < w * h; i++) this.pathDist[i] = gPath[i] * this.cell;
    progress(0.3);
    await yieldFrame();

    // 4. Heights.
    for (let j = 0; j < h; j++) {
      const z = -this.half + j * this.cell;
      for (let i = 0; i < w; i++) {
        const x = -this.half + i * this.cell;
        const k = j * w + i;
        this.heights[k] = this._height(x, z, this.coast[k], this.reefDist[k], lagoonIn[k]);
        this.lagoon[k] = lagoonIn[k] ? smoothstep(0, 45, this.reefDist[k]) : 0;
      }
      if (j % 128 === 0) { progress(0.3 + 0.3 * (j / h)); await yieldFrame(); }
    }

    // 5. Path flattening against a smoothed copy of the heights.
    const smooth = blur(Float32Array.from(this.heights), w, h, 3, 2);
    for (let k = 0; k < w * h; k++) {
      const pd = this.pathDist[k];
      if (pd < 6 && this.heights[k] > 0.4) {
        const m = 1 - smoothstep(0.8, 4.5, pd);
        this.heights[k] = lerp(this.heights[k], smooth[k] - 0.1 * (1 - smoothstep(0, 1.4, pd)), m * 0.92);
      }
    }
    progress(0.65);
    await yieldFrame();

    // 6. Slopes, waterline distance, wave energy, splats.
    this._computeSlopes();
    this._computeShoreDistance();
    this._computeWaterMasks();
    this._computeSplats();
    progress(0.9);
    await yieldFrame();

    this._buildTextures();
    progress(1);
  }

  _cliffiness(x, z) {
    const n = this.noise;
    const head = Math.exp(-(((x - 236) ** 2) + ((z + 98) ** 2)) / (2 * 62 * 62));
    const west = Math.exp(-(((x + 322) ** 2) + ((z + 44) ** 2)) / (2 * 34 * 34)) * 0.8;
    const south = smoothstep(240, 400, z) * 0.95;
    const east = smoothstep(300, 345, x) * smoothstep(-20, 60, z) * 0.85;
    const westCoast = smoothstep(-300, -345, x) * smoothstep(40, 160, z) * 0.7;
    const c = Math.max(head, west, south, east, westCoast);
    return saturate(c * (0.85 + 0.3 * n.noise2(x * 0.02, z * 0.02)));
  }

  _height(x, z, sdf, reefD, lagoonIn) {
    const n = this.noise, nb = this.noiseB;
    const campD = Math.hypot(x - CAMP.x, z - CAMP.z);
    const nearCamp = smoothstep(30, 110, campD);
    // Perturbed coast distance – irregular coves and points away from the camp.
    const dc = sdf + nearCamp * (n.fbm2(x * 0.012, z * 0.012, 3) * 8 + n.noise2(x * 0.045, z * 0.045) * 2.2)
      + (1 - nearCamp) * n.noise2(x * 0.03, z * 0.03) * 1.2;
    const cliff = this._cliffiness(x, z);
    let hgt;

    if (dc >= 0) {
      // --- land ---
      let beach = Math.min(dc, 24) * 0.062;
      beach += smoothstep(14, 34, dc) * 0.7;
      beach += n.noise2(x * 0.06, z * 0.06) * 0.12 * smoothstep(4, 20, dc);
      const cliffProfile = Math.min(dc * 1.25, 18 + 10 * cliff) * (0.9 + 0.2 * n.noise2(x * 0.05, z * 0.05));
      let base = lerp(beach, cliffProfile, smoothstep(0.15, 0.7, cliff));
      // Gentle inland rise with rolling hills.
      const inland = smoothstep(24, 280, dc);
      base += inland * 17;
      const hills = n.fbm2(x * 0.0075 + 3.1, z * 0.0075 - 1.7, 4) * 11 + nb.ridge2(x * 0.016, z * 0.016, 3) * 6 - 3;
      base += hills * smoothstep(30, 110, dc);
      // Mountains with ridged crests and rock bands.
      let mount = 0;
      for (const p of MOUNTAINS.peaks) {
        const r = Math.hypot(x - p.x, z - p.z) / p.r;
        if (r < 1.4) {
          const fall = Math.pow(saturate(1 - r / 1.35), 1.7);
          const rid = 0.62 + 0.5 * nb.ridge2(x * 0.021 + p.x, z * 0.021, 4);
          mount = Math.max(mount, p.h * fall * rid);
        }
      }
      // Spine connecting peaks.
      const spine = Math.exp(-(((z - (290 - 0.18 * x + 18 * Math.sin(x * 0.012))) / 48) ** 2)) * smoothstep(-280, -120, x) * smoothstep(320, 220, x);
      mount = Math.max(mount, spine * (52 + 28 * nb.ridge2(x * 0.018, z * 0.018, 4)));
      mount *= smoothstep(40, 120, dc);
      hgt = smax(base, base * 0.35 + mount, 0.01 + Math.min(12, mount * 0.3));
      // Terraced rock bands on steep high ground.
      if (hgt > 26) {
        const step = 9 + 3 * n.noise2(x * 0.01, z * 0.01);
        const t = hgt / step;
        const f = t - Math.floor(t);
        const terr = (Math.floor(t) + smoothstep(0.55, 0.95, f)) * step;
        hgt = lerp(hgt, terr, 0.45 * smoothstep(26, 50, hgt));
      }
      // Eastern headland plateau rising towards the lookout.
      const hd = Math.hypot(x - VIEWPOINT.x, z - VIEWPOINT.z);
      const headland = 21 * (1 - smoothstep(10, 85, hd)) * smoothstep(-2, 10, dc);
      hgt = smax(hgt, headland + n.noise2(x * 0.08, z * 0.08) * 0.8 * (headland > 0.5 ? 1 : 0), 0.01 + Math.min(6, headland * 0.3));
      // Rocky western point.
      const wp = Math.hypot(x + 300, z + 46);
      const pointH = (5.5 - wp * 0.11) + n.fbm2(x * 0.09, z * 0.09, 2) * 1.6;
      if (pointH > -2) hgt = smax(hgt, pointH, 0.01 + saturate((pointH + 2) / 6) * 2.5);
      // land never dips below the beach profile (no accidental inland lakes)
      hgt = Math.max(hgt, beach + smoothstep(30, 120, dc) * 1.2);
    } else {
      // --- seabed ---
      const off = -dc;
      const shoreface = -off * (0.07 + 0.35 * cliff);
      const lagoonFloor = -1.65 - 1.45 * smoothstep(20, 150, off)
        + n.noise2(x * 0.028, z * 0.075) * 0.22 + n.fbm2(x * 0.01, z * 0.01, 3) * 0.55;
      let hs = smax(shoreface, lagoonFloor, 0.8);
      // Coral bommies / patch reef.
      const coral = smoothstep(0.28, 0.58, n.fbm2(x * 0.017 + 9, z * 0.017 - 4, 3)) * smoothstep(35, 90, off);
      hs += coral * (1.25 + 0.6 * n.noise2(x * 0.12, z * 0.12));
      // Blue holes.
      const bh1 = Math.hypot(x + 128, z + 212), bh2 = Math.hypot(x - 36, z + 262);
      hs -= 7.5 * (1 - smoothstep(6, 22, bh1)) + 6 * (1 - smoothstep(5, 18, bh2));

      if (lagoonIn) {
        // Rising reef flat and crest.
        const flat = -0.5 - reefD * 0.03 + n.noise2(x * 0.09, z * 0.09) * 0.18;
        hs = smax(hs, flat, 0.6);
        const crest = Math.exp(-((reefD / 9) ** 2));
        hs = lerp(hs, -0.32 + n.noise2(x * 0.15, z * 0.15) * 0.16, crest);
      } else {
        // Open ocean outside the reef: steep drop-off to the deep.
        const drop = Math.max(-0.4 - reefD * 0.62 - smoothstep(0, 60, reefD) * 6, -38);
        const fromReef = lerp(-0.32 + n.noise2(x * 0.15, z * 0.15) * 0.16, drop, smoothstep(0, 10, reefD));
        const fromShore = Math.max(-off * (0.22 + 0.4 * cliff), -38);
        hs = Math.max(fromReef, fromShore, -38);
      }
      // Reef channel (boat pass).
      const cd = Math.abs(x - REEF_CHANNEL.x) / REEF_CHANNEL.halfWidth;
      const cz = Math.abs(z - REEF_CHANNEL.z);
      if (cd < 1.6 && cz < 60) {
        const m = (1 - smoothstep(0.6, 1.5, cd)) * (1 - smoothstep(30, 60, cz));
        hs = lerp(hs, Math.min(hs, -6.5 + n.noise2(x * 0.1, z * 0.1)), m);
      }
      hgt = Math.max(hs, -38);
    }

    // Islet and sandbar (in the lagoon).
    const ex = (x - ISLET.x) / ISLET.rx, ez = (z - ISLET.z) / ISLET.rz;
    const er = Math.sqrt(ex * ex + ez * ez) * (1 + 0.12 * n.noise2(x * 0.05, z * 0.05));
    if (er < 2.6) {
      const isl = lerp(ISLET.height, -0.7, smoothstep(0.2, 1.05, er)) - smoothstep(1.05, 2.6, er) * 2.2;
      hgt = Math.max(hgt, isl);
    }
    {
      const [sx, sz] = ISLET.sandbarTo;
      const vx = sx - ISLET.x, vz = sz - ISLET.z;
      const l2 = vx * vx + vz * vz;
      const t = clamp(((x - ISLET.x) * vx + (z - ISLET.z) * vz) / l2, 0, 1);
      const d = Math.hypot(x - (ISLET.x + vx * t), z - (ISLET.z + vz * t));
      if (d < 40) hgt = Math.max(hgt, -0.18 - t * 0.35 - d * 0.045 + n.noise2(x * 0.1, z * 0.1) * 0.08);
    }

    // Camp clearing (elliptical, shorter towards the sea).
    {
      const dz = z - CAMP.z;
      const d = Math.hypot(x - CAMP.x, dz < 0 ? dz * 1.9 : dz);
      const m = 1 - smoothstep(9, 24, d);
      if (m > 0) hgt = lerp(hgt, CAMP.height + n.noise2(x * 0.2, z * 0.2) * 0.04 - Math.max(0, -dz) * 0.012, m);
    }

    // Waterfall basin carved into the valley, cliffs wrap around the south side.
    {
      const W = WATERFALL;
      const d = Math.hypot(x - W.x, z - W.z);
      const basin = 1 - smoothstep(15, 36, d + Math.max(0, W.z - 20 - z) * 0.0);
      if (basin > 0) {
        hgt = lerp(hgt, W.floor + n.noise2(x * 0.15, z * 0.15) * 0.25 + Math.max(0, W.z - z) * 0.02, basin);
      }
      const south = smoothstep(W.z - 6, W.z + 10, z);
      const wallD = Math.hypot((x - W.x) * 0.85, z - W.z);
      const wall = smoothstep(11, 17, wallD) * south;
      const top = W.cliffTop + n.fbm2(x * 0.05, z * 0.05, 2) * 2;
      const local = 1 - smoothstep(26, 46, wallD);
      if (wall > 0 && local > 0) hgt = lerp(hgt, Math.max(hgt, lerp(W.floor, top, wall)), local);
      // pool
      if (d < W.poolRadius + 3) {
        const pd = Math.hypot((x - W.x) * 0.9, z - (W.z + 3));
        const pool = W.poolLevel - 2.0 * (1 - smoothstep(2, W.poolRadius, pd)) - 0.25;
        hgt = Math.min(hgt, lerp(pool, hgt, smoothstep(W.poolRadius - 3, W.poolRadius + 2, pd)));
      }
    }

    // Pier bed: keep the seabed under the pier tidy.
    if (Math.abs(x - PIER.x) < 6 && z < PIER.zStart && z > PIER.zEnd - 8) {
      hgt -= 0.15 * (1 - smoothstep(2, 6, Math.abs(x - PIER.x)));
    }

    // World edge falls to the deep ocean.
    const e = Math.max(Math.abs(x), Math.abs(z));
    if (e > 460) hgt = lerp(hgt, -38, smoothstep(460, 505, e));
    return hgt;
  }

  _computeSlopes() {
    const { res, heights, cell } = this;
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const k = j * res + i;
        const hl = heights[j * res + Math.max(0, i - 1)], hr = heights[j * res + Math.min(res - 1, i + 1)];
        const hd = heights[Math.max(0, j - 1) * res + i], hu = heights[Math.min(res - 1, j + 1) * res + i];
        const dx = (hr - hl) / (2 * cell), dz = (hu - hd) / (2 * cell);
        const ny = 1 / Math.sqrt(dx * dx + dz * dz + 1);
        this.slope[k] = 1 - ny;
      }
    }
  }

  _computeShoreDistance() {
    const { res, heights } = this;
    const N = res * res;
    const g = new Float64Array(N).fill(INF);
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const k = j * res + i;
        const s = heights[k] > 0;
        if ((i + 1 < res && (heights[k + 1] > 0) !== s) || (j + 1 < res && (heights[k + res] > 0) !== s)) g[k] = 0;
      }
    }
    edt2d(g, res, res);
    for (let k = 0; k < N; k++) {
      const d = Math.min(g[k] * this.cell, 200);
      this.shoreDist[k] = heights[k] > 0 ? d : -d;
    }
  }

  _computeWaterMasks() {
    const { res, heights, lagoon } = this;
    for (let k = 0; k < res * res; k++) {
      const depth = -heights[k];
      const lagoonCalm = lerp(1.0, 0.16, lagoon[k]);
      const depthFactor = 0.3 + 0.7 * smoothstep(0.0, 4.0, depth);
      this.energy[k] = lagoonCalm * depthFactor;
    }
    // Smooth energy so wave amplitude never changes abruptly.
    blur(this.energy, res, res, 3, 2);
  }

  _computeSplats() {
    const { res, heights, slope, coast, pathDist, splatA, splatB } = this;
    const n = this.noise;
    for (let j = 0; j < res; j++) {
      const z = -this.half + j * this.cell;
      for (let i = 0; i < res; i++) {
        const x = -this.half + i * this.cell;
        const k = j * res + i;
        const hh = heights[k];
        const sl = slope[k];
        const dc = coast[k];
        const nn = n.noise2(x * 0.05, z * 0.05);
        const nf = n.noise2(x * 0.17 + 40, z * 0.17);
        let rock = smoothstep(0.26, 0.42, sl + nn * 0.05);
        rock = Math.max(rock, smoothstep(118, 150, hh) * 0.7);
        // Sand: beaches, lagoon floor, islet.
        let sand = hh < 0.4 ? 1 : smoothstep(3.2 + nn * 0.6, 2.2 + nn * 0.4, hh) * smoothstep(40, 22, dc + nn * 5);
        if (Math.hypot(x - ISLET.x, z - ISLET.z) < 34) sand = Math.max(sand, smoothstep(3.4, 2.2, hh));
        sand *= 1 - rock * 0.9;
        // Coral on the lagoon floor and reef crest.
        const coral = hh < -0.15 ? saturate(smoothstep(0.15, 0.55, n.fbm2(x * 0.017 + 9, z * 0.017 - 4, 3)) * 1.2 + Math.exp(-((this.reefDist[k] / 14) ** 2)) * 0.8) * smoothstep(-0.1, -0.6, hh) * smoothstep(-14, -5, hh) : 0;
        // Grass / soil on land.
        const land = 1 - sand;
        const jungle = smoothstep(30, 70, dc);
        let soil = land * (0.25 + 0.5 * jungle * (0.5 + 0.5 * nf));
        let grass = land * (1 - rock) * (0.9 - 0.4 * jungle + 0.25 * nn);
        soil *= 1 - rock * 0.8;
        // Paths.
        const path = (hh > 0.5 ? 1 - smoothstep(0.7, 2.4, pathDist[k] + nf * 0.5) : 0);
        grass *= 1 - path;
        // Mud around the waterfall pool and low wet hollows.
        const wd = Math.hypot(x - WATERFALL.x, z - WATERFALL.z);
        const mud = Math.max(1 - smoothstep(8, 20, wd), 0) * (1 - rock);
        const total = sand + grass + soil + rock + 1e-4;
        splatA[k * 4] = Math.round((sand / total) * 255);
        splatA[k * 4 + 1] = Math.round((Math.max(0, grass) / total) * 255);
        splatA[k * 4 + 2] = Math.round((soil / total) * 255);
        splatA[k * 4 + 3] = Math.round((rock / total) * 255);
        splatB[k * 4] = Math.round(saturate(path) * 255);
        splatB[k * 4 + 1] = 0; // canopy – filled by vegetation
        splatB[k * 4 + 2] = Math.round(saturate(coral) * 255);
        splatB[k * 4 + 3] = Math.round(saturate(mud) * 255);
      }
    }
  }

  _buildTextures() {
    const { res } = this;
    const N = res * res;
    const half = new Uint16Array(N * 4);
    for (let k = 0; k < N; k++) {
      half[k * 4] = THREE.DataUtils.toHalfFloat(this.heights[k]);
      half[k * 4 + 1] = THREE.DataUtils.toHalfFloat(this.lagoon[k]);
      half[k * 4 + 2] = THREE.DataUtils.toHalfFloat(clamp(this.shoreDist[k], -200, 200));
      half[k * 4 + 3] = THREE.DataUtils.toHalfFloat(this.energy[k]);
    }
    const mk = (data, type) => {
      const t = new THREE.DataTexture(data, res, res, THREE.RGBAFormat, type);
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
      return t;
    };
    this.dataTexture = mk(half, THREE.HalfFloatType);
    this.splatATexture = mk(this.splatA, THREE.UnsignedByteType);
    this.splatBTexture = mk(this.splatB, THREE.UnsignedByteType);
    // World -> uv transform for shaders so texel centres land on grid samples:
    // uv = xz * (res-1)/(res*size) + 0.5
    const s = (res - 1) / (res * this.size);
    this.uvTransform = new THREE.Vector4(s, s, 0.5, 0.5);
  }

  // ------------------------------------------------------------------ queries
  _sample(arr, x, z) {
    const { res } = this;
    let gx = (x + this.half) / this.cell, gz = (z + this.half) / this.cell;
    gx = clamp(gx, 0, res - 1.001);
    gz = clamp(gz, 0, res - 1.001);
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const k = j * res + i;
    const a = arr[k], b = arr[k + 1], c = arr[k + res], d = arr[k + res + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }

  /** Height matching the rendered triangle mesh (same diagonal split as PlaneGeometry). */
  heightAt(x, z) {
    const { res } = this;
    if (Math.abs(x) > this.half || Math.abs(z) > this.half) return -38;
    let gx = (x + this.half) / this.cell, gz = (z + this.half) / this.cell;
    gx = clamp(gx, 0, res - 1.0001);
    gz = clamp(gz, 0, res - 1.0001);
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const k = j * res + i;
    const H = this.heights;
    const h00 = H[k], h10 = H[k + 1], h01 = H[k + res], h11 = H[k + res + 1];
    // Mesh triangles: (00, 01, 10) and (01, 11, 10)
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = this.cell * 0.5;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  slopeAt(x, z) { return this._sample(this.slope, x, z); }
  coastAt(x, z) { return this._sample(this.coast, x, z); }
  pathAt(x, z) { return this._sample(this.pathDist, x, z); }
  shoreAt(x, z) { return this._sample(this.shoreDist, x, z); }
  lagoonAt(x, z) { return this._sample(this.lagoon, x, z); }
  energyAt(x, z) {
    if (Math.abs(x) > this.half || Math.abs(z) > this.half) return 1;
    return this._sample(this.energy, x, z);
  }

  /** Splat weights at a world point: {sand, grass, soil, rock, path, canopy, coral, mud} */
  splatAt(x, z, out = {}) {
    const { res } = this;
    const gx = clamp(Math.round((x + this.half) / this.cell), 0, res - 1);
    const gz = clamp(Math.round((z + this.half) / this.cell), 0, res - 1);
    const k = (gz * res + gx) * 4;
    out.sand = this.splatA[k] / 255; out.grass = this.splatA[k + 1] / 255;
    out.soil = this.splatA[k + 2] / 255; out.rock = this.splatA[k + 3] / 255;
    out.path = this.splatB[k] / 255; out.canopy = this.splatB[k + 1] / 255;
    out.coral = this.splatB[k + 2] / 255; out.mud = this.splatB[k + 3] / 255;
    return out;
  }

  /** Write a canopy density grid (Float32 res*res, 0..1) into splatB.g. */
  setCanopy(canopy) {
    const N = this.res * this.res;
    for (let k = 0; k < N; k++) this.splatB[k * 4 + 1] = Math.round(saturate(canopy[k]) * 255);
    if (this.splatBTexture) this.splatBTexture.needsUpdate = true;
  }
}
