// GPS page check: accepts the soy contract, flies two spraying legs with the
// test autopilot, then captures the HUD (GPS mode) and the cockpit unit.
// Usage: AGRO_URL=... [AC=at502] node test/gpsview.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'gps-out';
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.AGRO_URL || 'http://localhost:4173/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url + '?q=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });
await page.evaluate((ac) => {
  const g = window.__agro;
  localStorage.clear();
  if (ac) g.selectAircraft(ac);
  g.career.resetAll(); g.career.tutorialDone = true;
  g.menuAction('career'); g.screens.close();
  g.selectContract('soy'); g.screens.close();
  g.frozen = true;
  const A = g.aircraft;
  A.fm.fuel = A.A.fuelCapacity * 0.6; A.fm.hopper = A.A.hopperCapacity * 0.9; A.fm.updateMass();
  A.placeAirborne(150, -300, Math.PI / 2, 4, 46 * (A.A.assistSpeedScale ?? 1));
  g.setSetting('hudGps', true);
}, process.env.AC);
// Two spraying passes (hands off, flight assist holds attitude), with a
// non-spraying leg in between.
await page.evaluate(() => {
  const g = window.__agro;
  const A = g.aircraft, sp = 46 * (A.A.assistSpeedScale ?? 1);
  const W = A.type.spray.swath;
  A.placeAirborne(150, -300 + W * 0.5, Math.PI / 2, 4, sp);
  g.sprayer.on = true;
  g.simulate(11, 1 / 30);
  g.sprayer.on = false;
  g.simulate(2, 1 / 30);
  A.placeAirborne(700, -300 + W * 1.5, -Math.PI / 2, 4, sp);
  g.sprayer.on = true;
  g.simulate(9, 1 / 30);
});
const st = await page.evaluate(() => {
  const g = window.__agro;
  return { phase: g.autopilot?.phase, track: g.guidance.trackN, cov: g.jobStats?.coverage, pos: [g.aircraft.fm.pos.x, g.aircraft.fm.pos.z] };
});
console.log(JSON.stringify(st));
await page.evaluate(() => { const g = window.__agro; g.cameraMode = 'chase'; g.rig.setMode('chase', g.aircraft); g.tick(1 / 60); g.hud.miniT = 0; g.tick(1 / 60); g.render(); });
await page.screenshot({ path: `${outDir}/hud_gps.png` });
await page.evaluate(() => { const g = window.__agro; g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', g.aircraft); for (let i = 0; i < 4; i++) g.tick(1 / 60); g.render(); });
await page.screenshot({ path: `${outDir}/cockpit_gps.png` });
// Raw unit pages: OPS (on the job), then NAV (ferry to a farm request).
const dump = async (name, w = 294, h = 226) => {
  const url = await page.evaluate(([w, h]) => {
    const g = window.__agro, c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
    const x = c.getContext('2d'); x.scale(2, 2); g.guidance.draw(x, 0, 0, w, h); return c.toDataURL();
  }, [w, h]);
  fs.writeFileSync(`${outDir}/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
};
await dump('unit_ops');
await page.evaluate(() => { const g = window.__agro; g.selectContract('sr-soy'); g.screens.close(); g.aircraft.placeAirborne(-1200, -600, -Math.PI / 2, 120, 50); g.simulate(1, 1 / 30); });
await dump('unit_nav');
await page.evaluate(() => { const g = window.__agro; g.setJob(null); g.simulate(0.2, 1 / 30); });
await dump('unit_nojob');
console.log('errors', JSON.stringify(errors));
await browser.close();
