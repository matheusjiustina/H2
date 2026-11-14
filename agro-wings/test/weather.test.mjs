// Dynamic weather and passing time of day: brief showers, mist only in the
// morning, farm tendencies, smooth hand-over to the atmosphere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WeatherCycle, TIME_STAGE } from '../src/world/weatherCycle.js';
import { siteById } from '../src/world/layout.js';
import { contractWindow, FARM_CONTRACTS } from '../src/game/farmContracts.js';

function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const at = (x, z) => ({ aircraft: { fm: { pos: { x, z } } } });

function run(game, seconds, opts) {
  const c = new WeatherCycle(game, lcg(7));
  c.start({ weather: 'clear', time: 'dawn', dynamic: true, flow: true, ...opts });
  const time = {}, rain = []; let cur = null, len = 0;
  for (let s = 0; s < seconds; s++) {
    c.update(1);
    time[c.weather] = (time[c.weather] || 0) + 1;
    if (c.weather === 'mist') assert.ok(c.time === 'dawn' || c.time === 'morning', `mist at ${c.time}`);
    if (c.weather !== cur) { if (cur === 'rain') rain.push(len); cur = c.weather; len = 0; }
    len++;
  }
  return { time, rain, c };
}

test('dynamic weather: every preset shows up, showers are brief, mist only in the morning', () => {
  const { time, rain } = run(at(-352, -64), 6 * 3600);
  for (const k of ['clear', 'partly', 'overcast', 'rain']) assert.ok(time[k] > 0, k);
  assert.ok(rain.length > 0 && Math.max(...rain) <= 150 * 2 + 1, `rain spells ${rain}`);
  assert.ok(time.rain < time.clear + time.partly, 'mostly fair weather');
});

test('time of day passes through every stage and wraps', () => {
  const c = new WeatherCycle(at(0, 0), lcg(3));
  c.start({ weather: 'clear', time: 'dawn', dynamic: false, flow: true });
  const seen = [c.time];
  for (let s = 0; s < TIME_STAGE * 5 + 1; s++) if (c.update(1)) seen.push(c.time);
  assert.deepEqual(seen, ['dawn', 'morning', 'noon', 'golden', 'dusk', 'dawn']);
  assert.equal(c.weather, 'clear', 'fixed weather stays');
});

test('farm tendencies: Vale do Rio rains more than Santa Rita', () => {
  const vr = siteById('valedorio').pad, sr = siteById('santarita').pad;
  const wet = run(at(vr.x, vr.z), 12 * 3600, { flow: false, time: 'noon' }).time.rain || 0;
  const dry = run(at(sr.x, sr.z), 12 * 3600, { flow: false, time: 'noon' }).time.rain || 0;
  assert.ok(wet > dry * 2, `rain s: humid ${wet}, dry ${dry}`);
});

test('farm requests follow the conditions (rain postpones, morning-only)', () => {
  const sr = FARM_CONTRACTS.find((c) => c.id === 'sr-soy'), sa = FARM_CONTRACTS.find((c) => c.id === 'sa-corn');
  assert.equal(contractWindow(sr, 'morning', 'clear').ok, true);
  assert.equal(contractWindow(sr, 'noon', 'clear').ok, false);
  assert.equal(contractWindow(sr, 'morning', 'rain').ok, false);
  assert.equal(contractWindow(sa, 'morning', 'mist').ok, false);
  for (const c of FARM_CONTRACTS) assert.equal(contractWindow(c, 'morning', 'rain').ok, false, c.id);
});
