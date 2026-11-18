// Adaptive Graphics Engine, live: Automatic mode with the game's own loop
// (real frame times) in a small window, on the ground then in flight with the
// spray on; every 10 s: frame rate, frame-time avg / p95 / p99, profile,
// resolution factor, effects level, canvas pixel ratio, heap, GPU counts.
//   AGRO_URL=http://localhost:5173/ node test/agelive.mjs [seconds per phase] [out.json]
import { chromium } from 'playwright';
import fs from 'node:fs';
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const secs = +(process.argv[2] || 60);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
const page = await (await browser.newContext({ viewport: { width: 400, height: 240 }, deviceScaleFactor: 1 })).newPage();
const errs = []; let gl = 0;
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (/WebGL: INVALID/.test(m.text())) gl++; });
const t0 = Date.now();
await page.goto(url + '?mem=mid', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 400000 });
const loadS = (Date.now() - t0) / 1000;
await page.evaluate(() => {
  const g = window.__agro; g.menuAction('free'); g.screens.close();
  window.__ft = []; const orig = g.perf.update.bind(g.perf);
  g.perf.update = (now, dt) => { window.__ft.push(dt); return orig(now, dt); };
});
const rows = [];
const sample = (phase) => page.evaluate((phase) => {
  const g = window.__agro, ft = window.__ft.splice(0).filter((d) => d > 0).sort((a, b) => a - b);
  const q = (p) => ft.length ? +ft[Math.min(ft.length - 1, Math.floor(p * ft.length))].toFixed(1) : null;
  const avg = ft.length ? ft.reduce((a, b) => a + b, 0) / ft.length : 0;
  const s = g.perf.stats(), i = g.renderer.info;
  return { phase, frames: ft.length, fps: avg ? +(1000 / avg).toFixed(1) : 0, avgMs: +avg.toFixed(1), p95: q(0.95), p99: q(0.99), profile: s.profile, scale: s.scale, fx: s.fx, ratio: +s.pixelRatio.toFixed(3), mode: s.mode, heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576), tex: i.memory.textures, geo: i.memory.geometries, onGround: g.aircraft.fm.out.onGround, state: g.aircraft.state };
}, phase);
for (let k = 0; k < secs / 10; k++) { await page.waitForTimeout(10000); rows.push(await sample('ground')); console.log(JSON.stringify(rows.at(-1))); }
await page.evaluate(() => { const g = window.__agro, ac = g.aircraft; ac.placeAirborne(300, -280, Math.PI / 2, 120, 48); g.sprayer.on = true; ac.fm.hopper = 400; });
for (let k = 0; k < secs / 10; k++) { await page.waitForTimeout(10000); rows.push(await sample('air')); console.log(JSON.stringify(rows.at(-1))); }
const log = await page.evaluate(() => window.__agro.perf.stats().log);
console.log(JSON.stringify({ loadS, log, errs: errs.slice(0, 3), glErrors: gl }));
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify({ loadS, rows, log, errs, gl }, null, 1));
await browser.close();
