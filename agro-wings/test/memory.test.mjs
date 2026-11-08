// Aircraft memory (optimisation stage 1): device tier and parked paint scale.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryTier, PARKED_PAINT } from '../src/aircraft/aircraftMemory.js';

const win = (search = '') => ({ location: { search } });

test('tier: phones and tablets are low unless they report ≥ 6 GB', () => {
  assert.equal(memoryTier({ coarsePointer: true, memoryGB: null }, win()), 'low'); // iOS: no deviceMemory
  assert.equal(memoryTier({ coarsePointer: true, memoryGB: 4 }, win()), 'low');
  assert.equal(memoryTier({ coarsePointer: true, memoryGB: 8 }, win()), 'mid');
});
test('tier: computers are high unless they report ≤ 4 GB', () => {
  assert.equal(memoryTier({ coarsePointer: false, memoryGB: null }, win()), 'high');
  assert.equal(memoryTier({ coarsePointer: false, memoryGB: 8 }, win()), 'high');
  assert.equal(memoryTier({ coarsePointer: false, memoryGB: 4 }, win()), 'mid');
});
test('tier: ?mem= forces it; the flown aircraft is never reduced (parked paint only)', () => {
  assert.equal(memoryTier({ coarsePointer: false, memoryGB: 16 }, win('?mem=low')), 'low');
  assert.equal(memoryTier({ coarsePointer: true, memoryGB: 2 }, win('?q=high&mem=high')), 'high');
  assert.deepEqual(PARKED_PAINT, { low: 0.25, mid: 0.5, high: 1 });
});
