// Browser checks for special cases + UI screenshots.
//   node test/e2e_ui.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'e2e-ui';
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.AGRO_URL || 'http://localhost:4173/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); };

async function open(viewport, opts = {}) {
  const page = await browser.newPage({ viewport, ...opts });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(url + '?q=low', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });
  return page;
}
const shot = async (page, name) => {
  await page.evaluate(() => { const g = window.__agro; g.tick(1 / 60); g.render(); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/${name}.png` });
};

const page = await open({ width: 1280, height: 720 });
await page.evaluate(() => { localStorage.clear(); const g = window.__agro; g.career.resetAll(); g.career.tutorialDone = true; g.frozen = true; });
await shot(page, '00-title');

// --- Contracts board + load sheet ------------------------------------------
await page.evaluate(() => { const g = window.__agro; g.menuAction('career'); g.render(); });
await shot(page, '01-board');
await page.evaluate(() => window.__agro.selectContract('cotton'));
await shot(page, '02-loadsheet');
check('load sheet opens at the pad', await page.evaluate(() => window.__agro.screens.open === 'load'));

// --- Service + interruption --------------------------------------------------
// The service truck drives to its stand first; then the badeco takes the hose.
await page.evaluate(() => { const g = window.__agro; g.screens.close(); g.requestService(200, 650); g.simulate(90, 1 / 30, () => !(g.service.carry || g.service.connected)); g.simulate(2, 1 / 30); });
const mid = await page.evaluate(() => { const g = window.__agro; return { st: g.service.state, step: g.service.step?.a, carry: g.service.carry, hoseVisible: g.service.fuelHose.mesh.visible }; });
check('badeco working with hose out', mid.st === 'working' && mid.hoseVisible, JSON.stringify(mid));
check('service truck parked at its stand', await page.evaluate(() => window.__agro.service.truck.parkedAtStand && window.__agro.service.useTruck));
await page.evaluate(() => { const g = window.__agro; g.cameraMode = 'orbit'; g.rig.setMode('orbit', g.aircraft); g.rig.orbit.yaw = 1.2; g.rig.orbit.dist = 16; g.rig.orbit.pitch = 0.3; g.simulate(0.5, 1 / 30); });
await shot(page, '03-service-hose');
// Try to start the engine: hold Q.
await page.evaluate(() => { const g = window.__agro; const q = g.input.keysOf('engine')[0]; g.input.press(q); g.simulate(0.6, 1 / 30); g.input.release(q); g.simulate(0.1, 1 / 30); });
const ab = await page.evaluate(() => { const g = window.__agro; return { st: g.service.state, eng: g.aircraft.fm.engine, toasts: (g.toastLog || []).slice(-3) }; });
check('engine start vetoed while crew is at the aircraft', ab.eng === 'off', JSON.stringify(ab));
check('service aborted', ab.st === 'aborting' || ab.st === 'idle', ab.st);
await page.evaluate(() => window.__agro.simulate(1.0, 1 / 30));
await shot(page, '04-service-abort');
await page.evaluate(() => window.__agro.simulate(14, 1 / 30));
const after = await page.evaluate(() => {
  const g = window.__agro; const b = g.service.badeco.pos; const p = g.aircraft.fm.pos;
  return { st: g.service.state, fuelHose: g.service.fuelHose.mesh.visible, mixHose: g.service.mixHose.mesh.visible, dist: Math.hypot(b.x - p.x, b.z - p.z) };
});
check('crew cleared and hoses reeled in after abort', after.st === 'idle' && !after.fuelHose && !after.mixHose && after.dist > 9, JSON.stringify(after));
// Engine can start now.
await page.evaluate(() => { const g = window.__agro; const q = g.input.keysOf('engine')[0]; g.input.press(q); g.simulate(0.6, 1 / 30); g.input.release(q); g.simulate(2, 1 / 30); });
check('engine starts once clear', await page.evaluate(() => window.__agro.aircraft.fm.engine === 'running'));
// Stop engine and redo full service; check levels rise gradually.
await page.evaluate(() => { const g = window.__agro; const q = g.input.keysOf('engine')[0]; g.input.press(q); g.simulate(0.1, 1 / 30); g.input.release(q); g.simulate(3, 1 / 30); g.requestService(200, 650); });
const levels = [];
for (let i = 0; i < 40; i++) {
  levels.push(await page.evaluate(() => { const g = window.__agro; g.input.press('KeyT'); g.simulate(3, 1 / 30); return [Math.round(g.aircraft.fm.fuel), Math.round(g.aircraft.fm.hopper), g.service.state, g.service.step?.a || '']; }));
  if (levels.at(-1)[2] === 'idle') break;
}
console.log('levels', JSON.stringify(levels));
const L = levels.at(-1);
check('full service completes with gradual levels', L[2] === 'idle' && L[0] >= 199 && L[1] >= 649 && levels.some((l) => l[1] > 50 && l[1] < 600), JSON.stringify(L));
await page.evaluate(() => window.__agro.input.release('KeyT'));

// --- Map, settings, pause, help --------------------------------------------
await page.evaluate(() => { const g = window.__agro; g.cameraMode = 'chase'; g.rig.setMode('chase', g.aircraft); g.screens.map(); });
await page.waitForTimeout(400);
await shot(page, '05-map');
await page.evaluate(() => { const g = window.__agro; g.screens.close(); g.screens.settings(); });
await shot(page, '06-settings');
// Key rebinding: rebind spray to KeyL then restore.
await page.evaluate(() => { const g = window.__agro; g.input.rebind('spray'); });
await page.keyboard.press('KeyL');
const reb = await page.evaluate(() => window.__agro.input.bindings.spray[0]);
check('key rebinding works', reb === 'KeyL', reb);
await page.evaluate(() => { const g = window.__agro; g.input.resetBindings(); g.screens.close(); g.screens.help(); });
await shot(page, '07-help');
await page.evaluate(() => window.__agro.screens.close());

// --- Crash + recovery --------------------------------------------------------
await page.evaluate(() => {
  const g = window.__agro;
  g.aircraft.placeAirborne(-1480, -800, -Math.PI / 2, 12, 45); // westbound into the legal-reserve forest edge
  g.aircraft.fm.throttle = 0.6;
  g.simulate(6, 1 / 30);
});
const cr = await page.evaluate(() => ({ state: window.__agro.aircraft.state, reason: window.__agro.aircraft.crashReason }));
check('flying into the forest crashes', cr.state === 'crashed', JSON.stringify(cr));
await page.waitForTimeout(2600);
await shot(page, '08-crash');
check('crash panel shown', await page.evaluate(() => window.__agro.screens.open === 'crash'));
await page.evaluate(() => { const g = window.__agro; g.screens.close(); g.recover(); g.simulate(1, 1 / 30); });
const rec = await page.evaluate(() => { const g = window.__agro; return { state: g.aircraft.state, x: Math.round(g.aircraft.fm.pos.x), z: Math.round(g.aircraft.fm.pos.z), dmg: g.aircraft.damage }; });
check('recovered at the pad', rec.state === 'ok' && rec.dmg === 0 && Math.hypot(rec.x + 352, rec.z + 64) < 3, JSON.stringify(rec));

// --- Stuck detection + reset (aircraft tipped onto a wingtip) ----------------
await page.evaluate(() => {
  const g = window.__agro;
  const fm = g.aircraft.fm;
  fm.pos.y += 3;
  fm.quat.set(0, 0, Math.sin(0.65), Math.cos(0.65)); // ~75° bank
  fm.vel.set(0, 0, 0); fm.omega.set(0, 0, 0);
  g.simulate(5, 1 / 30);
});
const st = await page.evaluate(() => ({ stuck: window.__agro.aircraft.stuck, state: window.__agro.aircraft.state }));
check('tipped-over aircraft detected as stuck', !!st.stuck || st.state === 'crashed', JSON.stringify(st));
await shot(page, '08b-stuck');
await page.evaluate(() => { const g = window.__agro; if (g.aircraft.state === 'crashed') { g.screens.close(); g.recover(); } g.input.press('Backspace'); g.simulate(0.1, 1 / 30); g.input.release('Backspace'); g.simulate(1, 1 / 30); });
check('reset clears the stuck state', await page.evaluate(() => !window.__agro.aircraft.stuck && window.__agro.aircraft.state === 'ok'));

// --- Tutorial -----------------------------------------------------------------
await page.evaluate(() => { const g = window.__agro; g.tutorial.start(); g.simulate(1, 1 / 30); });
await shot(page, '09-tutorial');
check('tutorial card visible', await page.evaluate(() => document.querySelector('.tut').classList.contains('show')));
await page.evaluate(() => window.__agro.tutorial.skip());
console.log('page errors', page.errors);
await page.close();

// --- Mobile layout -------------------------------------------------------------
const mob = await open({ width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await mob.evaluate(() => { const g = window.__agro; g.frozen = true; g.career.tutorialDone = true; g.menuAction('freeAir'); g.simulate(2, 1 / 30); });
await shot(mob, '10-mobile');
check('touch controls active on touch device', await mob.evaluate(() => window.__agro.touch.active));
await mob.close();

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
