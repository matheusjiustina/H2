// Job done: stop on the ground and cut the engine ANYWHERE -> the result comes up.
import { chromium } from 'playwright';
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(600000);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url + '?q=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
const res = [];
const check = (n, ok, i = '') => { res.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${i}`); };
const r = await page.evaluate(() => {
  const g = window.__agro, o = {};
  localStorage.clear(); g.career.resetAll(); g.career.tutorialDone = true; g.menuAction('career'); g.screens.close(); g.selectContract('soy'); g.screens.close();
  const A = g.aircraft, T = g.world.terrain, W = A.type.spray.swath, f = g.job.fields[0];
  A.fm.hopper = 800; A.fm.fuel = 150;
  const real = g.job.stats.bind(g.job); g.job.stats = () => ({ ...real(), coverage: 0.97 }); g.jobStats = null;
  A.fm.engine = 'running'; g.simulate(0.6, 1 / 30); g.screens.close();
  o.complete = g.job.complete();
  // Engine still running, parked far from the loading zone: no result yet.
  A.placeOnRunway('east'); A.fm.engine = 'running'; A.fm.vel.set(0, 0, 0);
  g.simulate(2, 1 / 30);
  o.shownRunning = g.screens.open === 'results' || g.resultShown;
  // Cut the engine on the ground, away from the pad.
  A.fm.engine = 'off'; A.fm.throttle = 0; A.fm.vel.set(0, 0, 0);
  g.simulate(4, 1 / 30);
  o.onGround = A.fm.out.onGround; o.gs = A.fm.out.groundSpeed; o.engine = A.fm.engine; o.state = A.state;
  o.x = Math.round(A.fm.pos.x);
  o.inZone = g.service.inZone();
  o.shown = g.resultShown; o.screen = g.screens.open; o.hist = g.career.history.length;
  return o;
});
check('job complete', r.complete);
check('engine running on the ground: no result yet', r.shownRunning === false, JSON.stringify({ gs: r.gs }));
check('engine cut, stopped, away from the pad: the result comes up', r.screen === 'results' && !r.inZone && r.hist === 1, JSON.stringify(r));
check('no page errors', errors.length === 0, errors.join(' | '));
console.log(`${res.filter(Boolean).length}/${res.length} passed`);
await browser.close(); process.exit(res.every(Boolean) ? 0 : 1);
