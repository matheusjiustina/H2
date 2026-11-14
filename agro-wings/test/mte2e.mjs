// Mato Grosso Operations in the browser: chosen in the Expansions screen
// (stored choice, reload), the agricultural fleet and four strips, the
// board's orders, a centre-pivot order sprayed to completion (passes as
// chords of the disc, hopping the pivot arm), the arm as an obstacle, a
// capim desiccation order, the BR-163, and the switch back with the career kept.
//   node test/mte2e.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'mt-out';
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
});
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); };
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(900000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
const ready = () => page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 600000 });
const shot = async (name) => { await page.evaluate(() => { const g = window.__agro; g.tick(1 / 60); g.render(); }); await page.waitForTimeout(300); await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 180000 }); };

await page.goto(url + '?q=low', { waitUntil: 'load' });
await ready();
await page.evaluate(() => { localStorage.clear(); const g = window.__agro; g.career.resetAll(); g.career.tutorialDone = true; g.career.money = 5555; g.career.save(); });
await page.evaluate(() => window.__agro.screens.expansions());
const rows = await page.evaluate(() => [...document.querySelectorAll('[data-map]')].map((b) => b.dataset.map));
check('map selector lists Mato Grosso Operations', rows.includes('matogrosso'), JSON.stringify(rows));
let t0 = Date.now();
await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 120000 }), page.evaluate(() => document.querySelector('[data-map="matogrosso"]').click())]);
await ready();
console.log(`INFO switch main -> matogrosso ${((Date.now() - t0) / 1000).toFixed(1)} s (SwiftShader)`);
let r = await page.evaluate(() => { const g = window.__agro; return { fleet: Object.keys(g.fleet).length, sites: g.sites.map((s) => s.id), money: g.career.money, pivots: !!g.world.pivots, br: g.world.roads.group.children.length }; });
check('Mato Grosso loaded: full fleet, four strips, pivots, career kept', r.fleet === 14 && r.sites.join() === 'main,pivo,capim,reserva' && r.pivots && r.money === 5555, JSON.stringify(r));

await page.evaluate(() => { const g = window.__agro; g.selectAircraft('ipanema'); g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear'); g.menuAction('career'); });
r = await page.evaluate(() => ({ cards: document.querySelectorAll('.cards .card').length, heads: [...document.querySelectorAll('h3.lvl')].map((h) => h.textContent.slice(0, 30)) }));
check('board: the base\'s orders (soy, corn by the BR)', r.cards >= 6, JSON.stringify(r));
await shot('01_board');
await page.evaluate(() => window.__agro.screens.close());

// The pivot arm is an obstacle at work height, clear above it.
r = await page.evaluate(() => {
  const g = window.__agro, T = g.world.terrain, x = 2000 + Math.cos(Math.PI / 2 + 0.06) * 200, z = -1330 + Math.sin(Math.PI / 2 + 0.06) * 200, h = T.heightAt(x, z);
  return { low: g.world.obstacleAt(x, h + 4, z), high: g.world.obstacleAt(x, h + 7.5, z), aside: g.world.obstacleAt(x + 15, h + 4, z) };
});
check('pivot arm: hit at work height, clear 7.5 m up and beside it', r.low === 'center pivot' && !r.high && !r.aside, JSON.stringify(r));

// Spray a pivot order: passes along the rows over the disc, hopping the arm.
const sprayJob = () => page.evaluate(() => {
  const g = window.__agro, A = g.aircraft, sp = 46 * (A.A.assistSpeedScale ?? 1), W = A.type.spray.swath * 0.85, T = g.world.terrain;
  let k = 0, hops = 0; A.damage = 0;
  for (const f of g.job.fields) {
    const ax = f.rowAxis === 'x', C = f.circle;
    const across0 = ax ? f.z0 : f.x0, across1 = ax ? f.z1 : f.x1;
    for (let c = across0 + W / 2; c < across1 + W * 0.3; c += W, k++) {
      let a0 = (ax ? f.x0 : f.z0) - 10, a1 = (ax ? f.x1 : f.z1) + 10;
      if (C) { const off = c - (ax ? C.z : C.x), hh = C.r * C.r - off * off; if (hh <= 0) continue; const half = Math.sqrt(hh), mid = ax ? C.x : C.z; a0 = mid - half - 10; a1 = mid + half + 10; }
      const dir = k % 2 ? -1 : 1;
      let a = dir > 0 ? a0 : a1;
      const hdg = ax ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      while (dir > 0 ? a < a1 : a > a0) {
        const x = ax ? a : c, z = ax ? c : a;
        // Near the pivot arm: up and over it (the pilot's hop), spray off.
        const nearArm = g.world.pivots && g.world.obstacleAt(x, T.heightAt(x, z) + 4.6, z) === 'center pivot' || [-12, 12].some((d) => g.world.obstacleAt(ax ? x + d * dir : x, T.heightAt(x, z) + 4.6, ax ? z : z + d * dir) === 'center pivot');
        A.fm.hopper = Math.max(A.fm.hopper, 300);
        A.placeAirborne(x, z, hdg, nearArm ? 9 : 0.8 + 3.2, sp);
        if (nearArm) hops++;
        const dt = 0.2;
        g.sprayer.on = !nearArm; g.simulate(dt, 1 / 30);
        a += dir * sp * dt;
      }
      g.sprayer.on = false;
    }
  }
  return { cov: +g.job.stats().coverage.toFixed(3), done: g.job.complete(), passes: k, hops, state: A.state, why: A.crashReason ?? null };
});
r = await page.evaluate(() => { const g = window.__agro; g.selectContract('mt-p01'); g.screens.close(); return { job: g.job?.c.id, ha: +g.job?.ha?.toFixed(1), field: g.job?.fields[0].name, circle: !!g.job?.fields[0].circle, passes: g.guidance.passes.length, chord: g.guidance.passes.map((p) => Math.round(p.e1 - p.e0)) }; });
check('pivot order taken: a round field, passes as chords of the disc', r.job === 'mt-p01' && r.circle && r.passes > 10 && r.chord[0] < r.chord[Math.floor(r.chord.length / 2)], JSON.stringify({ ...r, chord: r.chord.slice(0, 4) }));
r = await sprayJob();
check('pivot sprayed to completion, hopping the arm, no crash', r.done && r.state === 'ok' && r.hops > 3, JSON.stringify(r));
await page.evaluate(() => { const g = window.__agro, A = g.aircraft; A.placeAirborne(1650, -1100, 0.9, 60, 46); g.cameraMode = 'chase'; g.rig.setMode('chase', A); g.simulate(1, 1 / 30); });
await shot('02_pivot_done');
// Flying into the arm at work height ends the flight.
r = await page.evaluate(() => {
  const g = window.__agro, A = g.aircraft, T = g.world.terrain, x = 2000 - 60, z = -1330 + 200;
  A.repair?.(); A.placeAirborne(x, z, Math.PI / 2, 0.8 + 3.3, 46);
  g.simulate(3, 1 / 30);
  return { state: A.state, why: A.crashReason };
});
check('the pivot arm at work height brings the aircraft down', r.state === 'crashed' && /pivot/.test(r.why), JSON.stringify(r));
await page.evaluate(() => { const g = window.__agro; g.aircraft.repair(); g.aircraft.placeAtPad(g.sites[0]); g.simulate(1, 1 / 30); g.handIn?.(); });

// A capim desiccation request (capim strip).
r = await page.evaluate(() => { const g = window.__agro; g.screens.close(); g.selectContract('mt-c01'); g.screens.close(); return { job: g.job?.c.id, crop: g.job?.fields[0].crop, title: g.job?.c.title }; });
check('capim desiccation order', r.job === 'mt-c01' && r.crop === 'capim', JSON.stringify(r));
r = await sprayJob();
check('capim sprayed to completion', r.done && r.state === 'ok', JSON.stringify(r));

// The BR-163 from low.
await page.evaluate(() => { const g = window.__agro, A = g.aircraft; A.placeAirborne(-900, 1650, 1.6, 40, 46); g.cameraMode = 'chase'; g.rig.setMode('chase', A); g.simulate(1, 1 / 30); });
await shot('03_br163');

// Back to the main map.
await page.evaluate(() => window.__agro.screens.expansions());
await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 120000 }), page.evaluate(() => document.querySelector('[data-map="main"]').click())]);
await ready();
r = await page.evaluate(() => { const g = window.__agro; return { sites: g.sites.length, money: g.career.money, pivots: !!g.world.pivots }; });
check('back on the main map, career kept, no pivots there', r.sites > 4 && !r.pivots && r.money >= 5555, JSON.stringify(r));
await page.evaluate(() => localStorage.removeItem('agrowings.map'));
check('no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 5)));
await browser.close();
const failed = results.filter((x) => !x.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
