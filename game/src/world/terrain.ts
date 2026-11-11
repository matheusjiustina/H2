import { clamp, lerp, smoothstep, Rect } from '../core/util';
import { fbm, noise2 } from '../core/rng';
import { Geo, mix, shade } from '../render/geo';
import { PAL } from '../render/materials';
import { BOUNDS, districtAt, FLAT_ZONES, GARAGE, ISLAND, RAIL_Z, SEA, TUNNEL } from './layout';
import type { RoadNet } from './roads';

const CELL = 10;
const X0 = -1100, X1 = 1100, Z0 = -800, Z1 = 900;
const NX = (X1 - X0) / CELL, NZ = (Z1 - Z0) / CELL;

/** Open-air cut-outs in the ground (ramps down to the tunnel / garage). Aligned to the terrain grid. */
export const HOLES: Rect[] = [
  { x0: TUNNEL.x0, x1: TUNNEL.x1, z0: TUNNEL.zTop, z1: TUNNEL.zIn },
  { x0: TUNNEL.x0, x1: TUNNEL.x1, z0: TUNNEL.zOut, z1: TUNNEL.zEnd },
  { x0: GARAGE.rampX0, x1: GARAGE.rampX1, z0: GARAGE.rampZ0, z1: GARAGE.rampZ1 },
];
/** Covered underground volumes: the surface above is ignored while you are below it. */
export const UNDER: Rect[] = [
  { x0: TUNNEL.x0 - 3, x1: TUNNEL.x1 + 3, z0: TUNNEL.zTop, z1: TUNNEL.zEnd },
  { x0: GARAGE.room.x0 - 3, x1: GARAGE.room.x1 + 3, z0: GARAGE.rampZ0, z1: GARAGE.room.z1 + 3 },
];

function coast(x: number, z: number): number {
  const beach = z < 345 ? 0 : z < 412 ? lerp(0, -1.25, (z - 345) / 67) : Math.max(-9, -1.25 - (z - 412) * 0.11);
  const harbor = z <= 400 ? 0 : Math.max(-9, -(z - 400) * 0.85);
  const desert = z < 380 ? 0 : z < 420 ? lerp(0, -1.4, (z - 380) / 40) : Math.max(-9, -1.4 - (z - 420) * 0.12);
  if (x < -60) return beach;
  if (x < -30) return lerp(beach, harbor, (x + 60) / 30);
  if (x < 530) return harbor;
  if (x < 570) return lerp(harbor, desert, (x - 530) / 40);
  return desert;
}

export class Terrain {
  private hgt = new Float32Array((NX + 1) * (NZ + 1));

  constructor(roads: RoadNet) {
    for (let j = 0; j <= NZ; j++)
      for (let i = 0; i <= NX; i++) this.hgt[j * (NX + 1) + i] = this.raw(X0 + i * CELL, Z0 + j * CELL, roads);
  }

  private raw(x: number, z: number, roads: RoadNet): number {
    let h = coast(x, z);
    const ri = Math.hypot(x - ISLAND.x, z - ISLAND.z);
    if (ri < 80) h = Math.max(h, lerp(1.0, -9, smoothstep(ISLAND.r - 4, ISLAND.r + 18, ri)));
    if (z > 330 && x > -900 && x < 900 && h <= 0) {
      if (z > 400 || h < 0) return h;
    }
    const d = districtAt(x, z);
    // flat-zone and road masks
    let mask = smoothstep(14, 75, roads.distToRoad(x, z));
    for (const f of FLAT_ZONES) {
      const r = Math.hypot(x - f.x, z - f.z);
      if (r < f.r + 40) mask *= smoothstep(f.r, f.r + 40, r);
    }
    mask *= smoothstep(7, 36, Math.abs(z - RAIL_Z));
    let land = 0;
    if (d === 'outskirts') {
      const amp = 5 + 22 * clamp((-x - 480) / 380, 0, 1) + 15 * clamp((-z - 420) / 170, 0, 1);
      land = Math.max(0, fbm(x / 130 + 7.3, z / 130 - 2.1) - 0.3) * amp * 1.9 * mask;
    } else if (d === 'desert') {
      const dune = (fbm(x / 55 + 3.1, z / 55 + 9.7) - 0.42) * 5;
      const ridge = Math.max(0, fbm(x / 160 - 4.2, z / 160 + 1.4) - 0.5) * 60 * clamp((x - 560) / 120, 0, 1);
      land = (Math.max(-0.2, dune) + ridge) * mask * smoothstep(400, 340, z);
    }
    // ring of mountains outside the playable bounds (not on the ocean side)
    const ox = Math.max(BOUNDS.x0 - x, x - BOUNDS.x1, 0);
    const oz = Math.max(BOUNDS.z0 - z, 0);
    const out = Math.hypot(ox, oz);
    if (out > 0) land += smoothstep(0, 170, out) * (55 + 55 * noise2(x / 90, z / 90));
    return Math.max(h, 0) > 0 ? Math.max(h, land) : h + land;
  }

  /** Terrain surface height – matches the rendered triangles exactly. */
  h(x: number, z: number): number {
    const fx = clamp((x - X0) / CELL, 0, NX - 0.0001);
    const fz = clamp((z - Z0) / CELL, 0, NZ - 0.0001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const k = j * (NX + 1) + i;
    const h00 = this.hgt[k], h10 = this.hgt[k + 1], h01 = this.hgt[k + NX + 1], h11 = this.hgt[k + NX + 2];
    return v >= u ? h00 + (h11 - h01) * u + (h01 - h00) * v : h00 + (h10 - h00) * u + (h11 - h10) * v;
  }

  static inHole(x: number, z: number): boolean {
    for (const r of HOLES) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true;
    return false;
  }
  static inUnder(x: number, z: number): boolean {
    for (const r of UNDER) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true;
    return false;
  }

  private colorAt(x: number, z: number, h: number, slope: number) {
    if (h < SEA - 0.15) return mix(0xd9c998, 0x6f9aa0, clamp((SEA - h) / 6, 0, 1));
    const d = districtAt(x, z);
    const n = noise2(x / 23, z / 23);
    const out = x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0;
    if (d === 'desert' || (out && x > 500)) {
      if (slope > 0.55) return shade(PAL.rock, 0.9 + n * 0.25);
      return mix(PAL.desert, PAL.desertDark, n * 0.55 + clamp(h / 60, 0, 0.4));
    }
    if (d === 'beach') return z > 336 ? shade(PAL.sand, 0.94 + n * 0.1) : shade(PAL.sidewalk, 0.97);
    if (d === 'harbor') return shade(0xcbc7ba, 0.95 + n * 0.08);
    if (d === 'ocean') return Math.hypot(x - ISLAND.x, z - ISLAND.z) < ISLAND.r - 6 ? shade(PAL.lawn, 0.92 + n * 0.14) : shade(PAL.sand, 0.95);
    if (d === 'outskirts' || out) {
      if (slope > 0.9) return shade(0x7f9a6a, 0.9 + n * 0.15);
      const g = mix(PAL.grass, PAL.grassDark, n * 0.7 + clamp(h / 45, 0, 0.5));
      return h > 70 ? mix(g, 0xcfd3c8, clamp((h - 70) / 40, 0, 1)) : g;
    }
    if (d === 'suburbs') return shade(PAL.lawn, 0.95 + n * 0.08);
    return shade(0xd6ccb4, 0.97 + n * 0.05);
  }

  emit(geo: Geo) {
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const x0 = X0 + i * CELL, z0 = Z0 + j * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
        if (Terrain.inHole(x0 + 5, z0 + 5)) continue;
        const k = j * (NX + 1) + i;
        const h00 = this.hgt[k], h10 = this.hgt[k + 1], h01 = this.hgt[k + NX + 1], h11 = this.hgt[k + NX + 2];
        if (h00 < -8.5 && h10 < -8.5 && h01 < -8.5 && h11 < -8.5) continue; // deep sea floor never seen
        const b = geo.at('flat', x0 + 5, z0 + 5);
        const s1 = Math.max(Math.abs(h11 - h01), Math.abs(h01 - h00)) / CELL;
        const s2 = Math.max(Math.abs(h10 - h00), Math.abs(h11 - h10)) / CELL;
        b.tri(x0, h00, z0, x0, h01, z1, x1, h11, z1, this.colorAt(x0 + 3.3, z0 + 6.6, (h00 + h01 + h11) / 3, s1));
        b.tri(x0, h00, z0, x1, h11, z1, x1, h10, z0, this.colorAt(x0 + 6.6, z0 + 3.3, (h00 + h11 + h10) / 3, s2));
      }
    }
  }
}
