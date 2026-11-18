// GPS behaviour of every aircraft on an active contract (browser):
//   - on the talhão the unit shows the working screen (passes, coverage, track);
//   - ferrying (far from the talhão) it shows the moving map with the target;
//   - job done -> the target is the strip it was flown from;
//   - AgroNav units follow these situations by themselves; their soft keys still work;
//   - Fire Boss: an accepted fire order is on the MAPA / DESTINO / MISSÃO pages;
//   - the screen is drawn (not blank) and the hand-in clears it.
//   node test/gpsflow.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const outDir = process.argv[2] || 'gps-out'; fs.mkdirSync(outDir, { recursive: true });
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); };
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(600000);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url + '?q=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
const IDS = ['ipanema', 'at502', 'r44', 'm18', 'thrush', 'b206', 'e203', 'a188', 'pa36', 'agcat', 'e201', 'at401', 'at802'];
for (const id of IDS) {
  const r = await page.evaluate((id) => {
    const g = window.__agro, o = {};
    localStorage.clear(); g.career.resetAll(); g.career.tutorialDone = true;
    g.selectAircraft(id); g.menuAction('career'); g.screens.close();
    g.setSetting('timeOfDay', 'noon'); g.setSetting('weather', 'clear');
    g.selectContract('soy'); g.screens.close(); g.frozen = true;
    const A = g.aircraft, P = A.panel, gu = g.guidance, heli = A.kind === 'heli', W = A.type.spray.swath, sp = heli ? 25 : 46 * (A.A.assistSpeedScale ?? 1);
    const f = g.job.fields[0];
    const settle = () => { A.damage = 0; A.state = 'ok'; P.draw(A.instruments()); if (P.gps?.draw && P.nextPage) P.gps.draw(A.instruments(), 1, true); };
    const agro = !!P.nextPage && !!P.gps?.c;
    o.agro = agro;
    // On the talhão: two sprayed passes (placed along the line every 0.25 s, as the farm flow test does).
    const T = g.world.terrain;
    for (let k = 0; k < 2; k++) {
      const dir = k % 2 ? -1 : 1, c = f.z0 + W * (k + 0.5);
      for (let x = dir > 0 ? f.x0 - 10 : f.x1 + 10; dir > 0 ? x < f.x1 + 10 : x > f.x0 - 10; x += dir * sp * 0.25) {
        A.fm.hopper = Math.max(A.fm.hopper, 300);
        A.placeAirborne(x, c, dir > 0 ? Math.PI / 2 : -Math.PI / 2, 4 + (T.surfaceTop(x, c) - T.heightAt(x, c)), sp);
        g.sprayer.on = true; g.simulate(0.25, 1 / 30);
      }
      g.sprayer.on = false;
    }
    A.placeAirborne((f.x0 + f.x1) / 2 - 150, f.z0 + W * 3.5, Math.PI / 2, 8, sp); g.simulate(1.5, 1 / 30); settle();
    o.workNav = gu.navTarget()?.kind ?? null;
    o.workPage = agro ? P.page : 'n/a';
    o.passes = gu.passes.length; o.ext = gu.passes.every((p) => Number.isFinite(p.e0) && p.e1 > p.e0);
    o.cov = +(g.job.stats().coverage * 100).toFixed(1);
    // Ferrying: 3 km away from the talhão.
    A.placeAirborne(f.x0 - 3200, f.z0 - 1500, Math.PI / 2, 150, sp); g.simulate(1, 1 / 30); settle();
    o.ferryNav = gu.navTarget()?.kind ?? null;
    o.ferryPage = agro ? P.page : 'n/a';
    // A manual key press keeps the page while the situation holds.
    if (agro) { P.setPage('mission'); g.simulate(0.5, 1 / 30); settle(); o.manualKept = P.page === 'mission'; P.setPage('map'); }
    // Back on the talhão: the unit follows again.
    A.placeAirborne((f.x0 + f.x1) / 2 - 150, f.z0 + W * 3.5, Math.PI / 2, 8, sp); g.simulate(1.5, 1 / 30); settle();
    o.backPage = agro ? P.page : 'n/a';
    // Done: force the coverage over the target; the unit points home.
    const real = g.job.stats.bind(g.job); g.job.stats = () => ({ ...real(), coverage: 0.97 }); g.jobStats = null; g.simulate(0.6, 1 / 30); settle();
    const n = gu.navTarget(); o.doneNav = n ? `${n.kind}:${n.name}` : null; o.donePage = agro ? P.page : 'n/a';
    g.job.stats = real;
    // The unit's screen is drawn.
    const c = agro ? P.gps.c : null;
    if (c) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 0; i < d.length; i += 160) if (d[i] + d[i + 1] + d[i + 2] > 120) lit++; o.lit = lit; }
    // Hand-in clears the guidance.
    g.setJob(null); g.simulate(0.5, 1 / 30); settle();
    o.afterNav = gu.navTarget()?.kind ?? null; o.afterPage = agro ? P.page : 'n/a';
    return o;
  }, id);
  const inJob = r.workNav === null && r.passes > 0 && r.ext && r.cov > 0;
  check(`${id}: on the talhão (passes, extents, coverage)`, inJob, JSON.stringify({ passes: r.passes, cov: r.cov, nav: r.workNav }));
  check(`${id}: ferrying -> target is the field`, r.ferryNav === 'field', r.ferryNav);
  check(`${id}: job done -> target is the base strip`, /^strip:/.test(r.doneNav ?? ''), r.doneNav);
  check(`${id}: guidance clear after the hand-in`, r.afterNav === null);
  if (r.agro) {
    check(`${id}: AgroNav opens on COBERTURA at the talhão`, r.workPage === 'cov', r.workPage);
    check(`${id}: AgroNav shows MAPA while ferrying`, r.ferryPage === 'map', r.ferryPage);
    check(`${id}: a key press keeps its page`, r.manualKept === true);
    check(`${id}: AgroNav follows the work again`, r.backPage === 'cov', r.backPage);
    check(`${id}: AgroNav on MAPA after the job is done`, r.donePage === 'map', r.donePage);
    check(`${id}: AgroNav screen is drawn`, r.lit > 40, String(r.lit));
    check(`${id}: AgroNav back on MAPA with no job`, r.afterPage === 'map', r.afterPage);
  }
}
// Fire Boss: the fire order on the unit.
const fb = await page.evaluate(() => {
  const g = window.__agro, o = {};
  localStorage.clear(); g.career.resetAll(); g.career.tutorialDone = true;
  g.selectAircraft('at802f'); g.menuAction('career'); g.screens.close(); g.frozen = true;
  const A = g.aircraft, P = A.panel, gu = g.guidance;
  A.placeAirborne(0, 0, 0, 200, 60); g.simulate(1, 1 / 30);
  o.before = gu.navTarget()?.kind ?? null;
  o.ok = g.fireJobs.accept('fb-line'); g.simulate(1, 1 / 30);
  const n = gu.navTarget(); o.nav = n ? `${n.kind}:${n.name}` : null;
  A.damage = 0; A.state = 'ok'; P.setPage('mission'); P.draw(A.instruments()); P.gps.draw(A.instruments(), 1, true);
  const c = P.gps.c, d = c.getContext('2d').getImageData(0, 90, c.width, 160).data; let lit = 0; for (let i = 0; i < d.length; i += 40) if (d[i] > 200 && d[i + 1] > 200) lit++;
  o.missionLit = lit; o.page = P.page;
  for (const pg of ['map', 'dest']) { P.setPage(pg); P.gps.draw(A.instruments(), 1, true); }
  const sp = g.fireJobs.spots(); o.spots = sp.length;
  // Put one out: the unit's counter follows.
  sp[0].state = 'out'; P.setPage('mission'); g.simulate(0.5, 1 / 30); A.damage = 0; A.state = 'ok'; P.draw(A.instruments()); P.gps.draw(A.instruments(), 1, true);
  o.out = g.fireJobs.spots().filter((s) => s.state === 'out').length;
  g.fireJobs.cancel(); g.simulate(0.5, 1 / 30); o.after = gu.navTarget()?.kind ?? null;
  return o;
});
check('Fire Boss: no fire order -> no fire target', fb.before === null, String(fb.before));
check('Fire Boss: accepted order -> GPS target is the nearest fire', fb.ok && /^fire:FOGO \d/.test(fb.nm ?? fb.nav ?? ''), JSON.stringify(fb));
check('Fire Boss: MISSÃO page draws the fire order', fb.missionLit > 20 && fb.spots === 3, JSON.stringify({ lit: fb.missionLit, spots: fb.spots }));
check('Fire Boss: spots out are counted', fb.out === 1);
check('Fire Boss: order handed in -> target cleared', fb.after === null, String(fb.after));
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
