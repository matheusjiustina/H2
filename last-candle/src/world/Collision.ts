/**
 * Lightweight, deterministic collision world for the player and NPC spacing.
 * The building is mostly axis-aligned, so AABB obstacles + floor surfaces
 * (flat or ramped) give rock-solid results without a general physics solver.
 */
export interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  tag?: string;
  enabled?: boolean;
  /** Blocks interaction rays (walls, closed doors). */
  occludes?: boolean;
}

export interface FloorSurface {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
  /** Optional ramp along z: height goes from y at z=rampZ0 to y1 at z=rampZ1. */
  ramp?: { z0: number; z1: number; y1: number };
  tag?: string;
}

export interface DynCircle {
  x: number;
  z: number;
  r: number;
  minY: number;
  maxY: number;
  enabled: boolean;
  tag?: string;
}

export const STEP_HEIGHT = 0.42;
export const BODY_HEIGHT = 1.8;

export class CollisionWorld {
  boxes: AABB[] = [];
  floors: FloorSurface[] = [];
  circles: DynCircle[] = [];

  addBox(b: AABB): AABB {
    if (b.minX > b.maxX) [b.minX, b.maxX] = [b.maxX, b.minX];
    if (b.minZ > b.maxZ) [b.minZ, b.maxZ] = [b.maxZ, b.minZ];
    if (b.enabled === undefined) b.enabled = true;
    this.boxes.push(b);
    return b;
  }

  addFloor(f: FloorSurface): void {
    this.floors.push(f);
  }

  addCircle(c: DynCircle): DynCircle {
    this.circles.push(c);
    return c;
  }

  surfaceHeight(f: FloorSurface, z: number): number {
    if (!f.ramp) return f.y;
    const t = Math.min(1, Math.max(0, (z - f.ramp.z0) / (f.ramp.z1 - f.ramp.z0)));
    return f.y + (f.ramp.y1 - f.y) * t;
  }

  /** Highest walkable surface under (x,z) that is reachable from feetY. */
  groundAt(x: number, z: number, feetY: number): number {
    let best = -Infinity;
    for (const f of this.floors) {
      if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
      const h = this.surfaceHeight(f, z);
      if (h <= feetY + STEP_HEIGHT && h > best) best = h;
    }
    return best;
  }

  /** True when a surface at (x,z) rises too high to step onto but low enough to hit the body. */
  floorBlocks(x: number, z: number, feetY: number, r: number): boolean {
    // sample center + 4 points on the circle edge so ramps can't be clipped from the side
    const pts: [number, number][] = [
      [x, z],
      [x + r * 0.7, z],
      [x - r * 0.7, z],
      [x, z + r * 0.7],
      [x, z - r * 0.7],
    ];
    for (const [px, pz] of pts) {
      for (const f of this.floors) {
        if (px < f.minX || px > f.maxX || pz < f.minZ || pz > f.maxZ) continue;
        const h = this.surfaceHeight(f, pz);
        if (h > feetY + STEP_HEIGHT && h < feetY + BODY_HEIGHT) return true;
      }
    }
    return false;
  }

  /** Push a circle (player/NPC footprint) out of all overlapping obstacles. Returns true if any contact happened. */
  resolve(pos: { x: number; z: number }, r: number, feetY: number, ignoreTag?: string): boolean {
    let hit = false;
    const lo = feetY + 0.25;
    const hi = feetY + BODY_HEIGHT;
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const b of this.boxes) {
        if (!b.enabled) continue;
        if (b.maxY <= lo || b.minY >= hi) continue;
        if (pos.x < b.minX - r || pos.x > b.maxX + r || pos.z < b.minZ - r || pos.z > b.maxZ + r) continue;
        const cx = Math.min(Math.max(pos.x, b.minX), b.maxX);
        const cz = Math.min(Math.max(pos.z, b.minZ), b.maxZ);
        let dx = pos.x - cx;
        let dz = pos.z - cz;
        let d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 < 1e-10) {
          // center inside the box: push out along the shallowest axis
          const pl = pos.x - b.minX;
          const pr = b.maxX - pos.x;
          const pb = pos.z - b.minZ;
          const pf = b.maxZ - pos.z;
          const m = Math.min(pl, pr, pb, pf);
          if (m === pl) pos.x = b.minX - r;
          else if (m === pr) pos.x = b.maxX + r;
          else if (m === pb) pos.z = b.minZ - r;
          else pos.z = b.maxZ + r;
        } else {
          const d = Math.sqrt(d2);
          const push = r - d;
          dx /= d;
          dz /= d;
          pos.x += dx * push;
          pos.z += dz * push;
        }
        moved = true;
        hit = true;
      }
      for (const c of this.circles) {
        if (!c.enabled || (ignoreTag && c.tag === ignoreTag)) continue;
        if (c.maxY <= lo || c.minY >= hi) continue;
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const rr = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-4;
        const push = rr - d;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
        moved = true;
        hit = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  /** Distance to the nearest occluding box along a ray (Infinity if none). */
  occlusion(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): number {
    let best = Infinity;
    for (const b of this.boxes) {
      if (!b.enabled || !b.occludes) continue;
      let tmin = 0;
      let tmax = maxDist;
      const axes: [number, number, number, number][] = [
        [ox, dx, b.minX, b.maxX],
        [oy, dy, b.minY, b.maxY],
        [oz, dz, b.minZ, b.maxZ],
      ];
      let hit = true;
      for (const [o, d, mn, mx] of axes) {
        if (Math.abs(d) < 1e-9) {
          if (o < mn || o > mx) {
            hit = false;
            break;
          }
        } else {
          let t1 = (mn - o) / d;
          let t2 = (mx - o) / d;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) {
            hit = false;
            break;
          }
        }
      }
      if (hit && tmin < best) best = tmin;
    }
    return best;
  }

  /** Is a circle placed here free of static obstacles? */
  isFree(x: number, z: number, r: number, feetY: number): boolean {
    const p = { x, z };
    const hit = this.resolve(p, r, feetY);
    return !hit && !this.floorBlocks(x, z, feetY, r) && this.groundAt(x, z, feetY) > -Infinity;
  }
}
