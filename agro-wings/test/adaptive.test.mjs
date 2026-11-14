// Adaptive Performance System: profiles (Ultra Original untouched), capability
// fallbacks and the controller's rules, simulated with synthetic frame times
// (run: node --test test/adaptive.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY, SPRAY } from '../src/config.js';
import { PROFILES, PROFILE_ORDER, LEGACY_TO_PROFILE, normalizeProfile, pixelRatioFor, allowsDynamicRes } from '../src/core/perfProfiles.js';
import { AdaptiveController } from '../src/core/adaptive.js';
import { startProfile } from '../src/core/capabilities.js';

// The numbers of QUALITY.high as shipped in v73 (tag ultra-original-v73).
const HIGH_V73 = { pixelRatio: 1.5, shadow: 4096, shadowRange: 220, cropRadius: 320, cropPlantRadius: 34, cropShadows: true, treeNear: 800, crownRadius: 520, clouds: 44, nearPlants: true, grassRadius: 75, grassDensity: 1, rainDrops: 4000 };
const MEDIUM_V73 = { pixelRatio: 1, shadow: 2048, shadowRange: 170, cropRadius: 240, cropPlantRadius: 24, cropShadows: false, treeNear: 550, crownRadius: 380, clouds: 30, nearPlants: true, grassRadius: 60, grassDensity: 0.8, rainDrops: 2500 };
const LOW_V73 = { pixelRatio: 0.75, shadow: 1024, shadowRange: 120, cropRadius: 160, cropPlantRadius: 14, cropShadows: false, treeNear: 350, crownRadius: 260, clouds: 18, nearPlants: false, grassRadius: 45, grassDensity: 0.5, rainDrops: 1200 };

test('Ultra Original is exactly the v73 high preset; medium and low are unchanged', () => {
  assert.deepEqual({ ...QUALITY.high }, HIGH_V73);
  assert.deepEqual({ ...QUALITY.medium }, MEDIUM_V73);
  assert.deepEqual({ ...QUALITY.low }, LOW_V73);
  assert.equal(PROFILES.ultra.quality, QUALITY.high); // the same object, not a copy
  assert.equal(PROFILES.medio.quality, QUALITY.medium);
  assert.equal(PROFILES.economico.quality, QUALITY.low);
  assert.equal(PROFILES.ultra.particles, SPRAY.maxParticles.high);
  assert.equal(PROFILES.ultra.maxPixels, Infinity);
  // The pixel ratio is the original expression, at any screen.
  for (const [dpr, w, h] of [[1, 1920, 1080], [2, 1440, 900], [3, 412, 915], [1.25, 2560, 1440], [4, 3840, 2160]]) {
    assert.equal(pixelRatioFor(PROFILES.ultra, 1, dpr, w, h), Math.min(dpr, 2) * 1.5);
  }
  // Lower profiles never exceed Ultra's settings.
  for (const id of ['alto', 'medio', 'economico']) for (const k of Object.keys(HIGH_V73)) {
    const v = PROFILES[id].quality[k], u = HIGH_V73[k];
    if (typeof u === 'number') assert.ok(v <= u, `${id}.${k}`);
  }
  assert.ok(PROFILES.alto.quality.shadow === 4096 && PROFILES.alto.quality.cropShadows === true && PROFILES.alto.quality.treeNear === 800);
});

test('profile names, old saves and ?q= values map onto the profiles', () => {
  assert.deepEqual(PROFILE_ORDER, ['economico', 'medio', 'alto', 'ultra']);
  assert.equal(normalizeProfile('high'), 'ultra');
  assert.equal(normalizeProfile('medium'), 'medio');
  assert.equal(normalizeProfile('low'), 'economico');
  assert.equal(normalizeProfile('auto'), 'auto');
  assert.equal(normalizeProfile('alto'), 'alto');
  assert.equal(normalizeProfile('nonsense'), null);
  assert.equal(LEGACY_TO_PROFILE.high, 'ultra');
  assert.equal(allowsDynamicRes('ultra', false), false);
  assert.equal(allowsDynamicRes('ultra', true), true);
  assert.equal(allowsDynamicRes('medio', false), true);
});

test('pixel-count ceilings protect very large screens; the floor is 0.5', () => {
  const r4k = pixelRatioFor(PROFILES.medio, 1, 2, 3840, 2160);
  assert.ok(r4k * r4k * 3840 * 2160 <= PROFILES.medio.maxPixels * 1.001);
  assert.ok(pixelRatioFor(PROFILES.economico, 0.1, 1, 800, 600) >= 0.5);
});

// ---- controller ----
const B = 1000 / 60;
function run(ctl, ms, dt, t0 = 0, dtFn = null) {
  const acts = [];
  let t = t0;
  while (t < t0 + ms) { t += dt; const a = ctl.push(dtFn ? dtFn(t) : dt, t); if (a) acts.push({ t, ...a }); }
  return { acts, t };
}

test('a manually chosen Ultra Original is never touched, whatever the frame times', () => {
  const c = new AdaptiveController({ auto: false, profile: 'ultra' });
  const { acts } = run(c, 120000, 50);
  assert.equal(acts.length, 0);
  assert.equal(c.scale, 1);
});

test('a momentary drop, a load stall and a hidden-tab style gap change nothing', () => {
  const c = new AdaptiveController({ auto: false, profile: 'medio' });
  let r = run(c, 6000, B); // warm-up and good frames
  // A burst of a few slow frames inside a good window.
  r = run(c, 20000, B, r.t, (t) => (Math.floor(t) % 3000 < 60 ? 45 : B));
  assert.equal(r.acts.length, 0);
  // Loading stalls (> 250 ms) are not counted at all.
  r = run(c, 3000, 600, r.t);
  assert.equal(r.acts.length, 0);
  assert.ok(c.stalls > 0);
});

test('a persistent drop lowers the resolution gradually, honours the gap and the floor, never changes a manual profile', () => {
  const c = new AdaptiveController({ auto: false, profile: 'medio' });
  const { acts } = run(c, 120000, 33); // 30 fps against a 60 fps budget
  assert.ok(acts.length >= 4);
  // Secondary effects first (cheap), then the resolution.
  assert.deepEqual([acts[0].type, acts[0].fx], ['fx', 1]);
  const sc = acts.slice(1);
  assert.ok(sc.every((a) => a.type === 'scale'));
  for (let i = 1; i < acts.length; i++) assert.ok(acts[i].t - acts[i - 1].t >= 2500, 'minimum time between adjustments');
  for (let i = 1; i < sc.length; i++) assert.ok(Math.abs(sc[i].scale - sc[i - 1].scale - -0.05) < 1e-6 || sc[i].scale === PROFILES.medio.resMin, 'steps of 0.05');
  assert.equal(c.scale, PROFILES.medio.resMin); // floor reached, not below
  assert.equal(c.profile, 'medio');
});

test('hysteresis: frame times between the up and down thresholds cause no change', () => {
  const c = new AdaptiveController({ auto: true, profile: 'alto' });
  const { acts } = run(c, 300000, 17.5); // ≈ 57 fps: inside the dead band
  assert.equal(acts.length, 0);
});

test('automatic mode: resolution first, then one profile down, then keeps going while it stays slow', () => {
  const c = new AdaptiveController({ auto: true, profile: 'ultra' });
  const { acts } = run(c, 240000, 40);
  const firstProfile = acts.findIndex((a) => a.type === 'profile');
  assert.ok(firstProfile > 1, 'effects and scale moves come before the first profile move');
  assert.equal(acts[0].type, 'fx');
  assert.ok(acts.slice(1, firstProfile).every((a) => a.type === 'scale'));
  assert.equal(acts[firstProfile].profile, 'alto');
  assert.ok(acts[firstProfile].scale >= PROFILES.alto.resMin && acts[firstProfile].scale <= 1);
  assert.equal(c.profile, 'economico'); // 25 fps never holds: ends on the lowest rung
  assert.ok(c.scale >= PROFILES.economico.resMin);
});

test('recovery is gradual and slow: good frames raise the resolution step by step, then the profile, never faster than the gap', () => {
  const c = new AdaptiveController({ auto: true, profile: 'medio', scale: 0.8 });
  c.configure({ auto: true, profile: 'medio', scale: 0.8 }, 0);
  const { acts } = run(c, 400000, 9); // 110 fps: plenty of headroom
  assert.ok(acts.length >= 4);
  assert.equal(acts[0].type, 'scale');
  assert.ok(acts[0].t >= 15000, 'needs 15 s of good windows first');
  for (let i = 1; i < acts.length; i++) assert.ok(acts[i].t - acts[i - 1].t >= 20000);
  assert.ok(acts.some((a) => a.type === 'profile' && a.up));
  assert.ok(c.profile === 'ultra' || PROFILE_ORDER.indexOf(c.profile) > PROFILE_ORDER.indexOf('medio'));
});

test('oscillation guard: a failed climb doubles the back-off and bars that profile for a while', () => {
  const c = new AdaptiveController({ auto: true, profile: 'medio' });
  // Good until it climbs, then bad until it falls back.
  let t = 0, climbedAt = null, fellAt = null;
  const frame = () => (c.profile === 'alto' || (climbedAt !== null && fellAt === null) ? 40 : 8);
  while (t < 200000 && fellAt === null) {
    t += 10;
    const a = c.push(frame(), t);
    if (a?.type === 'profile' && a.profile === 'alto' && climbedAt === null) climbedAt = t;
    if (a && climbedAt !== null && a.type === 'profile' && a.profile === 'medio') fellAt = t;
  }
  assert.ok(climbedAt && fellAt, 'climbed, then fell back');
  assert.ok(fellAt - climbedAt < 60000);
  assert.equal(c.backoff, 2);
  assert.ok(c.bar && c.bar.profile === 'alto');
  // Back to good frames: the climb to 'alto' is barred for 5 minutes.
  const r = run(c, 200000, 8, t);
  assert.ok(!r.acts.some((a) => a.type === 'profile' && a.profile === 'alto'));
});

test('capability fallbacks: no WebGL2, software rendering or weak hints start on the lowest rung; strong desktops on alto at most', () => {
  const base = { webgl2: true, software: false, maxTextureSize: 16384, maxSamples: 4, coarsePointer: false, dpr: 1, cores: 8, memoryGB: 8 };
  assert.equal(startProfile({ ...base, webgl2: false }), 'economico');
  assert.equal(startProfile({ ...base, software: true }), 'economico');
  assert.equal(startProfile({ ...base, maxTextureSize: 2048 }), 'economico');
  assert.equal(startProfile({ ...base, memoryGB: 2 }), 'economico');
  assert.equal(startProfile({ ...base, coarsePointer: true, dpr: 3, cores: 4 }), 'economico');
  assert.equal(startProfile({ ...base, coarsePointer: true, dpr: 2, cores: 8 }), 'medio');
  assert.equal(startProfile({ ...base, cores: null, memoryGB: null }), 'medio');
  assert.equal(startProfile(base), 'alto');
});

test('the controller costs well under 5 µs per frame', () => {
  const c = new AdaptiveController({ auto: true, profile: 'alto' });
  let t = 0;
  const N = 2e6, t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) { t += 16.7; c.push(16.7, t); }
  const us = Number(process.hrtime.bigint() - t0) / 1000 / N;
  console.log(`  controller: ${us.toFixed(3)} µs per frame`);
  assert.ok(us < 5);
});

test('effects come back after the resolution, before any profile climb; a profile change resets them', () => {
  const c = new AdaptiveController({ auto: true, profile: 'medio' });
  c.configure({ auto: true, profile: 'medio', scale: 0.9 }, 0);
  c.fx = 1;
  const { acts } = run(c, 400000, 9);
  const iFx = acts.findIndex((a) => a.type === 'fx'), iProf = acts.findIndex((a) => a.type === 'profile');
  assert.ok(iFx > 0 && acts.slice(0, iFx).every((a) => a.type === 'scale'), 'resolution back to 1 first');
  assert.equal(acts[iFx].fx, 0);
  assert.ok(iProf === -1 || iProf > iFx, 'then a profile');
  if (iProf > 0) assert.equal(c.fx, 0);
});

test('canProfile gates profile changes (the game keeps them on the ground); effects and resolution still adapt', () => {
  const c = new AdaptiveController({ auto: true, profile: 'alto' });
  c.canProfile = () => false;
  const { acts } = run(c, 300000, 40);
  assert.ok(acts.length > 2);
  assert.ok(acts.every((a) => a.type !== 'profile'));
  assert.equal(c.profile, 'alto');
  assert.equal(c.scale, PROFILES.alto.resMin);
  c.canProfile = () => true;
  const more = run(c, 60000, 40, 300000).acts;
  assert.ok(more.some((a) => a.type === 'profile' && a.profile === 'medio'));
});

test('cockpit: never under one device pixel per CSS pixel (instrument legibility), still under the pixel ceiling; Ultra unchanged', () => {
  const { economico, medio, ultra } = PROFILES;
  assert.ok(pixelRatioFor(economico, 0.6, 1, 1280, 720) < 1); // outside: the profile's own ratio
  assert.equal(pixelRatioFor(economico, 0.6, 1, 1280, 720, true), 1);
  assert.equal(pixelRatioFor(economico, 1, 3, 390, 844, true), pixelRatioFor(economico, 1, 3, 390, 844)); // already ≥ 1 on a dense phone at full scale
  assert.ok(pixelRatioFor(medio, 1, 1, 3840, 2160, true) < 1); // a 4K screen keeps the ceiling
  assert.equal(pixelRatioFor(ultra, 1, 2, 1920, 1080, true), pixelRatioFor(ultra, 1, 2, 1920, 1080));
});
