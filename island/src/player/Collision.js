// Static collision world: terrain heightfield + boxes (optionally walkable), vertical
// cylinders (trunks / posts) and ellipsoids (rocks). Spatial hash for fast queries.

const CELL = 8;

export class CollisionWorld {
  constructor(terrain) {
    this.terrain = terrain;
    this.grid = new Map();
    this.colliders = [];
    this._seen = new Set();
    this._out = [];
  }

  _key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }

  _insert(c, minX, minZ, maxX, maxZ) {
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const k = this._key(x, z);
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        arr.push(c);
      }
    }
  }

  /** Oriented box. x,y,z centre; hx,hy,hz half extents; yaw rotation. */
  addBox({ x, y, z, hx, hy, hz, yaw = 0, walkable = false, surface = 'wood', solid = true, tag = null }) {
    const c = { type: 'box', x, y, z, hx, hy, hz, yaw, cos: Math.cos(yaw), sin: Math.sin(yaw), walkable, surface, solid, tag, id: this.colliders.length };
    this.colliders.push(c);
    const r = Math.hypot(hx, hz);
    this._insert(c, x - r, z - r, x + r, z + r);
    return c;
  }

  addCylinder({ x, z, r, y0, y1, surface = 'wood', tag = null }) {
    const c = { type: 'cyl', x, z, r, y0, y1, surface, tag, solid: true, id: this.colliders.length };
    this.colliders.push(c);
    this._insert(c, x - r, z - r, x + r, z + r);
    return c;
  }

  addEllipsoid({ x, y, z, rx, ry, rz, surface = 'rock', tag = null }) {
    const c = { type: 'ell', x, y, z, rx, ry, rz, surface, tag, solid: true, id: this.colliders.length };
    this.colliders.push(c);
    this._insert(c, x - rx, z - rz, x + rx, z + rz);
    return c;
  }

  remove(c) {
    c.solid = false;
    c.removed = true;
  }

  query(x, z, radius) {
    const out = this._out;
    out.length = 0;
    this._seen.clear();
    const x0 = Math.floor((x - radius) / CELL), x1 = Math.floor((x + radius) / CELL);
    const z0 = Math.floor((z - radius) / CELL), z1 = Math.floor((z + radius) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const arr = this.grid.get(this._key(cx, cz));
        if (!arr) continue;
        for (const c of arr) {
          if (c.removed || this._seen.has(c.id)) continue;
          this._seen.add(c.id);
          out.push(c);
        }
      }
    }
    return out;
  }

  _boxLocal(c, x, z) {
    const dx = x - c.x, dz = z - c.z;
    return [dx * c.cos - dz * c.sin, dx * c.sin + dz * c.cos];
  }

  /**
   * Highest walkable surface at (x,z) that is at most `maxY`.
   * Returns { y, surface, collider }.
   */
  ground(x, z, maxY, radius = 0.25) {
    let y = this.terrain.heightAt(x, z);
    let surface = 'terrain';
    let collider = null;
    const cands = this.query(x, z, radius + 0.5);
    for (const c of cands) {
      if (c.type === 'box' && c.walkable) {
        const [lx, lz] = this._boxLocal(c, x, z);
        if (Math.abs(lx) <= c.hx + radius * 0.4 && Math.abs(lz) <= c.hz + radius * 0.4) {
          const top = c.y + c.hy;
          if (top <= maxY && top > y) { y = top; surface = c.surface; collider = c; }
        }
      } else if (c.type === 'ell') {
        const dx = (x - c.x) / (c.rx + radius * 0.3), dz = (z - c.z) / (c.rz + radius * 0.3);
        const q = dx * dx + dz * dz;
        if (q < 1) {
          const top = c.y + c.ry * Math.sqrt(1 - q);
          if (top <= maxY && top > y) { y = top; surface = c.surface; collider = c; }
        }
      }
    }
    return { y, surface, collider };
  }

  /** Lowest solid surface above (x, y, z) – ceiling check for jumps. */
  ceiling(x, z, y, radius = 0.3) {
    let ceil = Infinity;
    for (const c of this.query(x, z, radius + 0.5)) {
      if (c.type !== 'box' || !c.solid) continue;
      const [lx, lz] = this._boxLocal(c, x, z);
      if (Math.abs(lx) <= c.hx + radius && Math.abs(lz) <= c.hz + radius) {
        const bottom = c.y - c.hy;
        if (bottom >= y && bottom < ceil) ceil = bottom;
      }
    }
    return ceil;
  }

  /**
   * Push a vertical capsule (feet position p, radius r, height h) out of solid
   * colliders whose vertical span intersects [feet + step, feet + h].
   * Mutates p.x / p.z. Returns true if a collision occurred.
   */
  resolve(p, r, h, step) {
    let hit = false;
    const lo = p.y + step, hi = p.y + h;
    for (let iter = 0; iter < 3; iter++) {
      let any = false;
      for (const c of this.query(p.x, p.z, r + 1.5)) {
        if (!c.solid) continue;
        if (c.type === 'box') {
          const y0 = c.y - c.hy, y1 = c.y + c.hy;
          if (y1 <= lo || y0 >= hi) continue;
          const [lx, lz] = this._boxLocal(c, p.x, p.z);
          const cx = Math.max(-c.hx, Math.min(c.hx, lx));
          const cz = Math.max(-c.hz, Math.min(c.hz, lz));
          let ox = lx - cx, oz = lz - cz;
          let d = Math.hypot(ox, oz);
          if (d >= r) continue;
          let nx, nz, push;
          if (d < 1e-5) {
            // centre inside: push out along the shallowest axis
            const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
            if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; push = px + r; } else { nx = 0; nz = Math.sign(lz) || 1; push = pz + r; }
          } else { nx = ox / d; nz = oz / d; push = r - d; }
          // back to world
          const wx = nx * c.cos + nz * c.sin, wz = -nx * c.sin + nz * c.cos;
          p.x += wx * push;
          p.z += wz * push;
          any = true;
        } else if (c.type === 'cyl') {
          if (c.y1 <= lo || c.y0 >= hi) continue;
          const dx = p.x - c.x, dz = p.z - c.z;
          const d = Math.hypot(dx, dz);
          const min = r + c.r;
          if (d >= min) continue;
          const nx = d > 1e-5 ? dx / d : 1, nz = d > 1e-5 ? dz / d : 0;
          p.x += nx * (min - d);
          p.z += nz * (min - d);
          any = true;
        } else if (c.type === 'ell') {
          // test the slice of the ellipsoid at the lowest blocking height
          const yy = Math.max(lo, Math.min(hi, c.y));
          const t = (yy - c.y) / c.ry;
          if (Math.abs(t) >= 1) continue;
          const s = Math.sqrt(1 - t * t);
          const rx = c.rx * s + r, rz = c.rz * s + r;
          const dx = (p.x - c.x) / rx, dz = (p.z - c.z) / rz;
          const q = Math.hypot(dx, dz);
          if (q >= 1) continue;
          // rocks low enough to step on are handled by ground()
          const top = c.y + c.ry * Math.sqrt(Math.max(0, 1 - ((p.x - c.x) / (c.rx + 0.01)) ** 2 - ((p.z - c.z) / (c.rz + 0.01)) ** 2));
          if (top <= lo) continue;
          const nx = q > 1e-5 ? dx / q : 1, nz = q > 1e-5 ? dz / q : 0;
          p.x = c.x + nx * rx;
          p.z = c.z + nz * rz;
          any = true;
        }
      }
      if (!any) break;
      hit = true;
    }
    return hit;
  }

  /** Segment test against solid boxes/cylinders/ellipsoids (for thrown objects). */
  pointInside(x, y, z, pad = 0) {
    for (const c of this.query(x, z, 1 + pad)) {
      if (!c.solid) continue;
      if (c.type === 'box') {
        const [lx, lz] = this._boxLocal(c, x, z);
        if (Math.abs(lx) < c.hx + pad && Math.abs(lz) < c.hz + pad && Math.abs(y - c.y) < c.hy + pad) return c;
      } else if (c.type === 'cyl') {
        if (Math.hypot(x - c.x, z - c.z) < c.r + pad && y > c.y0 && y < c.y1) return c;
      } else if (c.type === 'ell') {
        const dx = (x - c.x) / (c.rx + pad), dy = (y - c.y) / (c.ry + pad), dz = (z - c.z) / (c.rz + pad);
        if (dx * dx + dy * dy + dz * dz < 1) return c;
      }
    }
    return null;
  }
}
