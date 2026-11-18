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
// (AGRO_CHROME: a Chromium binary when the project's Playwright does not
// match the browsers installed on the machine.)
const browser = await chromium.launch({
  ...(process.env.AGRO_CHROME ? { executablePath: process.env.AGRO_CHROME } : {}),
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
check('Mato Grosso loaded: full fleet, five strips, pivots, career kept', r.fleet === 14 && r.sites.join() === 'main,pivo,capim,reserva,castanha' && r.pivots && r.money === 5555, JSON.stringify(r));

await page.evaluate(() => { const g = window.__agro; g.selectAircraft('ipanema'); g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear'); g.menuAction('career'); });
r = await page.evaluate(() => ({ cards: document.querySelectorAll('.cards .card').length, heads: [...document.querySelectorAll('h3.lvl')].map((h) => h.textContent.slice(0, 30)) }));
check('board: the base\'s orders (soy, corn by the BR)', r.cards >= 6, JSON.stringify(r));
await shot('01_board');
await page.evaluate(() => window.__agro.screens.close());

// The pivot arm is an obstacle at work height, clear above it.
r = await page.evaluate(async () => {
  const g = window.__agro, T = g.world.terrain, P = (await import('/src/world/matogrosso.js')).MT_PIVOTS[0];
  const x = P.x + Math.cos(P.ang) * 200, z = P.z + Math.sin(P.ang) * 200, h = T.heightAt(x, z);
  return { low: g.world.obstacleAt(x, h + 4, z), high: g.world.obstacleAt(x, h + 7.5, z), aside: g.world.obstacleAt(x + 15, h + 4, z) };
});
check('pivot arm: hit at work height, clear 7.5 m up and beside it', r.low === 'center pivot' && !r.high && !r.aside, JSON.stringify(r));

// Spray a pivot order: passes along the rows over the disc, hopping the arm.
const sprayJob = () => page.evaluate(async () => {
  const g = window.__agro, A = g.aircraft, sp = 46 * (A.A.assistSpeedScale ?? 1), W = A.type.spray.swath * 0.85, T = g.world.terrain;
  const { fieldSpans } = await import('/src/world/fieldShape.js');
  let k = 0, hops = 0, runs = 0, pulls = 0, crashes = 0; const log = []; A.damage = 0; A.crashReason = null;
  for (const f of g.job.fields) {
    const ax = f.rowAxis === 'x', C = f.circle;
    const across0 = ax ? f.z0 : f.x0, across1 = ax ? f.z1 : f.x1;
    for (let c = across0 + W / 2; c < across1 + W * 0.3; c += W, k++) {
      // The stretches of this pass over the crop (a pilot follows the
      // outline: across a forest inlet the aircraft climbs out, spray off).
      let runsHere = [[(ax ? f.x0 : f.z0) - 10, (ax ? f.x1 : f.z1) + 10]];
      if (C) { const off = c - (ax ? C.z : C.x), hh = C.r * C.r - off * off; if (hh <= 0) continue; const half = Math.sqrt(hh), mid = ax ? C.x : C.z; runsHere = [[mid - half - 10, mid + half + 10]]; }
      else if (f.outline) {
        const sp0 = [...fieldSpans(f, ax, c - W * 0.4), ...fieldSpans(f, ax, c), ...fieldSpans(f, ax, c + W * 0.4)].sort((p, q) => p[0] - q[0]);
        runsHere = [];
        for (const [a, b] of sp0) { const last = runsHere.at(-1); if (last && a <= last[1] + 25) last[1] = Math.max(last[1], b); else runsHere.push([a, b]); }
        runsHere = runsHere.map(([a, b]) => [a - 4, b + 4]);
      }
      for (const [a0, a1] of runsHere) {
      runs++;
      const dir = k % 2 ? -1 : 1;
      let a = dir > 0 ? a0 : a1;
      const hdg = ax ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      while (dir > 0 ? a < a1 : a > a0) {
        const x = ax ? a : c, z = ax ? c : a;
        // Near the pivot arm: up and over it (the pilot's hop), spray off.
        const nearArm = g.world.pivots && g.world.obstacleAt(x, T.heightAt(x, z) + 4.6, z) === 'center pivot' || [-12, 12].some((d) => g.world.obstacleAt(ax ? x + d * dir : x, T.heightAt(x, z) + 4.6, ax ? z : z + d * dir) === 'center pivot');
        // Trees ahead at work height (the forest at the end of the pass, a
        // castanheira in the talhão): the pilot pulls up, spray off.
        const treesAhead = [8, 16, 24].some((d) => /tree/.test(g.world.obstacleAt(ax ? x + d * dir : x, T.heightAt(ax ? x + d * dir : x, ax ? z : z + d * dir) + 5, ax ? z : z + d * dir) ?? ''));
        if (treesAhead) { g.sprayer.on = false; A.placeAirborne(x, z, hdg, 45, sp); g.simulate(0.2, 1 / 30); pulls++; if (A.state !== 'ok') { crashes++; if (log.length < 6) log.push(`${A.crashReason}@${Math.round(x)},${Math.round(z)} up`); A.repair?.(); } a += dir * sp * 0.2; continue; }
        A.fm.hopper = Math.max(A.fm.hopper, 300);
        A.placeAirborne(x, z, hdg, nearArm ? 9 : 0.8 + 3.2, sp);
        if (nearArm) hops++;
        const dt = 0.2;
        g.sprayer.on = !nearArm; g.simulate(dt, 1 / 30);
        if (A.state !== 'ok') { crashes++; if (log.length < 6) log.push(`${A.crashReason}@${Math.round(x)},${Math.round(z)}${nearArm ? ' hop' : ''}`); A.repair?.(); }
        a += dir * sp * dt;
      }
      g.sprayer.on = false;
      }
    }
  }
  return { cov: +g.job.stats().coverage.toFixed(3), done: g.job.complete(), passes: k, runs, hops, pulls, crashes, log, state: A.state };
});
r = await page.evaluate(() => { const g = window.__agro; g.selectContract('mt-p01'); g.screens.close(); return { job: g.job?.c.id, ha: +g.job?.ha?.toFixed(1), field: g.job?.fields[0].name, circle: !!g.job?.fields[0].circle, passes: g.guidance.passes.length, chord: g.guidance.passes.map((p) => Math.round(p.e1 - p.e0)) }; });
check('pivot order taken: a round field, passes as chords of the disc', r.job === 'mt-p01' && r.circle && r.passes > 10 && r.chord[0] < r.chord[Math.floor(r.chord.length / 2)], JSON.stringify({ ...r, chord: r.chord.slice(0, 4) }));
r = await sprayJob();
check('pivot sprayed to completion, hopping the arm, no crash', r.done && r.crashes === 0 && r.hops > 3, JSON.stringify(r));
await page.evaluate(() => { const g = window.__agro, A = g.aircraft; A.placeAirborne(1100, -200, -0.6, 60, 46); g.cameraMode = 'chase'; g.rig.setMode('chase', A); g.simulate(1, 1 / 30); });
await shot('02_pivot_done');
// Flying into the arm at work height ends the flight.
r = await page.evaluate(async () => {
  const g = window.__agro, A = g.aircraft, P = (await import('/src/world/matogrosso.js')).MT_PIVOTS[0], x = P.x - 60, z = P.z + 200;
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
check('capim sprayed to completion, pulling up over the forest at the ends, no crash', r.done && r.crashes === 0, JSON.stringify(r));

// An irregular talhão cut out of the forest (refinement 2.0): A-04, with a
// deep forest inlet. Passes from the outline; sprayed to completion along
// the crop only, climbing over the inlet; nothing counted in the forest.
await page.evaluate(() => { const g = window.__agro; g.aircraft.repair?.(); g.aircraft.placeAtPad(g.sites[0]); g.simulate(1, 1 / 30); g.handIn?.(); g.screens.close(); });
r = await page.evaluate(async () => {
  const g = window.__agro, S = await import('/src/world/fieldShape.js');
  g.selectContract('mt-a04'); g.screens.close();
  const f = g.job?.fields[0], P = g.guidance.passes;
  const box = (f.x1 - f.x0) * (f.z1 - f.z0);
  return { job: g.job?.c.id, outline: !!f?.outline, ha: +g.job.ha.toFixed(1), polyHa: +(S.fieldArea(f) / 1e4).toFixed(1), boxHa: +(box / 1e4).toFixed(1), passes: P.length, short: P.filter((p) => p.e1 - p.e0 < (f.x1 - f.x0) - 40).length };
});
check('irregular talhão order: area from the outline (not its box), passes follow it', r.job === 'mt-a04' && r.outline && Math.abs(r.ha - r.polyHa) / r.polyHa < 0.05 && r.ha < r.boxHa * 0.9 && r.passes > 8 && r.short > 2, JSON.stringify(r));
r = await sprayJob();
check('irregular talhão sprayed to completion along the crop, no crash', r.done && r.crashes === 0, JSON.stringify(r));
r = await page.evaluate(async () => {
  const g = window.__agro, S = await import('/src/world/fieldShape.js'), f = g.job.fields[0], cov = g.job.coverages[0];
  // A point of the inlet (inside the box, 30 m off the crop) took nothing.
  let x0 = null, z0 = null;
  for (let z = f.z0 + 5; z < f.z1 && x0 === null; z += 8) for (let x = f.x0 + 5; x < f.x1; x += 8) if (!S.fieldInside(f, x, z, 30)) { x0 = x; z0 = z; break; }
  const ix = Math.floor((x0 - f.x0) / cov.cell), iz = Math.floor((z0 - f.z0) / cov.cell);
  return { inlet: [Math.round(x0), Math.round(z0)], dose: cov.dose[iz * cov.nx + ix], masked: !cov.mask[iz * cov.nx + ix] };
});
check('nothing counted in the forest inlet', r.masked && r.dose === 0, JSON.stringify(r));
await page.evaluate(() => { const g = window.__agro, A = g.aircraft; A.placeAirborne(-200, -1150, -0.4, 120, 46); g.cameraMode = 'chase'; g.rig.setMode('chase', A); g.simulate(1, 1 / 30); });
await shot('03_irregular');

// The BR-163 from low.
await page.evaluate(() => { const g = window.__agro, A = g.aircraft; A.placeAirborne(-2150, 600, 0.0, 40, 46); g.cameraMode = 'chase'; g.rig.setMode('chase', A); g.simulate(1, 1 / 30); });
await shot('04_br163');

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
