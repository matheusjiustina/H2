// Serra das Bananeiras — the premium map's data, run in its own process:
//   AGRO_MAP=serra node --test test/serra.maptest.mjs   (npm run test:serra)
// (The map is chosen once per process; the main suite runs on the main map.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_ID, SERRA, MAPS, mapAllowed } from '../src/world/activeMap.js';
import { WORLD_HALF, PLAY_HALF, RUNWAY, FARMS, FARM_SITES, FIELDS, CREEK, WATER, ROADS, CROPS, cropHeight } from '../src/world/layout.js';
import { TerrainData, rawHeight } from '../src/world/terrainData.js';
import { EXP_PROPS, AUX_STRIPS, MESAS } from '../src/world/expansion.js';
import * as SB from '../src/world/serra.js';
import { CONTRACTS } from '../src/game/contracts.js';
import { FARM_CONTRACTS } from '../src/game/farmContracts.js';
import { EXPANSIONS, SERRA_EXPANSION, setPremiumEnforced, setEntitlementSource, isUnlocked } from '../src/game/expansions.js';

test('this process runs the Serra map', () => { assert.equal(MAP_ID, 'serra'); assert.ok(SERRA); assert.equal(MAPS.serra.premium, SERRA_EXPANSION.id); assert.ok(EXPANSIONS.includes(SERRA_EXPANSION)); });

test('compact: the playable area is 8–15 % of the main map', () => {
  const share = (2 * PLAY_HALF) ** 2 / 12000 ** 2;
  assert.ok(share >= 0.08 && share <= 0.15, String(share));
  assert.equal(WORLD_HALF, 3000);
});

test('three rustic strips at most, each a level (or evenly graded) platform', () => {
  assert.equal(1 + FARMS.length, 3);
  assert.equal(AUX_STRIPS.length, 0);
  for (let x = RUNWAY.x0; x <= RUNWAY.x1; x += 20) assert.ok(Math.abs(rawHeight(x, RUNWAY.z) - rawHeight(RUNWAY.x0, RUNWAY.z)) < 0.05, `main strip ${x}`);
  for (const s of FARM_SITES) {
    const f = s.farm, x0 = -400 + f.dx, hs = [];
    for (let x = x0 + 10; x <= x0 + f.len - 10; x += 20) hs.push(rawHeight(x, f.dz));
    const rise = hs.at(-1) - hs[0], step = rise / (hs.length - 1);
    if (f.grade) assert.ok(rise > 5 && rise <= f.grade * f.len + 0.5, `${f.id} rise ${rise}`); else assert.ok(Math.abs(rise) < 0.1, `${f.id} rise ${rise}`);
    // (The graded strip eases in and out at its ends: no step larger than the grade itself.)
    for (let i = 1; i < hs.length; i++) assert.ok(Math.abs(hs[i] - hs[i - 1]) <= Math.max(0.05, (f.grade ?? 0) * 20 + 0.05) && Math.abs(hs[i] - hs[i - 1] - step) < 0.7, `${f.id} bump at ${i}`);
  }
});

test('mountain country: real relief inside the playable area', () => {
  let lo = 1e9, hi = -1e9, steep = 0, n = 0;
  for (let z = -PLAY_HALF; z <= PLAY_HALF; z += 50) for (let x = -PLAY_HALF; x <= PLAY_HALF; x += 50) {
    const h = rawHeight(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); n++;
    if (Math.hypot(rawHeight(x + 10, z) - rawHeight(x - 10, z), rawHeight(x, z + 10) - rawHeight(x, z - 10)) / 20 > 0.15) steep++;
  }
  assert.ok(hi - lo > 150, `relief ${hi - lo}`);
  assert.ok(steep / n > 0.2, `steep share ${steep / n}`);
});

test('banana only; talhões follow the terrain in irregular plots', () => {
  assert.ok(FIELDS.length > 20);
  for (const f of FIELDS) { assert.equal(f.crop, 'banana'); assert.equal(cropHeight(f), CROPS.banana.height); assert.ok(Math.max(Math.abs(f.x0), Math.abs(f.x1), Math.abs(f.z0), Math.abs(f.z1)) < PLAY_HALF); }
  const plots = SB.SERRA_PLOTS;
  const stepped = plots.filter((p) => p.rects.length > 1 && new Set(p.rects.map((r) => (p.axis === 'x' ? `${r.x0},${r.x1}` : `${r.z0},${r.z1}`))).size > 1);
  assert.ok(stepped.length / plots.length > 0.5, `${stepped.length}/${plots.length} stepped`);
  // A band lies along the contour: little height change along its rows.
  let along = 0, across = 0;
  for (const f of FIELDS) {
    const ax = f.rowAxis === 'x', cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2;
    along += Math.abs(ax ? rawHeight(cx + 30, cz) - rawHeight(cx - 30, cz) : rawHeight(cx, cz + 30) - rawHeight(cx, cz - 30));
    across += Math.abs(ax ? rawHeight(cx, cz + 30) - rawHeight(cx, cz - 30) : rawHeight(cx + 30, cz) - rawHeight(cx - 30, cz));
  }
  assert.ok(along < across, `along ${along} across ${across}`);
});

test('talhões keep clear of strips, water and each other', () => {
  const strips = [{ x0: RUNWAY.x0, x1: RUNWAY.x1, z: RUNWAY.z, w: RUNWAY.width }, ...FARMS.map((f) => ({ x0: -400 + f.dx, x1: -400 + f.dx + f.len, z: f.dz, w: f.width }))];
  const all = [...SB.SERRA_FIELDS, ...SB.SERRA_GROVES];
  for (const f of all) {
    for (const s of strips) assert.ok(!(f.x1 > s.x0 - 100 && f.x0 < s.x1 + 100 && f.z1 > s.z - 40 && f.z0 < s.z + 40), `${f.name ?? f.plot} on a strip`);
    for (const st of [CREEK, ...WATER.streams]) for (const [x, z] of st.points) assert.ok(!(x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1), `${f.name ?? f.plot} over water`);
  }
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    assert.ok(!(a.x1 > b.x0 + 0.01 && a.x0 < b.x1 - 0.01 && a.z1 > b.z0 + 0.01 && a.z0 < b.z1 - 0.01), `${a.name ?? a.plot} overlaps ${b.name ?? b.plot}`);
  }
});

test('contracts: every order has its banana bands; farm requests belong to the two strips', () => {
  assert.ok(CONTRACTS.length >= 4 && FARM_CONTRACTS.length >= 4);
  const names = new Set(FIELDS.map((f) => f.name));
  for (const c of [...CONTRACTS, ...FARM_CONTRACTS]) {
    assert.ok(c.fields.length >= 1 && c.fields.every((n) => names.has(n)), c.id);
    assert.ok(c.payPerHa > 0 && c.title && c.brief);
  }
  const farms = new Set(FARMS.map((f) => f.id));
  for (const c of FARM_CONTRACTS) assert.ok(farms.has(c.farm), c.id);
  assert.equal(new Set([...CONTRACTS, ...FARM_CONTRACTS].map((c) => c.id)).size, CONTRACTS.length + FARM_CONTRACTS.length);
});

test('one small stream network whose level only falls; limited rural buildings', () => {
  assert.ok(WATER.streams.length <= 2 && WATER.ponds.length <= 1);
  const td = new TerrainData();
  for (const st of WATER.streams) { let prev = 1e9; for (const [x, z] of st.points) { const h = td.heightAt(x, z); assert.ok(h < prev + 2.5, `${st.name} rises at ${x},${z}: ${h} > ${prev}`); prev = Math.min(prev, h); } }
  assert.ok(EXP_PROPS.length > 0 && EXP_PROPS.length <= 24);
  assert.equal(MESAS.length, 0);
  for (const [kind, x, z] of EXP_PROPS) assert.ok(!FIELDS.some((f) => x > f.x0 - 8 && x < f.x1 + 8 && z > f.z0 - 8 && z < f.z1 + 8), `${kind} in a talhão`);
  assert.ok(ROADS.length >= 3);
});

test('deterministic: the same plots and forest every load', () => {
  assert.equal(SB.SERRA_PLOTS.length, 62);
  assert.equal(SB.SERRA_FIELDS.length, FIELDS.length);
  assert.ok(SB.serraForestBoxes().length > 100);
  assert.ok(SB.serraWild(-1700, -1640) > 0.8 && SB.serraWild(0, 0) === 0);
});

test('premium: the map answers to the same entitlement source as the other expansions', () => {
  assert.ok(mapAllowed()); // testing phase: enforcement off
  setPremiumEnforced(true);
  try {
    setEntitlementSource(null);
    assert.equal(isUnlocked(SERRA_EXPANSION.id), false);
    assert.equal(mapAllowed(), false); // no source: locked, the game leaves the map
    setEntitlementSource((id) => id === 'expansion.at802f-fireboss');
    assert.equal(mapAllowed(), false); // another expansion's entitlement does not open it
    setEntitlementSource((id) => id === SERRA_EXPANSION.id);
    assert.equal(mapAllowed(), true);
  } finally { setPremiumEnforced(false); setEntitlementSource(null); }
});
