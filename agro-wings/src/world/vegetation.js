// Trees and forest. Big native forest blocks ("mata", legal reserve) are a
// lumpy canopy surface (cheap from the air) wrapped in instanced trees along
// the edges plus emergent crowns. Planted eucalyptus windbreaks, isolated
// shade trees, yellow ipês near the house and buriti palms by the creek.
// Instanced in 500 m cells with two LODs; a separate collision index keeps
// obstacles cheap and independent from what is drawn.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FORESTS, CREEK, FIELDS, HQ, BASE, ROADS, RUNWAY } from './layout.js';
import { rng, fbm, segDist } from '../core/math.js';

const CELL = 500;

function colorize(g, c, jitter = 0.08, seed = 1) {
  const r = rng(seed);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const p = g.attributes.position;
  for (let i = 0; i < n; i++) {
    const k = 1 - jitter + r() * jitter * 2;
    const y = p.getY(i);
    col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
    void y;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function lumpy(radius, detail, seed, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const p = g.attributes.position;
  const r = rng(seed);
  const o = r() * 100;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.22 * fbm(x * 0.9 + o, z * 0.9 + y * 0.7, 2);
    p.setXYZ(i, x * n * sx, y * n * sy, z * n * sz);
  }
  g.computeVertexNormals();
  return g;
}

function crownShade(g, base, top) {
  // Darker underside, lighter sunlit top: cheap volumetric feel.
  const p = g.attributes.position;
  const col = g.attributes.color;
  g.computeBoundingBox();
  const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - y0) / Math.max(0.01, y1 - y0);
    const k = base + (top - base) * t;
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
}

function broadleaf(hi, seed, crownCol, height = 1, spread = 1) {
  const r = rng(seed);
  const parts = [];
  const trunkH = 4.5 * height;
  const trunk = new THREE.CylinderGeometry(0.22, 0.38, trunkH, hi ? 7 : 4, 1);
  trunk.translate(0, trunkH / 2, 0);
  parts.push(colorize(trunk, new THREE.Color(0.12, 0.085, 0.06), 0.1, seed));
  const blobs = hi ? 5 + Math.floor(r() * 3) : 2;
  for (let i = 0; i < blobs; i++) {
    const rad = (hi ? 2.0 + r() * 1.3 : 3.2) * spread;
    const b = lumpy(rad, hi ? 1 : 0, seed * 13 + i, 1, 0.78, 1);
    const a = r() * Math.PI * 2, d = hi ? r() * 2.4 * spread : (i ? 1.6 : -0.8) * spread;
    b.translate(Math.cos(a) * d, trunkH + 1.2 + r() * 2.6 * height, Math.sin(a) * d);
    const k = 0.8 + r() * 0.35;
    colorize(b, new THREE.Color(crownCol.r * k, crownCol.g * k, crownCol.b * k), 0.12, seed + i);
    parts.push(b);
  }
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  crownShade(g, 0.55, 1.15);
  return g;
}

function eucalyptus(hi, seed) {
  const r = rng(seed);
  const parts = [];
  const H = 22 + r() * 6;
  const trunk = new THREE.CylinderGeometry(0.14, 0.3, H * 0.8, hi ? 6 : 3, 1);
  trunk.translate(0, H * 0.4, 0);
  parts.push(colorize(trunk, new THREE.Color(0.30, 0.26, 0.20), 0.1, seed));
  const n = hi ? 5 : 2;
  for (let i = 0; i < n; i++) {
    const b = lumpy(hi ? 1.5 + r() * 0.8 : 2.2, hi ? 1 : 0, seed + i * 7, 0.9, 1.7, 0.9);
    b.translate((r() - 0.5) * 2.2, H * (0.6 + i * (0.4 / n)) + (r() - 0.5), (r() - 0.5) * 2.2);
    colorize(b, new THREE.Color(0.055, 0.11, 0.035), 0.15, seed + i);
    parts.push(b);
  }
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  crownShade(g, 0.6, 1.1);
  return g;
}

function buriti(hi, seed) {
  const r = rng(seed);
  const parts = [];
  const H = 11 + r() * 5;
  const trunk = new THREE.CylinderGeometry(0.28, 0.34, H, hi ? 7 : 4, 1);
  trunk.translate(0, H / 2, 0);
  parts.push(colorize(trunk, new THREE.Color(0.30, 0.26, 0.21), 0.08, seed));
  const fronds = hi ? 12 : 6;
  for (let i = 0; i < fronds; i++) {
    // Fan leaf: a flattened, tilted cone.
    const f = new THREE.ConeGeometry(1.9, 3.2, hi ? 6 : 3, 1, true);
    f.scale(1, 1, 0.18);
    f.rotateX(Math.PI / 2 + 0.6 + r() * 0.5);
    f.rotateY((i / fronds) * Math.PI * 2 + r() * 0.3);
    f.translate(0, H + 0.4, 0);
    colorize(f, new THREE.Color(0.07, 0.14, 0.03), 0.15, seed + i);
    parts.push(f);
  }
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  return g;
}

function bush(seed) {
  const b = lumpy(1.1, 0, seed, 1.2, 0.7, 1.2);
  b.translate(0, 0.6, 0);
  colorize(b, new THREE.Color(0.08, 0.13, 0.03), 0.15, seed);
  crownShade(b, 0.6, 1.1);
  return b.index ? b.toNonIndexed() : b;
}

// Variants per kind: [hi, lo] geometry pairs.
function buildVariants() {
  const mata = [new THREE.Color(0.06, 0.13, 0.025), new THREE.Color(0.045, 0.10, 0.02), new THREE.Color(0.09, 0.15, 0.03)];
  const v = {
    mata: [0, 1, 2, 3].map((i) => [broadleaf(true, 11 + i, mata[i % 3], 1.3 + 0.15 * i, 1.1), broadleaf(false, 11 + i, mata[i % 3], 1.3 + 0.15 * i, 1.1)]),
    shade: [0, 1].map((i) => [broadleaf(true, 41 + i, new THREE.Color(0.07, 0.15, 0.03), 0.9, 1.4), broadleaf(false, 41 + i, new THREE.Color(0.07, 0.15, 0.03), 0.9, 1.4)]),
    ipe: [[broadleaf(true, 61, new THREE.Color(0.75, 0.45, 0.02), 1.0, 1.15), broadleaf(false, 61, new THREE.Color(0.75, 0.45, 0.02), 1.0, 1.15)]],
    euca: [0, 1].map((i) => [eucalyptus(true, 71 + i), eucalyptus(false, 71 + i)]),
    buriti: [0, 1].map((i) => [buriti(true, 81 + i), buriti(false, 81 + i)]),
    bush: [[bush(91), bush(91)], [bush(92), bush(92)]],
  };
  return v;
}

export function createVegetation(terrain, quality) {
  const group = new THREE.Group();
  group.name = 'vegetation';
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const variants = buildVariants();
  const r = rng(2024);
  const trees = []; // {kind, v, x, z, s, rot}
  const colliders = []; // {x, z, r, top}

  const avoid = (x, z, m = 6) => {
    if (Math.abs(z) < 60 && x > RUNWAY.x0 - 250 && x < RUNWAY.x1 + 250) return true; // strip approach
    if (x > BASE.apron.x0 - 30 && x < BASE.apron.x1 + 30 && z > BASE.apron.z0 - 50 && z < 30) return true;
    for (const f of FIELDS) if (x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m) return true;
    for (const rd of ROADS) for (let i = 0; i < rd.pts.length - 1; i++) {
      if (segDist(x, z, rd.pts[i][0], rd.pts[i][1], rd.pts[i + 1][0], rd.pts[i + 1][1]) < rd.w / 2 + 3) return true;
    }
    return false;
  };
  const add = (kind, x, z, s = 1) => {
    const vs = variants[kind];
    trees.push({ kind, v: Math.floor(r() * vs.length), x, z, s, rot: r() * Math.PI * 2 });
  };

  // --- forest blocks -------------------------------------------------------
  const canopyParts = [];
  for (const fb of FORESTS) {
    if (fb.kind === 'eucalyptus') {
      for (let x = fb.x0 + 2; x < fb.x1; x += 4.2) for (let z = fb.z0 + 2; z < fb.z1; z += 4.2) {
        const jx = x + (r() - 0.5) * 1.2, jz = z + (r() - 0.5) * 1.2;
        if (!avoid(jx, jz, 2)) add('euca', jx, jz, 0.9 + r() * 0.25);
      }
      colliders.push({ box: fb, top: 30 });
      continue;
    }
    const w = fb.x1 - fb.x0, d = fb.z1 - fb.z0;
    const narrow = Math.min(w, d) < 120;
    if (!narrow) canopyParts.push(forestCanopy(fb, terrain));
    // Edge trees, two staggered rows facing inward; emergents inside.
    const spacing = 7.5;
    const sides = [
      [fb.x0, fb.z0, fb.x1, fb.z0, 0, 1], [fb.x1, fb.z0, fb.x1, fb.z1, -1, 0],
      [fb.x1, fb.z1, fb.x0, fb.z1, 0, -1], [fb.x0, fb.z1, fb.x0, fb.z0, 1, 0],
    ];
    for (const [ax, az, bx, bz, ix, iz] of sides) {
      const len = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s < len; s += spacing) {
        const t = s / len, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        for (let row = 0; row < 2; row++) {
          const off = 2 + row * 6 + r() * 2;
          const px = x + ix * off + (r() - 0.5) * 3, pz = z + iz * off + (r() - 0.5) * 3;
          if (!avoid(px, pz, 3)) add('mata', px, pz, 0.85 + r() * 0.45);
        }
      }
    }
    if (narrow) {
      for (let x = fb.x0 + 6; x < fb.x1 - 4; x += 8) for (let z = fb.z0 + 6; z < fb.z1 - 4; z += 8) {
        const jx = x + (r() - 0.5) * 5, jz = z + (r() - 0.5) * 5;
        if (!avoid(jx, jz, 3)) add('mata', jx, jz, 0.9 + r() * 0.4);
      }
    } else {
      const n = Math.floor((w * d) / 1800);
      for (let i = 0; i < n; i++) add('mata', fb.x0 + 20 + r() * (w - 40), fb.z0 + 20 + r() * (d - 40), 1.25 + r() * 0.4);
    }
    colliders.push({ box: fb, top: narrow ? 21 : 24 });
  }

  // --- riparian strip along the creek: buritis + mixed trees ---------------
  const cp = CREEK.points;
  for (let i = 0; i < cp.length - 1; i++) {
    const [ax, az] = cp[i], [bx, bz] = cp[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    for (let s = 0; s < len; s += 9) {
      const t = s / len;
      const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
      const nearCotton = Math.abs(pz) < 170 && px > 1500 && px < 1800;
      for (const side of [-1, 1]) {
        const off = 7 + r() * (nearCotton ? 18 : 40);
        const x = px + nx * off * side, z = pz + nz * off * side;
        if (avoid(x, z, 4)) continue;
        const k = r();
        if (nearCotton) { if (k < 0.55) add('buriti', x, z, 0.9 + r() * 0.3); else if (k < 0.7) add('bush', x, z, 1 + r()); }
        else if (k < 0.3) add('buriti', x, z, 0.9 + r() * 0.3);
        else add('mata', x, z, 0.9 + r() * 0.4);
        colliders.push({ x, z, r: 3, top: terrain.heightAt(x, z) + (nearCotton ? 15 : 20) });
      }
    }
  }

  // --- isolated trees, ipês, bushes ---------------------------------------
  const hx = HQ.house.x, hz = HQ.house.z;
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2, d = 35 + r() * 60;
    add(i % 3 === 0 ? 'ipe' : 'shade', hx + Math.cos(a) * d, hz + Math.sin(a) * d, 0.9 + r() * 0.3);
  }
  // Shade trees by the base: a big one over the crew bench.
  add('shade', BASE.crewPost.x + 8, BASE.crewPost.z - 14, 1.2);
  add('ipe', BASE.hangar.x + 30, BASE.hangar.z - 6, 1.0);
  add('shade', BASE.hangar.x - 34, BASE.hangar.z + 10, 1.1);
  for (let i = 0; i < 160; i++) {
    const x = -3600 + r() * 7200, z = -3600 + r() * 7200;
    if (avoid(x, z, 25)) continue;
    add(r() < 0.12 ? 'ipe' : 'shade', x, z, 0.9 + r() * 0.5);
  }
  for (let i = 0; i < 700; i++) {
    const x = -2600 + r() * 5600, z = -2600 + r() * 5200;
    if (avoid(x, z, 6)) continue;
    add('bush', x, z, 0.45 + r() * 0.6);
  }
  for (const t of trees) if (t.kind === 'shade' || t.kind === 'ipe') colliders.push({ x: t.x, z: t.z, r: 4.5 * t.s, top: terrain.heightAt(t.x, t.z) + 11 * t.s });

  // --- build instanced cells ----------------------------------------------
  const cells = new Map();
  for (const t of trees) {
    const key = Math.floor(t.x / CELL) + ',' + Math.floor(t.z / CELL);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(t);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const cellObjs = [];
  for (const [key, list] of cells) {
    const [cx, cz] = key.split(',').map(Number);
    const center = new THREE.Vector3((cx + 0.5) * CELL, 0, (cz + 0.5) * CELL);
    const hi = new THREE.Group(), lo = new THREE.Group();
    const byVar = new Map();
    for (const t of list) {
      const k = t.kind + ':' + t.v;
      if (!byVar.has(k)) byVar.set(k, []);
      byVar.get(k).push(t);
    }
    for (const [k, ts] of byVar) {
      const [kind, v] = k.split(':');
      const [gh, gl] = variants[kind][+v];
      for (const [grp, geo] of [[hi, gh], [lo, gl]]) {
        const im = new THREE.InstancedMesh(geo, mat, ts.length);
        ts.forEach((t, i) => {
          pos.set(t.x, terrain.heightAt(t.x, t.z) - 0.3, t.z);
          q.setFromAxisAngle(UP, t.rot);
          sc.setScalar(t.s);
          im.setMatrixAt(i, m4.compose(pos, q, sc));
        });
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        im.castShadow = grp === hi && kind !== 'bush';
        im.receiveShadow = grp === hi;
        grp.add(im);
      }
    }
    group.add(hi); group.add(lo);
    cellObjs.push({ center, hi, lo });
  }
  if (canopyParts.length) {
    const cg = mergeGeometries(canopyParts);
    const cm = new THREE.Mesh(cg, mat);
    cm.receiveShadow = true;
    cm.name = 'forestCanopy';
    group.add(cm);
  }

  let near = quality.treeNear;
  const far = 1800;
  return {
    group,
    colliders,
    count: trees.length,
    setQuality(qq) { near = qq.treeNear; },
    update(camera) {
      const p = camera.position;
      for (const c of cellObjs) {
        const d = Math.hypot(c.center.x - p.x, c.center.z - p.z) - CELL * 0.6;
        c.hi.visible = d < near;
        c.lo.visible = !c.hi.visible && d < far;
      }
    },
  };
}

function forestCanopy(fb, terrain) {
  const step = 10;
  const inset = 6;
  const x0 = fb.x0 + inset, x1 = fb.x1 - inset, z0 = fb.z0 + inset, z1 = fb.z1 - inset;
  const nx = Math.ceil((x1 - x0) / step) + 1, nz = Math.ceil((z1 - z0) / step) + 1;
  const pos = [], col = [], idx = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = Math.min(x1, x0 + i * step), z = Math.min(z1, z0 + j * step);
    const edge = Math.min(x - x0, x1 - x, z - z0, z1 - z);
    const lump = fbm(x / 16, z / 16, 3), big = fbm(x / 120 + 4, z / 120, 2);
    const h = edge < 0.5 ? 4 : 17 + 4 * big + 3.2 * lump;
    pos.push(x, terrain.heightAt(x, z) + h, z);
    const k = 0.7 + 0.35 * (lump * 0.5 + 0.5) + 0.1 * big;
    const tint = fbm(x / 60, z / 60 + 9, 2);
    col.push(0.05 * k * (1 + Math.max(0, tint) * 0.8), 0.105 * k, 0.025 * k);
  }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, d = a + 1, b = a + nx, c = b + 1;
    idx.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

// Obstacle test used by the aircraft (trees only; structures register their own).
export function makeTreeCollider(veg) {
  const grid = new Map();
  const boxes = [];
  for (const c of veg.colliders) {
    if (c.box) { boxes.push(c); continue; }
    const key = Math.floor(c.x / 50) + ',' + Math.floor(c.z / 50);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(c);
  }
  return (x, y, z, terrainH) => {
    for (const b of boxes) {
      const f = b.box;
      if (x > f.x0 + 3 && x < f.x1 - 3 && z > f.z0 + 3 && z < f.z1 - 3 && y < terrainH + b.top - 3) return 'trees';
    }
    const gx = Math.floor(x / 50), gz = Math.floor(z / 50);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const l = grid.get(gx + i + ',' + (gz + j));
      if (!l) continue;
      for (const c of l) if (y < c.top && Math.hypot(x - c.x, z - c.z) < c.r) return 'tree';
    }
    return null;
  };
}
