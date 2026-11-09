// Phase 05 — browser stability checks in the real game (Chromium + SwiftShader here;
// see README for what this does NOT prove about other browsers / devices).
//   AGRO_URL=http://localhost:5173/ node test/p5stability.mjs [out.json]
import { chromium } from 'playwright';
import fs from 'node:fs';
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
const page = await ctx.newPage();
const pageErrors = []; let navigations = 0;
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations++; });
await page.addInitScript(() => { window.__peak = 0; setInterval(() => { const m = performance.memory?.usedJSHeapSize ?? 0; if (m > window.__peak) window.__peak = m; }, 200); });
const res = {}; let fails = 0;
const ok = (name, cond, info = '') => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${typeof info === 'string' ? info : JSON.stringify(info)}`); };
const boot = async (q = '') => {
  const t0 = Date.now();
  await page.goto(url + '?mem=high&q=high' + q, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__agro && window.__agro.frames > 2 && window.__agro.diag?.readyMs != null, null, { timeout: 400000 });
  return (Date.now() - t0) / 1000;
};
const heap = () => page.evaluate(async () => { window.gc?.(); await new Promise((r) => setTimeout(r, 300)); return { heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576), peakMB: Math.round(window.__peak / 1048576) }; });

// 1 — boot (twice: the second is a reload, nothing may be duplicated).
res.boot1 = await boot('&diag');
res.boot1mem = await heap();
ok('1 boot: menu ready, no page error', pageErrors.length === 0, { s: res.boot1, ...res.boot1mem, readyMs: await page.evaluate(() => window.__agro.diag.readyMs) });
// one animation loop: frame() calls per second ≈ rAF callbacks per second
const loops = () => page.evaluate(async () => {
  const g = window.__agro; let f = 0, r = 0; const orig = g._frame.bind(g);
  g._frame = () => { f++; return orig(); };
  let on = true; const tick = () => { r++; if (on) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  await new Promise((res) => setTimeout(res, 2000)); on = false; g._frame = orig;
  return { frames: f, raf: r };
});
res.loops0 = await loops();
ok('1 one game loop (frames ≈ rAF callbacks)', Math.abs(res.loops0.frames - res.loops0.raf) <= 2, res.loops0);

// 2 — saves: a damaged career save is read back from its backup; settings survive.
res.save = await page.evaluate(() => {
  const g = window.__agro;
  g.career.money = 12345; g.career.save(); g.career.money = 23456; g.career.save(); // backup: 12345
  const raw = localStorage.getItem('agrowings.save.v1');
  localStorage.setItem('agrowings.save.v1', raw.slice(0, raw.length >> 1)); // half-written entry
  g.setSetting('fpsLimit', 30);
  g.career.save = () => {}; // the pagehide save of this tab must not rewrite the damaged entry
  return { env: JSON.parse(localStorage.getItem('agrowings.settings.v1')).f };
});
await boot('&diag');
res.saveAfter = await page.evaluate(() => ({ money: window.__agro.career.money, src: window.__agro.career.loadSource, fps: window.__agro.settings.fpsLimit }));
ok('2 damaged save → previous good copy, settings kept', res.saveAfter.money === 12345 && res.saveAfter.src === 'backup' && res.saveAfter.fps === 30 && res.save.env === 'aw1', res.saveAfter);
await page.evaluate(() => window.__agro.setSetting('fpsLimit', 0));

// 3 — background / foreground ×6 during a flight: paused, no extra loop, no physics jump.
res.life = await page.evaluate(async () => {
  const g = window.__agro; g.menuAction('free'); g.screens.close();
  const ac = g.aircraft; const p0 = ac.fm.pos.clone();
  const set = (v) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); document.dispatchEvent(new Event('visibilitychange')); };
  for (let i = 0; i < 6; i++) { set('hidden'); await new Promise((r) => setTimeout(r, 400)); set('visible'); await new Promise((r) => setTimeout(r, 200)); }
  delete document.visibilityState;
  const moved = ac.fm.pos.distanceTo(p0);
  return { stats: { ...g.lifecycle.stats }, paused: !!g.screens.open, moved: +moved.toFixed(3) };
});
res.loops1 = await loops();
ok('3 hide/show ×6: autopaused, one loop, aircraft not moved', res.life.stats.hides === 6 && res.life.stats.shows === 6 && res.life.paused && res.life.moved < 0.05 && Math.abs(res.loops1.frames - res.loops1.raf) <= 2, { ...res.life, loops: res.loops1 });
await page.evaluate(() => window.__agro.screens.close());

// 4 — one bad frame is survived; a frame loop that keeps failing stops on the fail-safe screen (no reload).
const nav0 = navigations;
res.frameErr = await page.evaluate(async () => {
  const g = window.__agro, orig = g.hud.update; let n = 0;
  g.hud.update = function (...a) { if (n++ < 1) throw new Error('test: one bad frame'); return orig.apply(this, a); };
  const until = async (f, ms) => { const t = performance.now(); while (!f() && performance.now() - t < ms) await new Promise((r) => setTimeout(r, 100)); return f(); };
  await until(() => n > 0, 60000);
  const f1 = g.frameN; await until(() => g.frameN >= f1 + 3, 60000); // three more frames went through
  g.hud.update = orig;
  return { recorded: g.diag.errors.some((e) => e.msg.includes('one bad frame')), running: g.frameN >= f1 + 3 && g._frameErr === 0, frameErrors: g.diag.errors.filter((e) => e.kind === 'frame').length, failed: g.diag.failed };
});
ok('4a one failing frame: recorded, game keeps running', res.frameErr.recorded && res.frameErr.running && !res.frameErr.failed, res.frameErr);
// 5 — diagnostics panel (?diag): shown with real numbers, "unavailable" only where the API is missing.
res.diag = await page.evaluate(async () => {
  const g = window.__agro; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', ctrlKey: true, shiftKey: true }));
  await new Promise((r) => setTimeout(r, 700));
  const el = document.querySelector('.diagPanel'); const txt = el?.textContent ?? '';
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', ctrlKey: true, shiftKey: true }));
  return { shown: !!el, gone: !document.querySelector('.diagPanel'), txt, snap: g.diag.snapshot() };
});
ok('5 diagnostics panel shows measured values and closes', res.diag.shown && res.diag.gone && res.diag.snap.calls > 0 && res.diag.snap.heapMB > 0 && /FPS \d/.test(res.diag.txt), res.diag.txt.split('\n').slice(0, 4).join(' | '));

// 6 — cockpit in/out ×10, aircraft switches, quality changes: no error, memory settles.
res.mix0 = await heap();
res.mix = await page.evaluate(async () => {
  const g = window.__agro, errs0 = g.diag.errors.length;
  for (let i = 0; i < 10; i++) { g.cameraMode = i % 2 ? 'chase' : 'cockpit'; g.rig.setMode(g.cameraMode, g.aircraft); await new Promise((r) => setTimeout(r, 120)); }
  for (const id of ['e203', 'r44', 'at802f', 'pa36', 'ipanema']) { g.selectAircraft(id); g.menuAction?.('free'); g.screens.close(); await new Promise((r) => setTimeout(r, 400)); }
  for (const p of ['economico', 'medio', 'alto', 'ultra']) { g.setSetting('profile', p); await new Promise((r) => setTimeout(r, 400)); }
  return { errors: g.diag.errors.slice(errs0), profile: g.perf.profileId };
});
res.mix1 = await heap();
ok('6 cockpit ×10, 5 switches, 4 quality changes: no error', res.mix.errors.length === 0 && res.mix.profile === 'ultra', { errors: res.mix.errors, before: res.mix0, after: res.mix1 });

// 7 — screen shapes: canvas follows the viewport, pixel ratio within the profile's ceiling.
res.screens = {};
for (const [w, h] of [[1280, 720], [1280, 800], [1680, 720], [844, 390], [390, 844], [1024, 768]]) {
  const r0 = await page.evaluate(() => window.__agro.lifecycle.stats.resizes);
  await page.setViewportSize({ width: w, height: h });
  await page.waitForFunction((r0) => window.__agro.lifecycle.stats.resizes > r0, r0, { timeout: 120000 });
  res.screens[`${w}x${h}`] = await page.evaluate(() => { const g = window.__agro, c = g.canvas; return { css: [c.clientWidth, c.clientHeight], px: [c.width, c.height], ratio: +g.renderer.getPixelRatio().toFixed(2), aspect: +g.camera.aspect.toFixed(3) }; });
}
const sh = Object.entries(res.screens);
ok('7 resize: canvas = viewport, camera aspect = viewport', sh.every(([k, s]) => { const [w, h] = k.split('x').map(Number); return s.css[0] === w && s.css[1] === h && Math.abs(s.aspect - w / h) < 0.01; }), res.screens);
await page.setViewportSize({ width: 640, height: 360 });

// 8 — WebGL context lost and NOT restored: fail-safe after the wait, no reload; restoring removes it.
res.ctx = await page.evaluate(async () => {
  const g = window.__agro, ext = g.renderer.getContext().getExtension('WEBGL_lose_context');
  ext.loseContext();
  await new Promise((r) => setTimeout(r, 21500));
  const shown = !!document.querySelector('.failsafe'), btn = !!document.querySelector('.failsafe button');
  const text = document.querySelector('.failsafe h1')?.textContent;
  ext.restoreContext();
  for (let i = 0; i < 300 && (g.lifecycle.contextLost || document.querySelector('.failsafe')); i++) await new Promise((r) => setTimeout(r, 100));
  const f1 = g.frames; g.screens.close?.(); await new Promise((r) => setTimeout(r, 1500));
  return { shown, btn, text, cleared: !document.querySelector('.failsafe'), lost: g.lifecycle.contextLost, timeouts: g.lifecycle.stats.restoreTimeouts, running: g.frames > f1 || g.frozen };
});
ok('8 context never restored: fail-safe + Restart, no reload; cleared when restored', res.ctx.shown && res.ctx.btn && res.ctx.cleared && !res.ctx.lost && navigations === nav0, { ...res.ctx, navigations: navigations - nav0 });

// 4b — a frame loop that keeps failing: fail-safe, no reload.
res.frameFatal = await page.evaluate(async () => {
  const g = window.__agro, orig = g.hud.update;
  g.hud.update = () => { throw new Error('test: broken frame'); };
  const t = performance.now(); while (!g.diag.failed && performance.now() - t < 400000) await new Promise((r) => setTimeout(r, 200)); // 30 frames at this renderer's pace
  const out = { failed: g.diag.failed, shown: !!document.querySelector('.failsafe') };
  g.hud.update = orig;
  return out;
});
ok('4b frame loop that keeps failing: fail-safe screen, no reload', res.frameFatal.failed && res.frameFatal.shown && navigations === nav0, res.frameFatal);

res.pageErrors = pageErrors.filter((m) => !m.startsWith('test:'));
ok('no unexpected page errors', res.pageErrors.length === 0, res.pageErrors.slice(0, 3));
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(res, null, 1));
await browser.close();
