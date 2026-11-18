// Replay: the flown track / talhão outline are off by default and toggleable;
// the last replay is always kept (hand-in or not) and opens from the pause menu.
//   node test/replaylast.mjs
import { chromium } from 'playwright';
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
const check = (n, ok, i = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${i}`); };
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(600000);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const ready = async () => { await page.goto(url + '?q=low', { waitUntil: 'load' }); await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 }); };
await ready();
await page.evaluate(() => {
  localStorage.clear(); const g = window.__agro; g.career.resetAll(); g.career.tutorialDone = true; g.menuAction('career'); g.screens.close();
  g.selectContract('soy'); g.screens.close();
  const A = g.aircraft, W = A.type.spray.swath, f = g.job.fields[0];
  A.fm.hopper = 500;
  for (let x = f.x0; x < f.x0 + 300; x += 12) { A.placeAirborne(x, f.z0 + W / 2, Math.PI / 2, 5, 46); g.sprayer.on = true; g.simulate(0.3, 1 / 30); }
  g.sprayer.on = false; A.damage = 0; A.state = 'ok';
});
// In-progress flight (not handed in): available from the pause menu.
const pm = await page.evaluate(() => { const g = window.__agro; g.screens.pause(); return { btn: !!document.querySelector('[data-a="lastReplay"]'), has: !!g.replay.lastAvailable() }; });
check('pause menu offers the last replay on a flight in progress', pm.btn && pm.has, JSON.stringify(pm));
const pl = await page.evaluate(() => { const g = window.__agro; document.querySelector('[data-a="lastReplay"]').click(); g.simulate(0.5, 1 / 30); const r = g.replay; return { active: r.active, trail: r.trail?.visible, bounds: r.bounds?.visible, btn: !!document.querySelector('[data-a="trail"]'), num: r.n }; });
check('replay opens; track and outline are off by default', pl.active && pl.trail === false && pl.bounds === false && pl.btn, JSON.stringify(pl));
const tg = await page.evaluate(() => { const g = window.__agro, r = g.replay; document.querySelector('[data-a="trail"]').click(); const on = [r.trail.visible, r.bounds?.visible, g.settings.replayTrail]; document.querySelector('[data-a="trail"]').click(); return { on, off: [r.trail.visible, g.settings.replayTrail] }; });
check('Track button shows and hides them (and remembers it)', tg.on[0] === true && tg.on[2] === true && tg.off[0] === false && tg.off[1] === false, JSON.stringify(tg));
await page.evaluate(() => window.__agro.replay.close());
// Leaving the job without handing in keeps the replay, even after a reload.
await page.evaluate(() => { const g = window.__agro; g.setJob(null); });
await ready();
const rl = await page.evaluate(() => { const g = window.__agro; const l = g.replay.lastAvailable(); return { has: !!l, n: l?.track.n, id: l?.meta.id }; });
check('last replay survives leaving the job and a reload', rl.has && rl.n > 10 && rl.id === 'soy', JSON.stringify(rl));
const pm2 = await page.evaluate(() => { const g = window.__agro; g.menuAction('free'); g.screens.close(); g.screens.pause(); const ok = !!document.querySelector('[data-a="lastReplay"]'); document.querySelector('[data-a="lastReplay"]').click(); g.simulate(0.3, 1 / 30); const a = g.replay.active; g.replay.close(); return { ok, a }; });
check('after the reload the pause menu still opens it', pm2.ok && pm2.a, JSON.stringify(pm2));
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
await browser.close(); process.exit(results.every(Boolean) ? 0 : 1);
