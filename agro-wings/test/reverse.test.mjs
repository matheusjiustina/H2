// Turboprop reverse (AT-502B / Thrush 510G / AT-802): only with a wheel on
// the ground, the gas generator spools up behind the gate, the thrust turns
// round and shortens the landing roll; locked out in flight; pistons have none.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, Vector3 } from './harness.mjs';
import { FLIGHT, FLIGHT_AT502 } from '../src/config.js';

function idleOnRunway(A, speed) {
  const sim = makeSim({ A, hopper: 0, fuel: 300, wind: false });
  const { fm } = sim;
  fm.settleOnGround(-385, 0, Math.PI / 2, sim.env);
  fm.engine = 'running'; fm.ng = A.turbine.idleNg; fm.rpm = A.idleRpm; fm.throttle = 0;
  fm.vel.set(speed, 0, 0); // rolling east along the strip
  return sim;
}
const rollOut = (sim, reverse, seconds = 40) => {
  const { fm } = sim;
  const x0 = fm.pos.x;
  for (let i = 0; i < 120 * seconds && (i < 5 || fm.out.groundSpeed > 1); i++) { fm.reverse = reverse; fm.throttle = 0; sim.step(1); }
  return { dist: fm.pos.x - x0, ng: fm.ng };
};

test('reverse: gas generator spools up, thrust reverses, landing roll much shorter', () => {
  const beta = rollOut(idleOnRunway(FLIGHT_AT502, 28), 0);
  const sim = idleOnRunway(FLIGHT_AT502, 28);
  const rev = rollOut(sim, 1);
  console.log(`  roll from 28 m/s: beta idle ${beta.dist.toFixed(0)} m, full reverse ${rev.dist.toFixed(0)} m, Ng ${rev.ng.toFixed(0)} %`);
  assert.ok(rev.dist < beta.dist * 0.8, 'reverse shortens the roll');
  assert.ok(rev.ng > FLIGHT_AT502.turbine.idleNg + 15, 'Ng rises in reverse');
});

test('reverse: locked out with no wheel on the ground', () => {
  const sim = makeSim({ A: FLIGHT_AT502, hopper: 0, fuel: 300, wind: false });
  const { fm } = sim;
  fm.reset(new Vector3(0, 400, 0), Math.PI / 2, { speed: 50, engineOn: true });
  fm.ng = 90;
  fm.reverse = 1; sim.step(1);
  assert.equal(fm.reverse, 0);
});

test('reverse: piston aircraft never reverse thrust', () => {
  const sim = makeSim({ A: FLIGHT, hopper: 0, fuel: 200, wind: false });
  const { fm } = sim;
  fm.settleOnGround(-385, 0, Math.PI / 2, sim.env);
  assert.equal(FLIGHT.turbine, undefined);
  assert.ok(fm.reverse === 0 || fm.reverse === undefined);
});
