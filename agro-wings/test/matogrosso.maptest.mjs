// Mato Grosso Operations — the premium agribusiness map's data, run in its own process:
//   AGRO_MAP=matogrosso node --test test/matogrosso.maptest.mjs   (npm run test:mt)
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_ID, MATOGROSSO, MAPS, mapAllowed } from '../src/world/activeMap.js';
import { WORLD_HALF, PLAY_HALF, RUNWAY, FARMS, FARM_SITES, FIELDS, ROADS, WATER, CREEK, FORESTS, CROPS, fieldAt, inFieldShape, cropHeight } from '../src/world/layout.js';
import { rawHeight, TerrainData } from '../src/world/terrainData.js';
import { segDist } from '../src/core/math.js';
import { MT_PIVOTS, pivotArmAt, BR_163 } from '../src/world/matogrosso.js';
import { CONTRACTS } from '../src/game/contracts.js';
import { FARM_CONTRACTS } from '../src/game/farmContracts.js';
import { FieldCoverage } from '../src/spray/coverage.js';
import { AIRCRAFT_ORDER } from '../src/aircraft/types.js';
import { MATOGROSSO_EXPANSION, EXPANSIONS, setPremiumEnforced, setEntitlementSource, isUnlocked, SERRA_EXPANSION } from '../src/game/expansions.js';

const td = new TerrainData();

test('this process runs Mato Grosso Operations', () => {
  assert.equal(MAP_ID, 'matogrosso'); assert.ok(MATOGROSSO);
  assert.equal(MAPS.matogrosso.premium, MATOGROSSO_EXPANSION.id);
  assert.ok(EXPANSIONS.includes(MATOGROSSO_EXPANSION));
  const share = (2 * PLAY_HALF) ** 2 / 12000 ** 2;
  assert.ok(share > 0.25 && share < 0.4, String(share));
  assert.equal(WORLD_HALF, 4000);
});

test('gently rolling: no mountains, slopes under 8 % off the creek banks, but not flat', () => {
  let lo = 1e9, hi = -1e9, maxS = 0;
  for (let z = -PLAY_HALF; z <= PLAY_HALF; z += 40) for (let x = -PLAY_HALF; x <= PLAY_HALF; x += 40) {
    const h = rawHeight(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h);
    if (td.waterLevel(x, z) > -1e8 || [CREEK, ...WATER.streams].some((w) => w.points.some(([px, pz], i) => i > 0 && segDist(x, z, w.points[i - 1][0], w.points[i - 1][1], px, pz) < 200)) || WATER.ponds.some((q) => Math.hypot(q.x - x, q.z - z) < q.rmax * 2.4)) continue; // (channel banks and the dam's bowl)
    const s = Math.hypot(rawHeight(x + 10, z) - rawHeight(x - 10, z), rawHeight(x, z + 10) - rawHeight(x, z - 10)) / 20;
    maxS = Math.max(maxS, s);
  }
  console.log(`  heights ${lo.toFixed(1)} … ${hi.toFixed(1)} m, steepest ${(maxS * 100).toFixed(1)} %`);
  assert.ok(hi - lo > 15 && hi - lo < 45);
  assert.ok(maxS < 0.08);
});

test('four short dirt strips (the base and three farm strips), level or evenly graded', () => {
  assert.equal(1 + FARMS.length, 4);
  for (let x = RUNWAY.x0; x <= RUNWAY.x1; x += 20) assert.ok(Math.abs(rawHeight(x, RUNWAY.z) - rawHeight(RUNWAY.x0, RUNWAY.z)) < 0.05);
  for (const s of FARM_SITES) {
    const f = s.farm, x0 = -400 + f.dx;
    assert.ok(f.len <= 600 && f.width <= 18, f.id);
    const rise = rawHeight(x0 + f.len - 10, f.dz) - rawHeight(x0 + 10, f.dz);
    console.log(`  ${f.name}: ${f.len} × ${f.width} m, ${(rise).toFixed(1)} m ${rise >= 0 ? 'up' : 'down'} eastbound`);
    assert.ok(Math.abs(rise - f.grade * (f.len - 120)) < 2.5, `${f.id} rise ${rise}`);
  }
});

test('the land: soy, corn, capim, stubble, pasture, reserves; roads, water and forest off the fields', () => {
  const crops = new Set(FIELDS.map((f) => f.crop));
  for (const c of ['soy', 'corn', 'capim', 'stubble', 'pasture']) assert.ok(crops.has(c), c);
  assert.equal(CROPS.capim.height, 0.6);
  assert.ok(FORESTS.filter((f) => f.kind === 'mata').length >= 3);
  for (const r of ROADS) for (const f of FIELDS) for (const [x, z] of r.pts) assert.ok(!inFieldShape(f, x, z, r.w / 2 + 2), `${r.name ?? 'road'} in ${f.name}`);
  for (const w of [CREEK, ...WATER.streams]) for (const [x, z] of w.points) for (const f of FIELDS) assert.ok(!inFieldShape(f, x, z, 20), `water in ${f.name}`);
  // The BR-163: paved, crossing the whole map east–west.
  const br = ROADS.find((r) => r.paved);
  assert.ok(br && br.w >= 12 && br.pts[0][0] <= -3900 && br.pts.at(-1)[0] >= 3900);
  assert.equal(BR_163.length > 5, true);
});

test('centre pivots: round fields (GPS, coverage, ground) and the arm as an obstacle', () => {
  const piv = FIELDS.filter((f) => f.circle);
  assert.equal(piv.length, 3);
  const P = piv.find((f) => f.name === 'P-01'), C = P.circle;
  assert.equal(fieldAt(C.x, C.z), P);
  assert.equal(fieldAt(C.x + C.r * 0.8, C.z + C.r * 0.8), null, 'the square\'s corner is not the field');
  const cov = new FieldCoverage(P);
  const ha = cov.area / 1e4, real = (Math.PI * C.r ** 2) / 1e4;
  console.log(`  P-01: ${ha.toFixed(1)} ha on the grid (disc ${real.toFixed(1)} ha)`);
  assert.ok(Math.abs(ha - real) / real < 0.02);
  assert.equal(cov.deposit(C.x + C.r * 0.8, C.z + C.r * 0.8, 1), -1, 'off the disc');
  assert.ok(cov.deposit(C.x, C.z, 1) > 0);
  // The arm crosses the passes (rows along x: the arm runs north–south), at work height.
  const p = MT_PIVOTS.find((q) => q.field === 'P-01');
  assert.ok(Math.abs(Math.sin(p.ang)) > 0.9, 'arm across the rows');
  assert.ok(pivotArmAt(p, p.x, p.z + 200) < 15);
  const work = cropHeight(P) + 3.5;
  assert.ok(p.h + 0.7 > work - 0.5 && p.h < work + 1, `arm ${p.h} m vs work ${work} m: has to be hopped`);
  for (const q of MT_PIVOTS) assert.ok(Math.abs(q.r - FIELDS.find((f) => f.name === q.field).circle.r) < 1);
});

test('orders: soy, corn, desiccation, pivots; every order on its fields; the farm strips have requests', () => {
  assert.ok(CONTRACTS.length >= 6);
  for (const c of [...CONTRACTS, ...FARM_CONTRACTS]) for (const n of c.fields) assert.ok(FIELDS.some((f) => f.name === n && f.contract === c.id), `${c.id} ${n}`);
  for (const site of ['pivo', 'capim', 'reserva']) assert.ok(FARM_CONTRACTS.filter((c) => c.farm === site).length >= 2, site);
  assert.ok(FARM_CONTRACTS.some((c) => /Pivot|Pivô/.test(c.title)));
  assert.ok([...CONTRACTS, ...FARM_CONTRACTS].some((c) => FIELDS.find((f) => f.name === c.fields[0]).crop === 'capim'));
  assert.ok(AIRCRAFT_ORDER.length >= 13, 'the agricultural fleet flies here');
});

test('premium: the map opens with its own package only', () => {
  setEntitlementSource(null);
  assert.ok(mapAllowed());
  setPremiumEnforced(true);
  assert.equal(mapAllowed(), false);
  setEntitlementSource((id) => id === SERRA_EXPANSION.id);
  assert.equal(mapAllowed(), false);
  setEntitlementSource((id) => id === MATOGROSSO_EXPANSION.id);
  assert.ok(mapAllowed() && isUnlocked(MATOGROSSO_EXPANSION.id));
  setEntitlementSource(null);
  setPremiumEnforced(false);
});
