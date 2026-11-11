import { Rect } from '../../core/util';
import { PAL } from '../../render/materials';
import { ROAD_LINES } from '../layout';

/** Half width of the road running along x=coord (vertical) or z=coord at position `at`. */
export function roadHalf(vertical: boolean, coord: number, at: number): number {
  let best = 0;
  for (const L of ROAD_LINES) {
    if (vertical) {
      if (Math.abs(L.ax - coord) < 0.5 && Math.abs(L.bx - coord) < 0.5 && at >= Math.min(L.az, L.bz) - 1 && at <= Math.max(L.az, L.bz) + 1) best = Math.max(best, L.w / 2);
    } else if (Math.abs(L.az - coord) < 0.5 && Math.abs(L.bz - coord) < 0.5 && at >= Math.min(L.ax, L.bx) - 1 && at <= Math.max(L.ax, L.bx) + 1) best = Math.max(best, L.w / 2);
  }
  return best;
}

/** Sidewalk slab rectangle of the block between grid lines (i,j)-(i+1,j+1). */
export function blockSlab(xs: number[], zs: number[], i: number, j: number): Rect {
  const mx = (xs[i] + xs[i + 1]) / 2, mz = (zs[j] + zs[j + 1]) / 2;
  return {
    x0: xs[i] + roadHalf(true, xs[i], mz),
    x1: xs[i + 1] - roadHalf(true, xs[i + 1], mz),
    z0: zs[j] + roadHalf(false, zs[j], mx),
    z1: zs[j + 1] - roadHalf(false, zs[j + 1], mx),
  };
}

export const GLASS = [0x8fc0c8, 0x9cc6d6, 0xa5cdc6, 0x86b6c6, 0xb0d0da, 0x8cc4b6, 0x9db6d0, 0xb8cfc0];
export const WALLS = [PAL.brick, PAL.mustard, 0xd9a05a, 0xd8cba8, 0xa85a44, 0xe8d8b0, 0xc9785a, 0xb9ad98, 0xe2c27a];
export const AWN = [PAL.red, PAL.green, PAL.navy, PAL.mustard, PAL.teal, 0xf6ecd0];
export const HOUSE_WALLS = [0xf2e6c8, 0xd8e2c4, 0xf0cfa8, 0xc9d8e6, 0xe8c9c0, 0xf6f0e0, 0xd6c9a8, 0xbcd0c0];
export const HOUSE_ROOFS = [0x7a4a3c, 0x4f5a6e, 0x8f3f36, 0x5a6a5c, 0x6e5a48];

export interface Lot {
  x: number;
  z: number;
  w: number;
  d: number;
  /** Rotation that makes local +z face the street. */
  rot: number;
}

/** Split a block's buildable area into street-facing lots (two rows back-to-back). */
export function splitLots(r: Rect, lotW: number, alley = 4, gap = 1.6): Lot[] {
  const W = r.x1 - r.x0, D = r.z1 - r.z0;
  const out: Lot[] = [];
  const n = Math.max(1, Math.round(W / lotW));
  const w = W / n;
  if (D < 44) {
    for (let i = 0; i < n; i++) out.push({ x: r.x0 + w * (i + 0.5), z: (r.z0 + r.z1) / 2, w: w - gap, d: D, rot: 0 });
    return out;
  }
  const d = (D - alley) / 2;
  for (let i = 0; i < n; i++) {
    out.push({ x: r.x0 + w * (i + 0.5), z: r.z0 + d / 2, w: w - gap, d, rot: Math.PI });
    out.push({ x: r.x0 + w * (i + 0.5), z: r.z1 - d / 2, w: w - gap, d, rot: 0 });
  }
  return out;
}
