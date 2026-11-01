// PerfManager against a stub game: old saves, ?q=, profile switches, the
// FPS cap, restore defaults, and that Ultra Original is applied exactly as
// the old code did (run: node --test test/perfmanager.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = { devicePixelRatio: 2, innerWidth: 1280, innerHeight: 720 };
const { PerfManager } = await import('../src/core/perfManager.js');
const { QUALITY } = await import('../src/config.js');

function stub(settings = {}) {
  const calls = { setQuality: [], ratio: [], resize: 0, saved: [] };
  const g = {
    settings: { quality: 'medium', qualityAuto: true, profile: null, fpsLimit: 0, autoLast: null, showFps: false, ...settings },
    renderer: { _r: 1, getPixelRatio() { return this._r; }, setPixelRatio(r) { this._r = r; calls.ratio.push(r); }, getContext: () => null, capabilities: { isWebGL2: true, maxTextureSize: 16384, maxSamples: 4, getMaxAnisotropy: () => 16 } },
    world: { setQuality: (q) => calls.setQuality.push(q) },
    mist: { limit: 0, max: 6000 },
    resize() { calls.resize++; },
    toast() {},
    setSetting(k, v) { this.settings[k] = v; calls.saved.push(k); },
  };
  return { g, calls };
}

test('old saves: a manual quality choice maps over, the automatic one starts in auto', () => {
  let { g } = stub({ quality: 'high', qualityAuto: false });
  let p = new PerfManager(g, '');
  assert.equal(p.mode, 'manual'); assert.equal(p.profileId, 'ultra'); assert.equal(g.settings.profile, 'ultra');
  ({ g } = stub({ quality: 'low', qualityAuto: false }));
  assert.equal(new PerfManager(g, '').profileId, 'economico');
  ({ g } = stub({ quality: 'medium', qualityAuto: true }));
  p = new PerfManager(g, '');
  assert.equal(p.mode, 'auto'); assert.equal(g.settings.profile, 'auto');
});

test('?q= pins the profile for the session and freezes the controller (benchmarks, tests)', () => {
  const { g } = stub();
  const p = new PerfManager(g, '?q=high');
  assert.equal(p.forced, true); assert.equal(p.profileId, 'ultra'); assert.equal(p.ctl.frozen, true);
  for (let i = 0; i < 5000; i++) p.update(i * 40, 40);
  assert.equal(p.scale, 1);
});

test('Ultra Original applies exactly the old settings: same quality object, same pixel ratio, same particle limit', () => {
  const { g, calls } = stub({ profile: 'ultra' });
  const p = new PerfManager(g, '');
  p.init();
  assert.equal(g.quality, QUALITY.high);
  assert.equal(g.renderer._r, Math.min(2, 2) * 1.5);
  assert.equal(p.profile.particles, 6000);
  p.setProfile('medio');
  assert.equal(g.quality, QUALITY.medium); assert.equal(g.mist.limit, 3500); assert.equal(calls.setQuality.at(-1), QUALITY.medium);
  p.setProfile('ultra');
  assert.equal(g.quality, QUALITY.high); assert.equal(g.renderer._r, 3); assert.equal(g.mist.limit, 6000);
});

test('FPS cap: frames are skipped to the limit, none when off', () => {
  const { g } = stub({ profile: 'medio' });
  const p = new PerfManager(g, '');
  let n = 0;
  for (let t = 0; t < 1000; t += 16.667) if (!p.gate(t)) n++;
  assert.ok(n >= 59);
  g.settings.fpsLimit = 30; n = 0; p.lastFrame = 0;
  for (let t = 0; t < 1000; t += 16.667) if (!p.gate(t)) n++;
  assert.ok(n >= 29 && n <= 31, `got ${n}`);
  g.settings.fpsLimit = 60; n = 0; p.lastFrame = 0;
  for (let t = 0; t < 1000; t += 8.333) if (!p.gate(t)) n++; // a 120 Hz display
  assert.ok(n >= 58 && n <= 61, `got ${n}`);
});

test('a persistent drop in auto mode changes resolution without touching the world modules; a profile move does', () => {
  const { g, calls } = stub({ profile: 'auto', autoLast: 'alto' });
  const p = new PerfManager(g, '');
  p.init();
  assert.equal(p.profileId, 'alto');
  const before = calls.setQuality.length;
  let t = 0, scaleMoves = 0;
  while (p.profileId === 'alto' && t < 200000) { t += 40; const s0 = p.scale; p.update(t, 40); if (p.scale !== s0) scaleMoves++; }
  assert.ok(scaleMoves >= 1);
  assert.ok(calls.setQuality.length - before <= 1, 'only the profile move calls world.setQuality');
  assert.equal(p.profileId, 'medio');
  assert.equal(g.settings.autoLast, 'medio');
  assert.ok(p.stats().costUsPerFrame < 50);
});

test('restore defaults: auto, no cap, FPS overlay off, forgotten rung', () => {
  const { g } = stub({ profile: 'ultra', fpsLimit: 30, showFps: true, autoLast: 'alto' });
  const p = new PerfManager(g, '');
  p.restoreDefaults();
  assert.equal(g.settings.profile, 'auto'); assert.equal(g.settings.fpsLimit, 0);
  assert.equal(g.settings.showFps, false); assert.equal(g.settings.autoLast, null);
  assert.equal(p.mode, 'auto');
});
