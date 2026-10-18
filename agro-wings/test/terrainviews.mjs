// Look-dev renders of the terrain from the air and from the ground: places the
// aircraft (airborne) at each view and renders it. Used for the before/after
// comparison of the relief (point AGRO_URL at either build).
// Usage: AGRO_URL=... [Q=low|medium|high] node test/terrainviews.mjs <outDir> '<views json>'
//   view: [name, x, z, yaw (rad, 0 = south, pi = north, pi/2 = east), agl, camera, speed]
import { chromium } from 'playwright';
const out = process.argv[2];
const views = JSON.parse(process.argv[3] || '[]');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto((process.env.AGRO_URL || 'http://localhost:4173/') + '?q=' + (process.env.Q || 'medium'), { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
await page.evaluate(() => { localStorage.clear(); const g = window.__agro; g.frozen = true; g.menuAction('free'); g.screens.close?.(); g.hud.show?.(false); });
for (const [name, x, z, hdg, agl, mode, spd, orbit] of views) {
  await page.evaluate(([x, z, hdg, agl, mode, spd, orbit]) => {
    const g = window.__agro, ac = g.aircraft;
    ac.placeAirborne(x, z, hdg, agl, spd ?? 45);
    g.cameraMode = mode; g.rig.setMode(mode, ac);
    if (mode === 'orbit' && orbit) { g.rig.orbit.yaw = orbit[0]; g.rig.orbit.pitch = orbit[1]; g.rig.orbit.dist = orbit[2]; }
    g.rig.initialized = false;
    for (let i = 0; i < 90; i++) g.tick(1 / 60);
    g.render();
  }, [x, z, hdg, agl, mode, spd, orbit]);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
}
console.log('errors', errs.length, errs.slice(0, 3));
await browser.close();
