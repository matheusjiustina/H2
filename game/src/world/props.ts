import { Rect, rectCx, rectCz, TAU } from '../core/util';
import { RGB, shade } from '../render/geo';
import { PAL } from '../render/materials';
import { SLAB_Y } from './layout';
import { rotP } from './buildings';
import { drawAd } from './signs';
import type { World } from './world';

type Col = number | RGB;
export type TreeKind = 'autumn' | 'green' | 'palm' | 'pine' | 'cactus' | 'bush';

export function tree(w: World, x: number, z: number, kind: TreeKind = 'autumn', s = 1, y = SLAB_Y) {
  const b = w.geo.at('world', x, z);
  const r = w.rng;
  const seed = Math.floor(r.next() * 1e6);
  if (kind === 'bush') {
    b.blob(x, y + 0.55 * s, z, 1.1 * s, 0.75 * s, 1.1 * s, r.pick(PAL.greens), seed, 0.25);
    return;
  }
  if (kind === 'cactus') {
    const h = r.range(2.6, 4.6) * s;
    const g = r.chance(0.5) ? 0x6f9a5a : 0x7fa862;
    b.cyl(x, y, z, 0.38 * s, 0.32 * s, h, 6, g, true);
    for (let i = 0; i < r.int(1, 2); i++) {
      const a = r.range(0, TAU), ay = y + h * r.range(0.35, 0.6), len = 0.9 * s;
      const ex = x + Math.cos(a) * len, ez = z + Math.sin(a) * len;
      b.box((x + ex) / 2, ay, (z + ez) / 2, len, 0.42 * s, 0.42 * s, g, -a, 0);
      b.cyl(ex, ay, ez, 0.24 * s, 0.2 * s, h * r.range(0.25, 0.4), 5, g, true);
    }
    w.addBox(x, z, 0.8, 0.8, 0, y + h, 0, { cam: false });
    return;
  }
  if (kind === 'palm') {
    const h = r.range(6.5, 9.5) * s;
    const lean = r.range(-0.6, 0.6), la = r.range(0, TAU);
    let px = x, pz = z;
    const seg = 4;
    for (let i = 0; i < seg; i++) {
      const t = (i + 1) / seg;
      const nx = x + Math.cos(la) * lean * t * t * 2, nz = z + Math.sin(la) * lean * t * t * 2;
      b.cyl((px + nx) / 2, y + (h * i) / seg, (pz + nz) / 2, 0.26 - i * 0.03, 0.23 - i * 0.03, h / seg + 0.05, 5, i % 2 ? 0x9a7a55 : 0x8a6b4a, false);
      px = nx;
      pz = nz;
    }
    const top = y + h;
    const green = r.chance(0.5) ? 0x5fa35a : 0x74b060;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + r.range(-0.2, 0.2);
      const dx = Math.cos(a), dz = Math.sin(a);
      const L = r.range(2.6, 3.4) * s, wd = 0.5 * s;
      const mx = px + dx * L * 0.55, mz = pz + dz * L * 0.55, my = top + 0.5;
      const ex = px + dx * L, ez = pz + dz * L, ey = top - 0.9;
      const sx = -dz * wd, sz = dx * wd;
      b.quad(px - sx * 0.3, top, pz - sz * 0.3, px + sx * 0.3, top, pz + sz * 0.3, mx + sx, my, mz + sz, mx - sx, my, mz - sz, green);
      b.tri(mx - sx, my, mz - sz, mx + sx, my, mz + sz, ex, ey, ez, shade(green, 0.85));
      // undersides so fronds are visible from below
      b.quad(px + sx * 0.3, top, pz + sz * 0.3, px - sx * 0.3, top, pz - sz * 0.3, mx - sx, my, mz - sz, mx + sx, my, mz + sz, shade(green, 0.7));
      b.tri(mx + sx, my, mz + sz, mx - sx, my, mz - sz, ex, ey, ez, shade(green, 0.65));
    }
    b.blob(px, top, pz, 0.45, 0.4, 0.45, 0x7a5a3a, seed, 0.1);
    w.addBox(x, z, 0.6, 0.6, 0, y + h * 0.6, 0, { cam: false });
    return;
  }
  if (kind === 'pine') {
    const h = r.range(7, 12) * s;
    const g = r.pick([0x3f7a55, 0x4a8a5c, 0x356a4c]);
    b.cyl(x, y, z, 0.3 * s, 0.2 * s, h * 0.3, 5, 0x5a4334, false);
    for (let i = 0; i < 3; i++) b.cyl(x, y + h * (0.2 + i * 0.24), z, (2.6 - i * 0.65) * s, 0, h * 0.36, 6, i % 2 ? shade(g, 1.1) : g, false, r.next());
    w.addBox(x, z, 0.7, 0.7, 0, y + h, 0, { cam: false });
    return;
  }
  const th = r.range(2.8, 4.2) * s;
  b.cyl(x, y, z, 0.24 * s, 0.14 * s, th, 5, 0x4a3a36, false);
  const pal = kind === 'green' ? PAL.greens : PAL.autumn;
  const c1 = r.pick(pal), c2 = shade(c1, 1.14);
  const n = r.int(3, 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r.range(0, 1);
    const d = i === 0 ? 0 : r.range(0.8, 1.5) * s;
    b.blob(x + Math.cos(a) * d, y + th + r.range(0.2, 1.5) * s, z + Math.sin(a) * d, r.range(1.4, 2.1) * s, r.range(1.0, 1.4) * s, r.range(1.4, 2.1) * s, c1, seed + i * 31, 0.26, c2);
  }
  w.addBox(x, z, 0.6, 0.6, 0, y + th, 0, { cam: false });
}

export function lamp(w: World, x: number, z: number, rot: number, y = SLAB_Y) {
  const b = w.geo.at('world', x, z);
  b.cyl(x, y, z, 0.13, 0.08, 6.6, 5, 0x3a5a5c, false);
  const [ax, az] = rotP(x, z, rot, 0, 1.0);
  b.box(ax, y + 6.6, az, 0.12, 0.12, 2.1, 0x3a5a5c, rot, 0);
  const [hx, hz] = rotP(x, z, rot, 0, 2.0);
  b.box(hx, y + 6.5, hz, 0.42, 0.18, 0.8, 0x2b2e42, rot, 0);
  w.geo.at('glow', x, z).box(hx, y + 6.38, hz, 0.34, 0.06, 0.66, PAL.paper, rot, 4);
  w.lamps.push(hx, y + 6.3, hz);
  w.addBox(x, z, 0.3, 0.3, 0, y + 6.6, 0, { cam: false });
}

export function bench(w: World, x: number, z: number, rot: number, y = SLAB_Y) {
  const b = w.geo.at('world', x, z);
  b.box(x, y + 0.45, z, 1.8, 0.1, 0.5, PAL.wood, rot, 0);
  const [bx, bz] = rotP(x, z, rot, 0, -0.26);
  b.box(bx, y + 0.8, bz, 1.8, 0.5, 0.08, PAL.wood, rot, 0);
  for (const lx of [-0.75, 0.75]) {
    const [px, pz] = rotP(x, z, rot, lx, 0);
    b.box(px, y + 0.22, pz, 0.08, 0.45, 0.45, PAL.dark, rot, 12);
  }
  w.addBox(x, z, 1.8, 0.5, 0, y + 0.5, rot, { cam: false });
}

export function hydrant(w: World, x: number, z: number) {
  const b = w.geo.at('world', x, z);
  b.cyl(x, SLAB_Y, z, 0.17, 0.15, 0.6, 6, PAL.red, true);
  b.cyl(x, SLAB_Y + 0.6, z, 0.12, 0.02, 0.16, 6, PAL.red);
  b.box(x, SLAB_Y + 0.4, z, 0.5, 0.12, 0.12, PAL.red, 0, 0);
}

export function trashcan(w: World, x: number, z: number) {
  w.geo.at('world', x, z).cyl(x, SLAB_Y, z, 0.28, 0.33, 0.9, 6, 0x4f6f66, true);
}

export function mailbox(w: World, x: number, z: number, rot: number) {
  const b = w.geo.at('world', x, z);
  b.box(x, SLAB_Y + 0.55, z, 0.1, 1.1, 0.1, PAL.wood, rot, 12);
  b.box(x, SLAB_Y + 1.2, z, 0.26, 0.26, 0.5, 0x8b93a6, rot, 0);
  const [fx, fz] = rotP(x, z, rot, 0.16, 0.1);
  b.box(fx, SLAB_Y + 1.36, fz, 0.03, 0.18, 0.12, PAL.red, rot, 0);
}

/** US-style blue collection box. */
export function postbox(w: World, x: number, z: number, rot: number) {
  const b = w.geo.at('world', x, z);
  b.box(x, SLAB_Y + 0.6, z, 0.6, 1.0, 0.55, PAL.blue, rot, 8);
  b.box(x, SLAB_Y + 1.14, z, 0.6, 0.16, 0.5, shade(PAL.blue, 1.2), rot, 0);
  w.addBox(x, z, 0.6, 0.55, 0, SLAB_Y + 1.2, rot, { cam: false });
}

export type FenceKind = 'picket' | 'iron' | 'chain' | 'wall' | 'wood' | 'hedge';

export function fence(w: World, ax: number, az: number, bx: number, bz: number, kind: FenceKind, h?: number, y = SLAB_Y, col?: Col) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 0.3) return;
  const rot = Math.atan2(-dz, dx);
  const ux = dx / len, uz = dz / len;
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const b = w.geo.at('world', mx, mz);
  const posts = (step: number, pw: number, ph: number, c: Col) => {
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= n; i++) b.box(ax + (dx * i) / n, y + ph / 2, az + (dz * i) / n, pw, ph, pw, c, rot, 8);
  };
  let H = h ?? 1;
  let thick = 0.12;
  let cam = false;
  if (kind === 'picket') {
    H = h ?? 1.0;
    b.box(mx, y + 0.25 + (H - 0.25) / 2, mz, len, H - 0.25, 0.06, col ?? PAL.white, rot, 0);
    posts(2.4, 0.13, H + 0.15, col ?? PAL.white);
  } else if (kind === 'iron') {
    H = h ?? 2.2;
    const c = col ?? 0x26283a;
    b.box(mx, y + H - 0.1, mz, len, 0.08, 0.08, c, rot, 0);
    b.box(mx, y + 0.25, mz, len, 0.08, 0.08, c, rot, 0);
    const n = Math.max(1, Math.round(len / 0.7));
    for (let i = 0; i <= n; i++) b.box(ax + (dx * i) / n, y + H / 2, az + (dz * i) / n, 0.05, H, 0.05, c, rot, 12);
    posts(7, 0.45, H + 0.3, PAL.stone);
  } else if (kind === 'chain') {
    H = h ?? 2.4;
    const c = col ?? 0x8b93a6;
    for (const ry of [0.2, H * 0.5, H - 0.05]) b.box(mx, y + ry, mz, len, 0.05, 0.05, c, rot, 0);
    const n = Math.max(1, Math.round(len / 0.9));
    for (let i = 0; i <= n; i++) b.box(ax + (dx * i) / n, y + H / 2, az + (dz * i) / n, 0.035, H, 0.035, c, rot, 12);
    posts(3.2, 0.1, H + 0.1, shade(c, 0.8));
  } else if (kind === 'wall') {
    H = h ?? 2.6;
    thick = 0.5;
    cam = true;
    b.box(mx, y + H / 2, mz, len, H, thick, col ?? 0xcfc8b8, rot, 8, shade(col ?? 0xcfc8b8, 0.85));
  } else if (kind === 'wood') {
    H = h ?? 1.1;
    for (const ry of [0.45, 0.9]) b.box(mx, y + ry, mz, len, 0.1, 0.06, col ?? PAL.wood, rot, 0);
    posts(3, 0.14, H + 0.1, col ?? PAL.woodDark);
  } else {
    H = h ?? 1.2;
    thick = 0.9;
    const n = Math.max(1, Math.round(len / 3));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      b.box(ax + dx * t, y + H / 2, az + dz * t, len / n + 0.05, H * (0.92 + (i % 3) * 0.05), thick, i % 2 ? 0x6fa35f : 0x7fb069, rot, 8);
    }
  }
  w.addBox(mx + 0 * ux, mz + 0 * uz, len, thick, 0, y + H, rot, { cam, tag: 'fence' });
}

/** Rectangle perimeter fence with optional gaps: gaps = list of [side(0=N,1=E,2=S,3=W), centre along side, width]. */
export function fenceRect(w: World, r: Rect, kind: FenceKind, gaps: [number, number, number][] = [], h?: number) {
  const sides: [number, number, number, number][] = [
    [r.x0, r.z0, r.x1, r.z0], [r.x1, r.z0, r.x1, r.z1], [r.x1, r.z1, r.x0, r.z1], [r.x0, r.z1, r.x0, r.z0],
  ];
  sides.forEach(([ax, az, bx, bz], i) => {
    const horiz = i % 2 === 0;
    const cuts = gaps.filter((g) => g[0] === i).map((g) => [g[1] - g[2] / 2, g[1] + g[2] / 2]).sort((a, b) => a[0] - b[0]);
    const lo = horiz ? Math.min(ax, bx) : Math.min(az, bz), hi = horiz ? Math.max(ax, bx) : Math.max(az, bz);
    let cur = lo;
    const seg = (s: number, e: number) => {
      if (e - s < 0.5) return;
      if (horiz) fence(w, s, az, e, az, kind, h);
      else fence(w, ax, s, ax, e, kind, h);
    };
    for (const [c0, c1] of cuts) {
      seg(cur, c0);
      cur = c1;
    }
    seg(cur, hi);
  });
}

export interface SlabOpts {
  top?: Col;
  hole?: Rect;
  inner?: Col;
  innerInset?: number;
  joints?: boolean;
}

/** Raised sidewalk block. Buildings sit on these; roads run between them. */
export function slab(w: World, r: Rect, o: SlabOpts = {}) {
  const top = o.top ?? PAL.sidewalk;
  const parts: Rect[] = [];
  const h = o.hole;
  if (h) {
    if (h.z0 > r.z0) parts.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: h.z0 });
    if (h.z1 < r.z1) parts.push({ x0: r.x0, x1: r.x1, z0: h.z1, z1: r.z1 });
    if (h.x0 > r.x0) parts.push({ x0: r.x0, x1: h.x0, z0: h.z0, z1: h.z1 });
    if (h.x1 < r.x1) parts.push({ x0: h.x1, x1: r.x1, z0: h.z0, z1: h.z1 });
  } else parts.push(r);
  for (const p of parts) {
    const cx = rectCx(p), cz = rectCz(p), sw = p.x1 - p.x0, sd = p.z1 - p.z0;
    // split big slabs into chunk-sized tiles
    const nx = Math.max(1, Math.ceil(sw / 70)), nz = Math.max(1, Math.ceil(sd / 70));
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const tx = p.x0 + (sw * (i + 0.5)) / nx, tz = p.z0 + (sd * (j + 0.5)) / nz;
        const skip = 8 | (i > 0 ? 2 : 0) | (i < nx - 1 ? 1 : 0) | (j > 0 ? 32 : 0) | (j < nz - 1 ? 16 : 0);
        w.geo.at('flat', tx, tz).box(tx, SLAB_Y / 2, tz, sw / nx, SLAB_Y, sd / nz, PAL.sidewalkEdge, 0, skip, top);
      }
    w.addBox(cx, cz, sw, sd, -1, SLAB_Y, 0, { cam: false, tag: 'slab' });
  }
  const y = SLAB_Y + 0.012;
  if (o.inner !== undefined) {
    const m = o.innerInset ?? 3.2;
    patch(w, { x0: r.x0 + m, z0: r.z0 + m, x1: r.x1 - m, z1: r.z1 - m }, o.inner, y, h ? { x0: h.x0 - 0.6, x1: h.x1 + 0.6, z0: h.z0 - 0.6, z1: h.z1 + 0.6 } : undefined);
  }
  if (o.joints !== false) {
    // expansion joints across the sidewalk ring
    const jw = 0.07, jl = 3.0;
    for (let x = r.x0 + 4; x < r.x1 - 3; x += 4) {
      if (h && x > h.x0 - 1 && x < h.x1 + 1) continue;
      w.geo.at('decal', x, r.z0).flat(x, y, r.z0 + jl / 2 + 0.1, jw, jl, PAL.sidewalkEdge);
      w.geo.at('decal', x, r.z1).flat(x, y, r.z1 - jl / 2 - 0.1, jw, jl, PAL.sidewalkEdge);
    }
    for (let z = r.z0 + 4; z < r.z1 - 3; z += 4) {
      w.geo.at('decal', r.x0, z).flat(r.x0 + jl / 2 + 0.1, y, z, jl, jw, PAL.sidewalkEdge);
      w.geo.at('decal', r.x1, z).flat(r.x1 - jl / 2 - 0.1, y, z, jl, jw, PAL.sidewalkEdge);
    }
  }
}

/** Coloured ground patch on top of a slab (lawns, plazas, courts). `hole` leaves a rectangular cut-out. */
export function patch(w: World, r: Rect, c: Col, y = SLAB_Y + 0.02, hole?: Rect) {
  if (hole) {
    if (hole.z0 > r.z0) patch(w, { x0: r.x0, x1: r.x1, z0: r.z0, z1: hole.z0 }, c, y);
    if (hole.z1 < r.z1) patch(w, { x0: r.x0, x1: r.x1, z0: hole.z1, z1: r.z1 }, c, y);
    if (hole.x0 > r.x0) patch(w, { x0: r.x0, x1: hole.x0, z0: Math.max(r.z0, hole.z0), z1: Math.min(r.z1, hole.z1) }, c, y);
    if (hole.x1 < r.x1) patch(w, { x0: hole.x1, x1: r.x1, z0: Math.max(r.z0, hole.z0), z1: Math.min(r.z1, hole.z1) }, c, y);
    return;
  }
  const sw = r.x1 - r.x0, sd = r.z1 - r.z0;
  if (sw <= 0 || sd <= 0) return;
  const nx = Math.max(1, Math.ceil(sw / 70)), nz = Math.max(1, Math.ceil(sd / 70));
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const tx = r.x0 + (sw * (i + 0.5)) / nx, tz = r.z0 + (sd * (j + 0.5)) / nz;
      w.geo.at('decal', tx, tz).flat(tx, y, tz, sw / nx, sd / nz, c);
    }
}

/** Street furniture around the edge of a block. */
export function furnish(w: World, r: Rect, o: { trees?: TreeKind | null; treeGap?: number; lamps?: number; extras?: boolean; skip?: Rect[]; sides?: number }) {
  const rng = w.rng;
  const skip = (x: number, z: number) => !!o.skip && o.skip.some((s) => x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1);
  const lampGap = o.lamps ?? 30;
  const treeGap = o.treeGap ?? 14;
  const edge = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number, rot: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    for (let s = 9; s < len - 9; s += lampGap) {
      const x = ax + ux * s + nx * 1.0, z = az + uz * s + nz * 1.0;
      if (!skip(x, z)) lamp(w, x, z, rot);
    }
    if (o.trees) {
      for (let s = 9 + lampGap / 2; s < len - 9; s += treeGap) {
        if (Math.abs(((s - 9) % lampGap)) < 2.5) continue;
        const x = ax + ux * s + nx * 1.6, z = az + uz * s + nz * 1.6;
        if (skip(x, z) || rng.chance(0.18)) continue;
        tree(w, x, z, o.trees, rng.range(0.8, 1.15));
      }
    }
    if (o.extras !== false) {
      for (let s = 14; s < len - 12; s += rng.range(16, 34)) {
        const x = ax + ux * s + nx * 1.1, z = az + uz * s + nz * 1.1;
        if (skip(x, z)) continue;
        const t = rng.next();
        if (t < 0.25) hydrant(w, x, z);
        else if (t < 0.5) trashcan(w, x, z);
        else if (t < 0.72) bench(w, ax + ux * s + nx * 2.6, az + uz * s + nz * 2.6, rot + Math.PI);
        else if (t < 0.82) postbox(w, x, z, rot);
      }
    }
  };
  const sides = o.sides ?? 15;
  // rot is the direction the lamp arm reaches (toward the road)
  if (sides & 1) edge(r.x0, r.z0, r.x1, r.z0, 0, 1, Math.PI);
  if (sides & 2) edge(r.x1, r.z1, r.x0, r.z1, 0, -1, 0);
  if (sides & 4) edge(r.x0, r.z1, r.x0, r.z0, 1, 0, -Math.PI / 2);
  if (sides & 8) edge(r.x1, r.z0, r.x1, r.z1, -1, 0, Math.PI / 2);
}

/** Free-standing billboard. Faces `rot`; visible from both sides. */
export function billboard(w: World, x: number, z: number, rot: number, ad: number, o: { y?: number; pole?: number; w?: number; h?: number; both?: boolean } = {}) {
  const b = w.geo.at('world', x, z);
  const bw = o.w ?? 12, bh = o.h ?? 6;
  const y0 = (o.y ?? SLAB_Y) + (o.pole ?? 9);
  if ((o.pole ?? 9) > 0.5) {
    for (const lx of [-bw * 0.3, bw * 0.3]) {
      const [px, pz] = rotP(x, z, rot, lx, -0.3);
      b.box(px, (o.y ?? SLAB_Y) + (o.pole ?? 9) / 2, pz, 0.4, o.pole ?? 9, 0.4, 0x4a4f66, rot, 8);
    }
    w.addBox(x, z, bw * 0.7, 0.6, 0, y0, rot, { cam: false });
  }
  b.box(x, y0 + bh / 2, z, bw + 0.5, bh + 0.5, 0.4, PAL.dark, rot, 0);
  const [fx, fz] = rotP(x, z, rot, 0, 0.22);
  w.signs.add(`ad${ad % 16}`, fx, y0 + bh / 2, fz, rot, bw, bh, 320, 160, drawAd(ad));
  if (o.both !== false) {
    const [gx, gz] = rotP(x, z, rot, 0, -0.22);
    w.signs.add(`ad${(ad + 5) % 16}`, gx, y0 + bh / 2, gz, rot + Math.PI, bw, bh, 320, 160, drawAd(ad + 5));
  }
}

export function flagpole(w: World, x: number, z: number, h = 9, y = SLAB_Y, s = 1) {
  const b = w.geo.at('world', x, z);
  b.cyl(x, y, z, 0.09, 0.05, h, 5, 0xcfd3d8, false);
  b.blob(x, y + h + 0.1, z, 0.14, 0.14, 0.14, PAL.gold, 3, 0);
  w.flags.push({ x, y: y + h - 0.2, z, rot: w.rng.range(-0.4, 0.4), s });
}

/** Utility poles with sagging wires along a polyline. */
export function powerLine(w: World, pts: number[][], y = SLAB_Y) {
  const poles: number[][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 34));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) poles.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n, Math.atan2(-(bz - az), bx - ax)]);
  }
  const H = 8.6;
  for (const [x, z, rot] of poles) {
    const b = w.geo.at('world', x, z);
    b.cyl(x, y, z, 0.16, 0.1, H + 0.6, 5, 0x5a4a40, false);
    b.box(x, y + H, z, 0.12, 0.12, 2.4, 0x5a4a40, rot, 0);
    b.box(x, y + H - 0.8, z, 0.1, 0.1, 1.6, 0x5a4a40, rot, 0);
    w.addBox(x, z, 0.35, 0.35, 0, y + H, 0, { cam: false });
  }
  for (let i = 0; i < poles.length - 1; i++) {
    const [ax, az, ra] = poles[i], [bx, bz] = poles[i + 1];
    const b = w.geo.at('world', (ax + bx) / 2, (az + bz) / 2);
    for (const off of [-1.1, 0, 1.1]) {
      const [oax, oaz] = rotP(ax, az, ra, 0, off), [obx, obz] = rotP(bx, bz, ra, 0, off);
      const S = 4;
      for (let s = 0; s < S; s++) {
        const t0 = s / S, t1 = (s + 1) / S;
        const sag = (t: number) => y + H + 0.08 - Math.sin(t * Math.PI) * 0.9;
        const x0 = oax + (obx - oax) * t0, z0 = oaz + (obz - oaz) * t0, x1 = oax + (obx - oax) * t1, z1 = oaz + (obz - oaz) * t1;
        // two thin crossed ribbons read as a wire from any angle
        b.quad(x0, sag(t0), z0, x1, sag(t1), z1, x1, sag(t1) + 0.05, z1, x0, sag(t0) + 0.05, z0, PAL.ink);
        b.quad(x1, sag(t1), z1, x0, sag(t0), z0, x0, sag(t0) + 0.05, z0, x1, sag(t1) + 0.05, z1, PAL.ink);
      }
    }
  }
}

/** Marked parking lot. Registers spawn spots for parked vehicles. */
export function parkingLot(w: World, r: Rect, vertical = true, kind?: string, y = SLAB_Y) {
  patch(w, r, PAL.asphaltDark, y + 0.02);
  const stall = 2.9, depth = 5.4;
  const dec = (x: number, z: number, sw: number, sd: number) => w.geo.at('decal', x, z).flat(x, y + 0.035, z, sw, sd, PAL.line);
  if (vertical) {
    // rows along x, cars face ±z
    for (let z = r.z0 + depth / 2 + 0.6, row = 0; z + depth / 2 < r.z1; z += row % 2 === 0 ? depth : depth + 7, row++) {
      for (let x = r.x0 + 1; x + stall <= r.x1 - 0.5; x += stall) {
        dec(x, z, 0.12, depth);
        if (w.rng.chance(0.55)) w.parkSpots.push({ x: x + stall / 2, z, rot: row % 2 ? 0 : Math.PI, y, kind });
      }
    }
  } else {
    for (let x = r.x0 + depth / 2 + 0.6, row = 0; x + depth / 2 < r.x1; x += row % 2 === 0 ? depth : depth + 7, row++) {
      for (let z = r.z0 + 1; z + stall <= r.z1 - 0.5; z += stall) {
        dec(x, z, depth, 0.12);
        if (w.rng.chance(0.55)) w.parkSpots.push({ x, z: z + stall / 2, rot: row % 2 ? Math.PI / 2 : -Math.PI / 2, y, kind });
      }
    }
  }
}

/** Steps rising toward local +z. Physics is a smooth ramp. */
export function stairs(w: World, x: number, z: number, rot: number, width: number, run: number, y0: number, y1: number, c: Col = PAL.stone) {
  const b = w.geo.at('world', x, z);
  const n = Math.max(2, Math.round((y1 - y0) / 0.22));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const [sx, sz] = rotP(x, z, rot, 0, -run / 2 + run * t);
    const top = y0 + ((y1 - y0) * (i + 1)) / n;
    b.box(sx, (y0 + top) / 2, sz, width, top - y0, run / n + 0.02, i % 2 ? shade(c, 0.93) : c, rot, 8);
  }
  w.addBox(x, z, width, run, y0 - 1, y1, rot, { ramp: { axis: 'z', ya: y0, yb: y1 }, cam: false });
}

export function rock(w: World, x: number, z: number, s: number, c: Col = PAL.rock, y = 0) {
  w.geo.at('world', x, z).blob(x, y + s * 0.35, z, s, s * 0.7, s * 0.9, c, Math.floor(w.rng.next() * 1e5), 0.3, shade(c, 0.85));
  if (s > 1.2) w.addBox(x, z, s * 1.4, s * 1.3, 0, y + s * 0.8, 0, { cam: false });
}

/** Stratified desert mesa. */
export function mesa(w: World, x: number, z: number, r: number, h: number) {
  const b = w.geo.at('world', x, z);
  const n = 9;
  const rad: number[] = [];
  for (let i = 0; i < n; i++) rad.push(r * w.rng.range(0.75, 1.15));
  const y = w.terrain.h(x, z) - 0.5;
  const levels = [[1.25, 1.0, 0, 0.38], [0.98, 0.9, 0.38, 0.72], [0.86, 0.8, 0.72, 1]];
  const cols = [PAL.desertDark, PAL.rock, PAL.rockDark];
  levels.forEach(([s0, s1, t0, t1], li) => {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      const r0 = rad[i], r1 = rad[(i + 1) % n];
      b.quad(
        x + Math.cos(a1) * r1 * s0, y + h * t0, z + Math.sin(a1) * r1 * s0, x + Math.cos(a0) * r0 * s0, y + h * t0, z + Math.sin(a0) * r0 * s0,
        x + Math.cos(a0) * r0 * s1, y + h * t1, z + Math.sin(a0) * r0 * s1, x + Math.cos(a1) * r1 * s1, y + h * t1, z + Math.sin(a1) * r1 * s1,
        shade(cols[li], i % 2 ? 1 : 0.92),
      );
      if (li < 2) {
        // ledge between strata
        const sn = levels[li + 1][0];
        b.quad(
          x + Math.cos(a1) * r1 * s1, y + h * t1, z + Math.sin(a1) * r1 * s1, x + Math.cos(a0) * r0 * s1, y + h * t1, z + Math.sin(a0) * r0 * s1,
          x + Math.cos(a0) * r0 * sn, y + h * t1, z + Math.sin(a0) * r0 * sn, x + Math.cos(a1) * r1 * sn, y + h * t1, z + Math.sin(a1) * r1 * sn, PAL.desert,
        );
      } else b.tri(x, y + h, z, x + Math.cos(a1) * r1 * s1, y + h, z + Math.sin(a1) * r1 * s1, x + Math.cos(a0) * r0 * s1, y + h, z + Math.sin(a0) * r0 * s1, PAL.desert);
    }
  });
  w.addBox(x, z, r * 1.5, r * 1.5, y, y + h, 0.4);
}

/** Painted stripes helper for courts and crossings. */
export function line(w: World, ax: number, az: number, bx: number, bz: number, wd: number, c: Col, y = SLAB_Y + 0.04) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  w.geo.at('decal', (ax + bx) / 2, (az + bz) / 2).flat((ax + bx) / 2, y, (az + bz) / 2, len, wd, c, Math.atan2(-dz, dx));
}
