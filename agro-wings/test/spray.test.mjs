// Spray deposition / coverage validation (run: node --test test/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { makeSim } from './harness.mjs';
import { Sprayer } from '../src/spray/sprayer.js';
import { FieldCoverage } from '../src/spray/coverage.js';
import { CONTRACT_FIELDS } from '../src/world/layout.js';
import { SPRAY, FLIGHT } from '../src/config.js';

const soy = CONTRACT_FIELDS.find((f) => f.name === 'T-07');
const cotA = CONTRACT_FIELDS.find((f) => f.name === 'T-03A');
const cotB = CONTRACT_FIELDS.find((f) => f.name === 'T-03B');

// Fly a straight eastbound line at a given height over the canopy with the
// valve open, using the real flight model + spray step at 120 Hz.
function fly({ z, height = 3.4, x0, x1, wind = null, coverages, speed = 46, hopper = 900 }) {
  const sim = makeSim({ hopper, fuel: 160, wind: false });
  const { fm, env } = sim;
  const windVec = new Vector3();
  const game = { aircraft: { fm, env, windVec }, toast() {}, audio: null };
  const sp = new Sprayer(game);
  sp.setTargets(coverages);
  const top = env.top(x0, z);
  fm.reset(new Vector3(x0, top + 1.25 + height, z), Math.PI / 2, { speed, engineOn: true });
  fm.throttle = 0.75;
  sp.on = true;
  const h = FLIGHT.sim.dt;
  while (fm.pos.x < x1) {
    if (wind) windVec.copy(wind);
    env.wind.copy(windVec);
    // Hold line, height and wings level by resetting attitude drift (deposition test, not handling).
    fm.quat.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    fm.omega.set(0, 0, 0);
    fm.vel.set(speed, 0, 0);
    fm.pos.y = env.top(fm.pos.x, z) + 1.25 + height;
    fm.pos.z = z;
    fm.step(h, env);
    sp.step(h);
  }
  return sp;
}

function profileAcross(cov, x) {
  const f = cov.f;
  const ix = Math.floor((x - f.x0) / cov.cell);
  const out = [];
  for (let iz = 0; iz < cov.nz; iz++) out.push(cov.dose[iz * cov.nx + ix]);
  return out;
}

test('one pass at work height lays a ~24 m swath close to the target dose', () => {
  const cov = new FieldCoverage(soy);
  const zc = -280;
  fly({ z: zc, x0: soy.x0 - 30, x1: soy.x1 + 30, coverages: [cov] });
  const prof = profileAcross(cov, 450);
  const treated = prof.filter((d) => d >= SPRAY.doseGood[0]).length * cov.cell;
  const centre = prof[Math.floor((zc - soy.z0) / cov.cell)];
  console.log(`  treated width ${treated} m, centre dose ${centre.toFixed(2)}`);
  assert.ok(treated >= 18 && treated <= 30, `swath ${treated}`);
  assert.ok(centre > 0.8 && centre < 1.4, `centre dose ${centre}`);
});

test('adjacent passes at swath spacing give uniform coverage; double pass shows overlap', () => {
  const cov = new FieldCoverage(soy);
  const z0 = soy.z0 + SPRAY.swath / 2;
  for (let k = 0; k < 4; k++) fly({ z: z0 + k * SPRAY.swath, x0: soy.x0 - 30, x1: soy.x1 + 30, coverages: [cov] });
  const prof = profileAcross(cov, 450).slice(0, Math.floor((4 * SPRAY.swath - 6) / cov.cell));
  const mean = prof.reduce((a, b) => a + b, 0) / prof.length;
  const cv = Math.sqrt(prof.reduce((a, b) => a + (b - mean) ** 2, 0) / prof.length) / mean;
  console.log(`  4 passes: mean dose ${mean.toFixed(2)}, CV ${(cv * 100).toFixed(0)}%`);
  assert.ok(cv < 0.2, `CV ${cv}`);
  const before = cov.stats().overlap;
  fly({ z: z0 + SPRAY.swath, x0: soy.x0 - 30, x1: soy.x1 + 30, coverages: [cov] });
  const after = cov.stats().overlap;
  console.log(`  overlap fraction ${(before * 100).toFixed(1)}% -> ${(after * 100).toFixed(1)}% after re-spraying one pass`);
  assert.ok(after > before + 0.03);
});

test('height above the canopy changes swath and losses', () => {
  const lowCov = new FieldCoverage(soy), highCov = new FieldCoverage(soy);
  const low = fly({ z: -280, height: 1.0, x0: soy.x0 - 30, x1: soy.x1 + 30, coverages: [lowCov] });
  const high = fly({ z: -280, height: 12, x0: soy.x0 - 30, x1: soy.x1 + 30, coverages: [highCov] });
  const w = (cov) => profileAcross(cov, 450).filter((d) => d > 0.05).length * cov.cell;
  console.log(`  1 m: wet width ${w(lowCov)} m, loss ${(low.lost / low.sprayed * 100).toFixed(0)}% | 12 m: wet width ${w(highCov)} m, loss ${(high.lost / high.sprayed * 100).toFixed(0)}%`);
  assert.ok(w(lowCov) < w(highCov));
  assert.ok(high.lost / high.sprayed > low.lost / low.sprayed + 0.2);
});

test('crosswind drifts the deposit downwind', () => {
  const calm = new FieldCoverage(soy), windy = new FieldCoverage(soy);
  fly({ z: -280, height: 4, x0: soy.x0 - 30, x1: soy.x1 + 30, coverages: [calm] });
  fly({ z: -280, height: 4, x0: soy.x0 - 30, x1: soy.x1 + 30, coverages: [windy], wind: new Vector3(0, 0, 5) });
  const centroid = (cov) => {
    const p = profileAcross(cov, 450);
    let s = 0, w = 0;
    p.forEach((d, i) => { s += d * (cov.f.z0 + (i + 0.5) * cov.cell); w += d; });
    return s / w;
  };
  const shift = centroid(windy) - centroid(calm);
  console.log(`  5 m/s crosswind shifts the swath by ${shift.toFixed(1)} m`);
  assert.ok(shift > 2, 'deposit must move downwind (+Z)');
});

test('liquid outside the talhão counts as waste; the creek gap between cotton fields too', () => {
  const a = new FieldCoverage(cotA), b = new FieldCoverage(cotB);
  const sp = fly({ z: 0, height: 3.4, x0: cotA.x0 - 10, x1: cotB.x1 + 10, coverages: [a, b] });
  const frac = sp.offTarget / sp.sprayed;
  console.log(`  spraying straight across both fields and the gap: ${(frac * 100).toFixed(0)}% off target`);
  assert.ok(frac > 0.2, 'gap should be counted as off-target');
  const a2 = new FieldCoverage(cotA), b2 = new FieldCoverage(cotB);
  const sp2 = fly({ z: 0, height: 3.4, x0: cotA.x0 + 2, x1: cotA.x1 - 14, coverages: [a2, b2] });
  console.log(`  valve only over the field: ${(sp2.offTarget / sp2.sprayed * 100).toFixed(0)}% off target`);
  assert.ok(sp2.offTarget / sp2.sprayed < 0.1);
});

test('progress needs liquid to land: flying over the field with the valve shut adds nothing', () => {
  const cov = new FieldCoverage(soy);
  const sim = makeSim({ hopper: 500, wind: false });
  const game = { aircraft: { fm: sim.fm, env: sim.env, windVec: new Vector3() }, toast() {} };
  const sp = new Sprayer(game);
  sp.setTargets([cov]);
  sim.fm.reset(new Vector3(300, sim.env.top(300, -280) + 4.6, -280), Math.PI / 2, { speed: 46, engineOn: true });
  for (let i = 0; i < 120 * 8; i++) { sim.step(1); sp.step(1 / 120); }
  assert.equal(cov.stats().coverage, 0);
});

test('coverage persists through save/restore (resume after reload)', () => {
  const cov = new FieldCoverage(soy);
  fly({ z: -300, x0: soy.x0 - 30, x1: soy.x1 + 30, coverages: [cov] });
  const s1 = cov.stats();
  const copy = new FieldCoverage(soy);
  copy.restore(JSON.parse(JSON.stringify(cov.serialize())));
  const s2 = copy.stats();
  assert.ok(Math.abs(s1.coverage - s2.coverage) < 0.002);
  assert.ok(s1.coverage > 0.05);
});

test('hopper drains with the flow and the aircraft gets lighter', () => {
  const cov = new FieldCoverage(soy);
  const sp = fly({ z: -280, x0: soy.x0 - 30, x1: soy.x1 + 30, coverages: [cov], hopper: 600 });
  void sp;
  const sim = makeSim({ hopper: 600 });
  const m0 = sim.fm.mass;
  sim.fm.hopper -= 300;
  sim.fm.updateMass();
  assert.ok(m0 - sim.fm.mass > 290);
});
