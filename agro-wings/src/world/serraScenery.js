// Serra das Bananeiras — the map's own visuals (three.js side of
// src/world/serra.js): the forest canopy with its organic outline and the
// banana plantations. Built only when the Serra is the active map.
//
// Banana plants: a small library of shared geometries (three detailed
// variants, one light far version), GPU-instanced per 96 m cell of a
// plantation. A cell's meshes are created when the camera comes within
// reach and disposed far behind; near cells draw the detailed variant, the
// others the light one (the two share one instance buffer), and distant
// cells draw a share of their plants only. No per-plant animation, no
// collider per plant (a talhão's canopy height is the field's crop height).
import * as THREE from 'three';
import { fbm, valueNoise, smoothstep, rng, lerp } from '../core/math.js';
import { serraWild, SERRA_FIELDS, SERRA_GROVES, SERRA_WORLD_HALF } from './serra.js';

// ---------------------------------------------------------------- canopy
// Roof of the forest on a 20 m grid wherever the forest density is above
// zero: full height inside, coming down to the ground along the outline
// (where the edge trees stand). Same vertex format as the engine's forest
// roofs (vegetation.js merges and draws them with its canopy material).
// Returns [{ g, key }] per 1 km tile, and the density grid for the trees.
export function serraCanopy(terrain) {
  const S = 20, H = SERRA_WORLD_HALF - 20, N = Math.floor((2 * H) / S) + 1;
  const hOf = (x, z) => terrain.heightAt(x, z);
  const w = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) w[j * N + i] = serraWild(-H + i * S, -H + j * S, hOf);
  const at = (x, z) => { const i = Math.round((x + H) / S), j = Math.round((z + H) / S); return i < 0 || j < 0 || i >= N || j >= N ? 0 : w[j * N + i]; };
  const TILE = 1000, tiles = new Map();
  const vert = (i, j) => {
    const x = -H + i * S, z = -H + j * S, d = w[j * N + i];
    const lump = fbm(x / 16, z / 16, 3), big = fbm(x / 120 + 4, z / 120, 2);
    const full = 17 + 4 * big + 3.2 * lump;
    const up = smoothstep(0.03, 0.6, d);
    const k = 0.72 + 0.3 * (lump * 0.5 + 0.5) + 0.1 * big, tint = fbm(x / 60, z / 60 + 9, 2), dry = fbm(x / 200 - 3, z / 200 + 1, 2);
    const shade = lerp(0.72, 1, smoothstep(0.02, 0.4, d));
    return {
      p: [x, terrain.heightAt(x, z) + (d <= 0.001 ? -0.8 : -0.8 + (full + 0.8) * up), z],
      c: [0.92 * k * (1 + Math.max(0, tint) * 0.3 + Math.max(0, dry) * 0.2) * shade, 1.42 * k * shade, 0.7 * k * (1 - Math.max(0, dry) * 0.2) * shade],
      uv: [x / 48, z / 48], mix: 0.5 + 0.5 * fbm(x / 90 + 7, z / 90 - 2, 2) * 1.6,
    };
  };
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    if (Math.max(w[j * N + i], w[j * N + i + 1], w[(j + 1) * N + i], w[(j + 1) * N + i + 1]) <= 0.02) continue;
    const key = Math.floor((-H + i * S) / TILE) + ',' + Math.floor((-H + j * S) / TILE);
    let t = tiles.get(key); if (!t) tiles.set(key, (t = { pos: [], col: [], uv: [], mix: [] }));
    const a = vert(i, j), d = vert(i + 1, j), b = vert(i, j + 1), c = vert(i + 1, j + 1);
    for (const v of [a, b, d, b, c, d]) { t.pos.push(...v.p); t.col.push(...v.c); t.uv.push(...v.uv); t.mix.push(v.mix); }
  }
  const parts = [];
  for (const [key, t] of tiles) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(t.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(t.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(t.uv, 2));
    g.setAttribute('aMix', new THREE.Float32BufferAttribute(t.mix, 1));
    g.computeVertexNormals();
    parts.push({ g, key: 'serra ' + key });
  }
  return { parts, density: at };
}

// ---------------------------------------------------------------- banana plant
// One plant: the pseudostem and a crown of large arching leaves (each a
// strip folded along its midrib). lod 0: 7 leaves × 3 segments; lod 1: 5
// leaves × 2 flat segments. Vertex colours carry the greens.
function bananaGeo(seed, lod) {
  const r = rng(seed), pos = [], col = [], idx = [];
  const V = (x, y, z, c) => { pos.push(x, y, z); col.push(c[0], c[1], c[2]); return pos.length / 3 - 1; };
  const quad = (a, b, c, d) => idx.push(a, b, c, a, c, d);
  // Pseudostem (tapered, slightly leaning).
  const SH = 1.9 + r() * 0.5, sides = lod ? 4 : 6, lean = [(r() - 0.5) * 0.18, (r() - 0.5) * 0.18];
  const stemC0 = [0.05, 0.055, 0.025], stemC1 = [0.08, 0.12, 0.04];
  const ring0 = [], ring1 = [];
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2;
    ring0.push(V(Math.cos(a) * 0.17, -0.2, Math.sin(a) * 0.17, stemC0));
    ring1.push(V(lean[0] + Math.cos(a) * 0.085, SH, lean[1] + Math.sin(a) * 0.085, stemC1));
  }
  for (let k = 0; k < sides; k++) quad(ring0[k], ring1[k], ring1[(k + 1) % sides], ring0[(k + 1) % sides]);
  // Leaves.
  const NL = lod ? 5 : 7, SEG = lod ? 2 : 3;
  for (let i = 0; i < NL; i++) {
    const az = i * 2.399963 + r() * 0.5, age = (i + r() * 0.6) / NL; // 0 young (upright) … 1 old (drooping)
    const L = 2.4 + r() * 0.9, Wd = (lod ? 0.7 : 0.52) + r() * 0.14;
    const th0 = 0.1 + age * 0.6, th1 = th0 + 0.7 + age * 1.0 + r() * 0.3; // angle from vertical at the base and tip
    const ca = Math.cos(az), sa = Math.sin(az);
    const g0 = 0.82 + r() * 0.3, dry = age > 0.8 && r() < 0.5;
    const cMid = dry ? [0.13, 0.11, 0.04] : [0.022 * g0, 0.082 * g0, 0.018 * g0], cEdge = dry ? [0.16, 0.13, 0.05] : [0.034 * g0, 0.112 * g0, 0.024 * g0], cRib = [0.075 * g0, 0.16 * g0, 0.045 * g0];
    let px = lean[0], py = SH - 0.05, pz = lean[1];
    let prev = null;
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG, th = th0 + (th1 - th0) * t * t;
      if (s > 0) { const dl = L / SEG; px += ca * Math.sin(th) * dl; pz += sa * Math.sin(th) * dl; py += Math.cos(th) * dl; }
      const hw = Wd * (s === 0 ? 0.16 : s === SEG ? 0.3 : 1) * (0.9 + 0.2 * Math.sin(t * Math.PI));
      const wx = -sa * hw, wz = ca * hw;
      const row = lod
        ? [V(px + wx, py, pz + wz, cEdge), V(px - wx, py, pz - wz, cMid)]
        : [V(px + wx, py + 0.07 * hw / Wd, pz + wz, cEdge), V(px, py - 0.03, pz, cRib), V(px - wx, py + 0.07 * hw / Wd, pz - wz, cEdge)];
      if (prev) for (let q = 0; q < row.length - 1; q++) quad(prev[q], row[q], row[q + 1], prev[q + 1]);
      prev = row;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- plantations
const CELL = 96;
// Share of the plants drawn and near radius per graphics profile (LOW …
// HIGH / ULTRA): quality.treeNear tells the profiles apart.
const profileOf = (q) => (q.treeNear >= 800 ? { dens: 1, near: 150, far: 2600 } : q.treeNear >= 550 ? { dens: 0.78, near: 115, far: 2300 } : { dens: 0.5, near: 80, far: 1900 });

export function createBananas(terrain, quality) {
  const group = new THREE.Group();
  group.name = 'bananas';
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const hiGeo = [bananaGeo(101, 0), bananaGeo(202, 0), bananaGeo(303, 0)], loGeo = bananaGeo(404, 1);
  // Plants per cell: rows along the plot's row axis, jittered, with small
  // gaps; the order inside a cell is shuffled so drawing the first share
  // of the buffer thins the cell evenly.
  const cells = new Map();
  const rects = [...SERRA_FIELDS.map((f) => ({ ...f, sp: 3.0 })), ...SERRA_GROVES.map((f) => ({ ...f, sp: 3.7 }))];
  for (const f of rects) {
    const alongX = f.rowAxis !== 'z', sp = f.sp;
    const u0 = alongX ? f.x0 : f.z0, u1 = alongX ? f.x1 : f.z1, v0 = alongX ? f.z0 : f.x0, v1 = alongX ? f.z1 : f.x1;
    let row = 0;
    for (let v = v0 + sp * 0.5; v < v1; v += sp, row++) {
      for (let u = u0 + sp * 0.5 + (row % 2) * sp * 0.5; u < u1; u += sp * 0.94) {
        const ju = u + valueNoise(u * 0.71 + 3.3, v * 0.53 - 1.2) * 0.7, jv = v + valueNoise(u * 0.37 - 5.1, v * 0.91 + 2.4) * 0.5;
        const x = alongX ? ju : jv, z = alongX ? jv : ju;
        if (valueNoise(x / 19 + 8.8, z / 19 - 3.1) > 0.74) continue; // gaps
        const key = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
        let c = cells.get(key); if (!c) cells.set(key, (c = { key, list: [], cx: (Math.floor(x / CELL) + 0.5) * CELL, cz: (Math.floor(z / CELL) + 0.5) * CELL, hi: null, lo: null }));
        c.list.push(x, z, (sp / 3.0) * (0.82 + 0.4 * (0.5 + 0.5 * valueNoise(x / 31 - 2.2, z / 31 + 6.6)) + 0.12 * valueNoise(x * 1.7, z * 1.3)));
      }
    }
  }
  let total = 0;
  for (const c of cells.values()) {
    const n = c.list.length / 3, r = rng(1000 + ((c.cx * 31 + c.cz * 17) | 0)), L = c.list;
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); for (let k = 0; k < 3; k++) { const t = L[i * 3 + k]; L[i * 3 + k] = L[j * 3 + k]; L[j * 3 + k] = t; } }
    c.n = n; total += n;
    c.cy = terrain.heightAt(c.cx, c.cz);
    c.variant = Math.abs((c.cx * 7 + c.cz * 13) | 0) % hiGeo.length;
  }
  const list = [...cells.values()];
  let P = profileOf(quality);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const stats = { cells: list.length, plants: total, built: 0, builtTotal: 0, released: 0 };
  const build = (c) => {
    const arr = new Float32Array(c.n * 16);
    for (let i = 0; i < c.n; i++) {
      const x = c.list[i * 3], z = c.list[i * 3 + 1], sc = c.list[i * 3 + 2];
      e.set((valueNoise(x * 0.9, z * 0.9) * 0.08), valueNoise(x * 2.1 + 1, z * 2.3) * Math.PI * 2, valueNoise(x * 0.8 + 4, z * 0.7) * 0.08);
      m4.compose(p.set(x, terrain.heightAt(x, z), z), q.setFromEuler(e), s.set(sc, sc * (0.92 + 0.16 * valueNoise(x * 0.5, z * 0.5 + 9)), sc));
      m4.toArray(arr, i * 16);
    }
    const im = new THREE.InstancedBufferAttribute(arr, 16);
    const mk = (geo) => {
      const m = new THREE.InstancedMesh(geo, mat, c.n);
      m.instanceMatrix = im;
      m.frustumCulled = true;
      m.geometry.boundingSphere ??= new THREE.Sphere();
      m.boundingSphere = new THREE.Sphere(new THREE.Vector3(c.cx, c.cy, c.cz), CELL * 0.75 + 40);
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      group.add(m);
      return m;
    };
    c.hi = mk(hiGeo[c.variant]); c.lo = mk(loGeo);
    stats.built++; stats.builtTotal++;
  };
  const release = (c) => {
    for (const m of [c.hi, c.lo]) { group.remove(m); m.dispose(); }
    c.hi = c.lo = null;
    stats.built--; stats.released++;
  };
  return {
    group, stats: () => ({ ...stats }),
    setQuality(qq) { P = profileOf(qq); },
    // All cells in reach built at once (tests / captures).
    buildAll() { for (const c of list) if (!c.hi) build(c); },
    update(camera) {
      const cp = camera.position;
      let budget = 3;
      for (const c of list) {
        const d = Math.hypot(c.cx - cp.x, c.cz - cp.z, (c.cy - cp.y) * 0.6);
        if (!c.hi) { if (d < P.far && budget > 0) { build(c); budget--; } else continue; }
        else if (d > P.far + 500) { release(c); continue; }
        const near = d < P.near + CELL * 0.7;
        c.hi.visible = near; c.lo.visible = !near && d < P.far;
        // Far cells draw a share of their plants (the buffer is shuffled).
        const share = P.dens * (near ? 1 : 1 - 0.55 * smoothstep(500, 1500, d));
        const count = Math.max(1, Math.round(c.n * share));
        c.hi.count = count; c.lo.count = count;
      }
    },
  };
}
