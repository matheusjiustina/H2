import { Vector3 } from 'three';
import { PLANET_RADIUS } from './constants';
import { SphereHash } from './SphereHash';

/**
 * Collision on a sphere. Colliders are defined in the tangent plane of their own centre, which is
 * accurate for building-sized objects on this planet; each one also carries a vertical extent so
 * the player can stand on top of platforms while their walls still block from below.
 */

export interface CircleCollider {
  kind: 'circle';
  center: Vector3; // unit direction
  radius: number;
  base: number; // bottom height relative to PLANET_RADIUS
  top: number;
  blocksCamera?: boolean;
  tag?: string;
}

export interface BoxCollider {
  kind: 'box';
  center: Vector3;
  xAxis: Vector3; // unit tangent
  zAxis: Vector3; // unit tangent
  hx: number;
  hz: number;
  base: number;
  top: number;
  blocksCamera?: boolean;
  tag?: string;
}

export type Collider = CircleCollider | BoxCollider;

/** A walkable platform: an oriented rectangle whose height ramps linearly from h0 (z = -hz) to h1 (z = +hz). */
export interface WalkSurface {
  center: Vector3;
  xAxis: Vector3;
  zAxis: Vector3;
  hx: number;
  hz: number;
  h0: number;
  h1: number;
  material?: SurfaceMaterial;
}

export type SurfaceMaterial = 'grass' | 'stone' | 'sand' | 'wood' | 'metal' | 'dirt' | 'snow';

export const STEP_UP = 0.45;

const _v = new Vector3();
const _q = new Vector3();
const _push = new Vector3();

export class CollisionWorld {
  readonly colliders: Collider[] = [];
  readonly surfaces: WalkSurface[] = [];
  private hash = new SphereHash<Collider>(6);
  private surfHash = new SphereHash<WalkSurface>(6);
  private qBuf: Collider[] = [];
  private qSeen = new Set<Collider>();
  private sBuf: WalkSurface[] = [];
  private sSeen = new Set<WalkSurface>();

  constructor(private terrainHeight: (d: Vector3) => number) {}

  add(c: Collider): void {
    this.colliders.push(c);
    const reach = c.kind === 'circle' ? c.radius : Math.hypot(c.hx, c.hz);
    this.hash.insert(c, _v.copy(c.center).multiplyScalar(PLANET_RADIUS + (c.base + c.top) / 2), reach + Math.abs(c.top - c.base) / 2 + 1);
  }

  addSurface(s: WalkSurface): void {
    this.surfaces.push(s);
    this.surfHash.insert(s, _v.copy(s.center).multiplyScalar(PLANET_RADIUS), Math.hypot(s.hx, s.hz) + 1);
  }

  /** Height of a walk surface at direction d, or null if outside it. */
  static surfaceHeightAt(s: WalkSurface, d: Vector3): number | null {
    _q.copy(d).normalize().sub(s.center);
    const x = _q.dot(s.xAxis) * PLANET_RADIUS;
    const z = _q.dot(s.zAxis) * PLANET_RADIUS;
    if (Math.abs(x) > s.hx || Math.abs(z) > s.hz) return null;
    const t = (z + s.hz) / (2 * s.hz);
    return s.h0 + (s.h1 - s.h0) * t;
  }

  /**
   * Ground height under d for a body whose feet are at `feet` (relative height). Platforms count if
   * they are reachable by stepping (at most STEP_UP above the feet). Returns the surface too.
   */
  ground(d: Vector3, feet = Infinity): { height: number; surface: WalkSurface | null } {
    let best = this.terrainHeight(d);
    let surf: WalkSurface | null = null;
    _v.copy(d).normalize().multiplyScalar(PLANET_RADIUS);
    this.sBuf.length = 0;
    this.sSeen.clear();
    this.surfHash.query(_v, 0.1, this.sBuf, this.sSeen);
    for (const s of this.sBuf) {
      const h = CollisionWorld.surfaceHeightAt(s, d);
      if (h === null) continue;
      if (h > best && h <= feet + STEP_UP) {
        best = h;
        surf = s;
      }
    }
    return { height: best, surface: surf };
  }

  /** Query colliders near a world position. */
  near(pos: Vector3, radius: number, out: Collider[] = []): Collider[] {
    this.qSeen.clear();
    return this.hash.query(pos, radius, out, this.qSeen);
  }

  /**
   * Pushes a body (unit direction `dir`, feet height `feet`, body radius `radius`, body height
   * `height`) out of overlapping colliders. Mutates `dir`; writes accumulated contact normals
   * (tangent vectors) into `normals`. Returns true if any contact occurred.
   */
  resolve(dir: Vector3, feet: number, radius: number, height: number, normals: Vector3[] = []): boolean {
    let hit = false;
    const R = PLANET_RADIUS;
    for (let iter = 0; iter < 3; iter++) {
      _v.copy(dir).multiplyScalar(R + feet);
      this.qBuf.length = 0;
      this.near(_v, radius + 1.5, this.qBuf);
      let moved = false;
      for (const c of this.qBuf) {
        if (feet >= c.top - 0.05 || feet + height <= c.base) continue;
        _q.copy(dir).sub(c.center);
        let pen = 0;
        if (c.kind === 'circle') {
          // Tangent offset from collider centre.
          _push.copy(_q).addScaledVector(c.center, -_q.dot(c.center));
          const dist = _push.length() * R;
          const minD = c.radius + radius;
          if (dist >= minD) continue;
          if (dist < 1e-5) {
            _push.set(1, 0, 0).addScaledVector(dir, -dir.x);
          }
          _push.normalize();
          pen = minD - dist;
        } else {
          const lx = _q.dot(c.xAxis) * R;
          const lz = _q.dot(c.zAxis) * R;
          const cx = Math.max(-c.hx, Math.min(c.hx, lx));
          const cz = Math.max(-c.hz, Math.min(c.hz, lz));
          const dx = lx - cx, dz = lz - cz;
          const d = Math.hypot(dx, dz);
          if (d >= radius) continue;
          if (d < 1e-6) {
            // Centre inside the box: exit through the nearest face.
            const px = c.hx - Math.abs(lx);
            const pz = c.hz - Math.abs(lz);
            if (px < pz) {
              _push.copy(c.xAxis).multiplyScalar(lx >= 0 ? 1 : -1);
              pen = px + radius;
            } else {
              _push.copy(c.zAxis).multiplyScalar(lz >= 0 ? 1 : -1);
              pen = pz + radius;
            }
          } else {
            _push.copy(c.xAxis).multiplyScalar(dx / d).addScaledVector(c.zAxis, dz / d);
            pen = radius - d;
          }
        }
        // Make the push tangent at the body and move along the surface.
        _push.addScaledVector(dir, -_push.dot(dir)).normalize();
        dir.addScaledVector(_push, (pen + 1e-4) / R).normalize();
        normals.push(_push.clone());
        hit = true;
        moved = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  /**
   * Segment cast from a to b (world positions) against camera-blocking boxes.
   * Returns the hit fraction in [0, 1] (1 = clear).
   */
  raycast(a: Vector3, b: Vector3): number {
    const R = PLANET_RADIUS;
    const mid = _v.copy(a).add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    this.qBuf.length = 0;
    this.near(mid, len / 2 + 2, this.qBuf);
    let best = 1;
    const dir = new Vector3().subVectors(b, a);
    for (const c of this.qBuf) {
      if (!c.blocksCamera) continue;
      const up = c.center;
      const hy = (c.top - c.base) / 2;
      const center = new Vector3().copy(up).multiplyScalar(R + c.base + hy);
      const o = new Vector3().subVectors(a, center);
      if (c.kind === 'circle') {
        // Vertical cylinder: radial quadratic, then clip by the height slab.
        const oh = o.clone().addScaledVector(up, -o.dot(up));
        const dh = dir.clone().addScaledVector(up, -dir.dot(up));
        const A = dh.dot(dh);
        const B = 2 * oh.dot(dh);
        const C = oh.dot(oh) - c.radius * c.radius;
        let tmin = 0, tmax = 1;
        if (A < 1e-12) {
          if (C > 0) continue;
        } else {
          const disc = B * B - 4 * A * C;
          if (disc < 0) continue;
          const sq = Math.sqrt(disc);
          tmin = Math.max(tmin, (-B - sq) / (2 * A));
          tmax = Math.min(tmax, (-B + sq) / (2 * A));
        }
        const e = o.dot(up);
        const f = dir.dot(up);
        if (Math.abs(f) < 1e-9) {
          if (Math.abs(e) > hy) continue;
        } else {
          let t1 = (-hy - e) / f;
          let t2 = (hy - e) / f;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
        }
        if (tmin <= tmax && tmin < best) best = tmin;
        continue;
      }
      // Slab test in the box frame.
      let tmin = 0, tmax = 1;
      const axes: [Vector3, number][] = [[c.xAxis, c.hx], [up, hy], [c.zAxis, c.hz]];
      let miss = false;
      for (const [ax, h] of axes) {
        const e = o.dot(ax);
        const f = dir.dot(ax);
        if (Math.abs(f) < 1e-9) {
          if (Math.abs(e) > h) { miss = true; break; }
          continue;
        }
        let t1 = (-h - e) / f;
        let t2 = (h - e) / f;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { miss = true; break; }
      }
      if (!miss && tmin < best) best = tmin;
    }
    return best;
  }
}
