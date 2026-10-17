// End-to-end validation in Chromium: full contract flown by the test
// autopilot through the normal player inputs. Usage:
//   [AC=at502|r44] node test/e2e.mjs [contractId] [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';

const contract = process.argv[2] || 'soy';
const outDir = process.argv[3] || 'e2e-out';
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url + '?q=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });
await page.evaluate(([id, ac]) => {
  const g = window.__agro;
  localStorage.clear();
  if (ac) g.selectAircraft(ac);
  g.career.resetAll();
  g.career.tutorialDone = true;
  g.menuAction('career');
  g.screens.close();
  g.selectContract(id);
  g.screens.close();
  g.frozen = true;
  g.noRender = true; // only render for snapshots: keeps the software GPU free for the simulation
  g.input.press('KeyT');
  g.startAutopilot('contract');
}, [contract, process.env.AC]);

const snap = async (name) => {
  // Fast-forward skips presentation: re-seat the camera, then ~0.75 s of full
  // (non-headless) ticks refresh camera, spray mist, streaming and HUD.
  await page.evaluate(() => { const g = window.__agro; g.rig.initialized = false; for (let i = 0; i < 45; i++) g.tick(1 / 60); g.render(); });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${outDir}/${name}.png` });
};
const state = () => page.evaluate(() => {
  const g = window.__agro;
  const ac = g.aircraft, fm = ac.fm, o = fm.out;
  const s = g.job ? g.job.stats() : null;
  return {
    t: +g.autopilot.t.toFixed(1), phase: g.autopilot.phase, x: +fm.pos.x.toFixed(0), z: +fm.pos.z.toFixed(0),
    agl: +o.agl.toFixed(1), hgt: +ac.workHeight().toFixed(1), kt: +(o.airspeed * 1.944).toFixed(0), eng: fm.engine,
    fuel: +fm.fuel.toFixed(0), hop: +fm.hopper.toFixed(0), mass: +fm.mass.toFixed(0), spray: g.sprayer.on,
    cov: s ? +(s.coverage * 100).toFixed(1) : null, dmg: +ac.damage.toFixed(1), state: ac.state,
    svc: g.service.state, step: g.service.step?.a || '', money: Math.round(g.career.money),
    results: g.screens.open,
  };
});

const shots = { service1: false, svcConnect: false, takeoff: false, spraying: false, cockpit: false, landing: false };
let last = null;
const t0 = Date.now();
for (let i = 0; i < (+process.env.MAXI || 900); i++) {
  await page.evaluate(() => window.__agro.simulate(4, 1 / 30));
  const s = await state();
  if (!last || s.phase !== last.phase || i % 5 === 0) console.log(JSON.stringify(s));
  if (!shots.service1 && s.step === 'walk' && s.svc === 'working' && s.t > 6) { shots.service1 = true; await page.evaluate(() => { const g = window.__agro; g.cameraMode = 'orbit'; g.rig.setMode('orbit', g.aircraft); g.rig.orbit.yaw = 0.9; g.rig.orbit.dist = 20; }); await snap('01-service-walk'); }
  if (!shots.svcConnect && (s.step === 'transfer')) { shots.svcConnect = true; await snap('02-service-transfer'); await page.evaluate(() => { const g = window.__agro; g.rig.orbit.yaw = 2.2; g.rig.orbit.dist = 9; g.rig.orbit.pitch = 0.3; }); await snap('02b-service-close'); }
  if (!shots.takeoff && ((s.phase === 'takeoff' && s.kt > 40) || (s.phase === 'liftoff' && s.agl > 4))) { shots.takeoff = true; await page.evaluate(() => { const g = window.__agro; g.cameraMode = 'chase'; g.rig.setMode('chase', g.aircraft); }); await page.evaluate(() => window.__agro.simulate(0.5)); await snap('03-takeoff'); }
  if (!shots.spraying && s.spray && s.cov > 3) { shots.spraying = true; await snap('04-spraying-chase');
    await page.evaluate(() => { const g = window.__agro; g.cameraMode = 'orbit'; g.rig.setMode('orbit', g.aircraft); const f = g.aircraft.forward(); g.rig.orbit.yaw = Math.atan2(f.x, f.z) + 0.6; g.rig.orbit.dist = 17; g.rig.orbit.pitch = 0.1; g.simulate(0.4); });
    await snap('04b-spraying-side');
    await page.evaluate(() => { const g = window.__agro; g.overlay.setVisible(true, g.job.coverages); g.rig.orbit.pitch = 0.9; g.rig.orbit.dist = 140; g.simulate(0.2); });
    await snap('04c-coverage-overlay');
    await page.evaluate(() => { const g = window.__agro; g.overlay.setVisible(false, g.job.coverages); }); await page.evaluate(() => { const g = window.__agro; g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', g.aircraft); }); await page.evaluate(() => window.__agro.simulate(0.3)); await snap('05-cockpit'); await page.evaluate(() => { const g = window.__agro; g.cameraMode = 'chase'; g.rig.setMode('chase', g.aircraft); }); }
  if (!shots.landing && ((s.phase === 'approach' && s.agl < 30 && s.agl > 5) || (s.phase === 'land' && s.agl > 1.5))) { shots.landing = true; await snap('06-approach'); }
  if (s.state !== 'ok' || s.phase === 'done' || s.phase === 'crashed' || s.results === 'results') { last = s; break; }
  last = s;
}
await snap('07-final');
const summary = await page.evaluate(() => {
  const g = window.__agro;
  return { log: g.autopilot.log, toasts: (g.toastLog || []).slice(-30), money: g.career.money, history: g.career.history, completed: g.career.completed };
});
console.log('SUMMARY', JSON.stringify(summary, null, 1));
console.log('ERRORS', errors.slice(0, 20));
console.log('wall', ((Date.now() - t0) / 1000).toFixed(0), 's');
await browser.close();
