// Terrain relief: protected flat core, smooth natural slopes, the 70/20/10
// distribution, hilly/rolling fields, roads, and one shared height source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, rawHeight } from '../src/world/terrainData.js';
import { reliefAt, reliefWeights, terrainLevel, CORE, ZONES } from '../src/world/relief.js';
import { FARM_SITES, stripLevel, RUNWAY, BASE, HQ, FIELDS, ROADS, WORLD_HALF, fieldAt, cropHeight } from '../src/world/layout.js';
import { createFlightEnv } from '../src/flight/env.js';
import { CONTRACTS } from '../src/game/contracts.js';
import { fieldsTerrain } from '../src/world/terrainInfo.js';

const td = new TerrainData();
const slopeDeg = (x, z, e = 12) => {
  const gx = (rawHeight(x + e, z) - rawHeight(x - e, z)) / (2 * e), gz = (rawHeight(x, z + e) - rawHeight(x, z - e)) / (2 * e);
  return (Math.atan(Math.hypot(gx, gz)) * 180) / Math.PI;
};

test('the farm core keeps the original terrain exactly (relief is zero there)', () => {
  let n = 0;
  for (let z = CORE.z0; z <= CORE.z1; z += 41) for (let x = CORE.x0; x <= CORE.x1; x += 41) { assert.equal(reliefAt(x, z), 0); n++; }
  assert.ok(n > 8000);
});

test('runway, base, hangar, headquarters and every spawn spot stay level', () => {
  // The strip is a perfectly flat platform.
  for (let x = RUNWAY.x0; x <= RUNWAY.x1; x += 20) for (const z of [RUNWAY.z - 12, RUNWAY.z, RUNWAY.z + 12]) assert.ok(Math.abs(rawHeight(x, z)) < 1e-6, `strip ${x},${z}`);
  for (const p of [BASE.pad, BASE.parking, BASE.parking2, BASE.helipad, BASE.hangar, HQ.house, ...HQ.sheds]) {
    assert.equal(reliefAt(p.x, p.z), 0);
    assert.ok(slopeDeg(p.x, p.z) < 2, `slope at ${p.x},${p.z}`);
  }
  for (const f of FIELDS.filter((f) => f.level === 1 && !f.farm)) assert.equal(reliefAt((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2), 0, f.name);
});

test('secondary farm strips and service areas sit on level platforms', () => {
  for (const s of FARM_SITES) {
    const r = s.runway;
    for (let x = r.x0; x <= r.x1; x += 20) for (const z of [r.z - r.width / 2, r.z, r.z + r.width / 2]) assert.ok(Math.abs(rawHeight(x, z) - stripLevel(s, x, z)) < 1e-3, `${s.id} strip ${x},${z}`);
    for (const p of [s.pad, s.helipad, s.fuelTank, s.mixTank, s.crewPost, s.truck, s.hangar, ...s.reservoirs]) {
      assert.ok(Math.abs(rawHeight(p.x, p.z) - s.y0) < 1e-3, `${s.id} at ${p.x},${p.z}`);
    }
    // No talhão on the strip, its approaches or the service area.
    for (const f of FIELDS) assert.ok(!(f.x1 > r.x0 - 120 && f.x0 < r.x1 + 120 && f.z1 > r.z - 170 && f.z0 < r.z + 40), `${f.name} on ${s.id}`);
  }
});

test('terrain is deterministic and the grid matches the height function', () => {
  const a = new TerrainData(), b = new TerrainData();
  assert.equal(a.h.length, b.h.length);
  for (let i = 0; i < a.h.length; i += 997) assert.equal(a.h[i], b.h[i]);
  const N = td.n, CELL = (WORLD_HALF * 2) / (N - 1);
  for (const [i, j] of [[10, 10], [300, 77], [450, 20], [100, 480]]) {
    const x = -WORLD_HALF + i * CELL, z = -WORLD_HALF + j * CELL;
    assert.ok(Math.abs(td.heightAt(x, z) - rawHeight(x, z)) < 1e-4);
  }
});

test('relief is smooth: no steps, slopes bounded (rolling ≤ 8°, hills ≤ 12°)', () => {
  let maxRoll = 0, maxHill = 0, maxStep = 0;
  for (let z = -3900; z <= 3900; z += 60) {
    let prev = null;
    for (let x = -3900; x <= 3900; x += 20) {
      const h = rawHeight(x, z);
      if (prev !== null) maxStep = Math.max(maxStep, Math.abs(h - prev)); // along a line, 20 m apart
      prev = h;
    }
  }
  for (let z = -3900; z <= 3900; z += 70) for (let x = -3900; x <= 3900; x += 70) {
    const w = reliefWeights(x, z);
    const s = slopeDeg(x, z);
    if (w.hill > 0.5) maxHill = Math.max(maxHill, s); else if (w.roll > 0.35) maxRoll = Math.max(maxRoll, s);
  }
  assert.ok(maxRoll <= 8, `rolling max ${maxRoll}`);
  assert.ok(maxHill <= 12, `hill max ${maxHill}`);
  assert.ok(maxStep < 4, `step ${maxStep}`); // 4 m in 20 m would be an 11° edge
});

test('only a minority of the map has relief: ~70 % flat, ~20 % rolling, ~10 % hilly', () => {
  let n = 0, c1 = 0, c2 = 0, c3 = 0;
  for (let z = -3950; z < 3950; z += 50) for (let x = -3950; x < 3950; x += 50) {
    const l = terrainLevel(x, z); n++; if (l === 3) c3++; else if (l === 2) c2++; else c1++;
  }
  const f = [c1, c2, c3].map((c) => (100 * c) / n);
  assert.ok(f[0] >= 65 && f[0] <= 90, `flat ${f[0]}`);
  assert.ok(f[1] >= 8 && f[1] <= 28, `rolling ${f[1]}`);
  assert.ok(f[2] >= 2 && f[2] <= 14, `hilly ${f[2]}`);
});

test('the three zones have the relief their level promises', () => {
  const stats = (cx, cz) => {
    let mn = 1e9, mx = -1e9;
    for (let dz = -700; dz <= 700; dz += 50) for (let dx = -700; dx <= 700; dx += 50) { const h = rawHeight(cx + dx, cz + dz); mn = Math.min(mn, h); mx = Math.max(mx, h); }
    return mx - mn;
  };
  assert.ok(stats(ZONES.hills.c[0], ZONES.hills.c[1]) > 30, 'hills');
  assert.ok(stats(ZONES.rollSE.c[0], ZONES.rollSE.c[1]) > 14, 'rolling');
  assert.ok(stats(0, 0) < 18, 'core');
});

test('contract fields carry their terrain level: relief grows from level 1 to 3', () => {
  const byLevel = { 1: [], 2: [], 3: [] };
  for (const c of CONTRACTS) {
    const fields = c.fields.map((n) => FIELDS.find((f) => f.name === n));
    assert.ok(fields.every((f) => f.level === c.level), c.id);
    const T = fieldsTerrain(td, fields);
    byLevel[c.level].push(T);
    assert.ok(T.maxSlope < 12, `${c.id} max slope ${T.maxSlope}`);
  }
  assert.ok(byLevel[1].length === 3 && byLevel[2].length === 3 && byLevel[3].length === 3);
  const avg = (l) => byLevel[l].reduce((s, t) => s + t.relief, 0) / byLevel[l].length;
  assert.ok(avg(2) > avg(1) * 0.8 && avg(3) > avg(2), `relief ${avg(1)} ${avg(2)} ${avg(3)}`);
  assert.ok(byLevel[3].every((t) => t.relief > 12), 'level 3 fields have real relief');
  // Higher levels pay more.
  const pay = (id) => CONTRACTS.find((c) => c.id === id).payPerHa;
  assert.ok(pay('roll-soy') > pay('soy') && pay('ridge-soy') > pay('roll-soy'));
});

test('advanced fields are irregular (stepped) and do not overlap other fields', () => {
  for (const c of CONTRACTS.filter((c) => c.level > 1)) assert.equal(c.fields.length, 2, c.id);
  for (let i = 0; i < FIELDS.length; i++) for (let j = i + 1; j < FIELDS.length; j++) {
    const a = FIELDS[i], b = FIELDS[j];
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    assert.ok(!(ox > 0.5 && oz > 0.5), `${a.name} overlaps ${b.name}`);
  }
});

test('one height source: flight environment, surfaces and crop tops read the same terrain', () => {
  const env = createFlightEnv(td);
  for (const [x, z] of [[2800, -2600], [900, 2900], [-2200, -2500], [100, 10]]) {
    assert.equal(env.ground(x, z), td.heightAt(x, z));
    const f = fieldAt(x, z);
    assert.equal(env.top(x, z), td.heightAt(x, z) + cropHeight(f));
    const n = env.normal(x, z, {});
    assert.ok(n.y > 0.97 && n.y <= 1, 'physical normal is the true slope');
    const v = td.visualNormalAt(x, z, {});
    assert.ok(v.y <= n.y + 1e-9, 'shading normal is at least as tilted');
  }
});

test('access roads follow the terrain (grade ≤ 12 %) and are dirt surfaces', () => {
  const roads = ROADS.filter((r) => r.mesh);
  assert.ok(roads.length >= 5);
  for (const r of roads) {
    let max = 0;
    for (let i = 1; i < r.pts.length; i++) {
      const [x0, z0] = r.pts[i - 1], [x1, z1] = r.pts[i];
      max = Math.max(max, Math.abs(rawHeight(x1, z1) - rawHeight(x0, z0)) / Math.hypot(x1 - x0, z1 - z0));
    }
    assert.ok(max < 0.12, `grade ${(max * 100).toFixed(1)} %`);
    const [mx, mz] = r.pts[Math.floor(r.pts.length / 2)];
    assert.equal(td.surfaceAt(mx, mz), 'dirt');
  }
});
