import * as THREE from 'three';
import { rng, lerp, clamp, smoothstep } from '../utils/MathUtils.js';

const UP = new THREE.Vector3(0, 1, 0);

/** Accumulates vertices with position/normal/uv/colour/wind attributes. */
export class GeoBuilder {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.wind = []; this.idx = [];
  }

  get count() { return this.pos.length / 3; }

  v(p, n, u, vv, c = [1, 1, 1], w = [0, 0, 0, 0]) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, vv);
    this.col.push(c[0], c[1], c[2]);
    this.wind.push(w[0], w[1], w[2], w[3]);
    return this.count - 1;
  }

  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.wind, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/**
 * Tube along a list of points. radius(t), color(t), wind(t, point) callbacks.
 * Returns nothing; writes into builder.
 */
export function tube(b, pts, { radius, radial = 8, uScale = 1, vScale = 1, color = () => [1, 1, 1], wind = () => [0, 0, 0, 0], radiusMod = null, capEnd = false }) {
  const n = pts.length;
  const T = [], N = [], B = [];
  for (let i = 0; i < n; i++) {
    const t = new THREE.Vector3();
    if (i === 0) t.subVectors(pts[1], pts[0]);
    else if (i === n - 1) t.subVectors(pts[n - 1], pts[n - 2]);
    else t.subVectors(pts[i + 1], pts[i - 1]);
    T.push(t.normalize());
  }
  // parallel transport frames
  let nrm = new THREE.Vector3(1, 0, 0);
  if (Math.abs(T[0].dot(nrm)) > 0.9) nrm.set(0, 0, 1);
  nrm.sub(T[0].clone().multiplyScalar(T[0].dot(nrm))).normalize();
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const axis = new THREE.Vector3().crossVectors(T[i - 1], T[i]);
      const s = axis.length();
      if (s > 1e-6) {
        axis.normalize();
        const ang = Math.acos(clamp(T[i - 1].dot(T[i]), -1, 1));
        nrm = nrm.clone().applyAxisAngle(axis, ang);
      }
    }
    N.push(nrm.clone());
    B.push(new THREE.Vector3().crossVectors(T[i], nrm).normalize());
  }
  let len = 0;
  const start = b.count;
  for (let i = 0; i < n; i++) {
    if (i > 0) len += pts[i].distanceTo(pts[i - 1]);
    const t = i / (n - 1);
    const r = radius(t);
    const c = color(t);
    const w = wind(t, pts[i]);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const rm = radiusMod ? radiusMod(t, a) : 1;
      const dir = N[i].clone().multiplyScalar(Math.cos(a)).add(B[i].clone().multiplyScalar(Math.sin(a)));
      const p = pts[i].clone().add(dir.clone().multiplyScalar(r * rm));
      b.v(p, dir, (j / radial) * uScale, len * vScale, c, w);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = start + i * (radial + 1) + j;
      const c = a + radial + 1;
      b.quad(a, a + 1, c + 1, c);
    }
  }
  if (capEnd) {
    const last = pts[n - 1];
    const ci = b.v(last, T[n - 1], 0.5, len * vScale, color(1), wind(1, last));
    const base = start + (n - 1) * (radial + 1);
    for (let j = 0; j < radial; j++) b.tri(base + j, base + j + 1, ci);
  }
}

function bezier(p0, p1, p2, p3, t) {
  const it = 1 - t;
  return new THREE.Vector3()
    .addScaledVector(p0, it * it * it)
    .addScaledVector(p1, 3 * it * it * t)
    .addScaledVector(p2, 3 * it * t * t)
    .addScaledVector(p3, t * t * t);
}

/**
 * Leaf ribbon along a spine (fronds, banana leaves). across: 3 or 5 vertices.
 * opts: halfWidth(t), fold(t) (edge vertical offset), uRange, vRange, color(t), wind(t)
 */
function ribbon(b, spine, opts) {
  const { halfWidth, fold = () => 0, color = () => [1, 1, 1], wind = () => [0, 0, 0, 0], u0 = 0, u1 = 1, v0 = 0, v1 = 1, bend = null, across = 3, center = null, twist = 0 } = opts;
  const n = spine.length;
  const start = b.count;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const p = spine[i];
    const tan = new THREE.Vector3().subVectors(spine[Math.min(n - 1, i + 1)], spine[Math.max(0, i - 1)]).normalize();
    let side = new THREE.Vector3().crossVectors(tan, UP);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    if (twist) side.applyAxisAngle(tan, twist * t);
    const up = new THREE.Vector3().crossVectors(side, tan).normalize();
    const hw = halfWidth(t);
    const f = fold(t);
    const c = color(t);
    const w = wind(t);
    for (let k = 0; k < across; k++) {
      const s = across === 3 ? k - 1 : (k - 2) / 2; // -1..1
      const pos = p.clone().addScaledVector(side, s * hw).addScaledVector(up, Math.abs(s) * f * hw);
      let nrm = up.clone().addScaledVector(side, -s * f * 0.6).normalize();
      if (center) {
        const radial = pos.clone().sub(center).normalize();
        nrm = nrm.multiplyScalar(0.55).add(radial.multiplyScalar(0.45)).normalize();
      }
      const u = lerp(u0, u1, t);
      const vv = lerp(v0, v1, (s + 1) / 2);
      b.v(pos, nrm, u, vv, c, w);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < across - 1; k++) {
      const a = start + i * across + k;
      b.quad(a, a + across, a + across + 1, a + 1);
    }
  }
}

/** Camera-independent leaf card (two triangles). */
function card(b, center, size, normalDir, rot, uvRect, color, wind, bentFrom = null) {
  const n = normalDir.clone().normalize();
  let t = new THREE.Vector3().crossVectors(n, Math.abs(n.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
  t.applyAxisAngle(n, rot);
  const bt = new THREE.Vector3().crossVectors(n, t).normalize();
  const hs = size / 2;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const idx = [];
  for (const [cx, cy] of corners) {
    const p = center.clone().addScaledVector(t, cx * hs).addScaledVector(bt, cy * hs);
    // slight cupping
    p.addScaledVector(n, -(cx * cx + cy * cy) * size * 0.06);
    let nn = n.clone();
    if (bentFrom) nn = nn.multiplyScalar(0.3).add(p.clone().sub(bentFrom).normalize().multiplyScalar(0.7)).normalize();
    const u = lerp(uvRect[0], uvRect[2], (cx + 1) / 2);
    const v = lerp(uvRect[1], uvRect[3], (cy + 1) / 2);
    idx.push(b.v(p, nn, u, v, color, wind));
  }
  b.quad(idx[0], idx[1], idx[2], idx[3]);
}

// ============================================================================ PALM
export function buildPalm(seed, lod = 0, opts = {}) {
  const r = rng(seed);
  const H = opts.height ?? 7 + r() * 6;
  const lean = opts.lean ?? 0.6 + r() * 2.2;
  const frondCount = [opts.fronds ?? 13 + Math.floor(r() * 5), 11, 8][lod];
  const ringCount = [30, 12, 5][lod];
  const radial = [10, 6, 4][lod];
  const phase = r();
  const trunk = new GeoBuilder();
  const leaves = new GeoBuilder();

  // trunk curve leaning towards +x with gentle S bend
  const p0 = new THREE.Vector3(0, -0.3, 0);
  const p1 = new THREE.Vector3(-lean * 0.08, H * 0.35, 0);
  const p2 = new THREE.Vector3(lean * 0.55, H * 0.72, (r() - 0.5) * 0.6);
  const p3 = new THREE.Vector3(lean, H, (r() - 0.5) * 0.4);
  const pts = [];
  for (let i = 0; i <= ringCount; i++) pts.push(bezier(p0, p1, p2, p3, i / ringCount));
  const top = pts[pts.length - 1];
  tube(trunk, pts, {
    radius: (t) => lerp(0.3, 0.165, Math.pow(t, 0.7)) + 0.13 * Math.pow(1 - smoothstep(0, 0.08, t), 2) + 0.012 * Math.sin(t * 40),
    radial,
    uScale: 1,
    vScale: 1 / 1.6,
    color: (t) => { const k = lerp(0.72, 1.05, smoothstep(0, 0.35, t)); return [k, k * 0.98, k * 0.94]; },
    wind: (t) => [t * t, 0, phase, 0],
  });
  // crown boss
  if (lod < 2) {
    const boss = [top.clone().add(new THREE.Vector3(0, -0.35, 0)), top.clone(), top.clone().add(new THREE.Vector3(0, 0.25, 0))];
    tube(trunk, boss, { radius: (t) => lerp(0.2, 0.08, t), radial, color: () => [0.75, 0.82, 0.5], wind: () => [1, 0, phase, 0], capEnd: true });
  }
  // coconuts
  if (lod === 0 && (opts.coconuts ?? r() < 0.8)) {
    const n = 3 + Math.floor(r() * 5);
    const ico = new THREE.IcosahedronGeometry(1, 1);
    const ip = ico.attributes.position;
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const c = top.clone().add(new THREE.Vector3(Math.cos(a) * 0.26, -0.3 - r() * 0.2, Math.sin(a) * 0.26));
      const s = 0.11 + r() * 0.04;
      const ripe = r();
      const col = ripe < 0.6 ? [0.55, 0.75, 0.3] : [0.6, 0.42, 0.25];
      const base = trunk.count;
      for (let i = 0; i < ip.count; i++) {
        const v = new THREE.Vector3(ip.getX(i), ip.getY(i) * 1.15, ip.getZ(i));
        trunk.v(v.clone().multiplyScalar(s).add(c), v.clone().normalize(), 0.5, 0.02, col, [1, 0.05, phase, 0.2]);
      }
      const ii = ico.index ? ico.index.array : null;
      if (ii) for (let i = 0; i < ii.length; i += 3) trunk.tri(base + ii[i], base + ii[i + 1], base + ii[i + 2]);
      else for (let i = 0; i < ip.count; i += 3) trunk.tri(base + i, base + i + 1, base + i + 2);
    }
  }

  // fronds
  const segs = [10, 5, 3][lod];
  const across = lod === 0 ? 5 : 3;
  const crownCenter = top.clone().add(new THREE.Vector3(0, 0.3, 0));
  const frondLen = opts.frondLen ?? 3.6 + r() * 1.2;
  for (let i = 0; i < frondCount; i++) {
    const age = (i % 3) / 2 * 0.7 + r() * 0.3;
    const az = (i / frondCount) * Math.PI * 2 * 2.618 + r() * 0.3;
    const pitch = lerp(0.95, -0.25, age) + (r() - 0.5) * 0.2;
    const L = frondLen * (0.82 + r() * 0.28) * (age > 0.8 ? 0.95 : 1);
    const droop = 0.25 + age * 0.55;
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(pitch), 0, Math.sin(az) * Math.cos(pitch));
    const spine = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const p = top.clone()
        .addScaledVector(dir, L * t * (1 - 0.12 * t))
        .add(new THREE.Vector3(0, Math.sin(pitch) * L * t - droop * L * t * t * 0.9 + 0.15, 0));
      spine.push(p);
    }
    const fPhase = r();
    const tint = age > 0.85 ? [1.25, 1.02, 0.7] : [lerp(0.95, 1.12, age), 1, lerp(1.0, 0.8, age)];
    ribbon(leaves, spine, {
      halfWidth: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.04 + t * 0.97)), 0.6) * L * 0.2,
      fold: () => -0.35 - age * 0.25,
      across,
      color: (t) => { const k = lerp(0.6, 1.0, smoothstep(0, 0.35, t)); return [tint[0] * k, tint[1] * k, tint[2] * k]; },
      wind: (t) => [1, t, fPhase, t * 0.9],
      center: crownCenter,
      twist: (r() - 0.5) * 0.6,
    });
  }
  // dead hanging fronds
  if (lod < 2) {
    const dead = opts.dead ?? Math.floor(r() * 3);
    for (let i = 0; i < dead; i++) {
      const az = r() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      const spine = [];
      const L = 2.6 + r();
      for (let s = 0; s <= 4; s++) {
        const t = s / 4;
        spine.push(top.clone().addScaledVector(dir, 0.25 + L * 0.28 * Math.sin(t * 1.4)).add(new THREE.Vector3(0, -L * t * 0.95, 0)));
      }
      ribbon(leaves, spine, {
        halfWidth: (t) => Math.sin(Math.PI * Math.min(1, 0.05 + t)) * 0.38,
        fold: () => -0.8,
        across: 3,
        color: () => [1.55, 1.05, 0.55],
        wind: (t) => [1, t * 0.4, r(), t * 0.3],
      });
    }
  }
  return { trunk: trunk.build(), leaves: leaves.build(), height: H, top };
}

// ============================================================================ BROADLEAF TREE
export function buildTree(seed, lod = 0, opts = {}) {
  const r = rng(seed);
  const H = opts.height ?? 5 + r() * 3.5;
  const R0 = opts.radius ?? 0.32 + r() * 0.2;
  const crownR = opts.crown ?? 4.2 + r() * 2.8;
  const phase = r();
  const trunk = new GeoBuilder();
  const leaves = new GeoBuilder();
  const vines = new GeoBuilder();
  const radial = [12, 7, 5][lod];
  const buttressPhase = r() * 6.28;

  const tpts = [];
  const tRings = [10, 5, 3][lod];
  const bend = new THREE.Vector3((r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.8);
  for (let i = 0; i <= tRings; i++) {
    const t = i / tRings;
    tpts.push(new THREE.Vector3(bend.x * t * t, -0.4 + t * (H + 0.4), bend.z * t * t));
  }
  tube(trunk, tpts, {
    radius: (t) => R0 * lerp(1.0, 0.72, t),
    radiusMod: (t, a) => 1 + 1.4 * Math.pow(Math.max(0, Math.cos(a * 5 + buttressPhase)), 3) * Math.pow(1 - smoothstep(0, 0.28, t), 2),
    radial,
    vScale: 1 / 2.2,
    uScale: 2,
    color: (t) => { const k = lerp(0.8, 1.0, t); return [k, k, k]; },
    wind: (t) => [t * t * 0.25, 0, phase, 0],
  });
  const crownCenter = new THREE.Vector3(bend.x, H + crownR * 0.25, bend.z);
  const ends = [];
  const nBranch = [5 + Math.floor(r() * 3), 4, 3][lod];
  for (let i = 0; i < nBranch; i++) {
    const az = (i / nBranch) * Math.PI * 2 + r() * 0.5;
    const el = 0.35 + r() * 0.5;
    const L = crownR * (0.7 + r() * 0.4);
    const start = tpts[tpts.length - 1].clone().add(new THREE.Vector3(0, -r() * H * 0.25, 0));
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const bp = [];
    const bs = [6, 3, 2][lod];
    for (let s = 0; s <= bs; s++) {
      const t = s / bs;
      bp.push(start.clone().addScaledVector(dir, L * t).add(new THREE.Vector3(0, -t * t * L * 0.18 + Math.sin(t * 3) * 0.2, 0)));
    }
    tube(trunk, bp, {
      radius: (t) => lerp(R0 * 0.48, 0.045, t),
      radial: Math.max(4, radial - 4),
      vScale: 1 / 2.2,
      color: () => [0.95, 0.95, 0.95],
      wind: (t, p) => [clamp(p.y / (H + 3), 0, 1) ** 2 * 0.4 + t * 0.3, 0, phase, t * 0.6],
    });
    ends.push({ p: bp[bp.length - 1], dir, t: 1 });
    ends.push({ p: bp[Math.floor(bp.length * 0.6)], dir, t: 0.6 });
    // sub branch
    if (lod === 0) {
      const sdir = dir.clone().applyAxisAngle(UP, (r() - 0.5) * 1.6).add(new THREE.Vector3(0, 0.3, 0)).normalize();
      const sp0 = bp[Math.floor(bp.length / 2)];
      const sp = [sp0, sp0.clone().addScaledVector(sdir, L * 0.25), sp0.clone().addScaledVector(sdir, L * 0.5)];
      tube(trunk, sp, { radius: (t) => lerp(0.08, 0.03, t), radial: 4, color: () => [0.95, 0.95, 0.95], wind: () => [0.5, 0, phase, 0.6] });
      ends.push({ p: sp[2], dir: sdir, t: 1 });
    }
  }
  // leaf cards around branch ends, forming a broad umbrella crown
  const cardsPer = [20, 12, 7][lod];
  const atlasCell = r() < 0.5 ? 0 : 1;
  for (const e of ends) {
    const n = Math.round(cardsPer * (e.t === 1 ? 1 : 0.6));
    for (let k = 0; k < n; k++) {
      const off = new THREE.Vector3((r() - 0.5) * 3.0, (r() - 0.35) * 1.6, (r() - 0.5) * 3.0);
      const c = e.p.clone().add(off);
      const size = (lod === 2 ? 4.6 : lod === 1 ? 3.6 : 2.9) + r() * 1.3;
      const d = c.clone().sub(crownCenter);
      // tilt cards to follow the crown's rounded silhouette instead of stacking flat shelves
      const nd = d.clone().normalize().multiplyScalar(0.75).add(new THREE.Vector3((r() - 0.5) * 0.9, 0.55 + r() * 0.4, (r() - 0.5) * 0.9));
      const ao = 0.55 + 0.45 * smoothstep(0.2, 1.0, d.length() / crownR);
      const tint = 0.9 + r() * 0.2;
      const cell = r() < 0.75 ? atlasCell : 1 - atlasCell;
      card(leaves, c, size, nd, r() * 6.28, [cell * 0.5, 0, cell * 0.5 + 0.5, 1], [ao * tint, ao * tint, ao * tint * 0.95], [0.35, 1, r(), 0.5], crownCenter);
    }
  }
  // crown fill cards (inner volume)
  const fill = [24, 12, 6][lod];
  for (let k = 0; k < fill; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * crownR * 0.7;
    const c = crownCenter.clone().add(new THREE.Vector3(Math.cos(a) * d, (r() - 0.2) * 1.8, Math.sin(a) * d));
    card(leaves, c, 3.0 + r() * 1.2, new THREE.Vector3(Math.cos(a) * 0.6 + (r() - 0.5), 0.8, Math.sin(a) * 0.6 + (r() - 0.5)), r() * 6.28, [atlasCell * 0.5, 0, atlasCell * 0.5 + 0.5, 1], [0.62, 0.62, 0.6], [0.3, 0.8, r(), 0.4], crownCenter);
  }
  // hanging vines
  if (lod < 2 && (opts.vines ?? r() < 0.6)) {
    const nv = 2 + Math.floor(r() * 4);
    for (let i = 0; i < nv; i++) {
      const e = ends[Math.floor(r() * ends.length)];
      const len = 2.5 + r() * 3.5;
      const sp = [];
      for (let s = 0; s <= 4; s++) sp.push(e.p.clone().add(new THREE.Vector3(Math.sin(s) * 0.15, -len * (s / 4), Math.cos(s * 1.3) * 0.15)));
      const vb = vines.count;
      // vertical ribbon facing a random horizontal direction
      const a = r() * Math.PI * 2;
      const side = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const nrm = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      for (let s = 0; s <= 4; s++) {
        const t = s / 4;
        vines.v(sp[s].clone().addScaledVector(side, -0.22), nrm, 0, t, [1, 1, 1], [0.4, 0.3 + t, r(), t]);
        vines.v(sp[s].clone().addScaledVector(side, 0.22), nrm, 1, t, [1, 1, 1], [0.4, 0.3 + t, r(), t]);
      }
      for (let s = 0; s < 4; s++) vines.quad(vb + s * 2, vb + s * 2 + 1, vb + s * 2 + 3, vb + s * 2 + 2);
    }
  }
  return { trunk: trunk.build(), leaves: leaves.build(), vines: vines.count ? vines.build() : null, height: H, crown: crownR };
}

// ============================================================================ BANANA
export function buildBanana(seed, lod = 0) {
  const r = rng(seed);
  const H = 1.5 + r() * 1.2;
  const phase = r();
  const stem = new GeoBuilder();
  const leaves = new GeoBuilder();
  const sp = [new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0.03, H * 0.5, 0.02), new THREE.Vector3(0.05, H, 0)];
  tube(stem, sp, { radius: (t) => lerp(0.13, 0.085, t), radial: lod === 0 ? 8 : 5, vScale: 1 / 2, color: () => [0.62, 0.78, 0.42], wind: (t) => [t * t * 0.4, 0, phase, 0] });
  const nLeaves = [7 + Math.floor(r() * 3), 6, 4][lod];
  const segs = [7, 4, 3][lod];
  const top = sp[2];
  const center = top.clone().add(new THREE.Vector3(0, 0.5, 0));
  for (let i = 0; i < nLeaves; i++) {
    const az = (i / nLeaves) * Math.PI * 2 * 1.618 + r() * 0.4;
    const pitch = 0.5 + r() * 0.7;
    const L = 1.8 + r() * 0.7;
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(pitch), 0, Math.sin(az) * Math.cos(pitch));
    const spine = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      spine.push(top.clone().addScaledVector(dir, L * t).add(new THREE.Vector3(0, Math.sin(pitch) * L * t - L * t * t * (0.55 + r() * 0.1), 0)));
    }
    const fPhase = r();
    const old = r() < 0.2;
    ribbon(leaves, spine, {
      halfWidth: (t) => (t < 0.12 ? 0.03 : Math.pow(Math.sin(Math.PI * clamp((t - 0.1) / 0.92, 0, 1)), 0.35) * 0.32),
      fold: () => -0.25,
      across: lod === 0 ? 5 : 3,
      color: (t) => (old ? [1.35, 1.05, 0.65] : [lerp(0.8, 1, t), 1, lerp(0.8, 1, t)]),
      wind: (t) => [0.6, t * 1.2, fPhase, t],
      center,
      twist: (r() - 0.5) * 0.5,
    });
  }
  // fruit bunch + bud
  if (lod === 0 && r() < 0.5) {
    const hang = [top.clone(), top.clone().add(new THREE.Vector3(0.25, -0.2, 0)), top.clone().add(new THREE.Vector3(0.35, -0.7, 0.05))];
    tube(stem, hang, { radius: () => 0.025, radial: 4, color: () => [0.5, 0.6, 0.3], wind: () => [0.6, 0.1, phase, 0.3] });
    for (let k = 0; k < 18; k++) {
      const a = (k / 6) * Math.PI * 2;
      const y = -0.25 - Math.floor(k / 6) * 0.13;
      const c = hang[1].clone().add(new THREE.Vector3(Math.cos(a) * 0.09, y, Math.sin(a) * 0.09));
      const bp = [c, c.clone().add(new THREE.Vector3(Math.cos(a) * 0.08, 0.1, Math.sin(a) * 0.08))];
      tube(stem, bp, { radius: () => 0.022, radial: 4, color: () => [0.7, 0.95, 0.35], wind: () => [0.6, 0.05, phase, 0.3], capEnd: true });
    }
    const bud = [hang[2], hang[2].clone().add(new THREE.Vector3(0.02, -0.28, 0))];
    tube(stem, bud, { radius: (t) => lerp(0.07, 0.01, t), radial: 6, color: () => [0.5, 0.15, 0.25], wind: () => [0.6, 0.1, phase, 0.5], capEnd: true });
  }
  return { trunk: stem.build(), leaves: leaves.build(), height: H };
}

// ============================================================================ FERN
export function buildFern(seed, lod = 0) {
  const r = rng(seed);
  const b = new GeoBuilder();
  const n = [12 + Math.floor(r() * 5), 8, 5][lod];
  const segs = [6, 3, 2][lod];
  const center = new THREE.Vector3(0, 0.25, 0);
  const size = 0.7 + r() * 0.6;
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + r() * 0.4;
    const pitch = 0.6 + r() * 0.6;
    const L = size * (0.75 + r() * 0.4);
    const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const spine = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      spine.push(new THREE.Vector3(0, 0.05, 0).addScaledVector(dir, L * t * Math.cos(pitch * 0.6)).add(new THREE.Vector3(0, Math.sin(pitch) * L * t - L * t * t * 0.75, 0)));
    }
    const ph = r();
    ribbon(b, spine, {
      halfWidth: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + t)), 0.7) * L * 0.2,
      fold: () => -0.15,
      color: (t) => { const k = lerp(0.55, 1.0, t); return [k * (0.95 + r() * 0.1), k, k * 0.95]; },
      wind: (t) => [t * 0.8, t, ph, t * 0.5],
      center,
    });
  }
  return { leaves: b.build() };
}

// ============================================================================ BIG LEAF PLANT
export function buildBigLeaf(seed, lod = 0, kind = 0) {
  const r = rng(seed);
  const stems = new GeoBuilder();
  const leaves = new GeoBuilder();
  const n = [5 + Math.floor(r() * 4), 4, 3][lod];
  const center = new THREE.Vector3(0, 0.6, 0);
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + r() * 0.6;
    const h = 0.6 + r() * 0.8;
    const out = 0.3 + r() * 0.4;
    const tip = new THREE.Vector3(Math.cos(az) * out, h, Math.sin(az) * out);
    const ph = r();
    if (lod < 2) {
      const sp = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(az) * out * 0.3, h * 0.6, Math.sin(az) * out * 0.3), tip];
      tube(stems, sp, { radius: (t) => lerp(0.025, 0.015, t), radial: 4, color: () => [0.55, 0.75, 0.35], wind: (t) => [t * 0.6, 0, ph, t * 0.4] });
    }
    // leaf blade as a cupped 3x3 grid hanging from the stem tip
    const size = 0.55 + r() * 0.45;
    const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const tilt = 0.4 + r() * 0.5;
    const fwd = dir.clone().multiplyScalar(Math.cos(tilt)).add(new THREE.Vector3(0, -Math.sin(tilt) * 0.6, 0)).normalize();
    const side = new THREE.Vector3().crossVectors(fwd, UP).normalize();
    const up = new THREE.Vector3().crossVectors(side, fwd).normalize();
    const grid = lod === 0 ? 4 : 2;
    const base = leaves.count;
    const u0 = kind === 0 ? 0 : 0.5;
    for (let gy = 0; gy <= grid; gy++) {
      for (let gx = 0; gx <= grid; gx++) {
        const s = (gx / grid) * 2 - 1;
        const tt = gy / grid;
        const p = tip.clone().addScaledVector(fwd, tt * size).addScaledVector(side, s * size * 0.45).addScaledVector(up, -(s * s) * size * 0.12 - tt * tt * size * 0.15);
        const nrm = up.clone().addScaledVector(side, -s * 0.35).normalize();
        nrm.multiplyScalar(0.6).add(p.clone().sub(center).normalize().multiplyScalar(0.4)).normalize();
        leaves.v(p, nrm, u0 + 0.5 * (0.08 + tt * 0.86), 0.5 + s * 0.46, [lerp(0.8, 1.05, tt), 1, 1], [0.5, tt, ph, tt * 0.6]);
      }
    }
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const a = base + gy * (grid + 1) + gx;
        leaves.quad(a, a + 1, a + grid + 2, a + grid + 1);
      }
    }
  }
  return { trunk: stems.count ? stems.build() : null, leaves: leaves.build() };
}

// ============================================================================ BUSH / SHRUB
export function buildBush(seed, lod = 0, cell = 0, opts = {}) {
  const r = rng(seed);
  const b = new GeoBuilder();
  const R = opts.radius ?? 0.7 + r() * 0.6;
  const Hh = opts.height ?? R * (0.8 + r() * 0.4);
  const n = [18 + Math.floor(r() * 8), 10, 5][lod];
  const center = new THREE.Vector3(0, Hh * 0.35, 0);
  const cu = (cell % 2) * 0.5, cv = Math.floor(cell / 2) * 0.5;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const el = Math.acos(1 - r() * 0.95);
    const d = R * (0.4 + r() * 0.6);
    const c = new THREE.Vector3(Math.cos(a) * Math.sin(el) * d, Hh * 0.35 + Math.cos(el) * Hh * 0.6, Math.sin(a) * Math.sin(el) * d);
    const nd = c.clone().sub(center).add(new THREE.Vector3((r() - 0.5), 0.5, (r() - 0.5))).normalize();
    const size = (lod === 2 ? 1.4 : 0.9) * R * (0.8 + r() * 0.5);
    const ao = 0.6 + 0.4 * (c.y / (Hh * 1.2));
    card(b, c, size, nd, r() * 6.28, [cu, cv, cu + 0.5, cv + 0.5], [ao, ao, ao], [c.y / Hh * 0.6, 0.8, r(), 0.4], center);
  }
  return { leaves: b.build(), radius: R };
}
