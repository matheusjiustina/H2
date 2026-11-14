// Operation: Fireboss Frontier in the browser: the map is chosen in the
// Expansions screen (stored choice, reload), only the Fire Boss and the red
// fire-service AT-802 are there, the board holds the fire missions, a full
// scoop → drop loop puts a mission out and pays it, the smoke haze rises near
// the fire, and the map switch back keeps the career.
//   node test/frontiere2e.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'frontier-out';
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
});
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); };
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(600000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
const ready = () => page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
const shot = async (name) => { await page.evaluate(() => { const g = window.__agro; g.tick(1 / 60); g.render(); }); await page.waitForTimeout(300); await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 180000 }); };

await page.goto(url + '?q=low', { waitUntil: 'load' });
await ready();
await page.evaluate(() => { localStorage.clear(); const g = window.__agro; g.career.resetAll(); g.career.tutorialDone = true; g.career.money = 7777; g.career.save(); });
await page.evaluate(() => window.__agro.screens.expansions());
const rows = await page.evaluate(() => [...document.querySelectorAll('[data-map]')].map((b) => b.dataset.map));
check('map selector lists Fireboss Frontier', rows.includes('frontier'), JSON.stringify(rows));
await shot('01_map_selector');
let t0 = Date.now();
await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 120000 }), page.evaluate(() => document.querySelector('[data-map="frontier"]').click())]);
await ready();
const loadS = (Date.now() - t0) / 1000;
let r = await page.evaluate(() => {
  const g = window.__agro;
  return { fleet: Object.keys(g.fleet), sites: g.sites.map((s) => s.id), money: g.career.money, fires: g.fires.fires.length, active: g.fires.active, burning: g.fires.fires.filter((f) => f.state === 'burning').length };
});
check('Frontier loaded after the switch: two aircraft, two strips, fires unlit', r.fleet.join() === 'at802f,at802' && r.sites.join() === 'main,retiro' && r.active && r.burning === 0, JSON.stringify(r));
check('career kept across the switch', r.money === 7777, String(r.money));
console.log(`INFO switch main -> frontier ${loadS.toFixed(1)} s (SwiftShader)`);
await shot('02_title_fireboss');

// The red AT-802: its own paint, no booms, no water.
r = await page.evaluate(() => {
  const g = window.__agro; g.selectAircraft('at802');
  for (let i = 0; i < 10; i++) g.tick(1 / 60);
  const ac = g.aircraft;
  return { id: g.aircraftId, water: !!ac.water, nozzles: ac.model.nozzles.length, reg: ac.type.reg, spray: ac.type.spray.none, paint: g.screens.title.querySelector('.sr-paint') ? 1 : 0 };
});
check('AT-802 Bombeiros: no water system, no booms, fixed paint', r.id === 'at802' && !r.water && r.nozzles === 0 && r.spray && r.reg === 'PR-BMF', JSON.stringify(r));
await page.evaluate(() => { const g = window.__agro; g.showroom?.enter?.(); for (let i = 0; i < 30; i++) g.tick(1 / 60); });
await shot('03_title_bombeiros');
// The board with the AT-802: missions listed, not acceptable.
await page.evaluate(() => { const g = window.__agro; g.menuAction('career'); });
r = await page.evaluate(() => ({ cards: document.querySelectorAll('.cards .card').length, accept: document.querySelectorAll('[data-fire]').length }));
check('board: fire missions only; the AT-802 cannot take them', r.cards === 7 && r.accept === 0, JSON.stringify(r));
await page.evaluate(() => window.__agro.screens.close());

// Fire Boss: accept the initial-attack mission on the board.
await page.evaluate(() => { const g = window.__agro; g.menuAction('title'); g.selectAircraft('at802f'); g.setSetting('timeOfDay', 'afternoon'); g.setSetting('weather', 'clear'); g.menuAction('career'); });
r = await page.evaluate(() => ({ cards: document.querySelectorAll('.cards .card').length, accept: document.querySelectorAll('[data-fire]').length, types: [...document.querySelectorAll('.cards .tag')].map((e) => e.textContent.trim()[0]).join('') }));
check('board with the Fire Boss: 7 missions of types A–F', r.cards === 7 && r.accept === 7 && ['A', 'B', 'C', 'D', 'E', 'F'].every((k) => r.types.includes(k)), JSON.stringify(r));
await shot('04_board');
await page.evaluate(() => document.querySelector('[data-fire="ff-capim"]').click());
r = await page.evaluate(() => { const g = window.__agro, s = g.fireJobs.spots(); return { job: g.fireJobs.job?.def.id, burning: s.filter((f) => f.state === 'burning').length, nav: g.guidance.navTarget?.()?.kind ?? null, open: g.screens.open }; });
check('mission accepted: its fire burns, GPS leads to it', r.job === 'ff-capim' && r.burning === 1 && r.nav === 'fire', JSON.stringify(r));

// Scoop on Lagoa Grande (keys: T probes).
r = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft, fm = ac.fm;
  const ok = ac.placeOnWater(250, -1520, Math.PI / 2);
  for (let i = 0; i < 60; i++) g.tick(1 / 60);
  return { ok, onWater: fm.out.onWater, gear: fm.gearDown };
});
check('Fire Boss afloat on Lagoa Grande', r.ok && r.onWater && r.gear === 0, JSON.stringify(r));
await page.keyboard.press('KeyT');
r = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft, fm = ac.fm;
  g.tick(1 / 60);
  fm.engine = 'running'; fm.ng = 98; fm.rpm = 1700; fm.throttle = 1; fm.vel.set(33, 0, 0);
  const h0 = fm.hopper;
  for (let i = 0; i < 60 * 8; i++) g.tick(1 / 60);
  return { h0, h1: Math.round(fm.hopper), onWater: fm.out.onWater, x: Math.round(fm.pos.x), wl: g.world.terrain.waterLevel(fm.pos.x, fm.pos.z) > -1e8 };
});
await page.evaluate(() => { const g = window.__agro; g.cameraMode = 'chase'; g.rig.setMode('chase', g.aircraft); for (let i = 0; i < 8; i++) g.tick(1 / 60); });
await shot('05_scooping_lagoa_grande');
check('scooping on Lagoa Grande: the tank fills on the run', r.h1 > 1500 && r.wl, JSON.stringify(r));

// Drop on the fire (key C first, then the door again): passes over the
// spot at 40 m, the door opened ahead of it (the water carries forward);
// after each release the aircraft is lifted clear (no pilot in the test).
r = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft, fm = ac.fm, f = g.fireJobs.spots()[0];
  ac.placeAirborne(f.x + 170, f.z, -Math.PI / 2, 40, 48);
  fm.gearDown = 0; fm.gearCmd = false; fm.hopper = Math.max(fm.hopper, 2800); fm.updateMass();
  for (let i = 0; i < 20; i++) g.tick(1 / 60);
  return { i0: f.intensity };
});
await page.keyboard.press('KeyC');
await page.evaluate(() => { const g = window.__agro; for (let i = 0; i < 60 * 1.4; i++) g.tick(1 / 60); g.cameraMode = 'orbit'; g.rig.setMode('orbit', g.aircraft); g.rig.orbit.dist = 70; g.rig.orbit.pitch = 0.3; for (let i = 0; i < 4; i++) g.tick(1 / 60); });
await shot('06_drop');
r = await page.evaluate((r0) => {
  const g = window.__agro, ac = g.aircraft, fm = ac.fm, f = g.fires.fires.find((s) => s.sector === 'capim');
  const lift = () => { ac.placeAirborne(f.x, f.z - 900, Math.PI / 2, 300, 50); fm.gearDown = 0; fm.gearCmd = false; };
  for (let i = 0; i < 60 * 1.5; i++) g.tick(1 / 60);
  if (ac.water.dropping) ac.water.toggleDrop();
  lift();
  for (let i = 0; i < 60 * 5; i++) g.tick(1 / 60);
  let passes = 1;
  // Further passes, as a pilot would, until the fire is out.
  while (f.state === 'burning' && passes < 5) {
    // Side by side: a drop is narrower than the fire (lanes ±10 m).
    const dir = passes % 2 ? 1 : -1, lane = [0, 10, -10, 5, -5][passes];
    ac.placeAirborne(f.x - dir * 170, f.z + lane, dir * Math.PI / 2, 40, 48); fm.gearDown = 0; fm.gearCmd = false; fm.hopper = 3000; fm.updateMass();
    for (let i = 0; i < 40; i++) g.tick(1 / 60);
    ac.water.toggleDrop();
    for (let i = 0; i < 60 * 3; i++) g.tick(1 / 60);
    if (ac.water.dropping) ac.water.toggleDrop();
    lift();
    for (let i = 0; i < 60 * 5; i++) g.tick(1 / 60);
    passes++;
  }
  return { ...r0, passes, i1: f.intensity, state: f.state, job: g.fireJobs.job?.def.id ?? null, money: g.career.money, done: !!g.career.completed['ff-capim'], crashed: ac.state === 'crashed' };
}, r);
check('drops put the fire out; the mission is paid and recorded', r.state === 'out' && r.job === null && r.money >= 7777 + 16000 && r.done && !r.crashed, JSON.stringify(r));
await shot('07_fire_out');

// Low-visibility mission: the haze thickens near the basin's fire.
r = await page.evaluate(() => {
  const g = window.__agro; g.fireJobs.accept('ff-baixada');
  const f = g.fireJobs.spots()[0], ac = g.aircraft;
  ac.placeAirborne(f.x - 400, f.z, Math.PI / 2, 120, 50);
  for (let i = 0; i < 60 * 10; i++) g.tick(1 / 60);
  const near = g.world.atmo.smoke;
  ac.placeAirborne(-300, -2600, Math.PI / 2, 150, 50);
  for (let i = 0; i < 60 * 12; i++) g.tick(1 / 60);
  return { near: +near.toFixed(2), far: +g.world.atmo.smoke.toFixed(2), fog: g.scene.fog.density };
});
check('smoke haze: thick by the basin fire, clear far from it', r.near > 0.25 && r.far < 0.08, JSON.stringify(r));
await page.evaluate(() => { const g = window.__agro, f = g.fireJobs.spots()[0], ac = g.aircraft; ac.placeAirborne(f.x - 500, f.z - 100, Math.PI / 2, 90, 50); for (let i = 0; i < 60 * 8; i++) g.tick(1 / 60); g.cameraMode = 'chase'; g.rig.setMode('chase', ac); for (let i = 0; i < 10; i++) g.tick(1 / 60); });
await shot('08_low_visibility');
await page.evaluate(() => window.__agro.fireJobs.cancel());
r = await page.evaluate(() => window.__agro.fires.fires.filter((f) => f.state === 'burning').length);
check('mission handed in: its fire is cleared', r === 0, String(r));

// Back to the main map: career kept, the fire-service AT-802 is gone.
await page.evaluate(() => window.__agro.screens.expansions());
t0 = Date.now();
await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 120000 }), page.evaluate(() => document.querySelector('[data-map="main"]').click())]);
await ready();
r = await page.evaluate(() => { const g = window.__agro; return { fleet: Object.keys(g.fleet).length, money: g.career.money, reg: g.fleet.at802?.type.reg, fires: g.fires.fires.length }; });
check('back on the main map: full fleet, career kept, AT-802 back to its own marks', r.fleet === 14 && r.money >= 7777 + 16000 && r.reg === 'PR-AWX' && r.fires === 5, JSON.stringify(r));
console.log(`INFO switch frontier -> main ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await page.evaluate(() => localStorage.removeItem('agrowings.map'));

check('no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 5)));
await browser.close();
const failed = results.filter((x) => !x.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
