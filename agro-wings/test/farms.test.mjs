// Airstrips expansion: the eight outer-ring farms — strips on real ground,
// their talhões and requests, pay by difficulty, aircraft each strip takes,
// scenery clear of the strips, fields and the service truck's yard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rawHeight, naturalHeight } from '../src/world/terrainData.js';
import { reliefAt, ringReliefAt } from '../src/world/relief.js';
import { FARMS, FARM_SITES, FIELDS, ROADS, WORLD_HALF, stripLevel, stripAllows, windFactorAt, siteById, nearestSite, BASE } from '../src/world/layout.js';
import { FARM_CONTRACTS, FARM_INFO, contractStars } from '../src/game/farmContracts.js';
import { AIRCRAFT_ORDER } from '../src/aircraft/types.js';

const NEW = ['horizonte', 'doislagos', 'serradocedro', 'mataalta', 'ipeamarelo', 'valeverde', 'terravermelha', 'chapada'];
const ring = FARM_SITES.filter((s) => s.farm.ring);
const PLAN = { x0: -402, x1: -280, z0: -110, z1: -28 }; // crew/truck.js PLAN_BOUNDS (site frame)

test('the eight farms exist, each with its own strip identity', () => {
  assert.deepEqual(ring.map((s) => s.id).sort(), [...NEW].sort());
  const sig = new Set(ring.map((s) => `${s.runway.x1 - s.runway.x0}x${s.runway.width}/${s.runway.surface}/${s.runway.grade}/${s.runway.bank}/${s.farm.marks}`));
  assert.equal(sig.size, 8, 'no two strips alike');
  for (const s of ring) {
    const r = s.runway;
    assert.ok(r.x0 > -WORLD_HALF + 300 && r.x1 < WORLD_HALF - 300 && Math.abs(r.z) < WORLD_HALF - 300, `${s.id} inside the map`);
    assert.ok(s.farm.difficulty >= 1 && s.farm.difficulty <= 5, s.id);
    assert.ok(FARM_INFO[s.id]?.blurb && FARM_INFO[s.id]?.strip && FARM_INFO[s.id]?.weather, `${s.id} office info`);
    // Nearest-site lookup finds the farm from its own pad (crew follows).
    assert.equal(nearestSite(s.pad.x, s.pad.z).site.id, s.id);
  }
  // Difficulty spans the whole scale.
  assert.deepEqual([...new Set(ring.map((s) => s.farm.difficulty))].sort(), [1, 3, 4, 5]);
});

test('no floating strips: the strip is the terrain, the service area level, the land around it natural', () => {
  for (const s of ring) {
    const r = s.runway;
    for (let x = r.x0; x <= r.x1; x += 10) for (const z of [r.z - r.width / 2, r.z, r.z + r.width / 2]) {
      assert.ok(Math.abs(rawHeight(x, z) - stripLevel(s, x, z)) < 1e-3, `${s.id} ${x},${z}`);
    }
    for (const p of [s.pad, s.helipad, s.fuelTank, s.mixTank, s.crewPost, s.truck, s.hangar, s.pickup, ...s.reservoirs]) assert.ok(Math.abs(rawHeight(p.x, p.z) - s.y0) < 1e-3, `${s.id} pad level`);
    // The platform fits its land: never more than ~14 m of cut or fill.
    let worst = 0;
    for (let x = r.x0; x <= r.x1; x += 20) worst = Math.max(worst, Math.abs(naturalHeight(x, r.z) - stripLevel(s, x, r.z)));
    assert.ok(worst < 14, `${s.id} cut/fill ${worst.toFixed(1)} m`);
  }
  // Grades and cross slopes as advertised.
  const sc = siteById('serradocedro').runway;
  assert.ok(stripLevel(siteById('serradocedro'), sc.x1, sc.z) - siteById('serradocedro').y0 > 15, 'Serra do Cedro climbs');
  const vv = siteById('valeverde'), vr = vv.runway;
  assert.ok(stripLevel(vv, vr.x1, vr.z - 8) > stripLevel(vv, vr.x1, vr.z + 8), 'Vale Verde tilts towards the creek (south)');
  assert.ok(siteById('chapada').y0 > 30, 'Chapada dos Ventos is up on the plateau');
});

test('the old 8 x 8 km world is untouched by the outer ring', () => {
  for (let z = -3990; z <= 3990; z += 97) for (let x = -3990; x <= 3990; x += 97) assert.equal(ringReliefAt(x, z), 0);
  assert.ok(Math.abs(reliefAt(0, 0)) === 0);
});

test('every farm has requests; their talhões belong to it and pay rises with difficulty', () => {
  for (const id of NEW) {
    const cs = FARM_CONTRACTS.filter((c) => c.farm === id);
    assert.ok(cs.length >= 1, id);
    for (const c of cs) {
      for (const n of c.fields) {
        const f = FIELDS.find((q) => q.name === n);
        assert.ok(f && f.farm === id && f.contract === c.id, `${c.id} field ${n}`);
      }
      assert.equal(contractStars(c), FARMS.find((f) => f.id === id).difficulty);
      assert.ok(c.title && c.from && c.message && c.brief && c.tip && c.difficulty, c.id);
    }
  }
  const byD = {};
  for (const c of FARM_CONTRACTS) (byD[contractStars(c)] ??= []).push(c.payPerHa);
  const mean = (d) => byD[d].reduce((a, b) => a + b, 0) / byD[d].length;
  const ds = Object.keys(byD).map(Number).sort();
  for (let i = 1; i < ds.length; i++) assert.ok(mean(ds[i]) > mean(ds[i - 1]), `pay ${ds[i - 1]} → ${ds[i]}`);
  assert.ok(Math.min(...byD[5]) > Math.max(...byD[1]) * 1.8, 'experts earn ~twice the easy rate');
});

test('aircraft compatibility: short and narrow strips take the light aircraft only', () => {
  for (const s of ring) {
    const list = AIRCRAFT_ORDER.filter((id) => stripAllows(s.farm, id));
    assert.ok(list.includes('ipanema') && list.includes('r44'), `${s.id}: Ipanema and R44 everywhere`);
    for (const id of s.farm.aircraft ?? []) assert.ok(AIRCRAFT_ORDER.includes(id), `${s.id} ${id}`);
    const len = s.runway.x1 - s.runway.x0;
    if (len < 450 || s.runway.width < 15) assert.ok(!stripAllows(s.farm, 'at502') && !stripAllows(s.farm, 'm18'), `${s.id} too short for the big aircraft`);
    if (!stripAllows(s.farm, 'at502')) assert.ok(!stripAllows(s.farm, 'm18'), `${s.id}: the Dromader needs at least what the AT-502 needs`);
  }
  assert.ok(stripAllows(null, 'm18'), 'the main base takes the whole fleet');
});

test('farm scenery stands clear of strips, talhões, roads and the service yard', () => {
  for (const s of ring) {
    const r = s.runway;
    for (const [kind, px, pz] of s.farm.props ?? []) {
      const x = px + s.dx, z = pz + s.dz;
      const R = kind === 'silo' ? 6 : kind === 'bigShed' ? 21 : kind === 'turbine' ? 30 : kind === 'corral' ? 16 : 8;
      assert.ok(!(px + R > PLAN.x0 && px - R < PLAN.x1 && pz + R > PLAN.z0 && pz - R < PLAN.z1), `${s.id} ${kind} in the truck yard`);
      const minC = kind === 'boulder' ? 24 : 40;
      assert.ok(!(x > r.x0 - 60 && x < r.x1 + 60 && Math.abs(z - r.z) < minC), `${s.id} ${kind} on the strip`);
      if (kind === 'pier' || kind === 'boat') continue;
      for (const f of FIELDS) assert.ok(!(x + R > f.x0 - 8 && x - R < f.x1 + 8 && z + R > f.z0 - 8 && z - R < f.z1 + 8), `${s.id} ${kind} in ${f.name}`);
      for (const rd of ROADS) for (const [qx, qz] of rd.pts) assert.ok(Math.hypot(qx - x, qz - z) > R + rd.w / 2, `${s.id} ${kind} on a road`);
    }
  }
});

test('local wind: the plateau farm is windier, the base is not', () => {
  const c = siteById('chapada');
  const w = windFactorAt(c.pad.x, c.pad.z);
  assert.ok(w.mean > 1.3 && w.gust > 2, JSON.stringify(w));
  const b = windFactorAt(BASE.pad.x, BASE.pad.z);
  assert.equal(b.mean, 1); assert.equal(b.gust, 1);
});

// Take-off from every outer-ring strip with each airplane it is cleared for,
// carrying the heaviest load its requests recommend: downhill on a graded
// strip (as the farmers advise), lift-off well inside the strip.
import { makeSim } from './harness.mjs';
import { FLIGHT, FLIGHT_AT502, FLIGHT_M18 } from '../src/config.js';
const PLANES = { ipanema: FLIGHT, at502: FLIGHT_AT502, m18: FLIGHT_M18 };
function stripTakeoff(A, s, fuel, hopper) {
  const r = s.runway, east = (r.grade || 0) <= 0;
  const sim = makeSim({ A, hopper, fuel, wind: false });
  const { fm } = sim;
  const hdg = east ? Math.PI / 2 : -Math.PI / 2;
  fm.settleOnGround(east ? r.x0 + 12 : r.x1 - 12, r.z, hdg, sim.env);
  fm.engine = 'running'; fm.throttle = 0.05;
  if (A.turbine) { fm.ng = A.turbine.idleNg; fm.rpm = A.idleRpm; } else if (A.radial) { fm.rpm = A.idleRpm; fm.mp = A.radial.mpIdle; } else fm.rpm = 900;
  fm.flapsCmd = fm.flaps = 1 / 3;
  sim.step(240);
  const x0 = fm.pos.x;
  const vs = Math.sqrt((2 * fm.mass * 9.81) / (1.225 * A.wingArea * 1.9));
  const cmd = { pitch: 0, roll: 0, yaw: 0 };
  let dist = Infinity, v = 0;
  for (let i = 0; i < 120 * 90; i++) {
    fm.throttle = Math.min(1, fm.throttle + 0.55 / 120);
    let e = hdg - fm.heading(); e = Math.atan2(Math.sin(e), Math.cos(e));
    cmd.yaw = Math.max(-1, Math.min(1, -e * 3 + fm.omega.y * 1.5));
    v = fm.out.airspeed;
    cmd.pitch = v < 16 ? 0 : v < vs * 1.1 ? -0.2 : 0.6;
    sim.step(1, cmd, 'normal');
    if (dist === Infinity && !fm.out.onGround && fm.out.agl > 0.5) { dist = Math.abs(fm.pos.x - x0); break; }
    if (fm.out.crashed) break;
  }
  return { dist, v, mass: fm.mass };
}

test('every outer strip lets its cleared airplanes take off with the recommended load', () => {
  for (const s of ring) {
    const cs = FARM_CONTRACTS.filter((c) => c.farm === s.id);
    const fuel = Math.max(...cs.map((c) => c.recommended.fuel)), liquid = Math.max(...cs.map((c) => c.recommended.liquid));
    const len = s.runway.x1 - s.runway.x0;
    for (const [id, A] of Object.entries(PLANES)) {
      if (!stripAllows(s.farm, id)) continue;
      const r = stripTakeoff(A, s, Math.min(fuel, A.fuelCapacity), Math.min(liquid, A.hopperCapacity));
      console.log(`  ${s.id.padEnd(14)} ${id.padEnd(8)} ${r.mass.toFixed(0)} kg: lift-off ${r.dist.toFixed(0)} m of ${len} m`);
      assert.ok(r.dist < len * 0.8, `${s.id} ${id}: lift-off after ${r.dist.toFixed(0)} m of ${len}`);
    }
  }
});
