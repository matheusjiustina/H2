// Forest crowns: real 3D tree crowns on top of the mata canopy around the
// camera. Far away the canopy surface (its crown texture) carries the forest;
// within crownRadius every crown is a clump of lit leaf cards (the same atlas
// and material as the trees, so it shades, sways and takes the per-tree tone
// variation), standing 2–3 m out of the canopy surface so the forest top is a
// broken, volumetric field of crowns instead of a smooth block. Placement is
// a jittered grid per 80 m cell (deterministic, cached); a few variants are
// instanced (one draw each) and refilled only when the camera has moved.
// Toward the radius the crowns shrink into the canopy (shader), so nothing
// pops. Above ~700 m the system switches itself off.
import * as THREE from 'three';
import { lruGet, lruTrim } from './lru.js';
import { FORESTS } from './layout.js';
import { fbm, rng } from '../core/math.js';
import { PlantBuilder, TILES, foliageMaterial } from './foliage.js';

const CELL = 80;
const SPACING = 10;
const EDGE = 14; // the edge band belongs to the instanced edge trees
const CAP = 12000; // instances per variant, at most
const CAP0 = 1024; // ... allocated at first (grows on demand)
const CACHE_MAX = 600; // generated 80 m cells kept (LRU); Ultra's reach covers ~150

const C = (r, g, b) => new THREE.Color(r, g, b);

// Canopy roof height over the ground at (x, z) inside a forest block (same
// formula as vegetation.js forestCanopy, its inset 9 m).
export function canopyHeight(fb, x, z) {
  const inset = 9;
  const edge = Math.min(x - fb.x0 - inset, fb.x1 - inset - x, z - fb.z0 - inset, fb.z1 - inset - z);
  const lump = fbm(x / 16, z / 16, 3), big = fbm(x / 120 + 4, z / 120, 2);
  const full = 17 + 4 * big + 3.2 * lump;
  return 9 + (full - 9) * Math.min(1, Math.max(0, edge) / 30);
}

function crownGeometry(seed, tiles, tint, rx, ry) {
  const B = new PlantBuilder(seed);
  const r = B.r;
  // Two or three overlapping lobes make the crown irregular from above.
  const lobes = 2 + Math.floor(r() * 2);
  for (let i = 0; i < lobes; i++) {
    const a = r() * Math.PI * 2, d = i === 0 ? 0 : rx * 0.45;
    const lr = i === 0 ? rx : rx * (0.55 + r() * 0.2);
    B.clump(Math.cos(a) * d, ry * (0.95 + r() * 0.3), Math.sin(a) * d, lr, ry * (i === 0 ? 1 : 0.8), lr, i === 0 ? 34 : 16, 2.5, tiles, tint, 0, ry * 2.2);
  }
  return B.geometry();
}

export function createForestCrowns(scene, terrain, atlas, quality) {
  const fadeR = { value: quality.crownRadius ?? 380 };
  const mat = foliageMaterial(atlas, { fadeRadius: fadeR });
  const VARIANTS = [
    crownGeometry(201, [TILES.broad[0], TILES.broad[1]], C(1, 1, 1), 4.4, 2.3),
    crownGeometry(202, [TILES.broad[1], TILES.broad[3]], C(0.92, 1.0, 0.9), 5.0, 2.5),
    crownGeometry(203, [TILES.broad[2], TILES.fine[0]], C(1.05, 1.03, 0.9), 4.0, 2.2),
    crownGeometry(204, [...TILES.fine], C(0.95, 1.0, 0.92), 4.6, 2.4),
    crownGeometry(205, [TILES.broad[3], TILES.mango], C(0.9, 0.95, 0.9), 5.4, 2.7),
    crownGeometry(206, [TILES.redFlush, TILES.broad[2]], C(1, 1, 1), 4.2, 2.2),
    crownGeometry(207, [TILES.cerrado, TILES.broad[0]], C(1, 0.98, 0.92), 4.4, 2.3),
  ];
  // Weights: mostly greens, a few reddish / leathery crowns.
  const WEIGHT = [24, 22, 16, 16, 12, 3, 7];
  const WT = WEIGHT.reduce((a, b) => a + b, 0);
  const group = new THREE.Group();
  group.name = 'forestCrowns';
  // Phase 3: each variant's instance buffer starts small and grows (powers
  // of two, up to CAP) to what the forests in reach need — 4 × CAP matrices
  // were ~3 MB (and as much on the GPU) whether or not a forest was near.
  const meshes = VARIANTS.map((g) => {
    const im = new THREE.InstancedMesh(g, mat, CAP0);
    im.count = 0;
    im.frustumCulled = false;
    im.castShadow = false;
    im.receiveShadow = true;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(im);
    return im;
  });
  scene.add(group);
  const blocks = FORESTS.filter((f) => f.kind === 'mata' && Math.min(f.x1 - f.x0, f.z1 - f.z0) >= 100);

  const cache = new Map();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function buildCell(ci, cj) {
    const lists = VARIANTS.map(() => []);
    const x0 = ci * CELL, z0 = cj * CELL;
    for (const fb of blocks) {
      if (fb.x1 - EDGE < x0 || fb.x0 + EDGE > x0 + CELL || fb.z1 - EDGE < z0 || fb.z0 + EDGE > z0 + CELL) continue;
      const r = rng(((ci * 73856093) ^ (cj * 19349663) ^ 0x5bd1e995) >>> 0);
      for (let z = z0 + SPACING / 2; z < z0 + CELL; z += SPACING) {
        for (let x = x0 + SPACING / 2; x < x0 + CELL; x += SPACING) {
          const px = x + (r() - 0.5) * SPACING * 0.8, pz = z + (r() - 0.5) * SPACING * 0.8;
          const pick = r() * WT, s = 0.8 + r() * 0.45, rot = r() * Math.PI * 2;
          if (px < fb.x0 + EDGE || px > fb.x1 - EDGE || pz < fb.z0 + EDGE || pz > fb.z1 - EDGE) continue;
          let v = 0;
          for (let acc = WEIGHT[0]; acc < pick && v < WEIGHT.length - 1; acc += WEIGHT[++v]);
          // Crown base under the roof: its top stands 2–3 m out of it.
          const y = terrain.heightAt(px, pz) + canopyHeight(fb, px, pz) - 2.6 * s;
          m4.compose(p.set(px, y, pz), q.setFromAxisAngle(UP, rot), sc.set(s, s * (0.9 + r() * 0.25), s));
          lists[v].push(...m4.elements);
        }
      }
    }
    return lists.map((l) => new Float32Array(l));
  }

  // Room for `need` instances (the first `keep` are kept).
  function reserve(im, keep, need) {
    const cap = im.instanceMatrix.count;
    if (need <= cap) return true;
    if (need > CAP) return false;
    let c = cap;
    while (c < need) c *= 2;
    c = Math.min(c, CAP);
    const a = new THREE.InstancedBufferAttribute(new Float32Array(c * 16), 16).setUsage(THREE.DynamicDrawUsage);
    a.array.set(im.instanceMatrix.array.subarray(0, keep * 16));
    im.dispose(); // the old GPU buffer goes; three.js uploads the new one
    im.instanceMatrix = a;
    stats.grows++;
    return true;
  }

  let lastX = 1e9, lastZ = 1e9, radius = fadeR.value;
  // World optimisation (phase 3): the instance buffers are refilled (and
  // re-uploaded, up to 4 × 12000 matrices) only when the SET of 80 m cells in
  // reach changes — a refill with the same cells wrote the same instances.
  // Generated cells are kept in a bounded LRU cache (it used to grow without
  // limit over a long flight across the forests).
  let lastSig = '';
  const stats = { refills: 0, skipped: 0, built: 0, grows: 0 };
  function refill(cam) {
    const counts = VARIANTS.map(() => 0);
    const R = radius + CELL * 0.75;
    const ci0 = Math.floor((cam.x - R) / CELL), ci1 = Math.floor((cam.x + R) / CELL);
    const cj0 = Math.floor((cam.z - R) / CELL), cj1 = Math.floor((cam.z + R) / CELL);
    const keys = [];
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
      const cx = (ci + 0.5) * CELL, cz = (cj + 0.5) * CELL;
      if (Math.hypot(cx - cam.x, cz - cam.z) > R) continue;
      keys.push(ci, cj);
    }
    const sig = keys.join(',');
    if (sig === lastSig) { stats.skipped++; return; }
    lastSig = sig; stats.refills++;
    for (let i = 0; i < keys.length; i += 2) {
      const ci = keys[i], cj = keys[i + 1];
      const key = ci + ',' + cj;
      let cell = lruGet(cache, key);
      if (!cell) { cache.set(key, (cell = buildCell(ci, cj))); stats.built++; }
      cell.forEach((arr, v) => {
        const n = arr.length / 16;
        if (!n || !reserve(meshes[v], counts[v], counts[v] + n)) return;
        meshes[v].instanceMatrix.array.set(arr, counts[v] * 16);
        counts[v] += n;
      });
    }
    meshes.forEach((im, v) => {
      im.count = counts[v];
      im.instanceMatrix.clearUpdateRanges();
      im.instanceMatrix.addUpdateRange(0, counts[v] * 16);
      im.instanceMatrix.needsUpdate = true;
    });
    lruTrim(cache, CACHE_MAX);
  }

  return {
    group,
    setQuality(qq) { radius = fadeR.value = qq.crownRadius ?? 380; lastX = 1e9; lastSig = ''; },
    update(camera, groundY) {
      const cam = camera.position;
      // From high up the canopy surface alone reads as forest.
      group.visible = cam.y - groundY < 700;
      if (!group.visible) return;
      if (Math.hypot(cam.x - lastX, cam.z - lastZ) < 25) return;
      lastX = cam.x; lastZ = cam.z;
      refill(cam);
    },
    count: () => meshes.reduce((a, m) => a + m.count, 0),
    stats: () => ({ ...stats, cached: cache.size }),
  };
}
