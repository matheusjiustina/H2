// Phase 7: mobile emulation (Chromium device metrics + touch; no real phone, no Safari/WebKit here).
// Layout per screen shape, auto profile and render size, control modes, lifecycle and WebGL context loss, single loop.
// Usage: AGRO_URL=... node test/p7mobile.mjs <outDir> [layout|modes|life|all]
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] || 'p7'; const only = process.argv[3] || 'all';
fs.mkdirSync(out, { recursive: true });
const URL = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const DEVICES = {
  'phone-land-844x390 (dpr3)': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3 },
  'phone-land-667x375 (dpr2)': { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2 },
  'phone-land-915x412 (dpr2.6)': { viewport: { width: 915, height: 412 }, deviceScaleFactor: 2.6 },
  'phone-port-390x844 (dpr3)': { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
  'tablet-land-1180x820 (dpr2)': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 },
};
async function open(name, d, extra = {}) {
  const ctx = await browser.newContext({ ...d, isMobile: true, hasTouch: true, userAgent: UA, ...extra });
  const page = await ctx.newPage(); page.setDefaultTimeout(900000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  return { ctx, page, errors };
}
const boot = async (page, q = '') => { await page.goto(URL + q, { waitUntil: 'load' }); await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 600000 }); };
const rows = [];
if (only === 'layout' || only === 'all') {
  for (const [name, d] of Object.entries(DEVICES)) {
    if (process.env.ONLY && !name.includes(process.env.ONLY)) continue;
    const { ctx, page, errors } = await open(name, d);
    await boot(page);
    const r = await page.evaluate(async () => {
      const g = window.__agro; g.menuAction('free'); g.screens.close();
      for (let i = 0; i < 20; i++) g.tick(1 / 30);
      g.aircraft.placeAirborne(300, -280, Math.PI / 2, 120, 46); for (let i = 0; i < 20; i++) g.tick(1 / 30); g.touch.update();
      const vw = innerWidth, vh = innerHeight;
      const rect = (el) => { const b = el.getBoundingClientRect(); return b.width && b.height ? { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom } : null; };
      const cs = (el) => getComputedStyle(el);
      const touchEls = [...document.querySelectorAll('.touch .t-stick,.touch .t-thr,.touch .t-rud,.touch .t-btns,.touch .t-flaps,.touch .t-trim,.touch .t-top,.touch .t-strip,.touch .t-dpad,.touch .t-tilt')].filter((e) => cs(e).display !== 'none' && cs(e).visibility !== 'hidden');
      const items = touchEls.map((e) => ({ n: e.className.split(' ')[0], r: rect(e) })).filter((x) => x.r);
      const hud = ['.readouts', '.minimap', '.jobcard', '.spraybadge', '.trimbadge'].map((s) => { const e = document.querySelector(s); return e && cs(e).display !== 'none' ? { n: s, r: rect(e) } : null; }).filter(Boolean);
      const ix = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
      const overlaps = [];
      for (let i = 0; i < items.length; i++) { for (let j = i + 1; j < items.length; j++) { const a = ix(items[i].r, items[j].r); if (a > 40) overlaps.push([items[i].n, items[j].n, Math.round(a)]); }
        for (const h of hud) { const a = ix(items[i].r, h.r); if (a > 40) overlaps.push([items[i].n, h.n, Math.round(a)]); } }
      // central view: the horizon band around the middle must be free of controls
      const centre = { x0: vw * 0.32, x1: vw * 0.68, y0: vh * 0.25, y1: vh * 0.6 };
      const inCentre = items.filter((x) => ix(x.r, centre) > 0).map((x) => x.n);
      const off = items.filter((x) => x.r.x0 < -1 || x.r.y0 < -1 || x.r.x1 > vw + 1 || x.r.y1 > vh + 1).map((x) => x.n);
      const cv = g.canvas, pr = g.renderer.getPixelRatio();
      return { vw, vh, dpr: devicePixelRatio, canvasPx: [cv.width, cv.height], pixelRatio: +pr.toFixed(3), mpx: +((cv.width * cv.height) / 1e6).toFixed(2), profile: g.perf.profile.id, mode: g.perf.auto ? 'auto' : 'manual', touchActive: g.touch.active, overlaps, inCentre, off, nControls: items.length };
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${out}/layout_${name.split(' ')[0]}.png`, timeout: 300000 });
    rows.push({ name, ...r, errors });
    console.log(name, JSON.stringify({ ...r, errors }));
    await ctx.close();
  }
}
if (only === 'modes' || only === 'all') {
  const { ctx, page, errors } = await open('modes', DEVICES['phone-land-844x390 (dpr3)']);
  await boot(page);
  const r = await page.evaluate(async () => {
    const g = window.__agro; g.menuAction('free'); g.screens.close(); for (let i = 0; i < 10; i++) g.tick(1 / 30);
    const T = g.touch, v = g.input.virtual, res = {};
    // Mode switching keeps all buttons and clears the stick
    for (const m of ['tilt', 'buttons', 'stick', 'tilt']) { g.setSetting('touchMode', m); res['mode_' + m] = { cls: [...T.el.classList].filter((c) => c.startsWith('m-')).join(), roll: v.roll, pitch: v.pitch }; }
    // Tilt through the real handler (sensor events), landscape (angle 90)
    const fire = (beta, gamma) => window.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta, gamma }));
    T.stopTilt(); await T.startTilt(true); T.neutral = null;
    Object.defineProperty(screen.orientation, 'angle', { get: () => 90, configurable: true });
    fire(10, 0);  // neutral pose
    fire(10, -11); T.update(); res.tilt_gamma_m11 = { x: T.tilt.x, y: T.tilt.y, vr: v.roll, vp: v.pitch };
    fire(10 + 25, 0); T.update(); res.tilt_beta_p25 = { x: T.tilt.x, y: T.tilt.y };
    for (const s of [0.7, 1, 1.5]) { g.setSetting('tiltSens', s); fire(10, 0); T.neutral = null; fire(10, 0); fire(10, -8); res['sens_' + s] = { y: +T.tilt.y.toFixed(3) }; }
    // orientation change drops the neutral pose
    T.neutral = { roll: 1, pitch: 1 }; window.dispatchEvent(new Event('orientationchange')); res.neutral_after_rotation = T.neutral;
    // no sensor: fallback to the virtual stick
    T._setTiltState('none'); T.update(); res.fallback = { cls: [...T.el.classList].filter((c) => c.startsWith('m-')).join(), stickShown: getComputedStyle(T.el.querySelector('.t-stick')).display };
    // virtual stick drives pitch/roll in the shared input
    g.setSetting('touchMode', 'stick'); T.update();
    const st = T.el.querySelector('.t-stick').getBoundingClientRect();
    const pd = (type, x, y) => T.el.querySelector('.t-stick').dispatchEvent(new PointerEvent(type, { pointerId: 5, clientX: x, clientY: y, bubbles: true }));
    T.el.querySelector('.t-stick').setPointerCapture = () => {};
    pd('pointerdown', st.left + st.width * 0.9, st.top + st.height * 0.5); res.stick = { roll: +v.roll.toFixed(2), pitch: +v.pitch.toFixed(2) }; pd('pointerup', 0, 0); res.stick_released = { roll: v.roll, pitch: v.pitch };
    // buttons mode drives them too
    g.setSetting('touchMode', 'buttons');
    const b = T.el.querySelector('[data-hold=rollR]'); b.setPointerCapture = () => {};
    b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 6, bubbles: true })); res.buttons_rollR = v.roll; b.dispatchEvent(new PointerEvent('pointerup', { pointerId: 6, bubbles: true })); res.buttons_released = v.roll;
    // power slider + other essential buttons exist in every mode
    res.controls = ['.t-thr', '.t-rud', '[data-tap=spray]', '[data-hold=engine]', '[data-hold=brake]', '[data-tap=flapsUp]', '[data-hold=trimUp]', '[data-tap=camera]', '[data-look]'].map((s) => [s, !!T.el.querySelector(s)]);
    return res;
  });
  console.log('MODES', JSON.stringify(r, null, 1), errors.length ? errors : 'no page errors');
  // permission path: a device that requires DeviceOrientationEvent.requestPermission (iOS style)
  const page2 = await (await browser.newContext({ ...DEVICES['phone-land-844x390 (dpr3)'], isMobile: true, hasTouch: true, userAgent: UA })).newPage(); page2.setDefaultTimeout(900000);
  await page2.addInitScript(() => { window.DeviceOrientationEvent = class extends Event { static async requestPermission() { window.__asked = (window.__asked || 0) + 1; return window.__grant === false ? 'denied' : 'granted'; } }; });
  await boot(page2);
  const p = await page2.evaluate(async () => {
    const g = window.__agro; g.menuAction('free'); g.screens.close(); const T = g.touch; const o = {};
    window.__grant = false; g.setSetting('touchMode', 'tilt'); await new Promise((r) => setTimeout(r, 50)); o.beforeTap = T.tiltState;
    await T.startTilt(true); o.denied = T.tiltState; T.update(); o.fallbackCls = [...T.el.classList].filter((c) => c.startsWith('m-')).join();
    window.__grant = true; T._tiltOn = false; await T.startTilt(true); o.granted = T.tiltState; o.asked = window.__asked;
    return o;
  });
  console.log('PERMISSION', JSON.stringify(p));
  await ctx.close();
}
if (only === 'life' || only === 'all') {
  const { ctx, page, errors } = await open('life', DEVICES['phone-land-844x390 (dpr3)']);
  await boot(page, '?q=low');
  const r = await page.evaluate(async () => {
    const g = window.__agro, L = g.lifecycle, res = {};
    g.menuAction('free'); g.screens.close(); g.aircraft.placeAirborne(300, -280, Math.PI / 2, 150, 46); for (let i = 0; i < 30; i++) g.tick(1 / 30);
    g.audio.start(); await new Promise((r) => setTimeout(r, 300)); res.audioBefore = g.audio.ctx?.state;
    const pos0 = g.aircraft.fm.pos.clone(), t0 = g.aircraft.simTime;
    const setVis = (s) => { Object.defineProperty(document, 'visibilityState', { get: () => s, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); };
    const money0 = g.career.money; g.career.money += 123; // unsaved change
    setVis('hidden'); await new Promise((r) => setTimeout(r, 200));
    res.hidden = { paused: g.screens.open, audio: g.audio.ctx?.state, saved: JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /career/i.test(k)) ?? '') ?? 'null')?.money };
    // 5 s in the background (no frames run): then back
    await new Promise((r) => setTimeout(r, 1500)); const lastBefore = g.last;
    setVis('visible'); await new Promise((r) => setTimeout(r, 300));
    res.shown = { audio: g.audio.ctx?.state, lastReset: g.last > lastBefore, stillPaused: g.screens.open, posMoved: +g.aircraft.fm.pos.distanceTo(pos0).toFixed(3), simDt: +(g.aircraft.simTime - t0).toFixed(3) };
    g.screens.close(); g.career.money = money0;
    // Single loop: animation callbacks run per game frame
    const f0 = g.frames; let cbs = 0; const raf = window.requestAnimationFrame; window.requestAnimationFrame = (fn) => raf((t) => { cbs++; fn(t); });
    await new Promise((r) => setTimeout(r, 4000)); window.requestAnimationFrame = raf; res.loop = { frames: g.frames - f0, rafCallbacks: cbs };
    res.stats = L.stats;
    return res;
  });
  console.log('LIFE', JSON.stringify(r, null, 1), errors.length ? errors : 'no page errors');
  // WebGL context loss / restore
  const ctl = await page.evaluate(async () => {
    const g = window.__agro, L = g.lifecycle; g.menuAction('free'); g.screens.close();
    const gl = g.renderer.getContext(); const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) return { supported: false };
    const o = { supported: true };
    ext.loseContext(); await new Promise((r) => setTimeout(r, 400));
    o.lost = { flag: L.contextLost, paused: g.screens.open, framesDuring: 0 };
    const f0 = g.frames; await new Promise((r) => setTimeout(r, 600)); o.lost.framesDuring = g.frames - f0;
    ext.restoreContext(); await new Promise((r) => setTimeout(r, 1500));
    o.restored = { flag: L.contextLost, stats: L.stats };
    g.screens.close(); const f1 = g.frames; await new Promise((r) => setTimeout(r, 2500)); o.framesAfter = g.frames - f1;
    return o;
  });
  console.log('CONTEXT', JSON.stringify(ctl));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/after_context_restore.png`, timeout: 300000 });
  console.log('page errors:', errors.length ? errors : 'none');
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(rows, null, 1));
