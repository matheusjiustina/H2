// Aircraft look-dev: renders the aircraft from fixed angles (exterior orbit
// and cockpit) into <outDir>. Usage: node test/planeviews.mjs <outDir> [names]
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'views-out';
const only = process.argv[3] ? process.argv[3].split(',') : null;
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(url + '?q=high', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });
// [name, setup] — orbit yaw is relative to the aircraft heading.
const views = [
  ['front34', { mode: 'orbit', yaw: 0.75, pitch: 0.1, dist: 10 }],
  ['side', { mode: 'orbit', yaw: Math.PI / 2, pitch: 0.04, dist: 11 }],
  ['rear34', { mode: 'orbit', yaw: 2.5, pitch: 0.18, dist: 10.5 }],
  ['top', { mode: 'orbit', yaw: 2.2, pitch: 0.95, dist: 13 }],
  ['front', { mode: 'orbit', yaw: 0.0, pitch: 0.06, dist: 10 }],
  ['cockpit', { mode: 'cockpit', look: [-0.32, 0] }],
  ['cockpitLeft', { mode: 'cockpit', look: [-0.35, 1.0] }],
  ['cockpitPanel', { mode: 'cockpit', look: [-0.62, 0], fov: 55 }],
  ['flyChase', { mode: 'chase', air: true }],
  ['flySide', { mode: 'orbit', air: true, yaw: 2.0, pitch: 0.1, dist: 22 }],
  ['cockpitJob', { mode: 'cockpit', air: true, job: 'soy', look: [-0.25, 0] }],
  ['flyJob', { mode: 'orbit', air: true, job: 'soy', yaw: 2.4, pitch: 0.08, dist: 12 }],
].filter(([n]) => !only || only.includes(n));
for (const [name, v] of views) {
  await page.evaluate((v) => {
    const g = window.__agro;
    g.frozen = true;
    if (!g._lookdev) { g.menuAction('free'); g.screens.close(); g._lookdev = true; }
    if (v.job && !g.job) { g.menuAction('career'); g.screens.close(); g.selectContract(v.job); g.screens.close(); g.frozen = true; }
    if (v.air) { g.aircraft.placeAirborne(300, -300, Math.PI / 2, 4, 46); g.sprayer.on = true; g.aircraft.fm.hopper = 600; }
    else { g.aircraft.placeAtPad(); g.sprayer.on = false; }
    g.cameraMode = v.mode; g.rig.setMode(v.mode, g.aircraft);
    for (let i = 0; i < 40; i++) {
      if (v.mode === 'orbit') {
        const f = g.aircraft.forward();
        g.rig.orbit.yaw = Math.atan2(f.x, f.z) + v.yaw; g.rig.orbit.pitch = v.pitch; g.rig.orbit.dist = v.dist;
      }
      if (v.mode === 'cockpit' && v.look) { g.rig.look.pitch = v.look[0]; g.rig.look.yaw = v.look[1]; }
      g.tick(1 / 60);
      if (v.fov) g.camera.fov = v.fov, g.camera.updateProjectionMatrix();
    }
    g.render();
  }, v);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('shot', name);
}
await browser.close();
