// Light bar: the LED pattern every display shares, and the physical bar's
// cost (two draw calls, colours written only when the pattern changes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { lightbarFill, lightbarKey, createLightbar, LB_OFF, LB_DIM, LB_GREEN, LB_AMBER, LB_RED } from '../src/aircraft/lightbar.js';

const fill = (mode, xte, n = 25) => Array.from(lightbarFill(new Uint8Array(n), n, mode, xte));

test('dark with no pass, centre glow while turning to the pass', () => {
  assert.ok(fill(0, 3).every((v) => v === LB_OFF));
  const s = fill(1, 3);
  assert.equal(s[12], LB_DIM);
  assert.equal(s.filter((v) => v !== LB_OFF).length, 1);
});

test('on the line: the centre lights green, nothing else', () => {
  const s = fill(2, 0.4);
  assert.deepEqual([s[11], s[12], s[13]], [LB_GREEN, LB_GREEN, LB_GREEN]);
  assert.equal(s.filter((v) => v !== LB_OFF).length, 3);
});

test('off the line: the light gathers on the side to steer to, amber then red, growing with the error', () => {
  const right = fill(2, 2), left = fill(2, -2);
  assert.ok(right.slice(13).some((v) => v === LB_AMBER) && right.slice(0, 12).every((v) => v === LB_OFF));
  assert.ok(left.slice(0, 12).some((v) => v === LB_AMBER) && left.slice(13).every((v) => v === LB_OFF));
  const lit = (x) => fill(2, x).filter((v) => v === LB_AMBER || v === LB_RED).length;
  assert.ok(lit(1.5) < lit(4) && lit(4) < lit(10) && lit(10) <= 12);
  assert.ok(fill(2, 20).includes(LB_RED) && !fill(2, 1.5).includes(LB_RED));
  // Any bar length: the same reading on the 15-LED cockpit bars.
  const s15 = fill(2, 20, 15);
  assert.equal(s15[14], LB_RED);
});

test('the key changes only when the drawn pattern does', () => {
  assert.equal(lightbarKey(25, 2, 0.1), lightbarKey(25, 2, -0.5));
  assert.notEqual(lightbarKey(25, 2, 0.1), lightbarKey(25, 2, 3));
  assert.equal(lightbarKey(25, 2, 14.9), lightbarKey(25, 2, 40));
  assert.equal(lightbarKey(25, 0, 3), lightbarKey(25, 0, -9));
});

test('physical bar: two meshes, LED colours written only on a pattern change', () => {
  const b = createLightbar({ n: 25 });
  const meshes = []; b.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes.length, 2);
  const inst = meshes.find((m) => m.isInstancedMesh);
  assert.equal(inst.count, 25);
  assert.ok(b.set(2, 3));
  const v = inst.instanceColor.version;
  assert.equal(b.set(2, 3.05), false, 'same pattern: nothing written');
  assert.equal(inst.instanceColor.version, v);
  assert.ok(b.set(2, -3));
  assert.ok(inst.instanceColor.version > v);
});
