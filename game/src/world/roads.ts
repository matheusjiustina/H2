import { PAL } from '../render/materials';
import { Geo } from '../render/geo';
import { segDist } from '../core/util';
import { ROAD_LINES, ROAD_Y, RoadKind, RoadLine } from './layout';

export interface RNode {
  id: number;
  x: number;
  z: number;
  edges: REdge[];
  signal: boolean;
  city: boolean;
  /** Half extent of the intersection patch along x and z. */
  hx: number;
  hz: number;
  axis: boolean;
  phase: number;
}

export interface REdge {
  id: number;
  a: RNode;
  b: RNode;
  len: number;
  w: number;
  kind: RoadKind;
  /** Unit direction a→b. */
  dx: number;
  dz: number;
  lanes: number;
  traffic: boolean;
  city: boolean;
  name: string;
}

const SPEED: Record<RoadKind, number> = { arterial: 15, street: 11, narrow: 8, rural: 14, highway: 19, dirt: 7, bridge: 12 };

export class RoadNet {
  nodes: RNode[] = [];
  edges: REdge[] = [];
  private nodeKey = new Map<string, RNode>();
  private hash = new Map<number, REdge[]>();
  private cell = 48;
  /** Positions of signal heads for the dynamic lamp renderer. */
  signalHeads: { x: number; y: number; z: number; node: RNode; ns: boolean; nx: number; nz: number }[] = [];

  constructor() {
    this.buildGraph(ROAD_LINES);
  }

  private getNode(x: number, z: number): RNode {
    const key = `${Math.round(x)}|${Math.round(z)}`;
    let n = this.nodeKey.get(key);
    if (!n) {
      n = { id: this.nodes.length, x, z, edges: [], signal: false, city: false, hx: 0, hz: 0, axis: true, phase: 0 };
      this.nodes.push(n);
      this.nodeKey.set(key, n);
    }
    return n;
  }

  private buildGraph(lines: RoadLine[]) {
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      const rx = L.bx - L.ax, rz = L.bz - L.az;
      const len = Math.hypot(rx, rz);
      const ts: number[] = [0, len];
      for (let j = 0; j < lines.length; j++) {
        if (i === j) continue;
        const O = lines[j];
        const sx = O.bx - O.ax, sz = O.bz - O.az;
        const den = rx * sz - rz * sx;
        if (Math.abs(den) < 1e-6) continue;
        const qx = O.ax - L.ax, qz = O.az - L.az;
        const t = (qx * sz - qz * sx) / den;
        const u = (qx * rz - qz * rx) / den;
        const olen = Math.hypot(sx, sz);
        if (t * len > -0.6 && t * len < len + 0.6 && u * olen > -0.6 && u * olen < olen + 0.6) ts.push(Math.min(len, Math.max(0, t * len)));
      }
      ts.sort((a, b) => a - b);
      let prev: RNode | null = null;
      let prevT = -10;
      for (const t of ts) {
        if (t - prevT < 1.5 && prev) continue;
        const n = this.getNode(L.ax + (rx / len) * t, L.az + (rz / len) * t);
        if (prev && prev !== n) this.addEdge(prev, n, L);
        prev = n;
        prevT = t;
      }
    }
    for (const n of this.nodes) {
      let wx = 0, wz = 0, axis = true, city = false, rad = 0;
      for (const e of n.edges) {
        const vertical = Math.abs(e.dx) < 0.02;
        const horizontal = Math.abs(e.dz) < 0.02;
        if (vertical) wx = Math.max(wx, e.w);
        else if (horizontal) wz = Math.max(wz, e.w);
        else axis = false;
        rad = Math.max(rad, e.w);
        if (e.city) city = true;
      }
      n.axis = axis;
      n.city = city;
      if (axis) {
        // patch spans the width of the crossing roads; a straight-through node needs none
        n.hx = (wx || wz) / 2;
        n.hz = (wz || wx) / 2;
      } else n.hx = n.hz = rad / 2;
      n.signal = city && n.edges.length >= 3;
      n.phase = (n.id * 7.31) % 22;
    }
  }

  private addEdge(a: RNode, b: RNode, L: RoadLine) {
    if (a.edges.some((e) => e.a === b || e.b === b)) return;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const e: REdge = {
      id: this.edges.length, a, b, len, w: L.w, kind: L.kind,
      dx: (b.x - a.x) / len, dz: (b.z - a.z) / len,
      lanes: L.kind === 'arterial' ? 2 : 1, traffic: L.traffic, city: L.city, name: L.name,
    };
    this.edges.push(e);
    a.edges.push(e);
    b.edges.push(e);
    const c = this.cell;
    const pad = 40;
    const x0 = Math.floor((Math.min(a.x, b.x) - pad) / c), x1 = Math.floor((Math.max(a.x, b.x) + pad) / c);
    const z0 = Math.floor((Math.min(a.z, b.z) - pad) / c), z1 = Math.floor((Math.max(a.z, b.z) + pad) / c);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const k = x * 4096 + z;
        let arr = this.hash.get(k);
        if (!arr) this.hash.set(k, (arr = []));
        arr.push(e);
      }
  }

  other(e: REdge, n: RNode) {
    return e.a === n ? e.b : e.a;
  }

  /** Distance to the nearest road edge surface (0 when on the road). Capped at ~40. */
  distToRoad(x: number, z: number): number {
    const arr = this.hash.get(Math.floor(x / this.cell) * 4096 + Math.floor(z / this.cell));
    if (!arr) return 60;
    let best = 60;
    for (const e of arr) {
      const d = segDist(x, z, e.a.x, e.a.z, e.b.x, e.b.z)[0] - e.w / 2;
      if (d < best) best = d;
    }
    return Math.max(0, best);
  }

  nearestEdge(x: number, z: number, trafficOnly = false): { e: REdge; t: number; d: number } | null {
    const arr = this.hash.get(Math.floor(x / this.cell) * 4096 + Math.floor(z / this.cell));
    let best: { e: REdge; t: number; d: number } | null = null;
    const scan = (list: REdge[]) => {
      for (const e of list) {
        if (trafficOnly && !e.traffic) continue;
        const [d, t] = segDist(x, z, e.a.x, e.a.z, e.b.x, e.b.z);
        if (!best || d < best.d) best = { e, t, d };
      }
    };
    if (arr) scan(arr);
    if (!best) scan(this.edges);
    return best;
  }

  nearestNode(x: number, z: number, filter?: (n: RNode) => boolean): RNode {
    let best = this.nodes[0];
    let bd = Infinity;
    for (const n of this.nodes) {
      if (filter && !filter(n)) continue;
      const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  /** A* over drivable edges. Returns the node list from a to b (inclusive) or [] when unreachable. */
  path(a: RNode, b: RNode): RNode[] {
    if (a === b) return [a];
    const N = this.nodes.length;
    const g = new Float32Array(N).fill(Infinity);
    const f = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open: number[] = [a.id];
    g[a.id] = 0;
    f[a.id] = Math.hypot(a.x - b.x, a.z - b.z) / 19;
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = this.nodes[open[bi]];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === b) {
        const out: RNode[] = [];
        let c = b.id;
        while (c >= 0) {
          out.push(this.nodes[c]);
          c = came[c];
        }
        return out.reverse();
      }
      if (closed[cur.id]) continue;
      closed[cur.id] = 1;
      for (const e of cur.edges) {
        if (e.kind === 'bridge') continue;
        const o = this.other(e, cur);
        if (closed[o.id]) continue;
        const ng = g[cur.id] + e.len / SPEED[e.kind];
        if (ng < g[o.id]) {
          g[o.id] = ng;
          came[o.id] = cur.id;
          f[o.id] = ng + Math.hypot(o.x - b.x, o.z - b.z) / 19;
          open.push(o.id);
        }
      }
    }
    return [];
  }

  /** Traffic signal state for traffic travelling along an edge into a node. */
  signalFor(n: RNode, ns: boolean, time: number): 'green' | 'yellow' | 'red' {
    if (!n.signal) return 'green';
    const t = (time + n.phase) % 22;
    if (ns) return t < 9 ? 'green' : t < 11 ? 'yellow' : 'red';
    return t >= 11 && t < 20 ? 'green' : t >= 20 ? 'yellow' : 'red';
  }

  speedLimit(e: REdge) {
    return SPEED[e.kind];
  }

  /** Emit asphalt, markings, crosswalks and signal poles. */
  emit(geo: Geo) {
    const asphalt = PAL.asphalt;
    for (const e of this.edges) {
      if (e.kind === 'bridge') continue;
      const cutA = this.cut(e, e.a), cutB = this.cut(e, e.b);
      const ax = e.a.x + e.dx * cutA, az = e.a.z + e.dz * cutA;
      const bx = e.b.x - e.dx * cutB, bz = e.b.z - e.dz * cutB;
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const px = -e.dz, pz = e.dx; // perpendicular
      const col = e.kind === 'dirt' ? PAL.dirt : asphalt;
      const y = e.kind === 'dirt' ? ROAD_Y - 0.012 : ROAD_Y;
      // split long edges so each piece lands in its own chunk
      const parts = Math.max(1, Math.ceil(L / 60));
      for (let i = 0; i < parts; i++) {
        const t0 = i / parts, t1 = (i + 1) / parts;
        const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0;
        const x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
        const hw = e.w / 2;
        geo.at('road', (x0 + x1) / 2, (z0 + z1) / 2).quad(
          x0 + px * hw, y, z0 + pz * hw, x1 + px * hw, y, z1 + pz * hw,
          x1 - px * hw, y, z1 - pz * hw, x0 - px * hw, y, z0 - pz * hw, col,
        );
      }
      if (e.kind === 'dirt') continue;
      this.markings(geo, e, ax, az, L);
    }
    for (const n of this.nodes) {
      if (n.edges.every((e) => e.kind === 'bridge')) continue;
      const dirt = n.edges.every((e) => e.kind === 'dirt');
      const b = geo.at('road', n.x, n.z);
      const y = dirt ? ROAD_Y - 0.012 : ROAD_Y;
      if (n.axis) {
        if (n.edges.length >= 2) b.flat(n.x, y, n.z, n.hx * 2, n.hz * 2, dirt ? PAL.dirt : asphalt);
      } else b.cyl(n.x, y - 0.01, n.z, n.hx, n.hx, 0.01, 12, dirt ? PAL.dirt : asphalt, true);
      if (n.signal) this.signals(geo, n);
    }
  }

  /** How far from the node centre the edge's own surface starts. */
  cut(e: REdge, n: RNode): number {
    if (!n.axis) return 0;
    if (n.edges.length < 2) return 0;
    return Math.abs(e.dx) < 0.02 ? n.hz : n.hx;
  }

  private markings(geo: Geo, e: REdge, ax: number, az: number, L: number) {
    const px = -e.dz, pz = e.dx;
    const y = ROAD_Y + 0.02;
    const strip = (off: number, s0: number, s1: number, w: number, col: number) => {
      const x0 = ax + e.dx * s0 + px * off, z0 = az + e.dz * s0 + pz * off;
      const x1 = ax + e.dx * s1 + px * off, z1 = az + e.dz * s1 + pz * off;
      const h = w / 2;
      geo.at('decal', (x0 + x1) / 2, (z0 + z1) / 2).quad(
        x0 + px * h, y, z0 + pz * h, x1 + px * h, y, z1 + pz * h,
        x1 - px * h, y, z1 - pz * h, x0 - px * h, y, z0 - pz * h, col,
      );
    };
    const solid = (off: number, w: number, col: number, s0 = 0, s1 = L) => {
      const parts = Math.max(1, Math.ceil((s1 - s0) / 60));
      for (let i = 0; i < parts; i++) strip(off, s0 + ((s1 - s0) * i) / parts, s0 + ((s1 - s0) * (i + 1)) / parts, w, col);
    };
    const dashed = (off: number, w: number, col: number, dash: number, gap: number, s0 = 0, s1 = L) => {
      for (let s = s0 + gap / 2; s + dash <= s1; s += dash + gap) strip(off, s, s + dash, w, col);
    };
    const sigA = e.a.signal ? 7 : 0, sigB = e.b.signal ? 7 : 0;
    const s0 = sigA, s1 = L - sigB;
    if (s1 - s0 < 4) return;
    if (e.kind === 'arterial') {
      solid(-0.22, 0.16, PAL.lineYellow, s0, s1);
      solid(0.22, 0.16, PAL.lineYellow, s0, s1);
      dashed(-e.w / 4, 0.16, PAL.line, 3, 6, s0, s1);
      dashed(e.w / 4, 0.16, PAL.line, 3, 6, s0, s1);
    } else if (e.kind === 'street') {
      solid(0, 0.18, PAL.lineYellow, s0, s1);
    } else if (e.kind === 'narrow') {
      dashed(0, 0.16, PAL.line, 2.5, 5, s0, s1);
    } else {
      dashed(0, 0.2, PAL.lineYellow, 4, 6, s0, s1);
      solid(-e.w / 2 + 0.5, 0.14, PAL.line, s0, s1);
      solid(e.w / 2 - 0.5, 0.14, PAL.line, s0, s1);
    }
    // stop lines + zebra crossings at signalised ends
    const cross = (atStart: boolean) => {
      const base = atStart ? 0 : L;
      const dir = atStart ? 1 : -1;
      const zx = base + dir * 3.2;
      for (let o = -e.w / 2 + 0.8; o <= e.w / 2 - 0.8; o += 1.3) strip(o, Math.min(zx - 1.5, zx + 1.5), Math.max(zx - 1.5, zx + 1.5), 0.62, PAL.line);
      // stop line across the incoming half: traffic heading to `a` drives on the -p side of a→b
      const sl = base + dir * 6;
      const x0 = ax + e.dx * sl, z0 = az + e.dz * sl;
      const h = 0.22;
      const f0 = atStart ? -e.w / 2 + 0.3 : 0.3;
      const f1 = atStart ? -0.3 : e.w / 2 - 0.3;
      geo.at('decal', x0, z0).quad(
        x0 + px * f0 - e.dx * h, y, z0 + pz * f0 - e.dz * h, x0 + px * f1 - e.dx * h, y, z0 + pz * f1 - e.dz * h,
        x0 + px * f1 + e.dx * h, y, z0 + pz * f1 + e.dz * h, x0 + px * f0 + e.dx * h, y, z0 + pz * f0 + e.dz * h, PAL.line,
      );
    };
    if (e.a.signal) cross(true);
    if (e.b.signal) cross(false);
  }

  private signals(geo: Geo, n: RNode) {
    // One post per approach, on the far-right corner as seen by incoming traffic.
    for (const e of n.edges) {
      const toNode = e.b === n ? 1 : -1;
      const fx = e.dx * toNode, fz = e.dz * toNode; // direction of travel into the node
      const rx = -fz, rz = fx; // right-hand side
      const along = this.cut(e, n) + 0.6;
      const side = e.w / 2 + 1.0;
      const x = n.x - fx * along + rx * side;
      const z = n.z - fz * along + rz * side;
      const b = geo.at('world', x, z);
      b.cyl(x, 0.16, z, 0.12, 0.09, 4.6, 5, PAL.dark, true);
      // mast arm reaching over the lane
      const armLen = Math.min(e.w / 2 - 1, 5);
      const ang = Math.atan2(-rx, -rz);
      b.box(x - rx * armLen * 0.5, 4.6, z - rz * armLen * 0.5, 0.12, 0.12, armLen, PAL.dark, ang, 0);
      const hx = x - rx * armLen, hz = z - rz * armLen;
      b.box(hx, 4.15, hz, 0.42, 1.1, 0.36, 0x26283a, Math.atan2(fx, fz), 0);
      const ns = Math.abs(e.dx) < Math.abs(e.dz);
      this.signalHeads.push({ x: hx, y: 4.15, z: hz, node: n, ns, nx: -fx, nz: -fz });
    }
  }
}
