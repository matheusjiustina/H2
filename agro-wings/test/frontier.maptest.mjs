// Operation: Fireboss Frontier — the premium fire map's data, its fires and
// missions, run in its own process:
//   AGRO_MAP=frontier node --test test/frontier.maptest.mjs   (npm run test:frontier)
// (The map is chosen once per process; the main suite runs on the main map.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { MAP_ID, FRONTIER, MAPS, mapAllowed } from '../src/world/activeMap.js';
import { WORLD_HALF, PLAY_HALF, RUNWAY, FARMS, FARM_SITES, FIELDS, WATER, ROADS, pondRadius } from '../src/world/layout.js';
import { TerrainData, rawHeight } from '../src/world/terrainData.js';
import { AUX_STRIPS, MESAS, biomeWeights } from '../src/world/expansion.js';
import * as FB from '../src/world/frontier.js';
import { CONTRACTS } from '../src/game/contracts.js';
import { FARM_CONTRACTS } from '../src/game/farmContracts.js';
import { FIRE_JOBS, FireJobs } from '../src/game/fireJobs.js';
import { FireField, FIRE_SPOTS } from '../src/world/fires.js';
import { AIRCRAFT_ORDER, AIRCRAFT_TYPES } from '../src/aircraft/types.js';
import { FRONTIER_EXPANSION, FIREBOSS_EXPANSION, SERRA_EXPANSION, EXPANSIONS, setPremiumEnforced, setEntitlementSource, isUnlocked, aircraftUnlocked } from '../src/game/expansions.js';

const td = new TerrainData();

test('this process runs the Fireboss Frontier map', () => {
  assert.equal(MAP_ID, 'frontier'); assert.ok(FRONTIER);
  assert.equal(MAPS.frontier.premium, FRONTIER_EXPANSION.id);
  assert.ok(EXPANSIONS.includes(FRONTIER_EXPANSION));
});

test('compact: smaller than the main map, bigger than the Serra; no main-map landforms', () => {
  const share = (2 * PLAY_HALF) ** 2 / 12000 ** 2;
  assert.ok(share > 0.15 && share < 0.35, String(share));
  assert.equal(WORLD_HALF, 3600);
  assert.equal(AUX_STRIPS.length, 0); assert.equal(MESAS.length, 0);
});

test('two strips: the fire base and the auxiliary strip, both level', () => {
  assert.equal(1 + FARMS.length, 2);
  for (let x = RUNWAY.x0; x <= RUNWAY.x1; x += 20) assert.ok(Math.abs(rawHeight(x, RUNWAY.z) - rawHeight(RUNWAY.x0, RUNWAY.z)) < 0.05, `main strip ${x}`);
  for (const s of FARM_SITES) {
    const f = s.farm, x0 = -400 + f.dx, h0 = rawHeight(x0 + 10, f.dz);
    for (let x = x0 + 10; x <= x0 + f.len - 10; x += 20) assert.ok(Math.abs(rawHeight(x, f.dz) - h0) < 0.1, `${f.id} at ${x}`);
  }
});

test('terrain: rolling plains, broken hills, a ridge, a basin — and no steps', () => {
  let lo = 1e9, hi = -1e9;
  for (let z = -PLAY_HALF; z <= PLAY_HALF; z += 50) for (let x = -PLAY_HALF; x <= PLAY_HALF; x += 50) { const h = rawHeight(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
  assert.ok(lo < -15 && hi > 120 && hi < 220, `${lo} … ${hi}`);
  const zone = (Z) => { let a = 1e9, b = -1e9; for (let z = Z.c[1] - Z.half[1] * 0.7; z <= Z.c[1] + Z.half[1] * 0.7; z += 40) for (let x = Z.c[0] - Z.half[0] * 0.7; x <= Z.c[0] + Z.half[0] * 0.7; x += 40) { const h = rawHeight(x, z); a = Math.min(a, h); b = Math.max(b, h); } return [a, b]; };
  const [aA, bA] = zone(FB.ZONES.A), [aB, bB] = zone(FB.ZONES.B), [aE, bE] = zone(FB.ZONES.E), [aD, bD] = zone({ ...FB.ZONES.D, half: [300, 200] });
  console.log(`  relief A ${(bA - aA).toFixed(0)} m · B ${(bB - aB).toFixed(0)} m · E ${(bE - aE).toFixed(0)} m · basin floor ${aD.toFixed(0)}…${bD.toFixed(0)} m`);
  assert.ok(bA - aA < 30, 'A gentle'); assert.ok(bB - aB > 50, 'B hilly'); assert.ok(bE - aE > 90, 'E ridge'); assert.ok(bD < -12, 'D low');
  // Continuity: no jump between 4 m samples larger than three times its neighbours' (water channels excepted).
  let jumps = 0;
  for (let z = -3400; z < 3400; z += 37) {
    let a = rawHeight(-3400, z), b = rawHeight(-3396, z);
    for (let x = -3392; x < 3400; x += 4) {
      const c = rawHeight(x, z), d1 = b - a, d2 = c - b;
      if (Math.abs(d2) > 2.5 && Math.abs(d2) > 4 * Math.abs(d1) && td.waterLevel(x, z) < -1e8 && td.waterLevel(x - 30, z) < -1e8 && td.waterLevel(x + 30, z) < -1e8) jumps++;
      a = b; b = c;
    }
  }
  assert.equal(jumps, 0);
});

test('two large irregular lakes the Fire Boss can scoop on', () => {
  const big = WATER.ponds.filter((p) => p.big);
  assert.equal(big.length, 2);
  for (const p of big) {
    // Longest straight run of open water through the centre (any heading).
    let best = 0, rmin = 1e9, rmax = 0;
    for (let a = 0; a < Math.PI; a += 0.05) {
      const r1 = pondRadius(p, a), r2 = pondRadius(p, a + Math.PI);
      best = Math.max(best, r1 + r2); rmin = Math.min(rmin, r1, r2); rmax = Math.max(rmax, r1, r2);
    }
    console.log(`  ${p.name}: ${Math.round(best)} m long, radius ${Math.round(rmin)}–${Math.round(rmax)} m, level ${p.level.toFixed(1)} m`);
    assert.ok(best > 850, p.name);
    assert.ok(rmax / rmin > 1.5, `${p.name} not round`);
    // Deep enough for the floats along the run.
    assert.ok(p.level - td.heightAt(p.x, p.z) > 2, `${p.name} depth`);
    assert.ok(td.waterLevel(p.x, p.z) > -1e8);
  }
  const [L1, L2] = big;
  assert.notDeepEqual(L1.lobes, L2.lobes);
  assert.ok(Math.hypot(L1.x - RUNWAY.x0, L1.z) < 2200, 'main lake near the base');
});

test('fire sectors on open land, missions A–F reference them', () => {
  assert.equal(FIRE_SPOTS, FB.FRONT_FIRE_SPOTS);
  for (const f of FIRE_SPOTS) assert.ok(FB.frontierOpen(f.x, f.z), `${f.sector} ${f.x},${f.z}`);
  assert.deepEqual([...new Set(FIRE_JOBS.map((j) => j.type))].sort(), ['A', 'B', 'C', 'D', 'E', 'F']);
  for (const j of FIRE_JOBS) for (const id of [...j.spots, ...(j.flare?.spots ?? [])]) assert.ok(id >= 1 && id <= FIRE_SPOTS.length, `${j.id} ${id}`);
  // The lake–fire distance: 0.7–4 km from the mission's lake.
  for (const j of FIRE_JOBS) {
    const L = WATER.ponds.find((p) => p.name === j.lake), s = FIRE_SPOTS[j.spots[0] - 1];
    const d = Math.hypot(L.x - s.x, L.z - s.z);
    assert.ok(d > 600 && d < 4000, `${j.id} ${Math.round(d)} m`);
  }
  // Dry cerrado everywhere, burn scars somewhere.
  const w = [0, 0, 0, 0];
  biomeWeights(1500, 300, w); assert.ok(w[0] > 0.3);
  biomeWeights(FB.BURN_SCARS[0][0], FB.BURN_SCARS[0][1], w); assert.ok(w[3] > 0.8);
});

test('no crop work on this map; only the Fire Boss and the fire-service AT-802', () => {
  assert.equal(CONTRACTS.length, 0);
  assert.equal(FARM_CONTRACTS.length, 0);
  assert.ok(FIELDS.every((f) => !f.contract));
  assert.deepEqual(AIRCRAFT_ORDER, ['at802f', 'at802']);
  const T = AIRCRAFT_TYPES.at802;
  assert.ok(T.fireService && T.spray.none && T.loads.free.hopper === 0 && T.premium === FRONTIER_EXPANSION.id);
  assert.ok(ROADS.length >= 4);
});

test('premium: the map package opens the map, the red AT-802 and the Fire Boss there; nothing else', () => {
  setEntitlementSource(null);
  assert.ok(mapAllowed(), 'testing phase: open');
  setPremiumEnforced(true);
  assert.equal(mapAllowed(), false);
  assert.equal(aircraftUnlocked(AIRCRAFT_TYPES.at802f), false);
  setEntitlementSource((id) => id === FRONTIER_EXPANSION.id);
  assert.ok(mapAllowed());
  assert.ok(aircraftUnlocked(AIRCRAFT_TYPES.at802f) && aircraftUnlocked(AIRCRAFT_TYPES.at802));
  assert.equal(isUnlocked(SERRA_EXPANSION.id), false);
  assert.equal(isUnlocked(FIREBOSS_EXPANSION.id), false, 'the Fire Boss package itself stays separate');
  setEntitlementSource(() => { throw new Error('offline'); });
  assert.equal(mapAllowed(), false);
  setEntitlementSource(null);
  setPremiumEnforced(false);
});

test('fires: unlit until a mission; lines put out by drops along them; hand-in clears; flare-up', () => {
  const ff = new FireField(null, td);
  ff.setActive(true);
  assert.ok(ff.fires.every((f) => f.state === 'idle' && f.intensity === 0));
  assert.equal(ff.hazeAt(1500, 60, 0, new Vector3(3, 0, 0)), 0);
  // A minimal game for the mission logic.
  const toasts = [];
  const g = { time: 0, fires: ff, aircraft: { water: {} }, career: { money: 0, completed: {}, save() {} }, toast: (m) => toasts.push(m), audio: null };
  const jobs = new FireJobs(g);
  assert.ok(jobs.accept('ff-chapadao'));
  const line = jobs.spots();
  assert.equal(line.length, 4);
  assert.ok(line.every((f) => f.state === 'burning' && f.kind === 'line'));
  // Smoke in the air downwind of the line, none upwind.
  const wind = new Vector3(4, 0, 0), c = line[1];
  const down = ff.hazeAt(c.x + 800, c.y + 200, c.z, wind), up = ff.hazeAt(c.x - 1500, c.y + 200, c.z, wind);
  console.log(`  haze 800 m downwind ${down.toFixed(2)}, 1.5 km upwind ${up.toFixed(3)}`);
  assert.ok(down > 0.2 && down <= 0.85 && up < 0.05);
  // One drop on one end of a line leaves the other end burning.
  const f = line[0], ux = Math.cos(f.ang), uz = Math.sin(f.ang);
  ff.applyWater(f.x - ux * f.len * 0.35, f.z - uz * f.len * 0.35, 3000, 22);
  assert.ok(f.state === 'burning' && f.intensity < 0.9 && f.cells.some((c) => c.k > 0.9), String(f.intensity));
  // Drops along every line put the mission out and pay it.
  for (const s of line) for (let u = -0.45; u <= 0.46; u += 0.15) ff.applyWater(s.x + Math.cos(s.ang) * s.len * u, s.z + Math.sin(s.ang) * s.len * u, 3000, 24);
  assert.ok(line.every((s) => s.state === 'out'));
  jobs.update();
  assert.equal(jobs.active, false);
  assert.ok(g.career.money >= 42000 && g.career.completed['ff-chapadao']);
  // Hand-in before the fire is out: its spots go back to unlit.
  jobs.accept('ff-garcas');
  const ids = jobs.ids();
  jobs.cancel();
  assert.ok(ids.every((id) => ff.fires[id - 1].state === 'idle'));
  // Flare-up after its time while the fire still burns.
  jobs.accept('ff-multi');
  g.time = 11 * 60;
  jobs.update();
  assert.ok(jobs.job.flared && jobs.spots().length === FIRE_JOBS.find((j) => j.id === 'ff-multi').spots.length + 1);
  assert.ok(toasts.some((m) => /jumped/.test(m)));
  // The field never relights by itself on this map.
  jobs.cancel();
  for (let i = 0; i < 200; i++) ff.update(1, wind);
  assert.ok(ff.fires.every((s) => s.state !== 'burning'));
});
