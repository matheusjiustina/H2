// Path planning on the base apron for the service truck and the badeco.
//  * A clearance field (metres to the nearest obstacle) on a 0.5 m grid, from
//    the static colliders plus the ground footprint of every aircraft.
//  * Vehicle paths: hybrid A* over (x, z, heading) with forward and reverse
//    arcs at the truck's real turning radius, so every path can be driven;
//    the truck is checked as a chain of circles along its length.
//  * Walking paths: grid A* + line-of-sight smoothing.
// Deterministic: same obstacles and poses -> same path.

const RES = 0.5;

export class ApronPlanner {
  constructor(bounds, staticBoxes) {
    this.x0 = bounds.x0; this.z0 = bounds.z0;
    this.nx = Math.ceil((bounds.x1 - bounds.x0) / RES);
    this.nz = Math.ceil((bounds.z1 - bounds.z0) / RES);
    this.staticBoxes = staticBoxes; // [{x0, x1, z0, z1}] axis-aligned, world
    this.occ = new Uint8Array(this.nx * this.nz);
    this.dt = new Float32Array(this.nx * this.nz);
  }

  // Rebuild the clearance field. rects: oriented ground rectangles
  // {cx, cz, hx, hz, yaw} (yaw: local +z = (sin yaw, cos yaw)).
  build(rects = []) {
    const { nx, nz, occ } = this;
    occ.fill(0);
    for (const b of this.staticBoxes) this._fillAABB(b.x0, b.x1, b.z0, b.z1);
    for (const r of rects) this._fillRect(r);
    // Two-pass chamfer distance transform (1, √2), in metres.
    const D = this.dt, INF = 1e9, d1 = RES, d2 = RES * Math.SQRT2;
    for (let i = 0; i < nx * nz; i++) D[i] = occ[i] ? 0 : INF;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      let v = D[k];
      if (v === 0) continue;
      // Grid edge counts as an obstacle (stay inside the planning area).
      v = Math.min(v, (Math.min(i, j) + 0.5) * RES);
      if (i > 0) v = Math.min(v, D[k - 1] + d1);
      if (j > 0) {
        v = Math.min(v, D[k - nx] + d1);
        if (i > 0) v = Math.min(v, D[k - nx - 1] + d2);
        if (i < nx - 1) v = Math.min(v, D[k - nx + 1] + d2);
      }
      D[k] = v;
    }
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i;
      let v = D[k];
      if (v === 0) continue;
      v = Math.min(v, (Math.min(nx - 1 - i, nz - 1 - j) + 0.5) * RES);
      if (i < nx - 1) v = Math.min(v, D[k + 1] + d1);
      if (j < nz - 1) {
        v = Math.min(v, D[k + nx] + d1);
        if (i < nx - 1) v = Math.min(v, D[k + nx + 1] + d2);
        if (i > 0) v = Math.min(v, D[k + nx - 1] + d2);
      }
      D[k] = v;
    }
  }

  _fillAABB(x0, x1, z0, z1) {
    const i0 = Math.max(0, Math.floor((x0 - this.x0) / RES)), i1 = Math.min(this.nx - 1, Math.floor((x1 - this.x0) / RES));
    const j0 = Math.max(0, Math.floor((z0 - this.z0) / RES)), j1 = Math.min(this.nz - 1, Math.floor((z1 - this.z0) / RES));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.occ[j * this.nx + i] = 1;
  }

  _fillRect({ cx, cz, hx, hz, yaw }) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const ex = Math.abs(c) * hx + Math.abs(s) * hz, ez = Math.abs(s) * hx + Math.abs(c) * hz;
    const i0 = Math.max(0, Math.floor((cx - ex - this.x0) / RES)), i1 = Math.min(this.nx - 1, Math.ceil((cx + ex - this.x0) / RES));
    const j0 = Math.max(0, Math.floor((cz - ez - this.z0) / RES)), j1 = Math.min(this.nz - 1, Math.ceil((cz + ez - this.z0) / RES));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = this.x0 + (i + 0.5) * RES - cx, dz = this.z0 + (j + 0.5) * RES - cz;
      // Local axes: +x = (cos yaw, -sin yaw), +z = (sin yaw, cos yaw).
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) this.occ[j * this.nx + i] = 1;
    }
  }

  clearance(x, z) {
    const i = Math.floor((x - this.x0) / RES), j = Math.floor((z - this.z0) / RES);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return 0;
    return this.dt[j * this.nx + i];
  }

  // Vehicle footprint (circles along the heading from the reference point).
  poseFree(x, z, yaw, circles, r) {
    const sx = Math.sin(yaw), cz = Math.cos(yaw);
    for (const d of circles) if (this.clearance(x + sx * d, z + cz * d) < r) return false;
    return true;
  }

  // Hybrid A*. start/goal: {x, z, yaw}; goalYaws: accepted goal headings.
  // Returns [{x, z, yaw, dir}] sampled every 0.5 m, or null.
  planVehicle(start, goal, veh, { goalYaws = [goal.yaw], posTol = 0.6, yawTol = 0.21, maxNodes = 60000, reverse = true } = {}) {
    const R = veh.turnRadius, circles = veh.circles, rad = veh.radius;
    const HB = 36, CELL = 0.75, STEP = 2.0, SUB = 4;
    const kappas = [-1 / R, -0.5 / R, 0, 0.5 / R, 1 / R];
    const dirs = reverse ? [1, -1] : [1];
    const nodes = [];
    const best = new Map();
    const heap = new Heap();
    const keyOf = (x, z, yaw) => {
      const ix = Math.floor((x - this.x0) / CELL), iz = Math.floor((z - this.z0) / CELL);
      const ih = ((Math.round(yaw / (2 * Math.PI / HB)) % HB) + HB) % HB;
      return (iz * 4096 + ix) * HB + ih;
    };
    const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const h = (x, z, yaw) => {
      const d = Math.hypot(goal.x - x, goal.z - z);
      let ya = Infinity;
      for (const gy of goalYaws) ya = Math.min(ya, angDiff(yaw, gy));
      return d + ya * R * 0.5;
    };
    if (!this.poseFree(start.x, start.z, start.yaw, circles, rad * 0.85)) return null;
    nodes.push({ x: start.x, z: start.z, yaw: start.yaw, g: 0, parent: -1, dir: 1, k: 0, samples: null });
    heap.push(0, h(start.x, start.z, start.yaw));
    let found = -1;
    while (heap.size && nodes.length < maxNodes) {
      const ni = heap.pop();
      const n = nodes[ni];
      if (n.closed) continue;
      n.closed = true;
      if (Math.hypot(n.x - goal.x, n.z - goal.z) < posTol && goalYaws.some((gy) => angDiff(n.yaw, gy) < yawTol)) { found = ni; break; }
      for (const dir of dirs) for (const k of kappas) {
        let x = n.x, z = n.z, yaw = n.yaw, ok = true;
        const samples = [];
        const ds = STEP / SUB;
        for (let s = 0; s < SUB; s++) {
          const ym = yaw + dir * k * ds * 0.5;
          x += dir * Math.sin(ym) * ds;
          z += dir * Math.cos(ym) * ds;
          yaw += dir * k * ds;
          if (!this.poseFree(x, z, yaw, circles, rad)) { ok = false; break; }
          samples.push({ x, z, yaw, dir });
        }
        if (!ok) continue;
        let g = n.g + STEP * (dir < 0 ? 2.2 : 1) * (1 + 0.12 * Math.abs(k) * R) + (dir !== n.dir && n.parent >= 0 ? 7 : 0) + Math.abs(k - n.k) * R * 0.4;
        const key = keyOf(x, z, yaw);
        const prev = best.get(key);
        if (prev !== undefined && nodes[prev].g <= g) continue;
        const id = nodes.length;
        nodes.push({ x, z, yaw, g, parent: ni, dir, k, samples });
        best.set(key, id);
        heap.push(id, g + h(x, z, yaw) * 1.4);
      }
    }
    if (found < 0) return null;
    const chain = [];
    for (let i = found; i > 0; i = nodes[i].parent) chain.push(nodes[i]);
    chain.reverse();
    const out = [{ x: start.x, z: start.z, yaw: start.yaw, dir: chain[0]?.dir ?? 1 }];
    for (const n of chain) out.push(...n.samples);
    return out;
  }

  // Walking path between two points (grid A*, 8-connected, then pruned to
  // straight legs with line of sight). extra: () => clearance offset fn.
  planWalk(a, b, r = 0.45, extra = null) {
    const free = (x, z) => this.clearance(x, z) >= r && !(extra && extra(x, z) < r);
    if (this._los(a, b, free)) return [b];
    const { nx, nz } = this;
    const idx = (x, z) => [Math.floor((x - this.x0) / RES), Math.floor((z - this.z0) / RES)];
    const [si, sj] = idx(a.x, a.z), [gi, gj] = idx(b.x, b.z);
    const g = new Float32Array(nx * nz).fill(Infinity), par = new Int32Array(nx * nz).fill(-1);
    const heap = new Heap();
    const s0 = sj * nx + si, goal = gj * nx + gi;
    if (s0 < 0 || s0 >= nx * nz || goal < 0 || goal >= nx * nz) return null;
    g[s0] = 0; heap.push(s0, 0);
    const cx = (k) => this.x0 + ((k % nx) + 0.5) * RES, cz = (k) => this.z0 + (Math.floor(k / nx) + 0.5) * RES;
    let done = false, iter = 0;
    while (heap.size && iter++ < 60000) {
      const k = heap.pop();
      if (k === goal) { done = true; break; }
      const i = k % nx, j = Math.floor(k / nx);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const kk = jj * nx + ii;
        if (kk !== goal && !free(cx(kk), cz(kk))) continue;
        const ng = g[k] + (di && dj ? 1.414 : 1);
        if (ng < g[kk]) { g[kk] = ng; par[kk] = k; heap.push(kk, ng + Math.hypot(gi - ii, gj - jj)); }
      }
    }
    if (!done) return null;
    const cells = [];
    for (let k = goal; k !== -1; k = par[k]) cells.push({ x: cx(k), z: cz(k) });
    cells.reverse();
    cells[cells.length - 1] = { x: b.x, z: b.z };
    // Line-of-sight pruning.
    const out = [];
    let cur = a;
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this._los(cur, cells[j], free)) j--;
      out.push(cells[j]);
      cur = cells[j];
      i = j + 1;
    }
    return out;
  }

  _los(a, b, free) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(d / (RES * 0.7)));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (!free(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }
}

// Binary min-heap of (id, priority).
class Heap {
  constructor() { this.ids = []; this.pr = []; }
  get size() { return this.ids.length; }
  push(id, p) {
    const { ids, pr } = this;
    let i = ids.length;
    ids.push(id); pr.push(p);
    while (i > 0) {
      const q = (i - 1) >> 1;
      if (pr[q] <= p) break;
      ids[i] = ids[q]; pr[i] = pr[q]; i = q;
    }
    ids[i] = id; pr[i] = p;
  }
  pop() {
    const { ids, pr } = this;
    const top = ids[0];
    const lid = ids.pop(), lp = pr.pop();
    const n = ids.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && pr[c + 1] < pr[c]) c++;
        if (pr[c] >= lp) break;
        ids[i] = ids[c]; pr[i] = pr[c]; i = c;
      }
      ids[i] = lid; pr[i] = lp;
    }
    return top;
  }
}
