// Phase 05: safe local saves (hash envelope, backup, legacy entries).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readSafe, writeSafe, hash } from '../src/core/safeStore.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

test('write then read returns the data from the main entry', () => {
  const s = mem();
  assert.equal(writeSafe('k', { money: 120, a: [1, 2] }, 1, s), true);
  const r = readSafe('k', s);
  assert.deepEqual(r.data, { money: 120, a: [1, 2] });
  assert.equal(r.source, 'main'); assert.equal(r.damaged, false);
});

test('a damaged main entry falls back to the previous good copy', () => {
  const s = mem();
  writeSafe('k', { money: 100 }, 1, s);
  writeSafe('k', { money: 200 }, 1, s); // backup now holds money 100
  s.setItem('k', s.getItem('k').replace('200', '999')); // bytes changed: hash no longer matches
  let r = readSafe('k', s);
  assert.equal(r.source, 'backup'); assert.equal(r.damaged, true); assert.deepEqual(r.data, { money: 100 });
  s.setItem('k', '{"f":"aw1","v":1,"sum":"'); // truncated write
  r = readSafe('k', s);
  assert.equal(r.source, 'backup'); assert.deepEqual(r.data, { money: 100 });
});

test('entries written before the envelope (plain JSON) are still read', () => {
  const s = mem();
  s.setItem('k', JSON.stringify({ money: 55 }));
  const r = readSafe('k', s);
  assert.deepEqual(r.data, { money: 55 }); assert.equal(r.source, 'main');
  writeSafe('k', { money: 60 }, 1, s); // the legacy entry becomes the backup
  assert.deepEqual(JSON.parse(s.getItem('k.bak')), { money: 55 });
});

test('a damaged entry is never copied over the backup', () => {
  const s = mem();
  writeSafe('k', { money: 1 }, 1, s);
  writeSafe('k', { money: 2 }, 1, s);
  s.setItem('k', 'garbage');
  writeSafe('k', { money: 3 }, 1, s); // the garbage is not kept: the backup stays the money-1 copy
  assert.deepEqual(readSafe('k', s).data, { money: 3 });
  const b = JSON.parse(s.getItem('k.bak'));
  assert.equal(b.f, 'aw1'); assert.equal(JSON.parse(b.data).money, 1);
});

test('storage that refuses writes or reads does not throw', () => {
  const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } };
  assert.equal(writeSafe('k', { a: 1 }, 1, bad), false);
  assert.deepEqual(readSafe('k', bad), { data: null, source: 'none', damaged: true });
  assert.equal(readSafe('none', mem()).damaged, false);
  assert.equal(hash('abc'), hash('abc')); assert.notEqual(hash('abc'), hash('abd'));
});
