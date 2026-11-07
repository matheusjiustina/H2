// Main menu 2.0 (showroom) screenshots and checks: every aircraft selected
// from its card (the model on show is the fleet's own, the camera framed to
// it), thumbnails rendered, locked premium preview, Fly / Unlock button,
// desktop / ultrawide / phone sizes, menu → flight → menu without leaks.
//   AGRO_URL=http://localhost:5173/ node test/menushots.mjs <outDir> [ids,...]
import { chromium } from 'playwright';
import fs from 'node:fs';
const outDir = process.argv[2] || 'menu-shots';
const only = process.argv[3]?.split(',');
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
const ok = (k, v, info = '') => { results.push([k, !!v]); console.log(v ? 'PASS' : 'FAIL', k, info); };
const errors = [];
async function open(w, h, touch = false) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
  page.setDefaultTimeout(600000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=medium', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
  return page;
}
const settle = (page, n = 40) => page.evaluate((n) => { const g = window.__agro; g.frozen = true; for (let i = 0; i < n; i++) g.tick(1 / 30); g.render(); }, n);
const page = await open(1600, 900);
await settle(page, 30);
const ids = await page.evaluate(() => [...document.querySelectorAll('[data-ac]')].map((b) => b.dataset.ac));
ok('every registered aircraft has a card', ids.length === 10, ids.join(','));
// Thumbnails are made one per frame while the menu is up.
await page.evaluate(() => { const g = window.__agro; for (let i = 0; i < 11; i++) g.render(); });
const th = await page.evaluate(() => [...document.querySelectorAll('[data-ac] img')].filter((i) => i.src.startsWith('data:image')).length);
ok('thumbnails rendered from the models', th === 10, String(th));
await page.screenshot({ path: `${outDir}/strip_thumbs.png`, clip: { x: 0, y: 700, width: 1600, height: 200 } });
for (const id of only ?? ids) {
  await page.click(`[data-ac="${id}"]`);
  await settle(page, 70);
  const s = await page.evaluate(() => { const g = window.__agro, sr = g.showroom, t = sr.target; return { shown: sr.id, flown: g.aircraftId, same: t === g.fleet[sr.id], dist: +g.rig.orbit.dist.toFixed(1), R: +sr._radius(sr.id).toFixed(1), fly: document.querySelector('.sr-fly').dataset.a, sel: document.querySelector(`[data-ac="${sr.id}"]`).getAttribute('aria-checked') }; });
  ok(`${id}: on show, framed`, s.shown === id && s.same && s.sel === 'true' && s.dist > s.R, JSON.stringify(s));
  await page.screenshot({ path: `${outDir}/sel_${id}.png` });
}
// Locked premium: preview only (enforcement on, no entitlement).
const lock = await page.evaluate(async () => {
  const ex = await import('/src/game/expansions.js'); ex.setPremiumEnforced(true); ex.setEntitlementSource(() => false);
  const g = window.__agro; g.screens.pickAircraft('at802'); const before = g.aircraftId;
  g.screens.pickAircraft('at802f'); for (let i = 0; i < 60; i++) g.tick(1 / 30); g.render();
  const r = { before, flown: g.aircraftId, shown: g.showroom.id, fly: document.querySelector('.sr-fly').dataset.a, label: document.querySelector('.sr-fly b').textContent };
  return r;
});
ok('locked premium: shown, not activated, Unlock button', lock.flown === lock.before && lock.shown === 'at802f' && lock.fly === 'unlock', JSON.stringify(lock));
await page.screenshot({ path: `${outDir}/locked_fireboss.png` });
await page.click('.sr-fly');
const exp = await page.evaluate(() => ({ open: window.__agro.screens.open, flown: window.__agro.aircraftId }));
ok('Unlock opens the expansions screen, nothing unlocked', exp.open === 'expansions' && exp.flown === lock.before, JSON.stringify(exp));
await page.screenshot({ path: `${outDir}/expansions.png` });
await page.evaluate(async () => { const g = window.__agro; g.screens.close(); const ex = await import('/src/game/expansions.js'); ex.setPremiumEnforced(false); g.screens.pickAircraft('e203'); });
await settle(page, 50);
// Paint change re-renders that card's thumbnail.
const paint = await page.evaluate(() => { const g = window.__agro; const a = document.querySelector('[data-ac="e203"] img').src; g.setAircraftOption('e203Livery', g.settings.e203Livery ? 0 : 1); g.screens._markAircraft(); g.render(); g.render(); return a !== document.querySelector('[data-ac="e203"] img').src; });
ok('paint change refreshes the thumbnail', paint);
await page.screenshot({ path: `${outDir}/e203_paint.png` });
// Fly → menu → fly: no duplicated aircraft or scene objects.
const cyc = await page.evaluate(() => {
  const g = window.__agro, n0 = g.scene.children.length;
  g.menuAction('free'); for (let i = 0; i < 10; i++) g.tick(1 / 30);
  const vo = !!g.camera.view?.enabled;
  g.menuAction('title'); for (let i = 0; i < 10; i++) g.tick(1 / 30);
  g.menuAction('free'); g.menuAction('title'); for (let i = 0; i < 10; i++) g.tick(1 / 30); g.render();
  return { n0, n1: g.scene.children.length, viewOffsetInFlight: vo, fleet: Object.keys(g.fleet).length, playing: g.playing };
});
ok('menu ↔ flight: no duplicates, no view offset in flight', cyc.n0 === cyc.n1 && !cyc.viewOffsetInFlight && cyc.fleet === 10 && !cyc.playing, JSON.stringify(cyc));
await page.screenshot({ path: `${outDir}/desktop.png` });
const fleet = await page.evaluate(() => { document.querySelector('[data-a="fleet"]').click(); return { open: window.__agro.screens.open, rows: document.querySelectorAll('.fl-row').length }; });
ok('Fleet screen lists every aircraft', fleet.open === 'fleet' && fleet.rows === 10, JSON.stringify(fleet));
await page.screenshot({ path: `${outDir}/fleet.png` });
await page.evaluate(() => window.__agro.screens.close());
await page.close();
for (const [w, h, name, touch] of [[2560, 1080, 'ultrawide', false], [1280, 720, 'hd', false], [844, 390, 'phone', true], [390, 844, 'phonePortrait', true]]) {
  const p = await open(w, h, touch);
  await settle(p, 50);
  await p.screenshot({ path: `${outDir}/size_${name}.png` });
  await p.close();
}
ok('no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
console.log(`${results.filter((r) => r[1]).length}/${results.length} passed`);
await browser.close();
