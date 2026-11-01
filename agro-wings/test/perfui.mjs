// Graphics profile UI and persistence in the real game (browser): the new
// controls in Settings, what each profile applies (quality object, pixel
// ratio, particle limit), the FPS limit, restore defaults, saved
// preferences after a reload, the old-save migration, and no page errors.
//   AGRO_URL=http://localhost:5173/ node test/perfui.mjs
import { chromium } from 'playwright';
const url = (process.env.AGRO_URL || 'http://localhost:5173/').replace(/\/?$/, '/');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.setDefaultTimeout(0);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
let fails = 0;
const ok = (n, v, i = '') => { if (!v) fails++; console.log(v ? 'PASS' : 'FAIL', n, i); };
const boot = async (q = '') => { await page.goto(url + q, { waitUntil: 'load' }); await page.waitForFunction(() => window.__agro && window.__agro.frames > 1, null, { timeout: 600000 }); };

await boot();
let r = await page.evaluate(() => { const p = window.__agro.perf; return { mode: p.mode, prof: p.profileId, s: JSON.parse(localStorage.getItem('agrowings.settings.v1') || '{}').profile, gpu: p.caps?.gpu, sw: p.caps?.software, ratio: window.__agro.renderer.getPixelRatio() }; });
ok('first run: automatic mode, conservative start (software GPU → economico)', r.mode === 'auto' && r.prof === 'economico' && r.sw === true, JSON.stringify(r));

await page.evaluate(() => { window.__agro.frozen = true; window.__agro.screens.settings(); });
const sel = (key, v) => page.evaluate(([key, v]) => document.querySelector(`.seg[data-key="${key}"] button[data-v="${v}"]`).click(), [key, v]);
const st = () => page.evaluate(() => { const g = window.__agro; return { profile: g.settings.profile, legacy: g.settings.quality, shadow: g.quality.shadow, pr: g.quality.pixelRatio, ratio: +g.renderer.getPixelRatio().toFixed(3), mist: g.mist.limit, label: g.perf.label(), ui: document.querySelector('[data-gfx]')?.textContent, fps: g.settings.fpsLimit }; });
ok('settings has the profile / FPS limit / restore controls', await page.evaluate(() => !!document.querySelector('.seg[data-key="profile"]') && !!document.querySelector('.seg[data-key="fpsLimit"]') && !!document.querySelector('[data-a="resetGfx"]') && document.querySelectorAll('.seg[data-key="profile"] button').length === 5));
await sel('profile', 'ultra'); r = await st();
ok('Ultra Original → QUALITY.high, ratio min(dpr,2)×1.5, 6000 particles', r.shadow === 4096 && r.pr === 1.5 && r.ratio === 1.5 && r.mist === 6000 && r.legacy === 'high', JSON.stringify(r));
await sel('profile', 'alto'); r = await st();
ok('Alto → shadows 4096 kept, ratio 1.25, 5000 particles', r.shadow === 4096 && r.ratio === 1.25 && r.mist === 5000, JSON.stringify(r));
await sel('profile', 'medio'); r = await st();
ok('Médio → the old medium preset', r.shadow === 2048 && r.ratio === 1 && r.mist === 3500 && r.legacy === 'medium', JSON.stringify(r));
await sel('profile', 'economico'); r = await st();
ok('Econômico → the old low preset', r.shadow === 1024 && r.ratio === 0.75 && r.mist === 1800 && r.legacy === 'low', JSON.stringify(r));
await sel('profile', 'auto'); r = await st();
ok('Automático selected, label shown in Settings', r.profile === 'auto' && /auto/.test(r.ui), JSON.stringify(r));
await sel('fpsLimit', 30); r = await st();
ok('FPS limit 30 saved', r.fps === 30 && (await page.evaluate(() => JSON.parse(localStorage.getItem('agrowings.settings.v1')).fpsLimit)) === 30);
await sel('profile', 'alto'); await sel('showFps', 'true');

// Persistence across a reload.
await boot();
r = await page.evaluate(() => { const g = window.__agro; return { p: g.perf.profileId, mode: g.perf.mode, fps: g.settings.fpsLimit, show: g.settings.showFps, ratio: g.renderer.getPixelRatio() }; });
ok('preferences survive a reload (alto, cap 30, FPS shown)', r.p === 'alto' && r.mode === 'manual' && r.fps === 30 && r.show === true && r.ratio === 1.25, JSON.stringify(r));

// Restore defaults.
await page.evaluate(() => { window.__agro.frozen = true; window.__agro.screens.settings(); });
await page.evaluate(() => document.querySelector('[data-a="resetGfx"]').click());
r = await page.evaluate(() => { const g = window.__agro; return { profile: g.settings.profile, fps: g.settings.fpsLimit, show: g.settings.showFps, mode: g.perf.mode }; });
ok('restore defaults → auto, no cap, FPS hidden', r.profile === 'auto' && r.fps === 0 && r.show === false && r.mode === 'auto', JSON.stringify(r));

// ?q= pins the profile for the session; a save with the old keys migrates.
await boot('?q=high');
r = await page.evaluate(() => { const g = window.__agro; return { p: g.perf.profileId, forced: g.perf.forced, frozen: g.perf.ctl.frozen, ratio: g.renderer.getPixelRatio(), shadow: g.quality.shadow }; });
ok('?q=high → Ultra Original, pinned, controller frozen', r.p === 'ultra' && r.forced && r.frozen && r.ratio === 1.5 && r.shadow === 4096, JSON.stringify(r));
await page.evaluate(() => localStorage.setItem('agrowings.settings.v1', JSON.stringify({ quality: 'high', qualityAuto: false, volume: 0.5 })));
await boot();
r = await page.evaluate(() => { const g = window.__agro; return { p: g.perf.profileId, mode: g.perf.mode, vol: g.settings.volume }; });
ok('old save (quality high, manual) → Ultra Original manual, other settings kept', r.p === 'ultra' && r.mode === 'manual' && r.vol === 0.5, JSON.stringify(r));

// Cost of the adaptive system itself, in the real page.
const cost = await page.evaluate(() => { const p = window.__agro.perf; p.ctl.frozen = false; const t0 = performance.now(); for (let i = 0; i < 20000; i++) p.update(t0 + i * 16.7, 16.7); return { us: (performance.now() - t0) * 1000 / 20000, stats: p.stats().costUsPerFrame }; });
console.log('adaptive update cost in the page:', JSON.stringify(cost));
ok('no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
await browser.close();
process.exit(fails ? 1 : 0);
