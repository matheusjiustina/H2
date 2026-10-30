// Key bindings: saved bindings from older builds are cleaned up on load so
// Q is only the left rudder and F only the engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, migrateBindings, chordOf, keyHeld, keyPressed, keyLabel } from '../src/core/input.js';

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

test('Shift + Up / Down move the pilot eye; the chord keeps Shift and Up to itself', () => {
  const b = defaults();
  assert.deepEqual(b.eyeUp, ['Shift+ArrowUp']);
  assert.deepEqual(b.eyeDown, ['Shift+ArrowDown']);
  assert.deepEqual(chordOf('Shift+ArrowUp'), [['ShiftLeft', 'ShiftRight'], 'ArrowUp']);
  assert.equal(chordOf('NumpadAdd'), null);
  const chords = Object.values(b).flat().map(chordOf).filter(Boolean);
  const held = (code, ...keys) => keyHeld(code, new Set(keys), chords);
  // Either Shift with Up: the eye rises, power (Shift) and the classic
  // stick (Up) do not see their keys.
  for (const sh of ['ShiftLeft', 'ShiftRight']) assert.ok(held('Shift+ArrowUp', sh, 'ArrowUp'));
  assert.ok(!held('ShiftLeft', 'ShiftLeft', 'ArrowUp'));
  assert.ok(!held('ArrowUp', 'ShiftLeft', 'ArrowUp'));
  assert.ok(!held('Shift+ArrowDown', 'ShiftLeft', 'ArrowUp'));
  // Alone, each key is its own again.
  assert.ok(held('ShiftLeft', 'ShiftLeft'));
  assert.ok(held('ArrowUp', 'ArrowUp'));
  assert.ok(!held('Shift+ArrowUp', 'ArrowUp'));
  // Shift with another key (power while rolling) is untouched.
  assert.ok(held('ShiftLeft', 'ShiftLeft', 'ArrowLeft'));
  // Taps: a key pressed and let go within one frame still counts; Shift
  // tapped while Up is held makes the chord, not a power step.
  const tap = (code, pressed, ...down) => keyPressed(code, new Set(pressed), new Set(down), chords);
  assert.ok(tap('KeyV', ['KeyV']));
  assert.ok(tap('Shift+ArrowUp', ['ArrowUp'], 'ShiftLeft'));
  assert.ok(tap('Shift+ArrowUp', ['ShiftLeft', 'ArrowUp']));
  assert.ok(!tap('ShiftLeft', ['ShiftLeft'], 'ShiftLeft', 'ArrowUp'));
  assert.ok(!tap('Shift+ArrowUp', ['ArrowUp']));
  assert.equal(keyLabel('Shift+ArrowUp'), 'Shift + Up');
  assert.deepEqual(migrateBindings(defaults()).eyeUp, ['Shift+ArrowUp']);
});
