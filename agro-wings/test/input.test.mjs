// Key bindings: saved bindings from older builds are cleaned up on load so
// Q is only the left rudder and F only the engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, migrateBindings } from '../src/core/input.js';

const defaults = () => Object.fromEntries(Object.entries(ACTIONS).map(([k, a]) => [k, a.keys.slice()]));

test('defaults: engine on F, Q only on the left rudder', () => {
  const b = defaults();
  assert.deepEqual(b.engine, ['KeyF']);
  assert.deepEqual(Object.keys(b).filter((k) => b[k].includes('KeyQ')), ['nYawLeft']);
  assert.deepEqual(migrateBindings(defaults()), b, 'the clean-up leaves the defaults alone');
});

test('old saved bindings: Q no longer starts or cuts the engine, F does', () => {
  for (const saved of [
    { engine: ['KeyQ'] },
    { engine: ['KeyF', 'KeyQ'] }, // rebound to F while Q was the engine key
    { engine: ['KeyQ', 'KeyF'] },
    { engine: ['KeyQ'], throttleDown: ['KeyF', 'ControlLeft'] },
  ]) {
    const b = migrateBindings({ ...defaults(), ...saved });
    assert.equal(b.engine[0], 'KeyF', JSON.stringify(saved));
    assert.ok(!b.engine.includes('KeyQ'), JSON.stringify(saved));
    assert.ok(b.nYawLeft.includes('KeyQ'));
    assert.ok(!b.throttleDown.includes('KeyF'));
    assert.ok(b.throttleDown.length > 0);
  }
  // A second key the player chose for the engine is kept (after F).
  assert.deepEqual(migrateBindings({ ...defaults(), engine: ['KeyI', 'KeyQ'] }).engine, ['KeyF', 'KeyI']);
});
