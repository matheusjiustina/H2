import * as THREE from 'three';

export type RGB = readonly [number, number, number];

const colorCache = new Map<number, RGB>();
const tmpColor = new THREE.Color();

/** Hex sRGB colour → linear 0..255 triple (vertex colours are stored as normalised bytes). */
export function C(hex: number): RGB {
  let c = colorCache.get(hex);
  if (!c) {
    tmpColor.setHex(hex);
    c = [Math.round(tmpColor.r * 255), Math.round(tmpColor.g * 255), Math.round(tmpColor.b * 255)];
    colorCache.set(hex, c);
  }
  return c;
}
/** Brighten/darken a colour by factor k. */
export function shade(c: RGB | number, k: number): RGB {
  const s = typeof c === 'number' ? C(c) : c;
  return [Math.min(255, s[0] * k), Math.min(255, s[1] * k), Math.min(255, s[2] * k)];
}
export function mix(a: RGB | number, b: RGB | number, t: number): RGB {
  const x = typeof a === 'number' ? C(a) : a;
  const y = typeof b === 'number' ? C(b) : b;
  return [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
}
type Col = RGB | number;
const rgb = (c: Col): RGB => (typeof c === 'number' ? C(c) : c);

// Unit icosahedron for low-poly blobs (tree crowns, rocks, clouds of dust).
const ICO_V: number[][] = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  return v.map((p) => {
    const l = Math.hypot(p[0], p[1], p[2]);
    return [p[0] / l, p[1] / l, p[2] / l];
  });
})();
const ICO_F = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

/**
 * Append-only flat-shaded triangle soup with per-vertex colours.
 * Everything static in the world is merged through this to keep draw calls tiny.
 */
export class MeshBuilder {
  pos = new Float32Array(3 * 1024);
  nor = new Int8Array(3 * 1024);
  col = new Uint8Array(3 * 1024);
  n = 0;

  private ensure(extra: number) {
    const need = (this.n + extra) * 3;
    if (need <= this.pos.length) return;
    let cap = this.pos.length;
    while (cap < need) cap *= 2;
    const p = new Float32Array(cap);
    p.set(this.pos);
    this.pos = p;
    const n = new Int8Array(cap);
    n.set(this.nor);
    this.nor = n;
    const c = new Uint8Array(cap);
    c.set(this.col);
    this.col = c;
  }

  tri(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, c: Col) {
    this.ensure(3);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx = Math.round((nx / l) * 127);
    ny = Math.round((ny / l) * 127);
    nz = Math.round((nz / l) * 127);
    const k = rgb(c);
    let i = this.n * 3;
    const P = this.pos, N = this.nor, K = this.col;
    P[i] = ax; P[i + 1] = ay; P[i + 2] = az;
    P[i + 3] = bx; P[i + 4] = by; P[i + 5] = bz;
    P[i + 6] = cx; P[i + 7] = cy; P[i + 8] = cz;
    for (let j = 0; j < 3; j++, i += 3) {
      N[i] = nx; N[i + 1] = ny; N[i + 2] = nz;
      K[i] = k[0]; K[i + 1] = k[1]; K[i + 2] = k[2];
    }
    this.n += 3;
  }

  /** Quad a,b,c,d counter-clockwise when seen from its front. */
  quad(
    ax: number, ay: number, az: number, bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number, dx: number, dy: number, dz: number, c: Col,
  ) {
    this.tri(ax, ay, az, bx, by, bz, cx, cy, cz, c);
    this.tri(ax, ay, az, cx, cy, cz, dx, dy, dz, c);
  }

  /** Horizontal quad facing up (axis aligned or rotated about its centre). */
  flat(cx: number, y: number, cz: number, w: number, d: number, c: Col, rot = 0) {
    const hx = w / 2, hz = d / 2;
    if (rot === 0) {
      this.quad(cx - hx, y, cz - hz, cx - hx, y, cz + hz, cx + hx, y, cz + hz, cx + hx, y, cz - hz, c);
      return;
    }
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const X = (lx: number, lz: number) => cx + lx * cs + lz * sn;
    const Z = (lx: number, lz: number) => cz - lx * sn + lz * cs;
    this.quad(X(-hx, -hz), y, Z(-hx, -hz), X(-hx, hz), y, Z(-hx, hz), X(hx, hz), y, Z(hx, hz), X(hx, -hz), y, Z(hx, -hz), c);
  }

  /**
   * Box centred at (cx,cy,cz). `skip` is a bitmask of faces to omit:
   * 1=+x 2=-x 4=+y 8=-y 16=+z 32=-z. `top` overrides the top face colour.
   */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, c: Col, rot = 0, skip = 8, top?: Col) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const cs = rot ? Math.cos(rot) : 1, sn = rot ? Math.sin(rot) : 0;
    const X = (lx: number, lz: number) => cx + lx * cs + lz * sn;
    const Z = (lx: number, lz: number) => cz - lx * sn + lz * cs;
    const y0 = cy - hy, y1 = cy + hy;
    const x00 = X(-hx, -hz), z00 = Z(-hx, -hz);
    const x10 = X(hx, -hz), z10 = Z(hx, -hz);
    const x11 = X(hx, hz), z11 = Z(hx, hz);
    const x01 = X(-hx, hz), z01 = Z(-hx, hz);
    if (!(skip & 4)) this.quad(x00, y1, z00, x01, y1, z01, x11, y1, z11, x10, y1, z10, top ?? c);
    if (!(skip & 8)) this.quad(x00, y0, z00, x10, y0, z10, x11, y0, z11, x01, y0, z01, c);
    if (!(skip & 16)) this.quad(x01, y0, z01, x11, y0, z11, x11, y1, z11, x01, y1, z01, c);
    if (!(skip & 32)) this.quad(x10, y0, z10, x00, y0, z00, x00, y1, z00, x10, y1, z10, c);
    if (!(skip & 1)) this.quad(x11, y0, z11, x10, y0, z10, x10, y1, z10, x11, y1, z11, c);
    if (!(skip & 2)) this.quad(x00, y0, z00, x01, y0, z01, x01, y1, z01, x00, y1, z00, c);
  }

  /** Vertical cylinder / cone frustum from y0 up by h. r1 = top radius. */
  cyl(cx: number, y0: number, cz: number, r0: number, r1: number, h: number, sides: number, c: Col, capTop = true, rot = 0, capBottom = false) {
    const y1 = y0 + h;
    for (let i = 0; i < sides; i++) {
      const a0 = rot + (i / sides) * Math.PI * 2;
      const a1 = rot + ((i + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      // a1 is counter-clockwise from a0 when seen from above (x right, z down) → outward faces
      if (r1 > 0.0001) {
        this.quad(
          cx + c1 * r0, y0, cz + s1 * r0, cx + c0 * r0, y0, cz + s0 * r0,
          cx + c0 * r1, y1, cz + s0 * r1, cx + c1 * r1, y1, cz + s1 * r1, c,
        );
        if (capTop) this.tri(cx, y1, cz, cx + c1 * r1, y1, cz + s1 * r1, cx + c0 * r1, y1, cz + s0 * r1, c);
      } else {
        this.tri(cx + c1 * r0, y0, cz + s1 * r0, cx + c0 * r0, y0, cz + s0 * r0, cx, y1, cz, c);
      }
      if (capBottom) this.tri(cx, y0, cz, cx + c0 * r0, y0, cz + s0 * r0, cx + c1 * r0, y0, cz + s1 * r0, c);
    }
  }

  /** Gabled roof: ridge runs along local X. Sits on y, rises by h. */
  gable(cx: number, y: number, cz: number, w: number, d: number, h: number, c: Col, rot = 0, endCol?: Col) {
    const hx = w / 2, hz = d / 2;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const X = (lx: number, lz: number) => cx + lx * cs + lz * sn;
    const Z = (lx: number, lz: number) => cz - lx * sn + lz * cs;
    const ax = X(-hx, -hz), az = Z(-hx, -hz), bx = X(hx, -hz), bz = Z(hx, -hz);
    const ex = X(hx, hz), ez = Z(hx, hz), fx = X(-hx, hz), fz = Z(-hx, hz);
    const r0x = X(-hx, 0), r0z = Z(-hx, 0), r1x = X(hx, 0), r1z = Z(hx, 0);
    const yt = y + h;
    this.quad(fx, y, fz, ex, y, ez, r1x, yt, r1z, r0x, yt, r0z, c);
    this.quad(bx, y, bz, ax, y, az, r0x, yt, r0z, r1x, yt, r1z, c);
    const e = endCol ?? c;
    this.tri(ax, y, az, fx, y, fz, r0x, yt, r0z, e);
    this.tri(ex, y, ez, bx, y, bz, r1x, yt, r1z, e);
  }

  /** Four-sided pyramid / hip roof. */
  pyramid(cx: number, y: number, cz: number, w: number, d: number, h: number, c: Col, rot = 0) {
    const hx = w / 2, hz = d / 2;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const X = (lx: number, lz: number) => cx + lx * cs + lz * sn;
    const Z = (lx: number, lz: number) => cz - lx * sn + lz * cs;
    const p = [[-hx, -hz], [-hx, hz], [hx, hz], [hx, -hz]];
    for (let i = 0; i < 4; i++) {
      const a = p[i], b = p[(i + 1) % 4];
      this.tri(X(a[0], a[1]), y, Z(a[0], a[1]), X(b[0], b[1]), y, Z(b[0], b[1]), cx, y + h, cz, c);
    }
  }

  /** Faceted blob (jittered icosahedron). */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: Col, seed = 1, jitter = 0.22, c2?: Col) {
    const v: number[][] = [];
    let s = (seed * 2654435761) >>> 0;
    const rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (const p of ICO_V) {
      const k = 1 + (rnd() - 0.5) * 2 * jitter;
      v.push([cx + p[0] * rx * k, cy + p[1] * ry * k, cz + p[2] * rz * k]);
    }
    let i = 0;
    for (const f of ICO_F) {
      const a = v[f[0]], b = v[f[1]], d = v[f[2]];
      this.tri(a[0], a[1], a[2], b[0], b[1], b[2], d[0], d[1], d[2], c2 && i++ % 3 === 0 ? c2 : c);
    }
  }

  /** Vertical quad on a wall. (ox,oz) is the wall point, (rx,rz) the unit "right" vector, normal = (rz,-rx)·-1 → pass n explicitly. */
  wallQuad(ox: number, y0: number, oz: number, rx: number, rz: number, w: number, h: number, c: Col) {
    // a→b along right, then up: normal = right × up = (rx,0,rz)×(0,1,0) = (-rz,0,rx)
    const bx = ox + rx * w, bz = oz + rz * w;
    this.quad(ox, y0, oz, bx, y0, bz, bx, y0 + h, bz, ox, y0 + h, oz, c);
  }

  /** Append arbitrary three geometry (triangulated, transformed by m). */
  add(g: THREE.BufferGeometry, m: THREE.Matrix4, c: Col) {
    const src = g.index ? g.toNonIndexed() : g;
    const p = src.getAttribute('position');
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let i = 0; i < p.count; i += 3) {
      for (let j = 0; j < 3; j++) v[j].fromBufferAttribute(p, i + j).applyMatrix4(m);
      this.tri(v[0].x, v[0].y, v[0].z, v[1].x, v[1].y, v[1].z, v[2].x, v[2].y, v[2].z, c);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const n = this.n * 3;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor.slice(0, n), 3, true));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, n), 3, true));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export type Layer = 'world' | 'flat' | 'road' | 'decal' | 'glow';

export interface ChunkMesh {
  mesh: THREE.Mesh;
  cx: number;
  cz: number;
  r: number;
}

/** Spatially chunked builder: geometry is routed to the chunk containing its anchor point. */
export class Geo {
  private chunks = new Map<string, MeshBuilder>();
  tris = 0;
  constructor(public size = 120) {}

  at(layer: Layer, x: number, z: number): MeshBuilder {
    const key = `${layer}|${Math.floor(x / this.size)}|${Math.floor(z / this.size)}`;
    let b = this.chunks.get(key);
    if (!b) {
      b = new MeshBuilder();
      this.chunks.set(key, b);
    }
    return b;
  }

  build(parent: THREE.Object3D, mats: Record<Layer, THREE.Material>): ChunkMesh[] {
    const out: ChunkMesh[] = [];
    for (const [key, b] of this.chunks) {
      if (b.n === 0) continue;
      const layer = key.split('|')[0] as Layer;
      const g = b.build();
      this.tris += b.n / 3;
      const mesh = new THREE.Mesh(g, mats[layer]);
      mesh.castShadow = layer === 'world';
      mesh.receiveShadow = layer !== 'glow';
      mesh.matrixAutoUpdate = false;
      if (layer === 'decal') mesh.renderOrder = 2;
      if (layer === 'road') mesh.renderOrder = 1;
      parent.add(mesh);
      const s = g.boundingSphere!;
      out.push({ mesh, cx: s.center.x, cz: s.center.z, r: s.radius });
    }
    this.chunks.clear();
    return out;
  }
}
