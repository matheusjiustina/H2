// Beginner talhões: five small, flat level-1 fields between the school and the
// full-size orders, in open country, clear of every other field, strip, road,
// powerline, water and tree; their contracts sit between school and level 1.
import test from 'node:test';
// The vegetation builder paints its foliage atlas on a canvas; only the tree
// positions matter here, so a no-op canvas stands in (as in test/apsim.mjs).
if (typeof document === 'undefined') {
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}
import assert from 'node:assert/strict';
import { FIELDS, CONTRACT_FIELDS, ROADS, POWERLINE, SITES, FORESTS } from '../src/world/layout.js';
import { AUX_STRIPS, EXP_PROPS, EXP_PASTURES } from '../src/world/expansion.js';
import { TerrainData } from '../src/world/terrainData.js';
import { CONTRACTS, LEVELS } from '../src/game/contracts.js';
import { createVegetation } from '../src/world/vegetation.js';
import { QUALITY } from '../src/config.js';

const td = new TerrainData();
const BEG = FIELDS.filter((f) => f.beginner);
const ha = (f) => ((f.x1 - f.x0) * (f.z1 - f.z0)) / 1e4;
const rectDist = (a, b) => Math.hypot(Math.max(a.x0 - b.x1, 0, b.x0 - a.x1), Math.max(a.z0 - b.z1, 0, b.z0 - a.z1));
const segDist = (x, z, ax, az, bx, bz) => {
  const vx = bx - ax, vz = bz - az, l = vx * vx + vz * vz;
  const t = l ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l)) : 0;
  return Math.hypot(x - ax - t * vx, z - az - t * vz);
};

test('five beginner talhões: bigger than the school, smaller than the level-1 orders', () => {
  assert.equal(BEG.length, 5);
  const school = FIELDS.filter((f) => f.school), t07 = FIELDS.find((f) => f.name === 'T-07');
  for (const f of BEG) {
    assert.ok(CONTRACT_FIELDS.includes(f), f.name);
    assert.ok(ha(f) > 2 * Math.max(...school.map(ha)) && ha(f) < ha(t07) * 0.6, `${f.name} ${ha(f)} ha`);
  }
});

test('beginner talhões sit on flat open ground, clear of fields, strips, roads, wires and water', () => {
  for (const f of BEG) {
    let lo = 1e9, hi = -1e9, slope = 0;
    for (let x = f.x0; x <= f.x1; x += 10) for (let z = f.z0; z <= f.z1; z += 10) {
      const h = td.heightAt(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h);
      slope = Math.max(slope, Math.hypot(td.heightAt(x + 5, z) - td.heightAt(x - 5, z), td.heightAt(x, z + 5) - td.heightAt(x, z - 5)) / 10);
      assert.ok(!(td.waterLevel(x, z) > h), `${f.name} water at ${x},${z}`);
    }
    assert.ok(hi - lo < 3, `${f.name} relief ${hi - lo}`);
    assert.ok(Math.atan(slope) * 57.3 < 2, `${f.name} slope`);
    for (const g of FIELDS) if (g !== f) assert.ok(rectDist(f, g) > 150, `${f.name} near ${g.name}`);
    // The run-in corridors (320 m past each end) are clear of forest blocks.
    const run = { x0: f.x0 - 320, x1: f.x1 + 320, z0: f.z0 - 35, z1: f.z1 + 35 };
    for (const fb of FORESTS) assert.ok(rectDist(run, fb) > 0, `${f.name} run-in through forest`);
    for (const s of SITES) assert.ok(Math.hypot((f.x0 + f.x1) / 2 - s.dx, (f.z0 + f.z1) / 2 - s.dz) > 1000, `${f.name} near ${s.id}`);
    for (const s of AUX_STRIPS) assert.ok(Math.hypot((f.x0 + f.x1) / 2 - s.c[0], (f.z0 + f.z1) / 2 - s.c[1]) > 1000, `${f.name} near ${s.id}`);
    for (const [k, x, z] of EXP_PROPS) assert.ok(rectDist(run, { x0: x - 30, x1: x + 30, z0: z - 30, z1: z + 30 }) > 0, `${f.name} near ${k}`);
    for (const [x0, x1, z0, z1] of EXP_PASTURES) assert.ok(rectDist(run, { x0, x1, z0, z1 }) > 0, `${f.name} fence`);
    for (const rd of ROADS) for (let i = 0; i < rd.pts.length - 1; i++) {
      for (const [x, z] of [[f.x0, f.z0], [f.x1, f.z0], [f.x0, f.z1], [f.x1, f.z1], [(f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2]]) {
        assert.ok(segDist(x, z, ...rd.pts[i], ...rd.pts[i + 1]) > 40, `${f.name} road`);
      }
      // No road crosses the field rectangle.
      const [ax, az] = rd.pts[i], [bx, bz] = rd.pts[i + 1];
      for (let k = 0; k <= 20; k++) { const x = ax + (bx - ax) * k / 20, z = az + (bz - az) * k / 20; assert.ok(!(x > f.x0 - 10 && x < f.x1 + 10 && z > f.z0 - 10 && z < f.z1 + 10), `${f.name} road crosses`); }
    }
    for (const p of POWERLINE.points) assert.ok(Math.hypot(Math.max(f.x0 - 320 - p[0], 0, p[0] - f.x1 - 320), Math.max(f.z0 - p[1], 0, p[1] - f.z1)) > 300, `${f.name} wires`);
  }
});

test('beginner contracts: own board group, pay between school and level 1', () => {
  const beg = CONTRACTS.filter((c) => c.beginner);
  assert.equal(beg.length, 5);
  assert.ok(LEVELS.b && LEVELS.b.label && LEVELS.b.short && LEVELS.b.blurb);
  const school = CONTRACTS.filter((c) => c.school), l1 = CONTRACTS.filter((c) => c.level === 1 && !c.beginner);
  for (const c of beg) {
    assert.equal(c.fields.length, 1);
    assert.ok(BEG.some((f) => f.name === c.fields[0] && f.contract === c.id), c.id);
    assert.ok(c.payPerHa >= Math.max(...school.map((s) => s.payPerHa)) && c.payPerHa <= Math.min(...l1.map((s) => s.payPerHa)), c.id);
    assert.ok(c.bonus > Math.max(...school.map((s) => s.bonus)) && c.bonus < Math.min(...l1.map((s) => s.bonus)), c.id);
    assert.ok(c.recommended.fuel > 0 && c.recommended.liquid > 0);
  }
});

test('no tree or tree collider inside a beginner talhão or its run-in corridors', () => {
  const v = createVegetation(td, QUALITY.low);
  const trees = v.cells.flatMap((c) => c.list), cols = v.colliders;
  assert.ok(trees.length > 1000);
  const inRun = (x, z) => BEG.some((f) => x > f.x0 - 320 && x < f.x1 + 320 && z > f.z0 - 35 && z < f.z1 + 35);
  const inField = (x, z) => BEG.some((f) => x > f.x0 - 2 && x < f.x1 + 2 && z > f.z0 - 2 && z < f.z1 + 2);
  for (const c of cols) if (!c.box) assert.ok(!inRun(c.x, c.z), `collider ${c.x},${c.z}`);
  for (const t of trees) assert.ok(!inField(t.x, t.z), `${t.kind} ${t.x},${t.z}`);
});
