// Trees and forest. Big native forest blocks ("mata", legal reserve) are a
// lumpy canopy surface (cheap from the air) wrapped in instanced trees along
// the edges plus emergent crowns. Planted eucalyptus windbreaks, isolated
// shade trees, yellow ipês near the house and buriti palms by the creek.
// Instanced in 500 m cells with two LODs; a separate collision index keeps
// obstacles cheap and independent from what is drawn.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FORESTS, CREEK, FIELDS, HQ, BASE, APRON0, ROADS, RUNWAY, FARM_SITES, WATER, pondRadius, siteById } from './layout.js';
import { reliefWeights, RING } from './relief.js';
import { EXP_REGIONS, EXP_PROPS, EXP_BOXES, inStripCorridor, biomeWeights } from './expansion.js';
import { rng, fbm, segDist } from '../core/math.js';
import {
  makeFoliageAtlas, makeCanopyTexture, foliageMaterial, tileRect, TILES,
  broadTree, mangoTree, ipeTree, eucalyptusTree, buritiPalm, shrub, cerradoTree, macaubaPalm, deadTree,
} from './foliage.js';

const C = (r, g, b) => new THREE.Color(r, g, b);

const CELL = 500;
const HYST = 30; // m, LOD switch hysteresis of a cell (phase 3)

// Level of a forest cell at distance d (1 near copy, 2 far copy, 0 none).
// Hysteresis (phase 3), one-sided: never less detail than the plain
// distances give (as before: < near → near copy, < far → far copy); a cell
// that already has a level only keeps it `hyst` metres longer, so a camera
// hovering at a boundary does not flip a whole 500 m cell every frame.
// `prev` undefined / 0 (just built, hidden, or after a jump): plain distances.
export function cellLevel(d, near, far, prev, hyst = HYST) {
  const lvl = d < near ? 1 : d < far ? 2 : 0;
  if (prev === 1 && d < near + hyst) return 1;
  if (prev && !lvl && d < far + hyst) return 2;
  return lvl;
}

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
    bush: [
      ...[0, 1].map((i) => pair((hi) => shrub(hi, 91 + i))),
      pair((hi) => shrub(hi, 93, [TILES.cerrado, TILES.redFlush, TILES.shrub], C(0.95, 0.95, 0.9))),
    ],
    cerrado: [
      pair((hi) => cerradoTree(hi, 101)),
      pair((hi) => cerradoTree(hi, 102, { tiles: [TILES.cerrado, TILES.redFlush, TILES.fine[0]], tint: C(1.0, 0.96, 0.92) })),
    ],
    macauba: [0, 1].map((i) => pair((hi) => macaubaPalm(hi, 111 + i))),
    ipeRoxo: [pair((hi) => ipeTree(hi, 121, TILES.ipeRoxo))],
    snag: [pair((hi) => deadTree(hi, 131))],
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
  // The original placements that branch on the terrain read it as it was
  // before the World Expansion 2.0 (TerrainData.buildBaseline), so their
  // random sequences — every tree after them — are unchanged.
  terrain.buildBaseline?.();
  const H0 = (x, z) => (terrain.heightAt0 ? terrain.heightAt0(x, z) : terrain.heightAt(x, z));

  // The original farm's fields and roads: the placement below draws its random
  // numbers against these only, so every tree of the original farm stays
  // exactly where it was. Trees that the outer fields, their pass corridors
  // and the outer roads now claim are removed afterwards (see `cleared`).
  const FIELDS0 = FIELDS.filter((f) => f.level === 1 && !f.farm && !f.school && !f.beginner), ROADS0 = ROADS.filter((rd) => !rd.mesh);
  const avoid = (x, z, m = 6) => {
    if (Math.abs(z) < 60 && x > RUNWAY.x0 - 250 && x < RUNWAY.x1 + 250) return true; // strip approach
    // (The original apron: the random streams draw against it; the main
    // base's larger apron is cleared afterwards, see onMainApron.)
    if (x > APRON0.x0 - 30 && x < APRON0.x1 + 30 && z > APRON0.z0 - 50 && z < 30) return true;
    for (const f of FIELDS0) if (x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m) return true;
    for (const rd of ROADS0) for (let i = 0; i < rd.pts.length - 1; i++) {
      if (segDist(x, z, rd.pts[i][0], rd.pts[i][1], rd.pts[i + 1][0], rd.pts[i + 1][1]) < rd.w / 2 + 3) return true;
    }
    return false;
  };
  // Outer (level 2/3) fields with their run-in corridors along the passes,
  // and the outer access roads: kept clear of trees (low scrub may stay
  // outside the fields themselves).
  // The flight-school talhões by the strip join them (cleared afterwards).
  // (World Expansion 2.0 roads, forests and water — exp: true — are left out of
  // every original placement, so those trees stay exactly where they were;
  // the new regions are planted and cleared further down.)
  // The beginner talhões (added last) are left out of every placement — all
  // random streams draw exactly as before — and cleared at the end with their
  // run-in corridors (begCleared).
  const FIELDS_R = FIELDS.filter((f) => !f.beginner), FIELDS_B = FIELDS.filter((f) => f.beginner);
  const begCleared = (x, z, tall, m) => FIELDS_B.some((f) => {
    if (x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m) return true;
    if (!tall) return false;
    const along = f.rowAxis === 'x', a = along ? x : z, c = along ? z : x;
    const a0 = along ? f.x0 : f.z0, a1 = along ? f.x1 : f.z1, c0 = along ? f.z0 : f.x0, c1 = along ? f.z1 : f.x1;
    return c > c0 - 35 && c < c1 + 35 && a > a0 - 320 && a < a1 + 320;
  });
  const FIELDS2 = FIELDS.filter((f) => f.level > 1 || f.farm || f.school), ROADS2 = ROADS.filter((rd) => rd.mesh && !rd.exp);
  // The outer roads' segments in a 200 m grid (each in every cell its
  // corridor touches), so a point only checks the segments near it.
  const RG = 200, roadGrid = new Map();
  for (const rd of ROADS2) for (let i = 0; i < rd.pts.length - 1; i++) {
    const [ax, az] = rd.pts[i], [bx, bz] = rd.pts[i + 1], m = rd.w / 2 + 3;
    const seg = [ax, az, bx, bz, m];
    for (let cx = Math.floor((Math.min(ax, bx) - m) / RG); cx <= Math.floor((Math.max(ax, bx) + m) / RG); cx++) {
      for (let cz = Math.floor((Math.min(az, bz) - m) / RG); cz <= Math.floor((Math.max(az, bz) + m) / RG); cz++) {
        const k = cx * 4096 + cz;
        if (!roadGrid.has(k)) roadGrid.set(k, []);
        roadGrid.get(k).push(seg);
      }
    }
  }
  const nearOuterRoad = (x, z) => {
    const list = roadGrid.get(Math.floor(x / RG) * 4096 + Math.floor(z / RG));
    if (list) for (const [ax, az, bx, bz, m] of list) if (segDist(x, z, ax, az, bx, bz) < m) return true;
    return false;
  };
  // Farm buildings and props of the outer-ring farms (world positions).
  const PROPS = FARM_SITES.flatMap((s) => (s.farm.props ?? []).map(([kind, px, pz]) => ({ x: px + s.dx, z: pz + s.dz, r: kind === 'turbine' || kind === 'mast' ? 30 : 26 })));
  const cleared = (x, z, tall = true, m = 6) => {
    // Secondary farm strips: service area, strip and its approaches (a
    // forest strip keeps its trees close: farm.clear).
    for (const s of FARM_SITES) {
      const r = s.runway;
      if (x > s.apron.x0 - 40 && x < s.apron.x1 + 30 && z > s.apron.z0 - 40 && z < r.z + 30) return true;
      if (Math.abs(z - r.z) < (tall ? s.farm.clear ?? 60 : r.width / 2 + 8) && x > r.x0 - (tall ? 300 : 20) && x < r.x1 + (tall ? 300 : 20)) return true;
    }
    for (const p of PROPS) if (Math.abs(x - p.x) < p.r && Math.abs(z - p.z) < p.r) return true;
    for (const f of FIELDS2) {
      if (x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m) return true;
      // Talhões cut out of the forest keep the forest up to their edges.
      if (!tall || !f.contract || (f.farm && siteById(f.farm).farm?.tight)) continue;
      const along = f.rowAxis === 'x';
      const a = along ? x : z, c = along ? z : x;
      const a0 = along ? f.x0 : f.z0, a1 = along ? f.x1 : f.z1, c0 = along ? f.z0 : f.x0, c1 = along ? f.z1 : f.x1;
      const run = f.school ? 250 : 600;
      if (c > c0 - 35 && c < c1 + 35 && a > a0 - run && a < a1 + run) return true;
    }
    return nearOuterRoad(x, z);
  };
  const isTall = (kind) => kind !== 'bush' && kind !== 'mound';
  const add = (kind, x, z, s = 1) => {
    const vs = variants[kind];
    trees.push({ kind, v: Math.floor(r() * vs.length), x, z, s, rot: r() * Math.PI * 2 });
  };

  // --- forest blocks -------------------------------------------------------
  // The original map's blocks draw from `r` in their old order (every tree
  // stays where it was); the outer ring's blocks are built further down from
  // their own random stream. keep(x, z): drop trees buried in a neighbouring
  // block (ring blocks overlap so their roofs close without a seam).
  const canopyParts = [];
  const FOR0 = FORESTS.filter((f) => !f.ring), FOR_RING = FORESTS.filter((f) => f.ring && !f.exp), FOR_EXP = FORESTS.filter((f) => f.exp);
  const forestBlock = (fb, r, add, keep = () => true) => {
    if (fb.kind === 'eucalyptus') {
      for (let x = fb.x0 + 2; x < fb.x1; x += 4.2) for (let z = fb.z0 + 2; z < fb.z1; z += 4.2) {
        const jx = x + (r() - 0.5) * 1.2, jz = z + (r() - 0.5) * 1.2;
        if (avoid(jx, jz, 2)) continue;
        add('euca', jx, jz, 0.9 + r() * 0.25);
        colliders.push({ x: jx, z: jz, r: 2.6, top: terrain.heightAt(jx, jz) + 27 });
      }
      return;
    }
    const w = fb.x1 - fb.x0, d = fb.z1 - fb.z0;
    const narrow = Math.min(w, d) < 120;
    if (!narrow) canopyParts.push({ g: forestCanopy(fb, terrain, fb.ring ? (fb.exp ? FOR_EXP : FOR_RING).filter((o) => o !== fb && o.kind === 'mata') : []), key: Math.floor((fb.x0 + fb.x1) / 6000) + ',' + Math.floor((fb.z0 + fb.z1) / 6000) });
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
          if (!avoid(px, pz, 3) && keep(px, pz)) add('mata', px, pz, 0.85 + r() * 0.45);
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
  };
  for (const fb of FOR0) forestBlock(fb, r, add);

  // --- riparian strip along the creek: buritis + mixed trees ---------------
  // (The original course from `r`; the stretches added across the outer ring
  // further down, from the ring's stream.)
  const riparian = (cp, r, add) => {
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
  };
  const CREEK0 = CREEK.points.filter((q) => Math.abs(q[1]) <= 4200);
  riparian(CREEK0, r, add);

  // --- isolated trees, ipês, bushes ---------------------------------------
  const hx = HQ.house.x, hz = HQ.house.z;
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2, d = 35 + r() * 60;
    add(i % 3 === 0 ? 'ipe' : 'shade', hx + Math.cos(a) * d, hz + Math.sin(a) * d, 0.9 + r() * 0.3);
  }
  // Shade trees by the base: a big one over the crew bench.
  add('shade', BASE.crewPost.x + 8, BASE.crewPost.z - 14, 1.2);
  add('ipe', BASE.hangar.x + 36, BASE.hangar.z - 6, 1.0);
  add('shade', BASE.hangar.x - 30, BASE.hangar.z - 4, 1.1);
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
  const capoeira = (fb, r2, add2, keep = () => true) => {
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
        if (!avoid(px, pz, 1) && keep(px, pz)) add2('bush', px, pz, 0.7 + r2() * 0.9);
        // Irregular extra trees break the planted look of the two edge rows.
        if (r2() < 0.28) {
          const o2 = 3 + r2() * 12;
          const qx = x + ix * o2 + (r2() - 0.5) * 4, qz = z + iz * o2 + (r2() - 0.5) * 4;
          if (!avoid(qx, qz, 3) && keep(qx, qz)) add2('mata', qx, qz, 0.65 + r2() * 0.85);
        }
      }
    }
  };
  for (const fb of FOR0) if (fb.kind === 'mata') capoeira(fb, r2, add2);
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
      const h = H0(px, pz);
      // Valley depth: height against the mean of the surroundings (200 m).
      const around = (H0(px + 200, pz) + H0(px - 200, pz) + H0(px, pz + 200) + H0(px, pz - 200)) / 4;
      const rel = h - around;
      const gx = H0(px + 10, pz) - H0(px - 10, pz), gz = H0(px, pz + 10) - H0(px, pz - 10);
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
  // (The original map's water first, from rw; the outer ring's stream and
  // açudes further down, from the ring's stream.)
  const streamMargin = (st, rw, add) => {
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
  };
  const pondMargin = (p, rw, add) => {
    const n = Math.round(p.r * 0.7 * (p.trees ?? 1));
    for (let i = 0; i < n; i++) {
      const a = rw() * Math.PI * 2;
      // Two open stretches of shore (access), trees in clumps elsewhere.
      if (Math.sin(a * 2 + p.ph) > (p.open ?? 0.55)) continue;
      const d = pondRadius(p, a) * (1.18 + rw() * 0.55);
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (avoid(x, z, 4)) continue;
      const k = rw();
      if (k < 0.35) add('bush', x, z, 0.8 + rw() * 0.7);
      else if (k < 0.55) add('buriti', x, z, 0.8 + rw() * 0.3);
      else { add('mata', x, z, 0.75 + rw() * 0.45); colliders.push({ x, z, r: 3, top: terrain.heightAt(x, z) + 18 }); }
    }
  };
  for (const st of WATER.streams) if (!st.ring && !st.exp) streamMargin(st, rw, add);
  for (const p of WATER.ponds) if (!p.ring && !p.exp) pondMargin(p, rw, add);

  // Cerrado vegetation (own random stream): clumps of crooked cerrado trees,
  // macaúba palms, a pink ipê here and there and dead snags in the open
  // country, and a shrubby, irregular margin (orla) where the mata meets the
  // pasture instead of a clean wall of trunks.
  const r6 = rng(6060);
  const add6 = (kind, x, z, s = 1) => {
    trees.push({ kind, v: Math.floor(r6() * variants[kind].length), x, z, s, rot: r6() * Math.PI * 2 });
    if (kind !== 'bush') colliders.push({ x, z, r: kind === 'macauba' ? 2 : 3, top: terrain.heightAt(x, z) + (kind === 'macauba' ? 14 : 10) * s });
  };
  const FOR_OLD = FORESTS.filter((f) => !f.exp);
  const inForest = (x, z, m = 0) => FOR_OLD.some((f) => x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m);
  for (let i = 0; i < 420; i++) {
    const cx = -3800 + r6() * 7600, cz = -3800 + r6() * 7600;
    if (avoid(cx, cz, 30) || inForest(cx, cz, 20)) continue;
    const n = 2 + Math.floor(r6() * 6);
    for (let k = 0; k < n; k++) {
      const x = cx + (r6() - 0.5) * 50, z = cz + (r6() - 0.5) * 50;
      if (avoid(x, z, 8) || inForest(x, z, 4)) continue;
      const q = r6();
      if (q < 0.5) add6('cerrado', x, z, 0.8 + r6() * 0.5);
      else if (q < 0.64) add6('macauba', x, z, 0.85 + r6() * 0.3);
      else if (q < 0.68) add6('ipeRoxo', x, z, 0.85 + r6() * 0.3);
      else if (q < 0.72) add6('snag', x, z, 0.8 + r6() * 0.4);
      else add6('bush', x, z, 0.6 + r6() * 0.6);
    }
  }
  const orla = (fb, r6, add6, keep = () => true) => {
    if (fb.kind !== 'mata' || Math.min(fb.x1 - fb.x0, fb.z1 - fb.z0) < 100) return;
    const per = [[fb.x0, fb.z0, fb.x1, fb.z0, 0, -1], [fb.x1, fb.z0, fb.x1, fb.z1, 1, 0], [fb.x1, fb.z1, fb.x0, fb.z1, 0, 1], [fb.x0, fb.z1, fb.x0, fb.z0, -1, 0]];
    for (const [ax, az, bx, bz, nx, nz] of per) {
      const len = Math.hypot(bx - ax, bz - az);
      for (let sd = 0; sd < len; sd += 6) {
        if (r6() < 0.3) continue;
        const t = sd / len, off = 2 + r6() * r6() * 14;
        const x = ax + (bx - ax) * t + nx * off, z = az + (bz - az) * t + nz * off;
        if (avoid(x, z, 4) || !keep(x, z)) continue;
        const q = r6();
        if (q < 0.62) add6('bush', x, z, 0.7 + r6() * 0.8);
        else if (q < 0.86) add6('cerrado', x, z, 0.8 + r6() * 0.4);
        else add6('macauba', x, z, 0.8 + r6() * 0.3);
      }
    }
  };
  for (const fb of FOR0) orla(fb, r6, add6);

  // Outer ring (airstrips expansion; own random stream, nothing above
  // moves): isolated shade trees and ipês, cerrado clumps, scrub and
  // termite mounds over the open country between the eight farms, gallery
  // woods in the valley floors, and the yellow ipês that name the Ipê
  // Amarelo farm along its yard and road.
  const r7 = rng(9191);
  const add7 = (kind, x, z, s = 1) => {
    trees.push({ kind, v: Math.floor(r7() * variants[kind].length), x, z, s, rot: r7() * Math.PI * 2 });
    if (kind === 'mata' || kind === 'buriti') colliders.push({ x, z, r: 3, top: terrain.heightAt(x, z) + 20 });
    else if (kind === 'shade' || kind === 'ipe') colliders.push({ x, z, r: 4.5 * s, top: terrain.heightAt(x, z) + 11 * s });
    else if (kind === 'cerrado' || kind === 'macauba' || kind === 'ipeRoxo' || kind === 'snag') colliders.push({ x, z, r: kind === 'macauba' ? 2 : 3, top: terrain.heightAt(x, z) + (kind === 'macauba' ? 14 : 10) * s });
  };
  // The outer ring's forest blocks, the creek's new stretches, and their
  // borders (capoeira, orla), as for the original ones.
  const addR = (kind, x, z, s = 1) => {
    trees.push({ kind, v: Math.floor(r7() * variants[kind].length), x, z, s, rot: r7() * Math.PI * 2 });
  };
  for (const fb of FOR_RING) {
    const buried = (x, z) => FOR_RING.some((o) => o !== fb && x > o.x0 + 1 && x < o.x1 - 1 && z > o.z0 + 1 && z < o.z1 - 1);
    const keep = (x, z) => !buried(x, z);
    forestBlock(fb, r7, addR, keep);
    if (fb.kind === 'mata') { capoeira(fb, r7, addR, keep); orla(fb, r7, add7, keep); }
  }
  const CREEK_N = CREEK.points.filter((q) => q[1] <= -4200), CREEK_S = CREEK.points.filter((q) => q[1] >= 4200);
  riparian(CREEK_N, r7, addR);
  riparian(CREEK_S, r7, addR);
  for (const st of WATER.streams) if (st.ring) streamMargin(st, r7, addR);
  for (const p of WATER.ponds) if (p.ring) pondMargin(p, r7, addR);
  const EDGE = 5900;
  const inRing = (x, z) => { const m = Math.max(Math.abs(x), Math.abs(z)); return m > RING.inner + 20 && m < EDGE; };
  const ringPt = () => {
    for (;;) {
      const x = -EDGE + r7() * EDGE * 2, z = -EDGE + r7() * EDGE * 2;
      if (inRing(x, z)) return [x, z];
    }
  };
  const openGround = (x, z, m) => inRing(x, z) && !inForest(x, z, m) && !cleared(x, z, true, m) && !fieldNear(x, z, m);
  const fieldNear = (x, z, m) => FIELDS_R.some((f) => x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m);
  for (let i = 0; i < 230; i++) {
    const [x, z] = ringPt();
    if (!openGround(x, z, 25)) continue;
    add7(r7() < 0.14 ? 'ipe' : 'shade', x, z, 0.9 + r7() * 0.5);
  }
  for (let i = 0; i < 520; i++) {
    const [cx, cz] = ringPt();
    if (!openGround(cx, cz, 30)) continue;
    const n = 2 + Math.floor(r7() * 6);
    for (let k = 0; k < n; k++) {
      const x = cx + (r7() - 0.5) * 50, z = cz + (r7() - 0.5) * 50;
      if (!openGround(x, z, 8)) continue;
      const q = r7();
      if (q < 0.5) add7('cerrado', x, z, 0.8 + r7() * 0.5);
      else if (q < 0.64) add7('macauba', x, z, 0.85 + r7() * 0.3);
      else if (q < 0.68) add7('ipeRoxo', x, z, 0.85 + r7() * 0.3);
      else if (q < 0.72) add7('snag', x, z, 0.8 + r7() * 0.4);
      else add7('bush', x, z, 0.6 + r7() * 0.6);
    }
  }
  for (let i = 0; i < 1100; i++) {
    const [x, z] = ringPt();
    if (openGround(x, z, 6)) add7('bush', x, z, 0.45 + r7() * 0.6);
  }
  for (let i = 0; i < 320; i++) {
    const [x, z] = ringPt();
    if (openGround(x, z, 8)) add7('mound', x, z, 0.5 + r7() * 0.8);
  }
  // Valley floors and flanks of the ring's relief (as in the zones above).
  for (let z = -EDGE; z <= EDGE; z += 60) {
    for (let x = -EDGE; x <= EDGE; x += 60) {
      if (!inRing(x + 30, z + 30)) continue;
      const px = x + r7() * 60, pz = z + r7() * 60;
      if (!openGround(px, pz, 12)) continue;
      const h = H0(px, pz);
      const around = (H0(px + 200, pz) + H0(px - 200, pz) + H0(px, pz + 200) + H0(px, pz - 200)) / 4;
      const rel = h - around;
      const gx = H0(px + 10, pz) - H0(px - 10, pz), gz = H0(px, pz + 10) - H0(px, pz - 10);
      const slope = Math.hypot(gx, gz) / 20;
      const k = r7();
      if (rel < -3.5 && slope < 0.08 && k < 0.5) {
        const n = 2 + Math.floor(r7() * 3);
        for (let i = 0; i < n; i++) {
          const qx = px + (r7() - 0.5) * 26, qz = pz + (r7() - 0.5) * 26;
          if (!openGround(qx, qz, 8)) continue;
          if (r7() < 0.22) add7('buriti', qx, qz, 0.9 + r7() * 0.3); else add7('mata', qx, qz, 0.9 + r7() * 0.5);
        }
      } else if (slope > 0.06 && k < 0.32) {
        add7('bush', px, pz, 0.5 + r7() * 0.7);
      } else if (rel > 4 && k < 0.1) {
        add7(r7() < 0.2 ? 'ipe' : 'shade', px, pz, 0.9 + r7() * 0.4);
      }
    }
  }
  // Ipê Amarelo: yellow ipês around the yard and down the access road.
  const ia = siteById('ipeamarelo');
  if (ia.farm) {
    for (let i = 0; i < 44; i++) {
      const x = ia.dx - 580 + r7() * 300, z = ia.dz - 320 + r7() * 220;
      if (!cleared(x, z, true, 4) && !fieldNear(x, z, 6)) add7('ipe', x, z, 1.0 + r7() * 0.4);
    }
  }

  // World Expansion 2.0 (own random stream: nothing placed above moves).
  // The Mata do Jatobá's blocks (canopy, edge rows, capoeira, orla), the
  // margins of the new rivers and lagoons, and over every new region the
  // vegetation of its biome: cerrado clumps and termite mounds, gallery
  // woods and buritis on the wet ground, capões and isolated shade trees on
  // the hills, sparse scrub on the serra's talus (none on the cliffs).
  const r8 = rng(20261110);
  const add8 = (kind, x, z, s = 1) => {
    trees.push({ kind, v: Math.floor(r8() * variants[kind].length), x, z, s, rot: r8() * Math.PI * 2 });
    if (kind === 'mata' || kind === 'buriti') colliders.push({ x, z, r: 3, top: terrain.heightAt(x, z) + 20 });
    else if (kind === 'shade' || kind === 'ipe') colliders.push({ x, z, r: 4.5 * s, top: terrain.heightAt(x, z) + 11 * s });
    else if (kind === 'cerrado' || kind === 'macauba' || kind === 'ipeRoxo' || kind === 'snag') colliders.push({ x, z, r: kind === 'macauba' ? 2 : 3, top: terrain.heightAt(x, z) + (kind === 'macauba' ? 14 : 10) * s });
  };
  const addE = (kind, x, z, s = 1) => {
    trees.push({ kind, v: Math.floor(r8() * variants[kind].length), x, z, s, rot: r8() * Math.PI * 2 });
  };
  // Ground the new roads, strips, buildings and water keep (as `cleared`).
  const EXPR = ROADS.filter((rd) => rd.exp), ERG = new Map();
  for (const rd of EXPR) for (let i = 0; i < rd.pts.length - 1; i++) {
    const [ax, az] = rd.pts[i], [bx, bz] = rd.pts[i + 1], m = rd.w / 2 + 5;
    const seg = [ax, az, bx, bz, m];
    for (let cx = Math.floor((Math.min(ax, bx) - m) / RG); cx <= Math.floor((Math.max(ax, bx) + m) / RG); cx++) {
      for (let cz = Math.floor((Math.min(az, bz) - m) / RG); cz <= Math.floor((Math.max(az, bz) + m) / RG); cz++) {
        const k = cx * 4096 + cz;
        if (!ERG.has(k)) ERG.set(k, []);
        ERG.get(k).push(seg);
      }
    }
  }
  const nearExpRoad = (x, z) => {
    const list = ERG.get(Math.floor(x / RG) * 4096 + Math.floor(z / RG));
    if (list) for (const [ax, az, bx, bz, m] of list) if (segDist(x, z, ax, az, bx, bz) < m) return true;
    return false;
  };
  const EPROPS = EXP_PROPS.map(([kind, x, z]) => ({ x, z, r: kind === 'corral' ? 26 : kind === 'mast' ? 14 : 18 }));
  const slopeAt = (x, z) => Math.hypot(terrain.heightAt(x + 6, z) - terrain.heightAt(x - 6, z), terrain.heightAt(x, z + 6) - terrain.heightAt(x, z - 6)) / 12;
  const expCleared = (x, z, tall = true) => inStripCorridor(x, z, tall) || nearExpRoad(x, z)
    || EPROPS.some((p) => Math.abs(x - p.x) < p.r && Math.abs(z - p.z) < p.r)
    // (cliffs: only on the new landforms — the original slopes keep their trees)
    || (tall && EXP_BOXES.some((b) => x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3]) && slopeAt(x, z) > 0.7);
  const keepE = (x, z) => !expCleared(x, z, true);
  for (const fb of FOR_EXP) {
    const buried = (x, z) => FOR_EXP.some((o) => o !== fb && x > o.x0 + 1 && x < o.x1 - 1 && z > o.z0 + 1 && z < o.z1 - 1);
    const keep = (x, z) => !buried(x, z) && keepE(x, z);
    forestBlock(fb, r8, addE, keep);
    if (fb.kind === 'mata') { capoeira(fb, r8, addE, keep); orla(fb, r8, add8, keep); }
  }
  for (const st of WATER.streams) if (st.exp) streamMargin(st, r8, (k, x, z, s) => { if (keepE(x, z)) addE(k, x, z, s); });
  for (const p of WATER.ponds) if (p.exp) pondMargin(p, r8, (k, x, z, s) => { if (keepE(x, z)) addE(k, x, z, s); });
  const inExpForest = (x, z, m = 0) => FOR_EXP.some((f) => x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m);
  const openE = (x, z, m) => !inForest(x, z, m) && !inExpForest(x, z, m) && !cleared(x, z, true, m) && !fieldNear(x, z, m) && !expCleared(x, z, true);
  const bw = [0, 0, 0, 0];
  for (const reg of EXP_REGIONS) {
    const R = Math.max(reg.half[0], reg.half[1]) + reg.fall;
    for (let z = reg.c[1] - R; z < reg.c[1] + R; z += 34) {
      for (let x = reg.c[0] - R; x < reg.c[0] + R; x += 34) {
        const px = x + r8() * 34, pz = z + r8() * 34, k = r8();
        if (Math.max(Math.abs(px), Math.abs(pz)) > EDGE) continue;
        biomeWeights(px, pz, bw);
        const [cer, wet, lush, rock] = bw;
        if (cer + wet + lush + rock < 0.05) continue;
        // Each point belongs to the region whose biome is strongest there
        // (the others' loops skip it), so overlaps never double the density.
        const own = reg.biome === 'cerrado' ? cer : reg.biome === 'varzea' ? wet : reg.biome === 'mata' ? lush : reg.biome === 'serra' ? rock : Math.max(lush, cer * 0.9);
        if (own < Math.max(cer, wet, lush, rock) * 0.999 && reg.biome !== 'morros') continue;
        if (!openE(px, pz, 8)) continue;
        const sl = slopeAt(px, pz);
        if (reg.biome === 'cerrado') {
          if (k < 0.075 * cer) {
            const n = 2 + Math.floor(r8() * 5);
            for (let i = 0; i < n; i++) {
              const qx = px + (r8() - 0.5) * 46, qz = pz + (r8() - 0.5) * 46;
              if (!openE(qx, qz, 6)) continue;
              const q = r8();
              if (q < 0.48) add8('cerrado', qx, qz, 0.8 + r8() * 0.5);
              else if (q < 0.6) add8('macauba', qx, qz, 0.85 + r8() * 0.3);
              else if (q < 0.65) add8('ipeRoxo', qx, qz, 0.85 + r8() * 0.3);
              else if (q < 0.7) add8('snag', qx, qz, 0.8 + r8() * 0.4);
              else addE('bush', qx, qz, 0.6 + r8() * 0.6);
            }
          } else if (k < 0.075 * cer + 0.06 * cer) addE('mound', px, pz, 0.5 + r8() * 0.8);
          else if (k < 0.075 * cer + 0.06 * cer + 0.07 * cer) addE('bush', px, pz, 0.5 + r8() * 0.6);
        } else if (reg.biome === 'varzea') {
          if (k < 0.05 * wet) {
            // Capão (island of trees) or a buriti grove on the wet ground.
            const n = 3 + Math.floor(r8() * 5), palm = r8() < 0.45;
            for (let i = 0; i < n; i++) {
              const qx = px + (r8() - 0.5) * 40, qz = pz + (r8() - 0.5) * 40;
              if (!openE(qx, qz, 6)) continue;
              if (palm || r8() < 0.2) add8('buriti', qx, qz, 0.85 + r8() * 0.3); else add8('mata', qx, qz, 0.8 + r8() * 0.4);
            }
          } else if (k < 0.05 * wet + 0.1 * wet) addE('bush', px, pz, 0.6 + r8() * 0.7);
        } else if (reg.biome === 'mata') {
          // Transition: the forest thins out in steps (capoeira, isolated
          // emergent trees) instead of ending at a line.
          if (k < 0.12 * lush) add8('mata', px, pz, 0.8 + r8() * 0.5);
          else if (k < 0.12 * lush + 0.14 * lush) addE('bush', px, pz, 0.7 + r8() * 0.8);
          else if (k < 0.12 * lush + 0.14 * lush + 0.02 * lush) add8('macauba', px, pz, 0.85 + r8() * 0.3);
        } else if (reg.biome === 'serra') {
          if (sl > 0.45) { if (k < 0.08 * rock) addE('bush', px, pz, 0.5 + r8() * 0.6); continue; }
          if (k < 0.035 * rock) {
            const n = 1 + Math.floor(r8() * 4);
            for (let i = 0; i < n; i++) {
              const qx = px + (r8() - 0.5) * 36, qz = pz + (r8() - 0.5) * 36;
              if (!openE(qx, qz, 6) || slopeAt(qx, qz) > 0.45) continue;
              const q = r8();
              if (q < 0.5) add8('cerrado', qx, qz, 0.7 + r8() * 0.4);
              else if (q < 0.62) add8('snag', qx, qz, 0.8 + r8() * 0.3);
              else addE('bush', qx, qz, 0.5 + r8() * 0.6);
            }
          } else if (k < 0.035 * rock + 0.05 * rock) addE('bush', px, pz, 0.45 + r8() * 0.5);
        } else {
          // Morros: pasture with isolated shade trees and ipês, scrub on the
          // steeper flanks.
          const w = Math.max(lush, cer, 0.25);
          if (k < 0.012 * w * 4) add8(r8() < 0.18 ? 'ipe' : 'shade', px, pz, 0.9 + r8() * 0.45);
          else if (sl > 0.12 && k < 0.012 * w * 4 + 0.05) addE('bush', px, pz, 0.5 + r8() * 0.6);
          else if (k < 0.012 * w * 4 + 0.07) addE('mound', px, pz, 0.5 + r8() * 0.7);
        }
      }
    }
  }

  // Nothing grows in the açudes, the lake or the stream channels.
  const inWater = (x, z) => WATER.ponds.some((p) => Math.hypot(x - p.x, z - p.z) < pondRadius(p, Math.atan2(z - p.z, x - p.x)) * 1.08)
    || WATER.streams.some((st) => st.points.some((q, i) => i < st.points.length - 1 && segDist(x, z, q[0], q[1], st.points[i + 1][0], st.points[i + 1][1]) < st.width * 0.5 + 7));
  // Clear what the outer fields, their pass corridors and the outer roads
  // claim (trees placed by the original farm's random streams included).
  // The main base's apron (wider than the original one, up to the
  // windbreak) and the hangar behind it: nothing grows there.
  const A = BASE.apron, HG = BASE.hangar;
  const onMainApron = (x, z, m) => (x > A.x0 - m && x < A.x1 + m && z > A.z0 - m && z < A.z1 + m)
    || (Math.abs(x - HG.x) < HG.w / 2 + 12 && Math.abs(z - HG.z) < HG.d / 2 + 4);
  // ...but the big shade tree over the crew post stays (it is the badeco's shade).
  const crewTree = (x, z) => Math.hypot(x - BASE.crewPost.x - 8, z - BASE.crewPost.z + 14) < 0.5;
  for (let i = trees.length - 1; i >= 0; i--) {
    const t = trees[i];
    if (cleared(t.x, t.z, isTall(t.kind), isTall(t.kind) ? 6 : 2) || begCleared(t.x, t.z, isTall(t.kind), isTall(t.kind) ? 6 : 2) || expCleared(t.x, t.z, isTall(t.kind)) || inWater(t.x, t.z) || (!crewTree(t.x, t.z) && onMainApron(t.x, t.z, 1.5))) trees.splice(i, 1);
  }
  for (let i = colliders.length - 1; i >= 0; i--) {
    const c = colliders[i];
    if (!c.box && (cleared(c.x, c.z, true, 6) || begCleared(c.x, c.z, true, 6) || expCleared(c.x, c.z, true) || inWater(c.x, c.z) || (!crewTree(c.x, c.z) && onMainApron(c.x, c.z, 1.5)))) colliders.splice(i, 1);
  }

  terrain.releaseBaseline?.();

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
  // Phase 5: a cell's instanced meshes are built when the cell comes within
  // reach (see stream()) and released when it is far behind — the tree list
  // (and the collision index made from it) stays whole, so nothing physical
  // depends on what is drawn. The variant geometries are shared by every
  // cell and are never disposed here.
  function buildCellMeshes(c) {
    const hi = new THREE.Group(), lo = new THREE.Group();
    const byVar = new Map();
    for (const t of c.list) {
      const k = t.kind + ':' + t.v;
      if (!byVar.has(k)) byVar.set(k, []);
      byVar.get(k).push(t);
    }
    for (const [k, ts] of byVar) {
      const [kind, v] = k.split(':');
      const [gh, gl] = variants[kind][+v];
      // Small plants (shrubs, termite mounds, snags) are a few pixels beyond
      // the near radius: no far-LOD copy, one draw call less per cell.
      const small = kind === 'bush' || kind === 'mound' || kind === 'snag';
      // The near and far copies hold the same trees: they share one
      // instance-matrix buffer (phase 3 — half the instance memory and
      // uploads; the matrices are computed once).
      let shared = null;
      for (const [grp, geo] of small ? [[hi, gh]] : [[hi, gh], [lo, gl]]) {
        const im = new THREE.InstancedMesh(geo, mat, ts.length);
        if (shared) im.instanceMatrix = shared;
        else {
          ts.forEach((t, i) => {
            pos.set(t.x, terrain.heightAt(t.x, t.z) - 0.3, t.z);
            q.setFromAxisAngle(UP, t.rot);
            sc.setScalar(t.s);
            im.setMatrixAt(i, m4.compose(pos, q, sc));
          });
          im.instanceMatrix.needsUpdate = true;
          shared = im.instanceMatrix;
        }
        im.computeBoundingSphere();
        im.castShadow = grp === hi && kind !== 'bush' && kind !== 'mound';
        im.receiveShadow = grp === hi;
        im.matrixAutoUpdate = false;
        grp.add(im);
      }
    }
    for (const g of [hi, lo]) { g.matrixAutoUpdate = false; g.visible = false; }
    group.add(hi); group.add(lo);
    c.hi = hi; c.lo = lo; c.built = true;
  }
  function releaseCellMeshes(c) {
    for (const g of [c.hi, c.lo]) {
      group.remove(g);
      g.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); // instance buffers only; geometry is shared
    }
    c.hi = c.lo = null; c.built = false; c.lvl = undefined;
  }
  for (const [key, list] of cells) {
    const [cx, cz] = key.split(',').map(Number);
    cellObjs.push({ key, list, center: new THREE.Vector3((cx + 0.5) * CELL, 0, (cz + 0.5) * CELL), hi: null, lo: null, built: false });
  }
  // Forest roofs merged per 3 km region (frustum culling per region).
  if (canopyParts.length) {
    const cmat = canopyMaterial(makeCanopyTexture());
    const regions = new Map();
    for (const c of canopyParts) { if (!regions.has(c.key)) regions.set(c.key, []); regions.get(c.key).push(c.g); }
    for (const [key, parts] of regions) {
      const cm = new THREE.Mesh(mergeGeometries(parts), cmat);
      cm.receiveShadow = true;
      cm.name = 'forestCanopy ' + key;
      group.add(cm);
    }
  }

  let near = quality.treeNear;
  const far = 1800;
  const vis = { built: 0, released: 0 };
  const lastCam = new THREE.Vector3(1e9, 0, 1e9);
  return {
    group,
    atlas,
    colliders,
    count: trees.length,
    setQuality(qq) { near = qq.treeNear; for (const c of cellObjs) c.lvl = undefined; },
    // Streaming interface (src/world/worldStreaming.js).
    cells: cellObjs,
    cellRadius: () => far + CELL,
    build: buildCellMeshes,
    release: (c) => { releaseCellMeshes(c); vis.released++; },
    // Cells the draw test would show (near / far) but whose meshes are not built (must be 0).
    missing: (cam) => cellObjs.filter((c) => !c.built && Math.hypot(c.center.x - cam.x, c.center.z - cam.z) - CELL * 0.6 < far).length,
    stats: () => ({ cells: cellObjs.length, built: cellObjs.filter((c) => c.built).length, releasedTotal: vis.released }),
    update(camera) {
      const p = camera.position;
      // A jump (teleport, site change): every cell decides afresh.
      const jump = Math.hypot(p.x - lastCam.x, p.z - lastCam.z) > 400;
      lastCam.copy(p);
      for (const c of cellObjs) {
        if (!c.built) continue;
        const d = Math.hypot(c.center.x - p.x, c.center.z - p.z) - CELL * 0.6;
        const lvl = cellLevel(d, near, far, jump ? 0 : c.lvl);
        c.lvl = lvl;
        c.hi.visible = lvl === 1;
        c.lo.visible = lvl === 2;
      }
    },
  };
}

// Canopy surface material: the crown texture sampled twice (the second at
// another scale and rotation) and blended by a slow noise carried on the
// vertices, so the tile never reads as a grid from altitude; the crown
// luminance as a bump map gives every crown its sunlit and shaded side.
function canopyMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 3.5, vertexColors: true, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMix;\nvarying float vMix;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMix = aMix;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMix;')
      .replace('#include <map_fragment>', `
        vec4 tA = texture2D(map, vMapUv);
        vec2 uv2 = mat2(0.81, -0.59, 0.59, 0.81) * vMapUv * 0.73 + vec2(0.37, 0.61);
        vec4 tB = texture2D(map, uv2);
        diffuseColor *= mix(tA, tB, smoothstep(0.3, 0.7, vMix));`);
  };
  m.customProgramCacheKey = () => 'canopy-v2';
  return m;
}

// nb: neighbouring blocks. A side lying against one (the outer ring's
// clearings are cut from several blocks) is not an edge: the roof runs on
// to the boundary at full height there, so adjoining roofs close without a
// seam; only the exposed edges come down to the edge trees.
function forestCanopy(fb, terrain, nb = []) {
  const step = 10;
  const inset = 9;
  const inNb = (x, z) => nb.some((o) => x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1);
  const covered = (side, x, z) => nb.length > 0 && inNb(side === 0 ? fb.x0 - 3 : side === 1 ? fb.x1 + 3 : x, side === 2 ? fb.z0 - 3 : side === 3 ? fb.z1 + 3 : z);
  const sideCov = (side) => nb.length > 0 && [0.1, 0.3, 0.5, 0.7, 0.9].every((t) => covered(side, fb.x0 + (fb.x1 - fb.x0) * t, fb.z0 + (fb.z1 - fb.z0) * t));
  const cx0 = sideCov(0), cx1 = sideCov(1), cz0 = sideCov(2), cz1 = sideCov(3);
  const x0 = fb.x0 + (cx0 ? 0 : inset), x1 = fb.x1 - (cx1 ? 0 : inset), z0 = fb.z0 + (cz0 ? 0 : inset), z1 = fb.z1 - (cz1 ? 0 : inset);
  const nx = Math.ceil((x1 - x0) / step) + 1, nz = Math.ceil((z1 - z0) / step) + 1;
  const pos = [], col = [], idx = [], uv = [], mix = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = Math.min(x1, x0 + i * step), z = Math.min(z1, z0 + j * step);
    const edge = Math.min(cx0 ? 1e9 : x - x0, cx1 ? 1e9 : x1 - x, cz0 ? 1e9 : z - z0, cz1 ? 1e9 : z1 - z);
    // Edge (ground) vertices: the texture is pulled outward so the shade
    // wall carries it at its real scale instead of in vertical streaks.
    const ox = !cx0 && x - x0 < 0.5 ? -14 : !cx1 && x1 - x < 0.5 ? 14 : 0, oz = !cz0 && z - z0 < 0.5 ? -14 : !cz1 && z1 - z < 0.5 ? 14 : 0;
    uv.push((x + ox) / 48, (z + oz) / 48);
    const lump = fbm(x / 16, z / 16, 3), big = fbm(x / 120 + 4, z / 120, 2);
    // The edge goes down to the ground behind the edge trees: a wall of deep
    // shade, so the forest never shows daylight under its roof.
    // Near the edge the roof comes down to the height of the edge trees.
    const full = 17 + 4 * big + 3.2 * lump;
    const h = edge < 0.5 ? -0.8 : 9 + (full - 9) * Math.min(1, edge / 30);
    pos.push(x, terrain.heightAt(x, z) + h, z);
    const k = 0.72 + 0.3 * (lump * 0.5 + 0.5) + 0.1 * big;
    const tint = fbm(x / 60, z / 60 + 9, 2), dry = fbm(x / 200 - 3, z / 200 + 1, 2);
    // The skirt down to the edge trees is the deep shade under the crowns.
    const shade = edge < 0.5 ? 0.16 : 1;
    col.push(0.95 * k * (1 + Math.max(0, tint) * 0.35 + Math.max(0, dry) * 0.25) * shade, 1.0 * k * shade, 0.88 * k * (1 - Math.max(0, dry) * 0.2) * shade);
    mix.push(0.5 + 0.5 * fbm(x / 90 + 7, z / 90 - 2, 2) * 1.6);
  }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, d = a + 1, b = a + nx, c = b + 1;
    idx.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aMix', new THREE.Float32BufferAttribute(mix, 1));
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
