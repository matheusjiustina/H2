import * as THREE from 'three';
import { woodBox, woodCylinder, place, merge, ropeGeometry } from '../environment/PropFactory.js';
import { wornPaint } from '../environment/PropMaterials.js';
import { patchMaterial } from '../core/MaterialPatch.js';
import { LAYER } from '../core/Shared.js';
import { rng } from '../utils/MathUtils.js';

// Building blocks for the sites on the archipelago: a builder that places parts in a
// local frame (merging static geometry per material, adding world colliders and named
// anchors), plus the structures themselves: docks, huts, lattice masts, containers,
// tanks, panels, terminals, stone ruins, a cave and so on. Everything is procedural.

// ---------------------------------------------------------------------- materials
let MAT = null;
export function siteMaterials(M) {
  if (MAT) return MAT;
  const plain = (opts, key, wet = 0.7) => { const m = new THREE.MeshStandardMaterial(opts); patchMaterial(m, { wet, key }); return m; };
  MAT = {
    wood: M.wood, woodDark: M.woodDark, rope: M.rope, stone: M.stone, canvas: M.canvasStatic, olive: M.olive, blueTarp: M.blueTarp,
    metalBlack: M.metalBlack, metalOlive: M.metalOlive, metalRed: M.metalRed, metalDrum: M.metalDrum, glass: M.glass, paper: M.paper, plastic: M.plastic, brass: M.brass,
    galv: wornPaint(0x9da3a2, { bare: 0x6e5c4a, wear: 0.2, rust: 0.8, scale: 1.4, bareMetal: 0.25, roughness: 0.45, metalness: 0.65 }),
    steel: wornPaint(0x6f7471, { bare: 0x4c3b2c, wear: 0.25, rust: 0.9, scale: 2.2, bareMetal: 0.4, roughness: 0.55, metalness: 0.7 }),
    boxGreen: wornPaint(0x34573f, { bare: 0x6a4e36, wear: 0.3, rust: 1.0, scale: 0.9, bareMetal: 0.3, roughness: 0.6, metalness: 0.3 }),
    boxRed: wornPaint(0x7b3324, { bare: 0x5f4430, wear: 0.32, rust: 1.0, scale: 0.9, bareMetal: 0.3, roughness: 0.62, metalness: 0.3 }),
    boxBlue: wornPaint(0x2e4c66, { bare: 0x5c4634, wear: 0.28, rust: 0.95, scale: 0.9, bareMetal: 0.3, roughness: 0.6, metalness: 0.3 }),
    tank: wornPaint(0xc8c2b0, { bare: 0x6b5340, wear: 0.25, rust: 0.85, scale: 1.1, bareMetal: 0.3, roughness: 0.55, metalness: 0.3 }),
    cabinet: wornPaint(0x8a8f74, { bare: 0x5e4a38, wear: 0.22, rust: 0.6, scale: 3.2, bareMetal: 0.5, roughness: 0.5, metalness: 0.4 }),
    pontoon: plain({ color: 0x2c3033, roughness: 0.7, metalness: 0 }, 'pontoon', 0.9),
    concrete: plain({ color: 0x8b877d, roughness: 0.95, metalness: 0 }, 'concrete', 0.8),
    rubber: plain({ color: 0x161616, roughness: 0.85, metalness: 0 }, 'rubber', 0.5),
    buoy: plain({ color: 0xd2652a, roughness: 0.5, metalness: 0 }, 'buoy', 0.9),
    solar: solarMaterial(false),
    solarCracked: solarMaterial(true),
    ancient: (() => {
      const m = new THREE.MeshStandardMaterial({ map: M.stone.map, normalMap: M.stone.normalMap, roughness: 0.92, vertexColors: true, color: new THREE.Color(0.92, 0.88, 0.8) });
      patchMaterial(m, { wet: 0.9, key: 'ancient' });
      return m;
    })(),
  };
  return MAT;
}

function solarMaterial(cracked) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 384;
  const g = c.getContext('2d');
  g.fillStyle = '#0d1a2b'; g.fillRect(0, 0, 256, 384);
  for (let y = 0; y < 6; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = `rgb(${18 + Math.random() * 6},${34 + Math.random() * 8},${64 + Math.random() * 10})`;
    g.fillRect(6 + x * 62, 6 + y * 62, 58, 58);
    g.strokeStyle = 'rgba(160,170,180,0.25)'; g.lineWidth = 1;
    for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(6 + x * 62 + k * 14.5, 6 + y * 62); g.lineTo(6 + x * 62 + k * 14.5, 64 + y * 62); g.stroke(); }
  }
  if (cracked) {
    g.strokeStyle = 'rgba(220,230,240,0.7)'; g.lineWidth = 1.2;
    const cx = 150, cy = 140;
    for (let i = 0; i < 14; i++) {
      let x = cx, y = cy; const a0 = Math.random() * Math.PI * 2;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { const a = a0 + (Math.random() - 0.5) * 0.7; x += Math.cos(a) * (12 + Math.random() * 22); y += Math.sin(a) * (12 + Math.random() * 22); g.lineTo(x, y); }
      g.stroke();
    }
    g.fillStyle = 'rgba(40,30,20,0.35)';
    for (let i = 0; i < 60; i++) g.fillRect(Math.random() * 256, Math.random() * 384, 2 + Math.random() * 6, 2 + Math.random() * 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: cracked ? 0.45 : 0.18, metalness: 0.35 });
  patchMaterial(m, { wet: 0.5, key: 'solar' });
  return m;
}

/** Emissive indicator light whose colour can be switched. */
export function makeLed(color = 0x220000, size = 0.03) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), new THREE.MeshBasicMaterial({ color }));
  m.castShadow = false;
  m.userData.led = true;
  return m;
}
export const LED = { off: new THREE.Color(0.05, 0.04, 0.035), red: new THREE.Color(2.2, 0.25, 0.1), amber: new THREE.Color(2.0, 1.1, 0.2), green: new THREE.Color(0.35, 2.2, 0.6), white: new THREE.Color(2.4, 2.3, 2.1) };

/** A small canvas screen (terminals, radios) that can be redrawn. */
export function makeScreen(w, h, px = 256) {
  const c = document.createElement('canvas');
  c.width = px; c.height = Math.round(px * h / w);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.castShadow = false;
  const draw = (fn) => { const g = c.getContext('2d'); fn(g, c.width, c.height); tex.needsUpdate = true; };
  draw((g, W, H) => { g.fillStyle = '#050605'; g.fillRect(0, 0, W, H); });
  return { mesh, draw, canvas: c };
}

// ---------------------------------------------------------------------- builder
/**
 * Places parts in a local frame (origin x,y,z, rotated by yaw about Y). Static parts are
 * merged per material at the end; colliders and anchors are created in world space.
 */
export class SiteBuilder {
  constructor({ id, x, y, z, yaw = 0, collision, parent, M, terrain }) {
    this.id = id;
    this.terrain = terrain;
    this.x = x; this.y = y; this.z = z; this.yaw = yaw;
    this.c = Math.cos(yaw); this.s = Math.sin(yaw);
    this.collision = collision;
    this.M = M;
    this.group = new THREE.Group();
    this.group.name = `site:${id}`;
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;
    parent.add(this.group);
    this.buckets = new Map();
    this.anchors = {};
    this.colliders = [];
  }

  wx(lx, lz) { return this.x + lx * this.c + lz * this.s; }
  wz(lx, lz) { return this.z - lx * this.s + lz * this.c; }
  /** Local -> world Vector3. */
  world(lx, ly, lz, out = new THREE.Vector3()) { return out.set(this.wx(lx, lz), this.y + ly, this.wz(lx, lz)); }
  /** Ground height (terrain, docks...) under a local point, in local y. */
  groundLocal(lx, lz) { return this.collision.ground(this.wx(lx, lz), this.wz(lx, lz), 1e4).y - this.y; }
  /** Terrain height only (ignores colliders), in local y. */
  terrainLocal(lx, lz) { return this.terrain.heightAt(this.wx(lx, lz), this.wz(lx, lz)) - this.y; }

  /** World -> local x/z. */
  local(x, z) { const dx = x - this.x, dz = z - this.z; return [dx * this.c - dz * this.s, dx * this.s + dz * this.c]; }

  /** Add a geometry (already in local coordinates) to the merged static mesh of a material. */
  geo(g, mat, { cast = true } = {}) {
    const key = `${mat.uuid}|${cast}`;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { mat, cast, list: [] }));
    b.list.push(g);
    return g;
  }

  /** Add a live mesh (moving parts, lights, screens) in local coordinates. */
  mesh(m, lx = 0, ly = 0, lz = 0, ry = 0) {
    m.position.set(lx, ly, lz);
    m.rotation.y += ry;
    if (m.isMesh && m.castShadow === undefined) m.castShadow = true;
    m.traverse((o) => { if (o.isMesh) { if (!o.userData.led) { o.castShadow = o.castShadow ?? true; } o.receiveShadow = true; } });
    this.group.add(m);
    return m;
  }

  /** Solid (and optionally walkable) box collider in local coordinates. */
  box(lx, ly, lz, hx, hy, hz, { yaw = 0, walkable = false, solid = true, surface = 'wood', tiltX = 0, tiltZ = 0, tag = null } = {}) {
    const c = this.collision.addBox({ x: this.wx(lx, lz), y: this.y + ly, z: this.wz(lx, lz), hx, hy, hz, yaw: this.yaw + yaw, walkable, solid, surface, tiltX, tiltZ, tag });
    this.colliders.push(c);
    return c;
  }

  cyl(lx, lz, r, y0, y1, surface = 'wood') {
    const c = this.collision.addCylinder({ x: this.wx(lx, lz), z: this.wz(lx, lz), r, y0: this.y + y0, y1: this.y + y1, surface });
    this.colliders.push(c);
    return c;
  }

  anchor(name, lx, ly, lz, extra = {}) {
    const a = { pos: this.world(lx, ly, lz), yaw: this.yaw + (extra.yaw || 0), site: this.id, local: new THREE.Vector3(lx, ly, lz), parent: this.group, localYaw: extra.yaw || 0, ...extra };
    this.anchors[name] = a;
    return a;
  }

  /** Merge static parts. Returns the number of merged meshes. */
  finish() {
    for (const b of this.buckets.values()) {
      const g = merge(b.list);
      const m = new THREE.Mesh(g, b.mat);
      m.castShadow = b.cast;
      m.receiveShadow = true;
      m.layers.set(LAYER.WORLD);
      m.layers.enable(LAYER.REFLECT_LITE);
      this.group.add(m);
    }
    this.buckets.clear();
    return this.group;
  }
}

// ---------------------------------------------------------------------- geometry helpers
export const box = (w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) => place(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
export const cylY = (r0, r1, h, x, y, z, seg = 10) => place(new THREE.CylinderGeometry(r1, r0, h, seg, 1), x, y, z);
/** Thin rod between two local points. */
export function rod(a, b, r = 0.02, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Corrugated sheet (w along x, d along z) lying in the XZ plane at y, ribs along z. */
export function corrugated(w, d, { ribs = 0.076, amp = 0.018, segX = null } = {}) {
  const nx = segX || Math.max(8, Math.round(w / ribs * 2));
  const g = new THREE.PlaneGeometry(w, d, nx, 1);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, Math.sin((p.getX(i) / ribs) * Math.PI) * amp);
  g.computeVertexNormals();
  return g;
}

/** Wall panel along local x with rectangular openings [{x0,x1,y0,y1}] cut out (local to the wall). */
export function wallBoxes(len, h, t, openings = []) {
  const xs = new Set([-len / 2, len / 2]);
  for (const o of openings) { xs.add(o.x0); xs.add(o.x1); }
  const sx = [...xs].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sx.length - 1; i++) {
    const a = sx[i], b = sx[i + 1];
    if (b - a < 1e-3) continue;
    const mid = (a + b) / 2;
    const cuts = openings.filter((o) => mid > o.x0 && mid < o.x1).sort((p, q) => p.y0 - q.y0);
    let y = 0;
    for (const o of cuts) { if (o.y0 > y) out.push({ x: mid, w: b - a, y0: y, y1: o.y0 }); y = Math.max(y, o.y1); }
    if (y < h) out.push({ x: mid, w: b - a, y0: y, y1: h });
  }
  return out;
}

// ---------------------------------------------------------------------- structures
/**
 * Plank dock on posts from local (x0,z0) to (x1,z1), deck at height `deckY` (local y).
 * Adds walkable colliders. Returns the dock end in local coordinates.
 */
export function buildDock(b, { x0, z0, x1, z1, width = 2.2, deckY = 1.0, seed = 1, ground }) {
  const M = b.M;
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const ang = Math.atan2(dx, dz); // local yaw of the dock axis (+z along the dock)
  const r = rng(seed);
  const ux = dx / len, uz = dz / len;
  // planks across the dock
  const n = Math.floor(len / 0.2);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    if (r() < 0.025) continue; // a missing board here and there
    const px = x0 + dx * t, pz = z0 + dz * t;
    b.geo(place(woodBox(width + (r() - 0.5) * 0.06, 0.05, 0.18, { seed: seed * 100 + i }), px, deckY - 0.025 + (r() - 0.5) * 0.012, pz, ang + Math.PI / 2 + (r() - 0.5) * 0.03), M.wood);
  }
  // stringers + posts every 2.4 m
  for (const side of [-1, 1]) {
    const ox = side * (width / 2 - 0.12) * uz, oz = -side * (width / 2 - 0.12) * ux;
    b.geo(place(woodBox(0.1, 0.16, len, { seed: seed + side }), (x0 + x1) / 2 + ox, deckY - 0.13, (z0 + z1) / 2 + oz, ang), M.woodDark);
    for (let s = 0; s <= len; s += 2.4) {
      const px = x0 + ux * s + ox * 1.05, pz = z0 + uz * s + oz * 1.05;
      const gy = ground(px, pz);
      const h = deckY + 0.3 - gy + 0.6;
      b.geo(place(woodCylinder(0.11, 0.1, h, { seed: seed + s * 7 + side, radial: 8 }), px, gy - 0.6 + h / 2, pz), M.woodDark);
      b.cyl(px, pz, 0.12, gy - 0.6, deckY + 0.3, 'wood');
    }
  }
  // walkable deck collider (one box per dock)
  b.box((x0 + x1) / 2, deckY - 0.12, (z0 + z1) / 2, width / 2 + 0.05, 0.12, len / 2, { yaw: ang, walkable: true, solid: false });
  // bollards at the end
  for (const side of [-1, 1]) {
    const px = x1 - ux * 0.4 + side * (width / 2 - 0.2) * uz, pz = z1 - uz * 0.4 - side * (width / 2 - 0.2) * ux;
    b.geo(place(woodCylinder(0.09, 0.08, 0.5, { seed: seed + 40 + side, radial: 8 }), px, deckY + 0.25, pz), M.woodDark);
    b.cyl(px, pz, 0.1, deckY, deckY + 0.5);
  }
  return { ang, len, ux, uz, end: [x1, z1] };
}

/**
 * Small timber hut with a door and windows. Floor at local y = 0 (+ floorH). Returns
 * local positions for the interior (centre) and the door.
 */
export function buildHut(b, { x, z, yaw = 0, w = 4.2, d = 3.4, h = 2.5, floorH = 0.18, door = { side: 'front', at: 0, width: 0.95 }, windows = [], seed = 3, roof = 'galv', doorOpen = 1.2 }) {
  const M = b.M;
  const t = 0.09;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  // floor slab
  const [fx, fz] = L(0, 0);
  b.geo(place(woodBox(w + 0.2, floorH, d + 0.2, { seed }), fx, floorH / 2, fz, yaw), M.woodDark);
  b.box(fx, floorH / 2, fz, w / 2 + 0.1, floorH / 2, d / 2 + 0.1, { yaw, walkable: true });
  // walls: front (+z), back (-z), left (-x), right (+x)
  const walls = [
    { id: 'front', len: w, lx: 0, lz: d / 2 - t / 2, ry: 0 },
    { id: 'back', len: w, lx: 0, lz: -d / 2 + t / 2, ry: Math.PI },
    { id: 'left', len: d - 2 * t, lx: -w / 2 + t / 2, lz: 0, ry: Math.PI / 2 },
    { id: 'right', len: d - 2 * t, lx: w / 2 - t / 2, lz: 0, ry: -Math.PI / 2 },
  ];
  for (const wl of walls) {
    const ops = [];
    if (door && door.side === wl.id) ops.push({ x0: door.at - door.width / 2, x1: door.at + door.width / 2, y0: -1, y1: 2.0 });
    for (const win of windows) if (win.side === wl.id) ops.push({ x0: win.at - win.width / 2, x1: win.at + win.width / 2, y0: win.y0 ?? 0.95, y1: win.y1 ?? 1.7 });
    for (const seg of wallBoxes(wl.len, h, t, ops)) {
      const segH = seg.y1 - seg.y0;
      const cx = wl.lx + Math.cos(wl.ry) * seg.x, cz = wl.lz - Math.sin(wl.ry) * seg.x;
      const [px, pz] = L(cx, cz);
      b.geo(place(woodBox(seg.w, segH, t, { seed: seed + Math.round(seg.x * 10) + wl.len }), px, floorH + seg.y0 + segH / 2, pz, yaw + wl.ry), M.wood);
      if (seg.y0 < 1.9) b.box(px, floorH + seg.y0 + segH / 2, pz, seg.w / 2, segH / 2, t / 2 + 0.02, { yaw: yaw + wl.ry });
    }
    // window frames + glass
    for (const win of windows) if (win.side === wl.id) {
      const cx = wl.lx + Math.cos(wl.ry) * win.at, cz = wl.lz - Math.sin(wl.ry) * win.at;
      const [px, pz] = L(cx, cz);
      const y0 = win.y0 ?? 0.95, y1 = win.y1 ?? 1.7;
      b.geo(place(woodBox(win.width + 0.12, 0.06, t + 0.08, { seed: seed + 70 }), px, floorH + y0 - 0.03, pz, yaw + wl.ry), M.woodDark);
      b.geo(place(woodBox(win.width + 0.12, 0.06, t + 0.04, { seed: seed + 71 }), px, floorH + y1 + 0.03, pz, yaw + wl.ry), M.woodDark);
      if (!win.broken) b.geo(place(new THREE.PlaneGeometry(win.width, y1 - y0), px, floorH + (y0 + y1) / 2, pz, 0, yaw + wl.ry), M.glass, { cast: false });
    }
  }
  // corner posts
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const [px, pz] = L(sx * (w / 2), sz * (d / 2));
    b.geo(place(woodBox(0.12, h + 0.05, 0.12, { seed: seed + sx * 3 + sz }), px, floorH + h / 2, pz, yaw), M.woodDark);
  }
  // roof: single pitch, falling to the back
  const [rx, rz] = L(0, 0);
  const roofW = w + 0.6, roofD = d + 0.7;
  const pitch = 0.12;
  const sheet = corrugated(roofW, roofD, { ribs: 0.08 });
  sheet.rotateZ(0);
  sheet.rotateX(pitch);
  b.geo(place(sheet, rx, floorH + h + 0.12, rz, 0, yaw), roof === 'galv' ? b.M.galv : b.M.steel);
  { const [tx, tz] = L(0, d / 2 + 0.12); b.geo(place(woodBox(w + 0.3, 0.1, 0.1, { seed: seed + 90 }), tx, floorH + h + 0.02, tz, 0, yaw), M.woodDark); }
  b.box(rx, floorH + h + 0.1, rz, roofW / 2, 0.06, roofD / 2, { yaw, solid: true });
  // door leaf on hinges (live mesh so it can swing)
  let doorPivot = null;
  if (door) {
    const wl = walls.find((q) => q.id === door.side);
    const hingeLocal = wl.lx + Math.cos(wl.ry) * (door.at - door.width / 2);
    const hingeLocalZ = wl.lz - Math.sin(wl.ry) * (door.at - door.width / 2);
    const [hx, hz] = L(hingeLocal, hingeLocalZ);
    doorPivot = new THREE.Group();
    doorPivot.position.set(hx, floorH, hz);
    doorPivot.rotation.y = yaw + wl.ry + doorOpen;
    const leaf = new THREE.Mesh(merge([place(woodBox(door.width - 0.04, 1.95, 0.05, { seed: seed + 80 }), (door.width - 0.04) / 2, 0.98, 0), place(woodBox(door.width - 0.1, 0.08, 0.07, { seed: seed + 81 }), (door.width - 0.04) / 2, 0.5, 0), place(woodBox(door.width - 0.1, 0.08, 0.07, { seed: seed + 82 }), (door.width - 0.04) / 2, 1.5, 0)]), M.woodDark);
    leaf.castShadow = true; leaf.receiveShadow = true;
    doorPivot.add(leaf);
    b.group.add(doorPivot);
  }
  return { L, floorH, doorPivot, inner: { w: w - 2 * t, d: d - 2 * t } };
}

/** Lattice radio mast (triangular, tapering) with guy wires and a top beacon. */
export function buildMast(b, { x, z, y = 0, height = 18, base = 1.0, top = 0.4, guys = true, seed = 9 }) {
  const M = b.M;
  const legs = [0, 1, 2].map((k) => (k / 3) * Math.PI * 2 + 0.3);
  const legAt = (k, hy) => {
    const w = base + (top - base) * (hy / height);
    const r = w / Math.sqrt(3);
    return V(x + Math.cos(legs[k]) * r, y + hy, z + Math.sin(legs[k]) * r);
  };
  const parts = [];
  for (let k = 0; k < 3; k++) parts.push(rod(legAt(k, 0), legAt(k, height), 0.035, 6));
  const step = 1.2;
  for (let hy = 0; hy < height - 0.1; hy += step) {
    for (let k = 0; k < 3; k++) {
      const a = legAt(k, hy), bb = legAt((k + 1) % 3, hy + step);
      parts.push(rod(a, bb, 0.012, 4));
      parts.push(rod(legAt(k, hy), legAt((k + 1) % 3, hy), 0.012, 4));
    }
  }
  // top whip, crossarm and a small yagi
  parts.push(rod(V(x, y + height, z), V(x, y + height + 3.2, z), 0.02, 5));
  parts.push(rod(V(x - 0.8, y + height - 0.4, z), V(x + 0.8, y + height - 0.4, z), 0.02, 5));
  const yagiY = y + height - 1.6;
  parts.push(rod(V(x, yagiY, z), V(x, yagiY, z + 1.6), 0.02, 5));
  for (let i = 0; i < 5; i++) parts.push(rod(V(x - 0.35 + i * 0.03, yagiY, z + 0.25 + i * 0.32), V(x + 0.35 - i * 0.03, yagiY, z + 0.25 + i * 0.32), 0.008, 4));
  // ladder rungs up one face
  for (let hy = 0.4; hy < height - 0.5; hy += 0.4) parts.push(rod(legAt(0, hy), legAt(1, hy), 0.01, 4));
  b.geo(merge(parts), b.M.galv);
  // concrete footing
  b.geo(cylY(base * 0.75, base * 0.72, 0.5, x, y + 0.05, z, 10), b.M.concrete);
  b.cyl(x, z, base * 0.55, y - 0.2, y + height, 'metal');
  // guy wires
  if (guys) {
    for (let k = 0; k < 3; k++) {
      const a = legs[k] + 0.0;
      const R = height * 0.55;
      const ax = x + Math.cos(a) * R, az = z + Math.sin(a) * R;
      const wy = b.terrainLocal(ax, az);
      const geo = ropeGeometry(V(x, y + height * 0.72, z), V(ax, wy + 0.3, az), 0.15, 0.008, 10);
      b.geo(geo, M.metalBlack, { cast: false });
      b.geo(cylY(0.12, 0.12, 0.35, ax, wy + 0.1, az, 8), b.M.concrete);
    }
  }
  const light = makeLed(0x220000, 0.08);
  b.mesh(light, x, y + height + 3.25, z);
  return { light, top: V(x, y + height, z) };
}

/** 20 ft shipping container with corrugated sides. open = 0..1 door swing. */
export function buildContainer(b, { x, z, y = 0, yaw = 0, mat, open = 0, seed = 1, collide = true }) {
  const W = 6.06, H = 2.59, D = 2.44;
  const parts = [];
  // corrugated long sides
  for (const sz of [-1, 1]) {
    const g = corrugated(W - 0.2, H - 0.2, { ribs: 0.14, amp: 0.035 });
    g.rotateX(sz > 0 ? Math.PI / 2 : -Math.PI / 2);
    g.translate(0, H / 2, sz * (D / 2 - 0.02));
    parts.push(g);
  }
  // roof and front wall
  const roof = corrugated(W - 0.2, D - 0.1, { ribs: 0.3, amp: 0.02 });
  roof.translate(0, H - 0.03, 0);
  parts.push(roof);
  const front = corrugated(D - 0.2, H - 0.2, { ribs: 0.14, amp: 0.03 });
  front.rotateX(Math.PI / 2);
  front.rotateY(Math.PI / 2);
  front.translate(-W / 2 + 0.02, H / 2, 0);
  parts.push(front);
  // frame rails and corner posts
  for (const sy of [0.06, H - 0.06]) for (const sz of [-1, 1]) parts.push(box(W, 0.12, 0.12, 0, sy, sz * (D / 2 - 0.06)));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.14, H, 0.14, sx * (W / 2 - 0.07), H / 2, sz * (D / 2 - 0.07)));
  for (const sy of [0.06, H - 0.06]) parts.push(box(0.12, 0.12, D, -W / 2 + 0.06, sy, 0), box(0.12, 0.12, D, W / 2 - 0.06, sy, 0));
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const g = merge(parts);
  g.rotateY(yaw);
  g.translate(x, y, z);
  b.geo(g, mat);
  // floor (walkable inside)
  b.geo(place(woodBox(W - 0.2, 0.06, D - 0.2, { seed }), x, y + 0.1, z, yaw), b.M.woodDark);
  // doors at +x end
  const doors = [];
  for (const sz of [-1, 1]) {
    const pivot = new THREE.Group();
    const hx = W / 2, hz = sz * (D / 2 - 0.02);
    pivot.position.set(x + hx * c + hz * s, y, z - hx * s + hz * c);
    pivot.rotation.y = yaw + (sz > 0 ? 1 : -1) * open * 1.9;
    const leaf = corrugated(D / 2 - 0.04, H - 0.15, { ribs: 0.12, amp: 0.03 });
    leaf.rotateX(Math.PI / 2);
    leaf.rotateY(Math.PI / 2);
    leaf.translate(0.02, H / 2, -sz * (D / 4 - 0.02));
    const bars = merge([box(0.04, H - 0.3, 0.04, 0.06, H / 2, -sz * D / 8), box(0.04, H - 0.3, 0.04, 0.06, H / 2, -sz * D * 0.33)]);
    const m = new THREE.Mesh(merge([leaf, bars]), mat);
    m.castShadow = true; m.receiveShadow = true;
    pivot.add(m);
    b.group.add(pivot);
    doors.push(pivot);
  }
  if (collide) {
    // walls (open end leaves a gap) and the walkable floor
    const wx = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const [ax, az] = wx(0, D / 2 - 0.05); b.box(ax, y + H / 2, az, W / 2, H / 2, 0.06, { yaw, surface: 'metal' });
    const [bx, bz] = wx(0, -D / 2 + 0.05); b.box(bx, y + H / 2, bz, W / 2, H / 2, 0.06, { yaw, surface: 'metal' });
    const [fx2, fz2] = wx(-W / 2 + 0.05, 0); b.box(fx2, y + H / 2, fz2, 0.06, H / 2, D / 2, { yaw, surface: 'metal' });
    if (open < 0.3) { const [ex, ez] = wx(W / 2 - 0.05, 0); b.box(ex, y + H / 2, ez, 0.06, H / 2, D / 2, { yaw, surface: 'metal' }); }
    const [cx2, cz2] = wx(0, 0);
    b.box(cx2, y + 0.07, cz2, W / 2 - 0.1, 0.07, D / 2 - 0.1, { yaw, walkable: true, solid: false, surface: 'metal' });
    b.box(cx2, y + H - 0.05, cz2, W / 2, 0.06, D / 2, { yaw, walkable: true, surface: 'metal' });
  }
  return { doors };
}


/** Horizontal fuel tank on saddles. */
export function buildTank(b, { x, z, y = 0, yaw = 0, len = 4.2, r = 0.85 }) {
  const parts = [];
  const body = new THREE.CylinderGeometry(r, r, len, 22, 1);
  body.rotateZ(Math.PI / 2);
  body.translate(0, r + 0.45, 0);
  parts.push(body);
  for (const sx of [-1, 1]) {
    const cap = new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.scale(1, 0.32, 1);
    cap.rotateZ(sx > 0 ? -Math.PI / 2 : Math.PI / 2);
    cap.translate(sx * len / 2, r + 0.45, 0);
    parts.push(cap);
  }
  parts.push(cylY(0.08, 0.08, 0.3, 0.6, r * 2 + 0.55, 0, 8));
  const g = merge(parts);
  g.rotateY(yaw);
  g.translate(x, y, z);
  b.geo(g, b.M.tank);
  for (const sx of [-1, 1]) {
    const sd = box(0.18, 0.55, r * 1.7, sx * len * 0.3, 0.27, 0);
    sd.rotateY(yaw); sd.translate(x, y, z);
    b.geo(sd, b.M.concrete);
  }
  b.box(x, y + r + 0.45, z, len / 2 + r * 0.3, r, r, { yaw, surface: 'metal' });
}

/** Solar panel on a tilted frame. */
export function buildSolarPanel(b, { x, z, y = 0, yaw = 0, tilt = 0.45, cracked = false, fallen = false }) {
  const parts = [];
  const legH = 0.9;
  parts.push(box(0.06, legH, 0.06, -0.8, legH / 2, 0.55), box(0.06, legH, 0.06, 0.8, legH / 2, 0.55));
  parts.push(box(0.06, legH * 0.45, 0.06, -0.8, legH * 0.22, -0.4), box(0.06, legH * 0.45, 0.06, 0.8, legH * 0.22, -0.4));
  const g = merge(parts);
  g.rotateY(yaw); g.translate(x, y, z);
  b.geo(g, b.M.galv);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.04, 1.3), [b.M.galv, b.M.galv, cracked ? b.M.solarCracked : b.M.solar, b.M.galv, b.M.galv, b.M.galv]);
  panel.position.set(x, y + legH * 0.72, z);
  panel.rotation.set(fallen ? 1.2 : tilt, yaw, fallen ? 0.3 : 0, 'YXZ');
  panel.castShadow = true;
  panel.receiveShadow = true;
  b.group.add(panel);
  b.box(x, y + 0.6, z, 1.0, 0.6, 0.7, { yaw, surface: 'metal' });
  return panel;
}

/** Wooden table + terminal console (monitor with a live screen, keyboard, radio stack). */
export function buildTerminal(b, { x, z, y = 0, yaw = 0, radio = true }) {
  const M = b.M;
  const parts = [];
  parts.push(box(1.5, 0.05, 0.7, 0, 0.76, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.06, 0.74, 0.06, sx * 0.68, 0.37, sz * 0.3));
  const tg = merge(parts);
  tg.rotateY(yaw); tg.translate(x, y, z);
  b.geo(tg, M.woodDark);
  const cabinet = merge([box(0.5, 0.42, 0.42, -0.1, 0.99, -0.08), box(0.56, 0.05, 0.2, -0.1, 0.8, 0.18)]);
  cabinet.rotateY(yaw); cabinet.translate(x, y, z);
  b.geo(cabinet, M.cabinet);
  if (radio) {
    const rg = merge([box(0.46, 0.18, 0.3, 0.45, 0.88, -0.12), box(0.46, 0.14, 0.3, 0.45, 1.05, -0.12)]);
    rg.rotateY(yaw); rg.translate(x, y, z);
    b.geo(rg, M.metalBlack);
  }
  const screen = makeScreen(0.38, 0.28, 256);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const sx2 = -0.1, sz2 = 0.135;
  screen.mesh.position.set(x + sx2 * c + sz2 * s, y + 1.0, z - sx2 * s + sz2 * c);
  screen.mesh.rotation.y = yaw;
  b.group.add(screen.mesh);
  const leds = [];
  for (let i = 0; i < 3; i++) {
    const l = makeLed(0x220000, 0.012);
    const lx = 0.3 + i * 0.07, lz = 0.035;
    l.position.set(x + lx * c + lz * s, y + 1.07, z - lx * s + lz * c);
    b.group.add(l);
    leds.push(l);
  }
  b.box(x, y + 0.45, z, 0.78, 0.45, 0.38, { yaw });
  return { screen, leds, front: [x + 0.7 * s, z + 0.7 * c] };
}

/** Metal power cabinet on a post with breaker panel door. */
export function buildPowerBox(b, { x, z, y = 0, yaw = 0 }) {
  const parts = [box(0.1, 1.5, 0.1, 0, 0.75, -0.12), box(0.62, 0.8, 0.26, 0, 1.25, 0)];
  const g = merge(parts); g.rotateY(yaw); g.translate(x, y, z);
  b.geo(g, b.M.cabinet);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const leds = [];
  for (let i = 0; i < 4; i++) {
    const l = makeLed(0x220000, 0.018);
    const lx = -0.21 + i * 0.14, lz = 0.135;
    l.position.set(x + lx * c + lz * s, y + 1.58, z - lx * s + lz * c);
    b.group.add(l);
    leds.push(l);
  }
  // warning plate
  const plate = box(0.3, 0.12, 0.01, 0, 1.4, 0.135); plate.rotateY(yaw); plate.translate(x, y, z);
  b.geo(plate, b.M.metalRed);
  b.box(x, y + 1.0, z, 0.32, 1.0, 0.2, { yaw, surface: 'metal' });
  return { leds };
}

/** Weathered stone pillar (ancient look). */
export function stonePillar(h = 2.6, r = 0.35, seed = 1, broken = false) {
  const rr = rng(seed);
  const g = new THREE.CylinderGeometry(r * 0.92, r, h, 9, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = 1 + (rr() - 0.5) * 0.12 + (broken && y > h * 0.35 ? (rr() - 0.5) * 0.25 : 0);
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
    if (broken && y > h * 0.45) p.setY(i, y - rr() * 0.3);
  }
  g.translate(0, h / 2, 0);
  g.computeVertexNormals();
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const t = 0.75 + 0.25 * (p.getY(i) / h) + (rr() - 0.5) * 0.08; col[i * 3] = t * 0.95; col[i * 3 + 1] = t * 0.93; col[i * 3 + 2] = t * 0.85; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Irregular dressed stone block. */
export function stoneBlock(w, h, d, seed = 1) {
  const rr = rng(seed);
  const g = new THREE.BoxGeometry(w, h, d, 3, 2, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (1 + (rr() - 0.5) * 0.06), p.getY(i) * (1 + (rr() - 0.5) * 0.08), p.getZ(i) * (1 + (rr() - 0.5) * 0.06));
  g.computeVertexNormals();
  const col = new Float32Array(p.count * 3);
  const t = 0.78 + rr() * 0.2;
  for (let i = 0; i < p.count; i++) { col[i * 3] = t; col[i * 3 + 1] = t * 0.97; col[i * 3 + 2] = t * 0.88; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * A rock dome over flat ground with an entrance: a small cave you can walk into. Outer
 * and inner shells share one mesh (the rock material). Colliders ring the wall.
 */
export function buildCave(b, { x, z, y = 0, yaw = 0, R = 5.2, H = 4.0, mouth = 1.3, material, seed = 7 }) {
  const rr = rng(seed);
  const seg = 40, rings = 12;
  const pos = [], idx = [], col = [];
  const noise = (a, t) => Math.sin(a * 3 + seed) * 0.12 + Math.sin(a * 7 + t * 5) * 0.06 + (rr() - 0.5) * 0.04;
  const mouthAng = Math.PI / 2; // entrance on local +z
  const shell = (radius, height, inner) => {
    const base = pos.length / 3;
    for (let j = 0; j <= rings; j++) {
      const t = j / rings; // 0 = ground, 1 = top
      const ph = t * Math.PI / 2;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const k = 1 + noise(a, t) * (inner ? 0.6 : 1);
        let rad = radius * Math.cos(ph) * k + (inner ? 0 : 0.1);
        let yy = height * Math.sin(ph) * (1 + noise(a + 1, t) * 0.3);
        pos.push(Math.cos(a) * rad, yy, Math.sin(a) * rad);
        const shade = inner ? 0.42 + t * 0.15 : 0.82 + t * 0.12;
        col.push(shade, shade * 0.97, shade * 0.92);
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const a0 = (i + 0.5) / seg * Math.PI * 2;
      const t0 = (j + 0.5) / rings;
      // cut the entrance: an arch around the mouth angle, up to ~55% of the height
      let da = Math.abs(((a0 - mouthAng + Math.PI) % (Math.PI * 2)) - Math.PI);
      if (da < mouth / radius * 1.15 && t0 < 0.55) continue;
      const v0 = base + j * (seg + 1) + i, v1 = v0 + 1, v2 = v0 + seg + 1, v3 = v2 + 1;
      if (inner) idx.push(v0, v1, v2, v1, v3, v2); else idx.push(v0, v2, v1, v1, v2, v3);
    }
  };
  shell(R, H, false);
  shell(R - 0.7, H - 0.6, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.rotateY(yaw);
  g.translate(x, y - 0.2, z);
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  m.receiveShadow = true;
  m.layers.set(LAYER.WORLD);
  b.group.add(m);
  // colliders around the wall, leaving the mouth open
  const n = 20;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let da = Math.abs(((a - mouthAng + Math.PI) % (Math.PI * 2)) - Math.PI);
    if (da < mouth / R * 1.25) continue;
    const lx = Math.cos(a) * (R - 0.35), lz = Math.sin(a) * (R - 0.35);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    b.box(x + lx * c + lz * s, y + 1.4, z - lx * s + lz * c, 0.45, 1.6, (Math.PI * 2 * R) / n / 2 + 0.1, { yaw: yaw - a, surface: 'rock' });
  }
  return { mesh: m, inside: [x, z] };
}

/** Floating pontoon walkway from (x0,z0) to (x1,z1) in group space, deck at water + 0.35. */
export function buildPontoon(b, { x0, z0, x1, z1, width = 2.0, seed = 5 }) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const ang = Math.atan2(dx, dz);
  const r = rng(seed);
  const floats = [], deck = [];
  for (let s = 0.6; s < len; s += 1.25) {
    const px = x0 + dx * (s / len), pz = z0 + dz * (s / len);
    floats.push(place(new THREE.BoxGeometry(width - 0.1, 0.4, 1.15), px, -0.05, pz, 0, ang));
  }
  for (let s = 0.1; s < len; s += 0.16) {
    const px = x0 + dx * (s / len), pz = z0 + dz * (s / len);
    deck.push(place(woodBox(width, 0.04, 0.14, { seed: seed * 50 + Math.round(s * 10), tint: [0.75 + r() * 0.15, 0.72 + r() * 0.1, 0.68] }), px, 0.32, pz, ang + Math.PI / 2));
  }
  b.geo(merge(floats), b.M.pontoon);
  b.geo(merge(deck), b.M.wood);
  b.box((x0 + x1) / 2, 0.17, (z0 + z1) / 2, width / 2, 0.17, len / 2, { yaw: ang, walkable: true, solid: false });
  return { ang, len };
}
