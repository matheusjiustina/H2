import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  IcosahedronGeometry,
  LatheGeometry,
  Matrix3,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  BoxGeometry,
} from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Box with chamfered (bevelled) edges: 6 inset faces, 12 edge strips and 8 corner triangles.
 * Gives the soft, hand-made silhouette of a rounded box for ~96 vertices.
 */
export function chamferBoxGeometry(w: number, h: number, d: number, r: number): BufferGeometry {
  const X = w / 2, Y = h / 2, Z = d / 2;
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const v = new Vector3(), a = new Vector3(), b = new Vector3(), c = new Vector3();
  const poly = (pts: number[][], n: number[]) => {
    const base = pos.length / 3;
    for (const p of pts) {
      pos.push(p[0], p[1], p[2]);
      nor.push(n[0], n[1], n[2]);
    }
    // Fan triangulation with outward winding.
    a.fromArray(pts[0]); b.fromArray(pts[1]); c.fromArray(pts[2]);
    v.crossVectors(b.sub(a), c.sub(a));
    const flip = v.x * n[0] + v.y * n[1] + v.z * n[2] < 0;
    for (let i = 1; i < pts.length - 1; i++) {
      if (flip) idx.push(base, base + i + 1, base + i);
      else idx.push(base, base + i, base + i + 1);
    }
  };
  const s3 = 1 / Math.sqrt(3), s2 = 1 / Math.SQRT2;
  for (const sg of [-1, 1]) {
    poly([[sg * X, -Y + r, -Z + r], [sg * X, Y - r, -Z + r], [sg * X, Y - r, Z - r], [sg * X, -Y + r, Z - r]], [sg, 0, 0]);
    poly([[-X + r, sg * Y, -Z + r], [X - r, sg * Y, -Z + r], [X - r, sg * Y, Z - r], [-X + r, sg * Y, Z - r]], [0, sg, 0]);
    poly([[-X + r, -Y + r, sg * Z], [X - r, -Y + r, sg * Z], [X - r, Y - r, sg * Z], [-X + r, Y - r, sg * Z]], [0, 0, sg]);
  }
  for (const sa of [-1, 1])
    for (const sb of [-1, 1]) {
      // Edges parallel to Z (between X and Y faces).
      poly([[sa * X, sb * (Y - r), -Z + r], [sa * (X - r), sb * Y, -Z + r], [sa * (X - r), sb * Y, Z - r], [sa * X, sb * (Y - r), Z - r]], [sa * s2, sb * s2, 0]);
      // Edges parallel to Y (between X and Z faces).
      poly([[sa * X, -Y + r, sb * (Z - r)], [sa * (X - r), -Y + r, sb * Z], [sa * (X - r), Y - r, sb * Z], [sa * X, Y - r, sb * (Z - r)]], [sa * s2, 0, sb * s2]);
      // Edges parallel to X (between Y and Z faces).
      poly([[-X + r, sa * Y, sb * (Z - r)], [-X + r, sa * (Y - r), sb * Z], [X - r, sa * (Y - r), sb * Z], [X - r, sa * Y, sb * (Z - r)]], [0, sa * s2, sb * s2]);
    }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    poly([[sx * X, sy * (Y - r), sz * (Z - r)], [sx * (X - r), sy * Y, sz * (Z - r)], [sx * (X - r), sy * (Y - r), sz * Z]], [sx * s3, sy * s3, sz * s3]);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setIndex(idx);
  return g;
}

function stripUV(g: BufferGeometry): BufferGeometry {
  g.deleteAttribute('uv');
  return g;
}

/** Indexed icosphere: smooth normals with shared vertices (42 verts at detail 1 instead of 240). */
function indexedIco(detail: number): BufferGeometry {
  const g = new IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv');
  if (detail === 0) return g;
  return mergeVertices(g, 1e-4);
}

export interface PartOptions {
  /** 0..1: glows warm at night (windows). >1: always self-lit at (value - 1) strength. */
  emissive?: number;
  /** 0..1 foliage sway weight. Applied per-vertex scaled by local height when `windByHeight`. */
  wind?: number;
  windByHeight?: number;
  /** Rotation in radians (XYZ Euler). */
  rot?: [number, number, number];
  scale?: [number, number, number];
  flat?: boolean;
}

type Vec3 = [number, number, number];

const _m = new Matrix4();
const _n = new Matrix3();
const _v = new Vector3();
const _c = new Color();
const geoCache = new Map<string, BufferGeometry>();
const flatCache = new WeakMap<BufferGeometry, BufferGeometry>();

function cached(key: string, make: () => BufferGeometry): BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

/**
 * Accumulates many primitive parts into one geometry with position / normal / color / aEmissive /
 * aWind attributes. A transform stack lets kit pieces be authored hierarchically in local units.
 */
export class GeoBuilder {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  emissive: number[] = [];
  wind: number[] = [];
  indices: number[] = [];
  private stack: Matrix4[] = [new Matrix4()];

  get matrix(): Matrix4 {
    return this.stack[this.stack.length - 1];
  }

  push(m?: Matrix4): this {
    const top = this.matrix.clone();
    if (m) top.multiply(m);
    this.stack.push(top);
    return this;
  }

  /** Push a translation / rotation(Y-first Euler in radians) / uniform or per-axis scale. */
  pushT(pos: Vec3, rot: Vec3 = [0, 0, 0], scale: Vec3 | number = 1): this {
    const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
    const m = new Matrix4().compose(
      new Vector3(...pos),
      new Quaternion().setFromEuler(new Euler(rot[0], rot[1], rot[2], 'YXZ')),
      new Vector3(s[0], s[1], s[2]),
    );
    return this.push(m);
  }

  pop(): this {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  /** Appends a geometry transformed by the current stack and a local transform. */
  add(geo: BufferGeometry, pos: Vec3, color: Color | string | number, opts: PartOptions = {}): this {
    const local = new Matrix4().compose(
      new Vector3(...pos),
      new Quaternion().setFromEuler(new Euler(...(opts.rot ?? [0, 0, 0]), 'YXZ')),
      new Vector3(...(opts.scale ?? [1, 1, 1])),
    );
    _m.copy(this.matrix).multiply(local);
    _n.getNormalMatrix(_m);
    let src = geo;
    if (opts.flat && geo.index) {
      let f = flatCache.get(geo);
      if (!f) {
        f = geo.toNonIndexed();
        f.computeVertexNormals();
        flatCache.set(geo, f);
      }
      src = f;
    }
    const p = src.getAttribute('position');
    const n = src.getAttribute('normal');
    const base = this.vertexCount;
    _c.set(color as any);
    const e = opts.emissive ?? 0;
    const w = opts.wind ?? 0;
    const wh = opts.windByHeight ?? 0;
    for (let i = 0; i < p.count; i++) {
      _v.set(p.getX(i), p.getY(i), p.getZ(i));
      const localY = _v.y;
      _v.applyMatrix4(_m);
      this.positions.push(_v.x, _v.y, _v.z);
      if (n) {
        _v.set(n.getX(i), n.getY(i), n.getZ(i)).applyMatrix3(_n).normalize();
        this.normals.push(_v.x, _v.y, _v.z);
      } else this.normals.push(0, 1, 0);
      this.colors.push(_c.r, _c.g, _c.b);
      this.emissive.push(e);
      this.wind.push(wh > 0 ? w * Math.max(0, Math.min(1, (localY + wh * 0.5) / wh)) : w);
    }
    if (src.index) {
      const idx = src.index;
      for (let i = 0; i < idx.count; i++) this.indices.push(base + idx.getX(i));
    } else {
      for (let i = 0; i < p.count; i++) this.indices.push(base + i);
    }
    // Negative determinant (mirroring) flips winding.
    if (_m.determinant() < 0) {
      const start = this.indices.length - (src.index ? src.index.count : p.count);
      for (let i = start; i < this.indices.length; i += 3) {
        const t = this.indices[i + 1];
        this.indices[i + 1] = this.indices[i + 2];
        this.indices[i + 2] = t;
      }
    }
    return this;
  }

  // ---- Primitive helpers (dimensions in local units; boxes are centred on pos) ---------------

  box(w: number, h: number, d: number, pos: Vec3, color: Color | string | number, opts: PartOptions = {}): this {
    const g = cached(`box`, () => new BoxGeometry(1, 1, 1));
    const s = opts.scale ?? [1, 1, 1];
    return this.add(g, pos, color, { ...opts, scale: [w * s[0], h * s[1], d * s[2]] });
  }

  /** Rounded box — softer silhouettes for buildings, furniture and characters. */
  rbox(w: number, h: number, d: number, radius: number, pos: Vec3, color: Color | string | number, opts: PartOptions = {}): this {
    const r = Math.min(radius, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
    const key = `rbox:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${r.toFixed(3)}`;
    const g = cached(key, () => chamferBoxGeometry(w, h, d, Math.max(0.001, r)));
    return this.add(g, pos, color, opts);
  }

  cyl(rTop: number, rBottom: number, h: number, pos: Vec3, color: Color | string | number, opts: PartOptions & { seg?: number; open?: boolean } = {}): this {
    const seg = opts.seg ?? 12;
    const key = `cyl:${rTop}:${rBottom}:${seg}:${opts.open ? 1 : 0}`;
    const g = cached(key, () => new CylinderGeometry(rTop, rBottom, 1, seg, 1, !!opts.open));
    const s = opts.scale ?? [1, 1, 1];
    return this.add(g, pos, color, { ...opts, scale: [s[0], h * s[1], s[2]] });
  }

  cone(r: number, h: number, pos: Vec3, color: Color | string | number, opts: PartOptions & { seg?: number; open?: boolean } = {}): this {
    const seg = opts.seg ?? 10;
    const g = cached(`cone:${seg}:${opts.open ? 1 : 0}`, () => new ConeGeometry(1, 1, seg, 1, !!opts.open));
    const s = opts.scale ?? [1, 1, 1];
    return this.add(g, pos, color, { ...opts, scale: [r * s[0], h * s[1], r * s[2]] });
  }

  sphere(r: number, pos: Vec3, color: Color | string | number, opts: PartOptions & { detail?: number; ws?: number; hs?: number } = {}): this {
    const key = opts.detail !== undefined ? `ico:${opts.detail}` : `sph:${opts.ws ?? 10}:${opts.hs ?? 7}`;
    const g = cached(key, () => (opts.detail !== undefined ? indexedIco(opts.detail) : stripUV(new SphereGeometry(1, opts.ws ?? 10, opts.hs ?? 7))));
    const s = opts.scale ?? [1, 1, 1];
    return this.add(g, pos, color, { ...opts, scale: [r * s[0], r * s[1], r * s[2]] });
  }

  torus(r: number, tube: number, pos: Vec3, color: Color | string | number, opts: PartOptions & { arc?: number } = {}): this {
    const arc = opts.arc ?? Math.PI * 2;
    const g = cached(`torus:${r}:${tube}:${arc}`, () => new TorusGeometry(r, tube, 8, 24, arc));
    return this.add(g, pos, color, opts);
  }

  plane(w: number, h: number, pos: Vec3, color: Color | string | number, opts: PartOptions = {}): this {
    const g = cached('plane', () => new PlaneGeometry(1, 1));
    const s = opts.scale ?? [1, 1, 1];
    return this.add(g, pos, color, { ...opts, scale: [w * s[0], h * s[1], s[2]] });
  }

  /** Triangular prism roof: width along X, depth along Z, ridge along Z. */
  gable(w: number, h: number, d: number, pos: Vec3, color: Color | string | number, opts: PartOptions & { overhang?: number } = {}): this {
    const key = `gable`;
    const g = cached(key, () => {
      const shape = new Shape();
      shape.moveTo(-0.5, 0);
      shape.lineTo(0.5, 0);
      shape.lineTo(0, 1);
      shape.closePath();
      const geo = new ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
      geo.translate(0, 0, -0.5);
      geo.computeVertexNormals();
      return geo;
    });
    return this.add(g, pos, color, { ...opts, scale: [w, h, d] });
  }

  /** Extruded polygon in the XZ plane (points in X/Z), height along +Y from pos. */
  prism(points: [number, number][], h: number, pos: Vec3, color: Color | string | number, opts: PartOptions = {}): this {
    const shape = new Shape(points.map(([x, z]) => new Vector2(x, -z)));
    const geo = new ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    return this.add(geo, pos, color, opts);
  }

  lathe(profile: [number, number][], pos: Vec3, color: Color | string | number, opts: PartOptions & { seg?: number } = {}): this {
    const key = `lathe:${JSON.stringify(profile)}:${opts.seg ?? 16}`;
    const g = cached(key, () => new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), opts.seg ?? 16));
    return this.add(g, pos, color, opts);
  }

  /** Appends another builder's content (already in this builder's local space) under the current transform. */
  merge(other: GeoBuilder): this {
    const geo = other.toGeometry();
    const base = this.vertexCount;
    _m.copy(this.matrix);
    _n.getNormalMatrix(_m);
    const p = geo.getAttribute('position');
    const n = geo.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      _v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(_m);
      this.positions.push(_v.x, _v.y, _v.z);
      _v.set(n.getX(i), n.getY(i), n.getZ(i)).applyMatrix3(_n).normalize();
      this.normals.push(_v.x, _v.y, _v.z);
    }
    this.colors.push(...other.colors);
    this.emissive.push(...other.emissive);
    this.wind.push(...other.wind);
    for (const i of other.indices) this.indices.push(base + i);
    return this;
  }

  isEmpty(): boolean {
    return this.positions.length === 0;
  }

  toGeometry(): BufferGeometry {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    geo.setAttribute('aEmissive', new BufferAttribute(new Float32Array(this.emissive), 1));
    geo.setAttribute('aWind', new BufferAttribute(new Float32Array(this.wind), 1));
    const vc = this.vertexCount;
    geo.setIndex(vc > 65535 ? new BufferAttribute(new Uint32Array(this.indices), 1) : new BufferAttribute(new Uint16Array(this.indices), 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}
