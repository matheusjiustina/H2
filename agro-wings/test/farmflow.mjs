// Secondary-farm flow in the browser: office computer (messages, requests,
// map, aircraft, history), accept a farm request, fly over, the local truck
// loads the aircraft at that farm, work, hand in, separate history.
//   node test/farmflow.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'farm-out';
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.AGRO_URL || 'http://localhost:4173/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); };
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url + '?q=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });
const shot = async (name) => { await page.evaluate(() => { const g = window.__agro; g.tick(1 / 60); g.render(); }); await page.waitForTimeout(700); await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 180000 }); };

await page.evaluate(() => {
  localStorage.clear(); const g = window.__agro; g.career.resetAll(); g.career.tutorialDone = true;
  g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
  g.menuAction('career'); g.screens.close();
});
check('office prompt at the base', await page.evaluate(() => window.__agro.atMainBase()));
for (const tab of ['inbox', 'requests', 'map', 'aircraft', 'history']) {
  await page.evaluate((tab) => window.__agro.screens.office(tab), tab);
  await shot(`office-${tab}`);
}
// Weather decides what can be accepted.
const cond = await page.evaluate(() => {
  const g = window.__agro;
  g.setSetting('weather', 'rain'); g.screens.office('requests');
  const rain = [...document.querySelectorAll('[data-accept]')].filter((b) => !b.disabled).length;
  g.setSetting('weather', 'clear'); g.setSetting('timeOfDay', 'noon'); g.screens.office('requests');
  const noon = [...document.querySelectorAll('[data-accept]')].map((b) => [b.dataset.accept, !b.disabled]);
  g.setSetting('timeOfDay', 'morning'); g.screens.office('requests');
  return { rain, noon };
});
check('rain postpones every farm request', cond.rain === 0, JSON.stringify(cond.rain));
check('morning-only requests closed at noon', cond.noon.find((x) => x[0] === 'sr-soy')[1] === false && cond.noon.find((x) => x[0] === 'sr-cotton')[1] === true);
await page.evaluate(() => document.querySelector('[data-accept="sr-soy"]').click());
const acc = await page.evaluate(() => { const g = window.__agro; return { job: g.job?.c.id, site: g.site.id, toast: g.toastLog.at(-1) }; });
check('request accepted at the office, crew still at the base', acc.job === 'sr-soy' && acc.site === 'main', JSON.stringify(acc));
// Ferry: the GPS shows the NAV page to the farm.
check('GPS navigates to the farm strip', await page.evaluate(() => window.__agro.guidance.navTarget()?.name === 'SANTA RITA'));
// Arrive at the farm: the crew there takes over.
const arr = await page.evaluate(() => {
  const g = window.__agro, s = g.sites.find((x) => x.id === 'santarita');
  g.aircraft.placeAtPad(s); g.simulate(1.2, 1 / 30);
  return { site: g.site.id, inZone: g.service.inZone(), truckHome: g.service.truck.atHome, tx: g.service.truck.x, tz: g.service.truck.z };
});
check('local truck and badeco at Santa Rita', arr.site === 'santarita' && arr.inZone && arr.truckHome && Math.abs(arr.tx + 3331) < 2, JSON.stringify(arr));
await page.evaluate(() => { const g = window.__agro; g.aircraft.fm.fuel = 60; g.aircraft.fm.hopper = 0; g.requestService(180, 600); g.simulate(90, 1 / 30, () => !(g.service.truck.parkedAtStand && g.service.connected)); });
await page.evaluate(() => { const g = window.__agro; g.cameraMode = 'orbit'; g.rig.setMode('orbit', g.aircraft); g.rig.orbit.yaw = 2.2; g.rig.orbit.dist = 26; g.rig.orbit.pitch = 0.32; g.simulate(0.3, 1 / 30); });
await shot('farm-service');
const svc = await page.evaluate(() => { const g = window.__agro; g.simulate(400, 1 / 20, () => g.service.state !== 'idle'); return { st: g.service.state, fuel: g.aircraft.fm.fuel, hop: g.aircraft.fm.hopper, used: g.service.useTruck }; });
check('serviced by the farm truck', svc.st === 'idle' && svc.fuel > 170 && svc.hop > 590, JSON.stringify(svc));
// A few spraying passes over SR-01.
await page.evaluate(() => {
  const g = window.__agro, A = g.aircraft, sp = 46 * (A.A.assistSpeedScale ?? 1), W = A.type.spray.swath;
  for (let k = 0; k < 3; k++) {
    A.placeAirborne(k % 2 ? -3000 : -3800, -1760 + W * (k + 0.5), k % 2 ? -Math.PI / 2 : Math.PI / 2, 4, sp);
    g.sprayer.on = true; g.simulate(16, 1 / 30); g.sprayer.on = false;
  }
  g.aircraft.placeAtPad(g.sites.find((x) => x.id === 'santarita')); g.simulate(1, 1 / 30);
});
await page.evaluate(() => { const g = window.__agro; g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', g.aircraft); g.simulate(0.2, 1 / 30); });
const cov = await page.evaluate(() => window.__agro.job.stats().coverage);
check('coverage recorded on the farm talhão', cov > 0.02, cov.toFixed(3));
await page.evaluate(() => window.__agro.handIn());
await shot('farm-results');
const hist = await page.evaluate(() => { const g = window.__agro; return { main: g.career.history.length, sec: g.career.history2.map((e) => [e.id, e.farm, e.ac, e.n]) }; });
check('hand-in recorded in the secondary history only', hist.main === 0 && hist.sec.length === 1 && hist.sec[0][1] === 'santarita', JSON.stringify(hist));
await page.evaluate(() => window.__agro.screens.office('history'));
await shot('office-history-after');
// Replay of the operation from the history: every camera, then back.
const before = await page.evaluate(() => { const p = window.__agro.aircraft.model.root.position; return [p.x, p.y, p.z]; });
const rp = await page.evaluate(() => { const g = window.__agro; const b = document.querySelector('[data-replay]'); b?.click(); return { active: g.replay.active, dur: g.replay.rec?.track.duration }; });
check('replay opens from the history', rp.active && rp.dur > 30, JSON.stringify(rp));
for (const [i, cam] of ['chase', 'side', 'orbit', 'cinematic', 'observer', 'free'].entries()) {
  await page.evaluate(([cam, i]) => { const g = window.__agro; g.replay.setCamera(cam); g.replay.t = 6 + i * 7; for (let k = 0; k < 30; k++) g.tick(1 / 30); g.render(); }, [cam, i]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/replay-${cam}.png`, timeout: 180000 });
}
const moved = await page.evaluate(() => { const g = window.__agro; const p = g.aircraft.model.root.position; return { x: p.x, z: p.z, spray: g.replay.cur.spray, paused: g.frames }; });
check('replay moves the aircraft model along the recorded track', Math.hypot(moved.x - before[0], moved.z - before[2]) > 100, JSON.stringify(moved));
const after = await page.evaluate(() => { const g = window.__agro; g.replay.close(); g.tick(1 / 30); const p = g.aircraft.model.root.position; return { p: [p.x, p.y, p.z], active: g.replay.active, ui: !!document.querySelector('.replay-ui') }; });
check('replay closes and the aircraft is back where it was', !after.active && !after.ui && Math.hypot(after.p[0] - before[0], after.p[2] - before[2]) < 0.5, JSON.stringify(after));
check('replay kept in storage', await page.evaluate(() => (JSON.parse(localStorage.getItem('agrowings.replays.v1') || '[]')).length === 1));
const miss = await page.evaluate(() => [...(globalThis.__i18nMisses || [])]);
if (process.env.MISSES) fs.writeFileSync(process.env.MISSES, JSON.stringify(miss, null, 1));
check('no untranslated text', miss.length === 0, miss.slice(0, 5).join(' | '));
check('no page errors', errors.length === 0, errors.join(' | '));
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
