import * as THREE from 'three';
import { woodBox, place, merge, ropeGeometry } from '../environment/PropFactory.js';
import { wornPaint } from '../environment/PropMaterials.js';
import { SiteBuilder, buildHut, box, rod, cylY } from './SiteKit.js';
import { rng, smoothstep } from '../utils/MathUtils.js';
import { LAYER } from '../core/Shared.js';

// The Lost Vessel: a small coastal freighter run aground on the shoal west of
// Smuggler's Cove. Bow up on the sand, listing to port, stern awash. Built procedurally:
// lofted steel hull, well deck with cargo hatches (one open onto the flooded hold),
// raised poop deck with the wheelhouse you can walk into, forecastle, broken derrick,
// funnel and railings. Colliders follow the tilt of the decks.

const L = 34; // length overall
const HALF = L / 2;
const B = 3.7; // half beam
const DEPTH = 4.3; // keel to main deck at midship
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Half breadth at station x (-HALF stern .. +HALF bow) and height t (0 keel .. 1 deck). */
function halfBreadth(x, t) {
  const u = x / HALF;
  // plan shape at deck level
  let plan;
  if (u > 0.3) plan = B * Math.pow(Math.max(0, 1 - Math.pow((u - 0.3) / 0.7, 2.2)), 0.62);
  else if (u < -0.6) plan = B * (0.72 + 0.28 * Math.pow(Math.max(0, 1 - ((-u - 0.6) / 0.4) ** 2), 0.5));
  else plan = B;
  // section: full bilge amidships, V forward, cut-up run aft
  const vee = smoothstep(0.35, 0.95, u);
  const run = smoothstep(-0.55, -0.95, u);
  const bilge = 1 - Math.pow(1 - Math.min(1, t / 0.22), 2) * 0.55;
  const v = Math.pow(t, 0.75);
  let f = bilge * (1 - vee) + v * vee;
  f *= 1 - run * (1 - Math.min(1, t / 0.55)) * 0.75;
  return Math.max(0.04, plan * f);
}
/** Keel line (local y of the bottom) – rises at the forefoot and the stern run. */
function keelY(x) {
  const u = x / HALF;
  return -DEPTH + smoothstep(0.75, 1.0, u) * 2.8 + smoothstep(-0.7, -1.0, u) * 1.6;
}
/** Sheer: main deck edge height. */
function deckY(x) { const u = x / HALF; return 0.12 * u * u + 0.08 * u; }

function hullGeometry() {
  const NU = 72, NV = 14;
  const pos = [], col = [], idx = [];
  const r = rng(5);
  for (let i = 0; i <= NU; i++) {
    const x = -HALF + (i / NU) * L;
    const ky = keelY(x), dy = deckY(x);
    for (let side = 0; side < 2; side++) {
      for (let j = 0; j <= NV; j++) {
        const t = j / NV;
        const y = ky + (dy - ky) * t;
        const hb = halfBreadth(x, t);
        const z = (side ? 1 : -1) * hb;
        // forefoot rake: lower stations sit further aft at the bow
        const rake = smoothstep(0.7, 1, x / HALF) * (1 - t) * 1.4;
        pos.push(x - rake, y, z);
        col.push(1, 1, 1);
      }
    }
  }
  const row = (NV + 1) * 2;
  for (let i = 0; i < NU; i++) {
    for (let side = 0; side < 2; side++) {
      for (let j = 0; j < NV; j++) {
        const a = i * row + side * (NV + 1) + j, b = a + 1, c = a + row, d = c + 1;
        if (side) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
      }
    }
  }
  // transom (flat stern) closing the aft end between the two sides
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // uv from length / girth for the wear pattern scale (worn paint uses local position anyway)
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let k = 0; k < pos.length / 3; k++) { uv[k * 2] = pos[k * 3] / 4; uv[k * 2 + 1] = pos[k * 3 + 1] / 4; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  void r;
  return g;
}

function transomGeometry() {
  const x = -HALF;
  const pts = [];
  const N = 10;
  for (let j = 0; j <= N; j++) { const t = j / N; pts.push(new THREE.Vector2(-halfBreadth(x, t), keelY(x) + (deckY(x) - keelY(x)) * t)); }
  for (let j = N; j >= 0; j--) { const t = j / N; pts.push(new THREE.Vector2(halfBreadth(x, t), keelY(x) + (deckY(x) - keelY(x)) * t)); }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
  g.rotateY(-Math.PI / 2);
  g.translate(x, 0, 0);
  return g;
}

/** Deck plate following the deck edge between x0 and x1, with rectangular holes. */
function deckGeometry(x0, x1, y, holes = []) {
  const pts = [];
  const N = 30;
  for (let i = 0; i <= N; i++) { const x = x0 + (x1 - x0) * (i / N); pts.push(new THREE.Vector2(x, halfBreadth(x, 1) - 0.05)); }
  for (let i = N; i >= 0; i--) { const x = x0 + (x1 - x0) * (i / N); pts.push(new THREE.Vector2(x, -halfBreadth(x, 1) + 0.05)); }
  const shape = new THREE.Shape(pts);
  for (const h of holes) {
    const p = new THREE.Path();
    p.moveTo(h.x0, h.z0); p.lineTo(h.x0, h.z1); p.lineTo(h.x1, h.z1); p.lineTo(h.x1, h.z0); p.closePath();
    shape.holes.push(p);
  }
  const g = new THREE.ShapeGeometry(shape, 1);
  // shape is in x/y: map y -> z, lay flat at height y (follows sheer)
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const sx = p.getX(i), sz = p.getY(i); p.setXYZ(i, sx, y(sx), sz); }
  g.computeVertexNormals();
  // normals point up
  const nrm = g.attributes.normal;
  for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) < 0) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
  const idx = g.index.array;
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k], b2 = idx[k + 1], c = idx[k + 2];
    const e1 = V(p.getX(b2) - p.getX(a), p.getY(b2) - p.getY(a), p.getZ(b2) - p.getZ(a));
    const e2 = V(p.getX(c) - p.getX(a), p.getY(c) - p.getY(a), p.getZ(c) - p.getZ(a));
    if (e1.cross(e2).y < 0) { idx[k + 1] = c; idx[k + 2] = b2; }
  }
  return g;
}

/** Builder whose colliders follow the tilted ship (positions through the group's matrix). */
class ShipBuilder extends SiteBuilder {
  constructor(opts) {
    super(opts);
    this.pitch = opts.pitch; this.roll = opts.roll;
    this.group.rotation.set(this.roll, this.yaw, this.pitch, 'YZX');
    this.group.updateMatrixWorld(true);
    this.tiltX = Math.tan(this.pitch);
    this.tiltZ = -Math.tan(this.roll);
    this._p = new THREE.Vector3();
  }
  world(lx, ly, lz, out = new THREE.Vector3()) { return out.set(lx, ly, lz).applyMatrix4(this.group.matrixWorld); }
  box(lx, ly, lz, hx, hy, hz, { yaw = 0, walkable = false, solid = true, surface = 'metal', tag = null } = {}) {
    // walkable tops follow the deck slope; the centre goes through the ship's transform
    const top = this.world(lx, ly + hy, lz);
    // the ship's slopes expressed along this box's own axes
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const tx = this.tiltX * cy - this.tiltZ * sy, tz = this.tiltX * sy + this.tiltZ * cy;
    const c = this.collision.addBox({ x: top.x, y: top.y - hy, z: top.z, hx, hy, hz, yaw: this.yaw + yaw, tiltX: tx, tiltZ: tz, walkable, solid, surface, tag });
    this.colliders.push(c);
    return c;
  }
  cyl(lx, lz, r, y0, y1, surface = 'metal') {
    const a = this.world(lx, y0, lz), b = this.world(lx, y1, lz);
    const c = this.collision.addCylinder({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, r, y0: a.y, y1: b.y, surface });
    this.colliders.push(c);
    return c;
  }
  anchor(name, lx, ly, lz, extra = {}) {
    const a = { pos: this.world(lx, ly, lz), yaw: this.yaw + (extra.yaw || 0), site: this.id, local: V(lx, ly, lz), parent: this.group, localYaw: extra.yaw || 0, ...extra };
    this.anchors[name] = a;
    return a;
  }
  groundLocal() { return 0; }
}

export class Shipwreck {
  constructor({ scene, collision, materials, terrainData, x = 560, z = -556, yaw = -0.49 }) {
    const M = materials;
    this.hullMat = wornPaint(0x2b3a40, { bare: 0x4e3524, wear: 0.42, rust: 1.25, scale: 0.42, bareMetal: 0.35, roughness: 0.72, metalness: 0.35 });
    this.hullMat.vertexColors = true;
    this.superMat = wornPaint(0xc9c3b2, { bare: 0x5a3e2a, wear: 0.38, rust: 1.1, scale: 0.8, bareMetal: 0.3, roughness: 0.66, metalness: 0.25 });
    this.deckMat = wornPaint(0x5d4b3c, { bare: 0x3a2a1f, wear: 0.5, rust: 1.2, scale: 0.6, bareMetal: 0.3, roughness: 0.85, metalness: 0.2 });
    this.redMat = wornPaint(0x6e2b20, { bare: 0x3c2a1e, wear: 0.45, rust: 1.0, scale: 0.7, bareMetal: 0.3, roughness: 0.75, metalness: 0.25 });
    const pitch = 0.062, roll = -0.085;
    // midship main deck sits ~0.9 m above the water
    const y = 0.92;
    const b = new ShipBuilder({ id: 'wreck', x, y, z, yaw, pitch, roll, collision, parent: scene, M: { ...M, steel: this.deckMat, galv: this.superMat }, terrain: terrainData });
    this.b = b;
    this.group = b.group;
    b.activation = 1500;

    // ------------------------------------------------------------ hull
    const hull = hullGeometry();
    // waterline staining, weed and rust streaks baked into vertex colours (in ship space)
    const p = hull.attributes.position, col = hull.attributes.color;
    const tmp = new THREE.Vector3();
    const r = rng(17);
    const streakSeeds = Array.from({ length: 26 }, () => [-HALF + r() * L, 0.4 + r() * 0.6]);
    for (let i = 0; i < p.count; i++) {
      tmp.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(b.group.matrixWorld);
      const wy = tmp.y; // world height (water at 0)
      let c = 1;
      // below the old waterline (now under water or just above): dark, green-brown growth
      const under = smoothstep(0.35, -0.25, wy);
      const growth = smoothstep(-0.2, 0.6, wy) * smoothstep(1.2, 0.3, wy);
      let rr = 1, gg = 1, bb = 1;
      rr = 1 - under * 0.55; gg = 1 - under * 0.45; bb = 1 - under * 0.5;
      rr -= growth * 0.25; bb -= growth * 0.3;
      // rust streaks running down from scuppers
      for (const [sx, w] of streakSeeds) {
        const dx = Math.abs(p.getX(i) - sx);
        if (dx < w * 0.5 && p.getY(i) < deckY(sx) - 0.1) { const k = (1 - dx / (w * 0.5)) * smoothstep(-3.5, 0, p.getY(i)) * 0.6; rr = rr * (1 - k) + 0.62 * k; gg = gg * (1 - k) + 0.36 * k; bb = bb * (1 - k) + 0.2 * k; }
      }
      c = 1;
      col.setXYZ(i, rr * c, gg * c, bb * c);
    }
    const hullMesh = new THREE.Mesh(hull, this.hullMat);
    hullMesh.castShadow = true; hullMesh.receiveShadow = true;
    hullMesh.layers.set(LAYER.WORLD); hullMesh.layers.enable(LAYER.REFLECT_LITE);
    this.hullMat.side = THREE.DoubleSide;
    b.group.add(hullMesh);
    b.geo(transomGeometry(), this.hullMat);
    // boot topping band and rubbing strake
    for (const side of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 40; i++) { const x = -HALF + 0.3 + (i / 40) * (L - 0.8); pts.push(V(x, deckY(x) - 0.25, side * (halfBreadth(x, 0.94) + 0.04))); }
      b.geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.07, 5, false), this.redMat);
    }

    // ------------------------------------------------------------ decks
    const WELL0 = -9, WELL1 = 10.5;
    const hatches = [{ x0: -5.6, x1: -1.6, z0: -1.9, z1: 1.9, open: true }, { x0: 1.6, x1: 6.2, z0: -1.9, z1: 1.9, open: false }];
    b.geo(deckGeometry(WELL0, WELL1, (sx) => deckY(sx), hatches.filter((h) => h.open)), this.deckMat);
    // well deck walkable surface (split around the open hatch)
    const dy = (x) => deckY(x);
    const sx0 = WELL0 + 0.2, sx1 = WELL1 - 0.2;
    const seg = (x0, x1, z0, z1) => { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; b.box(cx, dy(cx) - 0.15, cz, (x1 - x0) / 2, 0.15, (z1 - z0) / 2, { walkable: true, solid: false, surface: 'metal' }); };
    seg(sx0, -5.6, -B + 0.3, B - 0.3);
    seg(-1.6, sx1, -B + 0.3, B - 0.3);
    seg(-5.6, -1.6, 1.9, B - 0.3);
    seg(-5.6, -1.6, -B + 0.3, -1.9);
    // hatch coamings, one cover in place, the other gone
    for (const h of hatches) {
      const cx = (h.x0 + h.x1) / 2, w = h.x1 - h.x0, d = h.z1 - h.z0;
      const cy = dy(cx);
      b.geo(merge([box(w + 0.2, 0.6, 0.12, cx, cy + 0.3, h.z0 - 0.06), box(w + 0.2, 0.6, 0.12, cx, cy + 0.3, h.z1 + 0.06), box(0.12, 0.6, d, h.x0 - 0.06, cy + 0.3, (h.z0 + h.z1) / 2), box(0.12, 0.6, d, h.x1 + 0.06, cy + 0.3, (h.z0 + h.z1) / 2)]), this.superMat);
      if (!h.open) {
        b.geo(box(w + 0.1, 0.12, d + 0.1, cx, cy + 0.66, (h.z0 + h.z1) / 2), this.redMat);
        b.box(cx, cy + 0.36, (h.z0 + h.z1) / 2, w / 2 + 0.1, 0.36, d / 2 + 0.1, { walkable: true, surface: 'metal' });
      } else {
        // coaming walls block walking into the hold; a broken cover leans against it
        b.box(cx, cy + 0.3, h.z0 - 0.06, w / 2 + 0.1, 0.3, 0.07, {});
        b.box(cx, cy + 0.3, h.z1 + 0.06, w / 2 + 0.1, 0.3, 0.07, {});
        b.box(h.x0 - 0.06, cy + 0.3, (h.z0 + h.z1) / 2, 0.07, 0.3, d / 2, {});
        b.box(h.x1 + 0.06, cy + 0.3, (h.z0 + h.z1) / 2, 0.07, 0.3, d / 2, {});
        const lean = box(w * 0.55, 0.1, d * 0.9, 0, 0, 0);
        lean.rotateZ(0.5);
        lean.translate(h.x0 - 1.0, cy + 0.6, (h.z0 + h.z1) / 2 + 0.2);
        b.geo(lean, this.redMat);
        // dark inner walls of the hold
        b.geo(merge([box(w, 3.4, 0.05, cx, cy - 1.7, h.z0 + 0.02), box(w, 3.4, 0.05, cx, cy - 1.7, h.z1 - 0.02), box(0.05, 3.4, d, h.x0 + 0.02, cy - 1.7, (h.z0 + h.z1) / 2), box(0.05, 3.4, d, h.x1 - 0.02, cy - 1.7, (h.z0 + h.z1) / 2)]), M.metalBlack, { cast: false });
      }
    }

    // ------------------------------------------------------------ poop deck + wheelhouse
    const POOP_H = 1.45;
    const poopY = (x) => deckY(x) + POOP_H;
    b.geo(deckGeometry(-HALF + 0.2, WELL0, poopY), this.deckMat);
    // poop front bulkhead and side plating up to the raised deck
    {
      const x = WELL0;
      b.geo(box(0.12, POOP_H, halfBreadth(x, 1) * 2 - 0.1, x, deckY(x) + POOP_H / 2, 0), this.superMat);
      b.box(x - 0.06, deckY(x) + POOP_H / 2, 0, 0.08, POOP_H / 2, halfBreadth(x, 1) - 0.1, {});
      for (const side of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= 12; i++) { const xx = -HALF + 0.2 + (i / 12) * (WELL0 + HALF - 0.2); pts.push(xx); }
        for (let i = 0; i < pts.length - 1; i++) {
          const xa = pts[i], xb = pts[i + 1], xm = (xa + xb) / 2;
          b.geo(box(xb - xa + 0.02, POOP_H, 0.08, xm, deckY(xm) + POOP_H / 2, side * (halfBreadth(xm, 1) - 0.02)), this.hullMat);
        }
      }
    }
    b.box((-HALF + WELL0) / 2, poopY((-HALF + WELL0) / 2) - 0.15, 0, (WELL0 + HALF) / 2 - 0.3, 0.15, 2.7, { walkable: true, solid: false });
    // steps from the well deck up to the poop (port side, where the deck sits lowest)
    for (let k = 0; k < 4; k++) {
      const xx = WELL0 + 1.6 - k * 0.38;
      const yy = deckY(xx) + (k + 1) * (POOP_H / 4);
      b.geo(box(0.4, 0.06, 1.0, xx, yy - 0.03, -2.4), this.deckMat);
      b.box(xx, yy - 0.08, -2.4, 0.2, 0.08, 0.5, { walkable: true, solid: false });
    }
    b.geo(merge([rod(V(WELL0 + 1.8, deckY(WELL0 + 1.8), -2.95), V(WELL0 + 0.2, deckY(WELL0) + POOP_H + 0.9, -2.95), 0.025), rod(V(WELL0 + 1.8, deckY(WELL0 + 1.8) + 0.9, -2.95), V(WELL0 + 0.2, deckY(WELL0) + POOP_H + 0.9, -2.95), 0.025)]), this.superMat);
    // wheelhouse on the poop deck (door facing forward, onto the stair head)
    const hx = -13.0, hz = 0.0;
    const hy = poopY(hx);
    const hutB = new ShipBuilder({ id: 'wreckHouse', x, y, z, yaw, pitch, roll, collision, parent: b.group.parent, M: { ...M, steel: this.superMat, galv: this.superMat }, terrain: terrainData });
    hutB.group.removeFromParent();
    b.group.add(hutB.group);
    hutB.group.position.set(hx, hy, hz);
    hutB.group.rotation.set(0, 0, 0);
    hutB.group.updateMatrixWorld(true);
    // colliders of the hut must go through the full transform: give it the ship's matrix
    hutB.world = (lx, ly, lz, out = new THREE.Vector3()) => out.set(lx, ly, lz).applyMatrix4(hutB.group.matrixWorld);
    const hut = buildHut(hutB, { x: 0, z: 0, yaw: Math.PI / 2, w: 4.2, d: 4.6, h: 2.3, door: { side: 'front', at: -1.2, width: 0.9 }, windows: [{ side: 'front', at: 0.7, width: 1.2, broken: true }, { side: 'left', at: 0.6, width: 1.0 }, { side: 'right', at: -0.6, width: 1.0, broken: true }, { side: 'back', at: 0.0, width: 1.6 }], seed: 101, roof: 'steel', doorOpen: 0.5 });
    // interior (ship frame: +x forward to the door wall, back wall aft at x = -2.2):
    // chart table, desk with the log, a bunk, the master's chart on a wall cabinet
    const fh = hut.floorH;
    hutB.geo(merge([box(0.8, 0.05, 1.3, 0, 0.92, 0), box(0.05, 0.85, 1.3, -0.38, 0.45, 0), box(0.8, 0.9, 0.05, 0, 0.45, -0.63), box(0.8, 0.9, 0.05, 0, 0.45, 0.63)]).translate(1.25, fh, -1.1), M.woodDark);
    hutB.box(1.25, fh + 0.47, -1.1, 0.4, 0.47, 0.65, { solid: true });
    const chart = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.1), M.paper);
    chart.rotation.set(-Math.PI / 2 + 0.03, 0, 0.1);
    hutB.mesh(chart, 1.25, fh + 0.955, -1.1);
    hutB.anchor('chart', 1.25, fh + 1.0, -1.1, { mesh: chart });
    // desk with the log book against the side wall
    hutB.geo(merge([box(1.0, 0.05, 0.55, 0, 0.76, 0), box(0.05, 0.75, 0.5, -0.45, 0.38, 0), box(0.05, 0.75, 0.5, 0.45, 0.38, 0)]).translate(-0.25, fh, -1.68), M.woodDark);
    hutB.box(-0.25, fh + 0.4, -1.68, 0.5, 0.4, 0.28, {});
    const log = new THREE.Mesh(merge([box(0.24, 0.04, 0.32, 0, 0.02, 0)]), M.leather);
    hutB.mesh(log, -0.2, fh + 0.79, -1.66, 0.4);
    hutB.anchor('log', -0.2, fh + 0.85, -1.66, { mesh: log });
    // bunk along the back corner
    hutB.geo(merge([box(0.75, 0.08, 1.8, 0, 0.5, 0), box(0.75, 0.5, 0.05, 0, 0.25, 0.9), box(0.75, 0.5, 0.05, 0, 0.25, -0.9)]).translate(-1.75, fh, -1.0), M.woodDark);
    hutB.box(-1.75, fh + 0.27, -1.0, 0.38, 0.27, 0.9, { walkable: true });
    // wall cabinet on the back wall; its door is the framed master's chart (the false panel)
    const cz = 0.95, cx0 = -2.2, depth = 0.3;
    hutB.geo(merge([box(depth, 0.04, 0.84, cx0 + depth / 2, 1.78, cz), box(depth, 0.04, 0.84, cx0 + depth / 2, 1.12, cz), box(depth, 0.66, 0.04, cx0 + depth / 2, 1.45, cz - 0.42), box(depth, 0.66, 0.04, cx0 + depth / 2, 1.45, cz + 0.42)]).translate(0, fh, 0), M.woodDark);
    hutB.geo(box(0.02, 0.62, 0.8, cx0 + 0.01, fh + 1.45, cz), M.metalBlack, { cast: false });
    hutB.box(cx0 + depth / 2, fh + 1.45, cz, depth / 2, 0.34, 0.43, {});
    const panelPivot = new THREE.Group();
    const frame = new THREE.Mesh(merge([woodBox(0.86, 0.62, 0.04, { seed: 3 }), box(0.8, 0.54, 0.01, 0, 0, 0.025)]), M.woodDark);
    const framed = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.5), M.paper);
    framed.position.z = 0.032;
    frame.add(framed);
    frame.position.set(0.43, 0, 0);
    panelPivot.add(frame);
    // hinge on the cabinet's +z front edge; the frame faces forward into the room
    hutB.mesh(panelPivot, cx0 + depth + 0.02, fh + 1.45, cz + 0.43, Math.PI / 2);
    hutB.anchor('panel', cx0 + depth + 0.15, fh + 1.45, cz, { pivot: panelPivot });
    hutB.anchor('secret', cx0 + 0.15, fh + 1.16, cz, { yaw: Math.PI / 2 });
    // compass binnacle and the wheel by the front windows
    hutB.geo(cylY(0.18, 0.14, 1.0, 1.75, fh + 0.5, -0.15, 12), M.brass);
    hutB.cyl(1.75, -0.15, 0.2, fh, fh + 1.0);
    hutB.geo(new THREE.TorusGeometry(0.35, 0.025, 6, 18).rotateY(Math.PI / 2).translate(1.95, fh + 1.15, 0.45), M.woodDark);
    hutB.geo(cylY(0.05, 0.05, 1.1, 2.0, fh + 0.55, 0.45, 8), M.metalBlack);
    hutB.finish();
    Object.assign(b.anchors, Object.fromEntries(Object.entries(hutB.anchors)));
    // funnel and a ventilator behind the wheelhouse
    b.geo(cylY(0.7, 0.62, 2.4, -16.0, poopY(-16) + 1.2, 0.0, 14), this.redMat);
    b.geo(cylY(0.62, 0.62, 0.18, -16.0, poopY(-16) + 2.45, 0.0, 14), M.metalBlack);
    b.cyl(-16, 0, 0.72, poopY(-16) - 0.2, poopY(-16) + 2.5);

    // ------------------------------------------------------------ forecastle, derrick, windlass
    const FC_H = 1.2;
    const fcY = (x) => deckY(x) + FC_H;
    b.geo(deckGeometry(WELL1, HALF - 0.6, fcY), this.deckMat);
    b.geo(box(0.12, FC_H, halfBreadth(WELL1, 1) * 2 - 0.1, WELL1, deckY(WELL1) + FC_H / 2, 0), this.superMat);
    b.box(WELL1 + 0.06, deckY(WELL1) + FC_H / 2, 0, 0.08, FC_H / 2, halfBreadth(WELL1, 1) - 0.1, {});
    for (const side of [-1, 1]) for (let i = 0; i < 8; i++) {
      const xa = WELL1 + (i / 8) * (HALF - 0.6 - WELL1), xb = WELL1 + ((i + 1) / 8) * (HALF - 0.6 - WELL1), xm = (xa + xb) / 2;
      b.geo(box(xb - xa + 0.02, FC_H, 0.08, xm, deckY(xm) + FC_H / 2, side * (halfBreadth(xm, 1) - 0.02)), this.hullMat);
    }
    b.box((WELL1 + HALF - 1) / 2, fcY((WELL1 + HALF) / 2) - 0.15, 0, (HALF - 1 - WELL1) / 2, 0.15, 1.6, { walkable: true, solid: false });
    b.geo(merge([box(1.2, 0.5, 0.8, 13.2, fcY(13.2) + 0.25, 0), cylY(0.22, 0.22, 1.4, 13.2, fcY(13.2) + 0.55, 0, 10).rotateX(Math.PI / 2).translate(0, 0, 0)]), this.redMat);
    // anchor chain running to the hawse pipe
    const chainPts = [V(13.2, fcY(13.2) + 0.3, 0.4), V(15.4, fcY(15.4) + 0.1, 1.0), V(16.2, fcY(16.2) - 0.4, 1.2)];
    b.geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(chainPts), 20, 0.06, 5, false), M.metalBlack);
    // derrick post with a fallen boom across the open hatch
    b.geo(cylY(0.22, 0.16, 7.5, 0.0, deckY(0) + 3.75, 0, 10), this.superMat);
    b.cyl(0.0, 0, 0.25, deckY(0), deckY(0) + 7.5);
    b.geo(rod(V(-0.2, deckY(0) + 1.4, 0.1), V(-7.0, deckY(-7) + 0.5, 1.6), 0.13, 8), this.superMat);
    b.geo(ropeGeometry(V(0, deckY(0) + 7.3, 0), V(-6.2, deckY(-6.2) + 0.6, 1.4), 0.6, 0.02, 12), M.rope, { cast: false });

    // ------------------------------------------------------------ bulwarks, rails (with gaps)
    const railRanges = [[-HALF + 0.4, -9.3], [WELL0 + 0.2, WELL1 - 0.2], [WELL1 + 0.2, HALF - 0.8]];
    for (const side of [-1, 1]) {
      for (const [ra, rb] of railRanges) {
        const isWell = ra === WELL0 + 0.2;
        const yb = (x) => (ra < WELL0 ? poopY(x) : ra > WELL1 ? fcY(x) : deckY(x));
        for (let xx = ra; xx < rb - 0.2; xx += 1.2) {
          // the port side of the well deck is broken away aft: the way aboard from the water
          const gap = isWell && side < 0 && xx < -3.5;
          const bent = isWell && side > 0 && xx > 4 && xx < 6.5;
          if (gap) continue;
          const zz = side * (halfBreadth(xx, 1) - 0.12);
          const lean = bent ? 0.35 : 0;
          b.geo(rod(V(xx, yb(xx), zz), V(xx, yb(xx) + 1.0, zz + side * lean), 0.025, 5), this.superMat);
          const xn = Math.min(xx + 1.2, rb);
          const zn = side * (halfBreadth(xn, 1) - 0.12);
          b.geo(rod(V(xx, yb(xx) + 1.0, zz + side * lean), V(xn, yb(xn) + 1.0, zn + side * (bent ? 0.35 : 0)), 0.022, 5), this.superMat);
          b.geo(rod(V(xx, yb(xx) + 0.5, zz + side * lean * 0.5), V(xn, yb(xn) + 0.5, zn), 0.016, 5), this.superMat);
          b.box((xx + xn) / 2, yb((xx + xn) / 2) + 0.6, (zz + zn) / 2, (xn - xx) / 2, 0.6, 0.06, { yaw: 0 });
        }
      }
    }
    // a deck locker on the well deck (common cache sits there)
    b.anchor('locker', 7.4, deckY(7.4), -2.5, { yaw: 0 });
    // the cargo: storage crates spilled on deck
    const cr = rng(9);
    for (let i = 0; i < 4; i++) {
      const xx = 7.8 + cr() * 2, zz = 0.6 + cr() * 2.2;
      b.geo(box(0.8, 0.5, 0.55, xx, deckY(xx) + 0.25, zz, cr() * 0.6), M.metalOlive);
      b.box(xx, deckY(xx) + 0.25, zz, 0.42, 0.25, 0.3, { walkable: true });
    }
    b.anchor('boarding', -6.5, deckY(-6.5) + 0.1, -3.2);
    b.anchor('centre', 0, deckY(0) + 1, 0);
    b.finish();
    this.anchors = Object.fromEntries(Object.entries(b.anchors).map(([k, v]) => [`wreck.${k}`, v]));
  }

  update(dt, game) {
    const cam = game.camera.position;
    const d = Math.hypot(this.b.x - cam.x, this.b.z - cam.z);
    this.group.visible = d < this.b.activation;
  }
}

