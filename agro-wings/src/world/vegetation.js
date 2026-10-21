// Trees and forest. Big native forest blocks ("mata", legal reserve) are a
// lumpy canopy surface (cheap from the air) wrapped in instanced trees along
// the edges plus emergent crowns. Planted eucalyptus windbreaks, isolated
// shade trees, yellow ipês near the house and buriti palms by the creek.
// Instanced in 500 m cells with two LODs; a separate collision index keeps
// obstacles cheap and independent from what is drawn.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FORESTS, CREEK, FIELDS, HQ, BASE, ROADS, RUNWAY, FARM_SITES, WATER, pondRadius } from './layout.js';
import { reliefWeights } from './relief.js';
import { rng, fbm, segDist } from '../core/math.js';
import {
  makeFoliageAtlas, makeCanopyTexture, foliageMaterial, tileRect, TILES,
  broadTree, mangoTree, ipeTree, eucalyptusTree, buritiPalm, shrub,
} from './foliage.js';

const C = (r, g, b) => new THREE.Color(r, g, b);

const CELL = 500;

// Variants per kind: [hi, lo] geometry pairs, all card-built (foliage.js).
function buildVariants() {
  const tints = [C(1, 1, 1), C(0.88, 1.0, 0.86), C(1.08, 1.04, 0.9), C(0.84, 0.94, 0.92)];
  const pair = (fn) => [fn(true), fn(false)];
  return {
    mata: [0, 1, 2, 3].map((i) => pair((hi) => broadTree(hi, 11 + i, {
      height: 1.25 + 0.08 * (i % 3), spread: 1.05 + 0.1 * (i % 2), tint: tints[i % 4],
      tiles: i === 2 ? [...TILES.fine, TILES.broad[2]] : [TILES.broad[i], TILES.broad[(i + 1) % 4]],
    }))),
    shade: [
      pair((hi) => mangoTree(hi, 41)),
      pair((hi) => broadTree(hi, 42, { height: 0.85, spread: 1.45, girth: 1.4, tiles: [...TILES.fine, TILES.broad[1]], tint: C(0.95, 1.0, 0.9) })),
    ],
    ipe: [pair((hi) => ipeTree(hi, 61))],
    euca: [0, 1].map((i) => pair((hi) => eucalyptusTree(hi, 71 + i))),
    buriti: [0, 1].map((i) => pair((hi) => buritiPalm(hi, 81 + i))),
    bush: [0, 1].map((i) => pair((hi) => shrub(hi, 91 + i))),
    mound: [(() => { const g = termiteMound(95); return [g, g]; })()],
  };
}

// Cupinzeiro: lumpy red-earth cone, iconic in Mato Grosso pastures.
function termiteMound(seed) {
  const r = rng(seed);
  const g = new THREE.ConeGeometry(0.55, 1.0, 9, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.18 * fbm(x * 3 + seed, z * 3 + y * 2, 2);
    p.setXYZ(i, x * k * (1 + (0.5 - y) * 0.25), y + 0.5, z * k);
  }
  g.computeVertexNormals();
  const [u0, v0, u1, v1] = tileRect(TILES.bark);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v0 + (v1 - v0) * uv.getY(i));
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = 0.9 + r() * 0.2;
    col[i * 3] = 2.3 * k; col[i * 3 + 1] = 1.12 * k; col[i * 3 + 2] = 0.72 * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function createVegetation(terrain, quality) {
  const group = new THREE.Group();
  group.name = 'vegetation';
  const atlas = makeFoliageAtlas();
  const mat = foliageMaterial(atlas);
  const variants = buildVariants();
  const r = rng(2024);
  const trees = []; // {kind, v, x, z, s, rot}
  const colliders = []; // {x, z, r, top}

  // The original farm's fields and roads: the placement below draws its random
  // numbers against these only, so every tree of the original farm stays
  // exactly where it was. Trees that the outer fields, their pass corridors
  // and the outer roads now claim are removed afterwards (see `cleared`).
  const FIELDS0 = FIELDS.filter((f) => f.level === 1 && !f.farm), ROADS0 = ROADS.filter((rd) => !rd.mesh);
  const avoid = (x, z, m = 6) => {
    if (Math.abs(z) < 60 && x > RUNWAY.x0 - 250 && x < RUNWAY.x1 + 250) return true; // strip approach
    if (x > BASE.apron.x0 - 30 && x < BASE.apron.x1 + 30 && z > BASE.apron.z0 - 50 && z < 30) return true;
    for (const f of FIELDS0) if (x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m) return true;
    for (const rd of ROADS0) for (let i = 0; i < rd.pts.length - 1; i++) {
      if (segDist(x, z, rd.pts[i][0], rd.pts[i][1], rd.pts[i + 1][0], rd.pts[i + 1][1]) < rd.w / 2 + 3) return true;
    }
    return false;
  };
  // Outer (level 2/3) fields with their run-in corridors along the passes,
  // and the outer access roads: kept clear of trees (low scrub may stay
  // outside the fields themselves).
  const FIELDS2 = FIELDS.filter((f) => f.level > 1 || f.farm), ROADS2 = ROADS.filter((rd) => rd.mesh);
  const cleared = (x, z, tall = true, m = 6) => {
    // Secondary farm strips: service area, strip and its approaches.
    for (const s of FARM_SITES) {
      const r = s.runway;
      if (x > s.apron.x0 - 40 && x < s.apron.x1 + 30 && z > s.apron.z0 - 40 && z < r.z + 30) return true;
      if (Math.abs(z - r.z) < (tall ? 60 : r.width / 2 + 8) && x > r.x0 - (tall ? 300 : 20) && x < r.x1 + (tall ? 300 : 20)) return true;
    }
    for (const f of FIELDS2) {
      if (x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m) return true;
      if (!tall || !f.contract) continue;
      const along = f.rowAxis === 'x';
      const a = along ? x : z, c = along ? z : x;
      const a0 = along ? f.x0 : f.z0, a1 = along ? f.x1 : f.z1, c0 = along ? f.z0 : f.x0, c1 = along ? f.z1 : f.x1;
      if (c > c0 - 35 && c < c1 + 35 && a > a0 - 600 && a < a1 + 600) return true;
    }
    for (const rd of ROADS2) for (let i = 0; i < rd.pts.length - 1; i++) {
      if (segDist(x, z, rd.pts[i][0], rd.pts[i][1], rd.pts[i + 1][0], rd.pts[i + 1][1]) < rd.w / 2 + 3) return true;
    }
    return false;
  };
  const isTall = (kind) => kind !== 'bush' && kind !== 'mound';
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
        if (avoid(jx, jz, 2)) continue;
        add('euca', jx, jz, 0.9 + r() * 0.25);
        colliders.push({ x: jx, z: jz, r: 2.6, top: terrain.heightAt(jx, jz) + 27 });
      }
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
      // Cleared crossing between the cotton talhões: only low scrub there.
      const nearCotton = Math.abs(pz) < 150 && px > 1500 && px < 1800;
      for (const side of [-1, 1]) {
        const off = 7 + r() * (nearCotton ? 18 : 40);
        const x = px + nx * off * side, z = pz + nz * off * side;
        if (avoid(x, z, 4)) continue;
        const k = r();
        if (nearCotton) { if (k < 0.5) add('bush', x, z, 0.8 + r() * 0.6); continue; }
        if (k < 0.3) add('buriti', x, z, 0.9 + r() * 0.3);
        else add('mata', x, z, 0.9 + r() * 0.4);
        colliders.push({ x, z, r: 3, top: terrain.heightAt(x, z) + 20 });
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

  // --- extra natural detail (own random stream: the trees above, and their
  // colliders, stay exactly where they were) ---------------------------------
  const r2 = rng(5150);
  const add2 = (kind, x, z, s = 1) => {
    trees.push({ kind, v: Math.floor(r2() * variants[kind].length), x, z, s, rot: r2() * Math.PI * 2 });
  };
  for (const fb of FORESTS) {
    if (fb.kind !== 'mata') continue;
    const sides = [
      [fb.x0, fb.z0, fb.x1, fb.z0, 0, 1], [fb.x1, fb.z0, fb.x1, fb.z1, -1, 0],
      [fb.x1, fb.z1, fb.x0, fb.z1, 0, -1], [fb.x0, fb.z1, fb.x0, fb.z0, 1, 0],
    ];
    for (const [ax, az, bx, bz, ix, iz] of sides) {
      const len = Math.hypot(bx - ax, bz - az);
      for (let s = r2() * 4; s < len; s += 3 + r2() * 5) {
        const t = s / len, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        // Shrubby forest border (capoeira) just outside and inside the edge.
        const off = -1.5 + r2() * 4;
        const px = x + ix * off + (r2() - 0.5) * 2, pz = z + iz * off + (r2() - 0.5) * 2;
        if (!avoid(px, pz, 1)) add2('bush', px, pz, 0.7 + r2() * 0.9);
        // Irregular extra trees break the planted look of the two edge rows.
        if (r2() < 0.28) {
          const o2 = 3 + r2() * 12;
          const qx = x + ix * o2 + (r2() - 0.5) * 4, qz = z + iz * o2 + (r2() - 0.5) * 4;
          if (!avoid(qx, qz, 3)) add2('mata', qx, qz, 0.65 + r2() * 0.85);
        }
      }
    }
  }
  // Cupinzeiros in the pasture and scattered over the grassland.
  const past = FIELDS.find((f) => f.crop === 'pasture');
  if (past) {
    for (let i = 0; i < 170; i++) {
      const x = past.x0 + 6 + r2() * (past.x1 - past.x0 - 12), z = past.z0 + 6 + r2() * (past.z1 - past.z0 - 12);
      add2('mound', x, z, 0.6 + r2() * 0.9);
    }
  }
  for (let i = 0; i < 240; i++) {
    const x = -2600 + r2() * 5600, z = -2600 + r2() * 5200;
    if (avoid(x, z, 8)) continue;
    add2('mound', x, z, 0.5 + r2() * 0.8);
  }
  // Scrub along the fence lines and road verges.
  for (const rd of ROADS) {
    for (let i = 0; i < rd.pts.length - 1; i++) {
      const [ax, az] = rd.pts[i], [bx, bz] = rd.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (let s = r2() * 30; s < len; s += 18 + r2() * 40) {
        const side = r2() < 0.5 ? -1 : 1, off = rd.w / 2 + 4 + r2() * 5;
        const x = ax + (bx - ax) * (s / len) + nx * off * side, z = az + (bz - az) * (s / len) + nz * off * side;
        if (!avoid(x, z, 4)) add2('bush', x, z, 0.5 + r2() * 0.7);
      }
    }
  }

  // --- vegetation that follows the landforms (own random stream: nothing
  // placed above moves). Gallery woods fill the valley floors of the rolling
  // and hilly zones, scrub (capoeira) clings to the steeper flanks, and a few
  // isolated trees stand on the crests.
  const r3 = rng(7788);
  const add3 = (kind, x, z, s = 1) => {
    trees.push({ kind, v: Math.floor(r3() * variants[kind].length), x, z, s, rot: r3() * Math.PI * 2 });
    // Same collision volumes as the trees of the same kind elsewhere.
    if (kind === 'mata' || kind === 'buriti') colliders.push({ x, z, r: 3, top: terrain.heightAt(x, z) + 20 });
    else if (kind === 'shade' || kind === 'ipe') colliders.push({ x, z, r: 4.5 * s, top: terrain.heightAt(x, z) + 11 * s });
  };
  for (let z = -3800; z <= 3800; z += 60) {
    for (let x = -3800; x <= 3800; x += 60) {
      const w = reliefWeights(x + 30, z + 30);
      if (w.roll < 0.3 && w.hill < 0.1) continue;
      const px = x + r3() * 60, pz = z + r3() * 60;
      if (avoid(px, pz, 12) || cleared(px, pz, true, 12)) continue;
      const h = terrain.heightAt(px, pz);
      // Valley depth: height against the mean of the surroundings (200 m).
      const around = (terrain.heightAt(px + 200, pz) + terrain.heightAt(px - 200, pz) + terrain.heightAt(px, pz + 200) + terrain.heightAt(px, pz - 200)) / 4;
      const rel = h - around;
      const gx = terrain.heightAt(px + 10, pz) - terrain.heightAt(px - 10, pz), gz = terrain.heightAt(px, pz + 10) - terrain.heightAt(px, pz - 10);
      const slope = Math.hypot(gx, gz) / 20;
      const k = r3();
      if (rel < -3.5 && slope < 0.08 && k < 0.55) {
        // Gallery wood: a tight cluster of mixed trees and buritis.
        const n = 2 + Math.floor(r3() * 3);
        for (let i = 0; i < n; i++) {
          const qx = px + (r3() - 0.5) * 26, qz = pz + (r3() - 0.5) * 26;
          if (avoid(qx, qz, 8) || cleared(qx, qz, true, 8)) continue;
          if (r3() < 0.22) add3('buriti', qx, qz, 0.9 + r3() * 0.3); else add3('mata', qx, qz, 0.9 + r3() * 0.5);
        }
      } else if (slope > 0.05 && k < 0.3) {
        add3('bush', px, pz, 0.5 + r3() * 0.7);
      } else if (rel > 4 && k < 0.12) {
        add3(r3() < 0.2 ? 'ipe' : 'shade', px, pz, 0.9 + r3() * 0.4);
      }
    }
  }

  // Marginal vegetation of the other water (own random stream, so the trees
  // placed above stay where they were): buritis and gallery forest along
  // the Vale do Rio stream, clumps of trees and scrub around the açudes with
  // open gaps where the cattle and the roads come down to the water.
  const rw = rng(4242);
  for (const st of WATER.streams) {
    const sp = st.points;
    for (let i = 0; i < sp.length - 1; i++) {
      const [ax, az] = sp[i], [bx, bz] = sp[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (let sd = 0; sd < len; sd += 10) {
        const t = sd / len, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        for (const side of [-1, 1]) {
          const off = st.width * 0.5 + 9 + rw() * 32;
          const x = px + nx * off * side, z = pz + nz * off * side;
          if (avoid(x, z, 4) || rw() < 0.15) continue;
          const k = rw();
          if (k < 0.22) add('buriti', x, z, 0.85 + rw() * 0.3);
          else if (k < 0.8) { add('mata', x, z, 0.8 + rw() * 0.4); colliders.push({ x, z, r: 3, top: terrain.heightAt(x, z) + 20 }); }
          else add('bush', x, z, 0.8 + rw() * 0.6);
        }
      }
    }
  }
  for (const p of WATER.ponds) {
    const n = Math.round(p.r * 0.7);
    for (let i = 0; i < n; i++) {
      const a = rw() * Math.PI * 2;
      // Two open stretches of shore (access), trees in clumps elsewhere.
      if (Math.sin(a * 2 + p.ph) > 0.55) continue;
      const d = pondRadius(p, a) * (1.18 + rw() * 0.55);
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (avoid(x, z, 4)) continue;
      const k = rw();
      if (k < 0.35) add('bush', x, z, 0.8 + rw() * 0.7);
      else if (k < 0.55) add('buriti', x, z, 0.8 + rw() * 0.3);
      else { add('mata', x, z, 0.75 + rw() * 0.45); colliders.push({ x, z, r: 3, top: terrain.heightAt(x, z) + 18 }); }
    }
  }

  // Nothing grows in the açudes, the lake or the stream channels.
  const inWater = (x, z) => WATER.ponds.some((p) => Math.hypot(x - p.x, z - p.z) < pondRadius(p, Math.atan2(z - p.z, x - p.x)) * 1.08)
    || WATER.streams.some((st) => st.points.some((q, i) => i < st.points.length - 1 && segDist(x, z, q[0], q[1], st.points[i + 1][0], st.points[i + 1][1]) < st.width * 0.5 + 7));
  // Clear what the outer fields, their pass corridors and the outer roads
  // claim (trees placed by the original farm's random streams included).
  for (let i = trees.length - 1; i >= 0; i--) {
    const t = trees[i];
    if (cleared(t.x, t.z, isTall(t.kind), isTall(t.kind) ? 6 : 2) || inWater(t.x, t.z)) trees.splice(i, 1);
  }
  for (let i = colliders.length - 1; i >= 0; i--) {
    const c = colliders[i];
    if (!c.box && (cleared(c.x, c.z, true, 6) || inWater(c.x, c.z))) colliders.splice(i, 1);
  }

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
        im.castShadow = grp === hi && kind !== 'bush' && kind !== 'mound';
        im.receiveShadow = grp === hi;
        grp.add(im);
      }
    }
    group.add(hi); group.add(lo);
    cellObjs.push({ center, hi, lo });
  }
  if (canopyParts.length) {
    const cg = mergeGeometries(canopyParts);
    const cm = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ map: makeCanopyTexture(), vertexColors: true, roughness: 0.9, metalness: 0 }));
    cm.receiveShadow = true;
    cm.name = 'forestCanopy';
    group.add(cm);
  }

  let near = quality.treeNear;
  const far = 1800;
  return {
    group,
    atlas,
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
  const pos = [], col = [], idx = [], uv = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = Math.min(x1, x0 + i * step), z = Math.min(z1, z0 + j * step);
    uv.push(x / 36, z / 36);
    const edge = Math.min(x - x0, x1 - x, z - z0, z1 - z);
    const lump = fbm(x / 16, z / 16, 3), big = fbm(x / 120 + 4, z / 120, 2);
    const h = edge < 0.5 ? 4 : 17 + 4 * big + 3.2 * lump;
    pos.push(x, terrain.heightAt(x, z) + h, z);
    const k = 0.7 + 0.35 * (lump * 0.5 + 0.5) + 0.1 * big;
    const tint = fbm(x / 60, z / 60 + 9, 2);
    col.push(0.95 * k * (1 + Math.max(0, tint) * 0.5), 1.0 * k, 0.9 * k);
  }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, d = a + 1, b = a + nx, c = b + 1;
    idx.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
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
  const hit = (x, y, z, terrainH) => {
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
  // Highest tree top within rad of (x, z) (-Infinity if none): lets the
  // autopilot plan its height over a wood before it reaches it.
  hit.topNear = (x, z, rad, terrainH) => {
    let top = -Infinity;
    for (const b of boxes) {
      const f = b.box;
      if (x > f.x0 - rad && x < f.x1 + rad && z > f.z0 - rad && z < f.z1 + rad) top = Math.max(top, terrainH + b.top);
    }
    const gx = Math.floor(x / 50), gz = Math.floor(z / 50);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const l = grid.get(gx + i + ',' + (gz + j));
      if (!l) continue;
      for (const c of l) if (c.top > top && Math.hypot(x - c.x, z - c.z) < c.r + rad) top = c.top;
    }
    return top;
  };
  return hit;
}
