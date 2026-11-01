// Continuous protection of the flight / helicopter / spray physics: the 28 reproducible scenarios of
// test/p6golden.mjs must give exactly the checksums recorded in test/golden/physics.json (the same values
// the v73 tag produces — phase 6 proved it). A deliberate physics change must regenerate the file
// (node test/p6golden.mjs test/golden/physics.json, then keep only hash/n/final) AND be reviewed.
// A new aircraft type must also get its scenarios in p6golden.mjs (covered check below).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { AIRCRAFT_TYPES } from '../src/aircraft/types.js';

const ref = JSON.parse(fs.readFileSync(new URL('./golden/physics.json', import.meta.url), 'utf8'));

test('every flight model in the registry has golden physics scenarios', () => {
  for (const [id, T] of Object.entries(AIRCRAFT_TYPES)) {
    const key = T.kind === 'heli' ? `heli.${id}.` : `plane.${id}.`;
    assert.ok(Object.keys(ref).some((k) => k.startsWith(key)), `aircraft '${id}' has no golden scenario (add it to test/p6golden.mjs and regenerate test/golden/physics.json)`);
  }
});

test('physics traces are identical to the recorded reference (28 scenarios)', () => {
  const out = new URL('./golden/_now.json', import.meta.url).pathname;
  const r = spawnSync(process.execPath, [new URL('./p6golden.mjs', import.meta.url).pathname, out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const now = JSON.parse(fs.readFileSync(out, 'utf8'));
  fs.unlinkSync(out);
  const bad = Object.keys(ref).filter((k) => now[k]?.hash !== ref[k].hash);
  assert.deepEqual(bad, [], `physics changed in: ${bad.join(', ')}`);
  assert.equal(Object.keys(now).length, Object.keys(ref).length);
});
