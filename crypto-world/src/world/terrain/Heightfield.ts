import { Vector3 } from 'three';
import { PLANET_RADIUS, TERRAIN_RES } from '../constants';

/**
 * Baked cube-sphere heightfield using an equal-angle mapping (uniform vertex spacing).
 * The rendered terrain mesh is built from exactly these samples and triangulation, and ground
 * queries interpolate over the same triangles, so characters stand precisely on the visible surface.
 */

export interface CubeFace {
  n: Vector3;
  u: Vector3;
  v: Vector3;
}

export const CUBE_FACES: CubeFace[] = [
  { n: new Vector3(1, 0, 0), u: new Vector3(0, 0, -1), v: new Vector3(0, 1, 0) },
  { n: new Vector3(-1, 0, 0), u: new Vector3(0, 0, 1), v: new Vector3(0, 1, 0) },
  { n: new Vector3(0, 1, 0), u: new Vector3(1, 0, 0), v: new Vector3(0, 0, -1) },
  { n: new Vector3(0, -1, 0), u: new Vector3(1, 0, 0), v: new Vector3(0, 0, 1) },
  { n: new Vector3(0, 0, 1), u: new Vector3(1, 0, 0), v: new Vector3(0, 1, 0) },
  { n: new Vector3(0, 0, -1), u: new Vector3(-1, 0, 0), v: new Vector3(0, 1, 0) },
];

const QUARTER = Math.PI / 2;

/** Direction of grid coordinate (fi, fj) on a face (may extend past the face edge). */
export function gridDir(face: number, fi: number, fj: number, N: number, out = new Vector3()): Vector3 {
  const f = CUBE_FACES[face];
  const a = Math.tan((fi / N - 0.5) * QUARTER);
  const b = Math.tan((fj / N - 0.5) * QUARTER);
  return out.copy(f.n).addScaledVector(f.u, a).addScaledVector(f.v, b).normalize();
}

/** Face index and continuous grid coordinates for a direction. */
export function dirToGrid(d: Vector3, N: number): { face: number; fi: number; fj: number } {
  const ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z);
  let face: number;
  if (ax >= ay && ax >= az) face = d.x >= 0 ? 0 : 1;
  else if (ay >= az) face = d.y >= 0 ? 2 : 3;
  else face = d.z >= 0 ? 4 : 5;
  const f = CUBE_FACES[face];
  const ma = d.dot(f.n);
  const gu = d.dot(f.u) / ma;
  const gv = d.dot(f.v) / ma;
  const fi = (Math.atan(gu) / QUARTER + 0.5) * N;
  const fj = (Math.atan(gv) / QUARTER + 0.5) * N;
  return { face, fi, fj };
}

export class Heightfield {
  readonly N = TERRAIN_RES;
  readonly E = TERRAIN_RES + 3; // extended stride (one-sample border on every side)
  readonly heights: Float32Array[] = [];
  readonly normals: Float32Array[] = [];
  minHeight = Infinity;
  maxHeight = -Infinity;

  constructor(heightFn: (d: Vector3) => number) {
    const { N, E } = this;
    const d = new Vector3();
    for (let face = 0; face < 6; face++) {
      const hs = new Float32Array(E * E);
      for (let j = -1; j <= N + 1; j++) {
        for (let i = -1; i <= N + 1; i++) {
          gridDir(face, i, j, N, d);
          const h = heightFn(d);
          hs[i + 1 + (j + 1) * E] = h;
          if (i >= 0 && i <= N && j >= 0 && j <= N) {
            if (h < this.minHeight) this.minHeight = h;
            if (h > this.maxHeight) this.maxHeight = h;
          }
        }
      }
      this.heights.push(hs);
      this.normals.push(this.computeNormals(face, hs));
    }
  }

  private computeNormals(face: number, hs: Float32Array): Float32Array {
    const { N, E } = this;
    const out = new Float32Array((N + 1) * (N + 1) * 3);
    const pl = new Vector3(), pr = new Vector3(), pd = new Vector3(), pu = new Vector3(), c = new Vector3(), n = new Vector3();
    const R = PLANET_RADIUS;
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        gridDir(face, i - 1, j, N, pl).multiplyScalar(R + hs[i + (j + 1) * E]);
        gridDir(face, i + 1, j, N, pr).multiplyScalar(R + hs[i + 2 + (j + 1) * E]);
        gridDir(face, i, j - 1, N, pd).multiplyScalar(R + hs[i + 1 + j * E]);
        gridDir(face, i, j + 1, N, pu).multiplyScalar(R + hs[i + 1 + (j + 2) * E]);
        pr.sub(pl);
        pu.sub(pd);
        n.crossVectors(pr, pu).normalize();
        gridDir(face, i, j, N, c);
        if (n.dot(c) < 0) n.negate();
        const k = (i + j * (N + 1)) * 3;
        out[k] = n.x;
        out[k + 1] = n.y;
        out[k + 2] = n.z;
      }
    }
    return out;
  }

  /** Height at integer grid vertex (i, j in [0, N]). */
  vertexHeight(face: number, i: number, j: number): number {
    return this.heights[face][i + 1 + (j + 1) * this.E];
  }

  /** Terrain height (relative to PLANET_RADIUS) under direction d — exact match with the mesh triangles. */
  heightAt(d: Vector3): number {
    const { N } = this;
    const g = dirToGrid(d, N);
    let i = Math.floor(g.fi), j = Math.floor(g.fj);
    if (i < 0) i = 0; else if (i > N - 1) i = N - 1;
    if (j < 0) j = 0; else if (j > N - 1) j = N - 1;
    const fx = Math.min(1, Math.max(0, g.fi - i));
    const fy = Math.min(1, Math.max(0, g.fj - j));
    const hs = this.heights[g.face];
    const E = this.E;
    const h00 = hs[i + 1 + (j + 1) * E];
    const h10 = hs[i + 2 + (j + 1) * E];
    const h01 = hs[i + 1 + (j + 2) * E];
    const h11 = hs[i + 2 + (j + 2) * E];
    if (fx >= fy) return h00 + (h10 - h00) * fx + (h11 - h10) * fy;
    return h00 + (h11 - h01) * fx + (h01 - h00) * fy;
  }

  /** Smoothly interpolated surface normal under direction d. */
  normalAt(d: Vector3, out = new Vector3()): Vector3 {
    const { N } = this;
    const g = dirToGrid(d, N);
    let i = Math.floor(g.fi), j = Math.floor(g.fj);
    if (i < 0) i = 0; else if (i > N - 1) i = N - 1;
    if (j < 0) j = 0; else if (j > N - 1) j = N - 1;
    const fx = Math.min(1, Math.max(0, g.fi - i));
    const fy = Math.min(1, Math.max(0, g.fj - j));
    const ns = this.normals[g.face];
    const S = N + 1;
    const k00 = (i + j * S) * 3, k10 = (i + 1 + j * S) * 3, k01 = (i + (j + 1) * S) * 3, k11 = (i + 1 + (j + 1) * S) * 3;
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    out.set(
      ns[k00] * w00 + ns[k10] * w10 + ns[k01] * w01 + ns[k11] * w11,
      ns[k00 + 1] * w00 + ns[k10 + 1] * w10 + ns[k01 + 1] * w01 + ns[k11 + 1] * w11,
      ns[k00 + 2] * w00 + ns[k10 + 2] * w10 + ns[k01 + 2] * w01 + ns[k11 + 2] * w11,
    );
    return out.normalize();
  }

  /** Surface point (world position) under direction d with an optional lift along the normal. */
  surfacePoint(d: Vector3, lift = 0, out = new Vector3()): Vector3 {
    const n = out.copy(d).normalize();
    return n.multiplyScalar(PLANET_RADIUS + this.heightAt(n) + lift);
  }
}
