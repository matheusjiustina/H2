// Dromader cockpit look-dev: the pilot's view parked (tail down) and in
// level flight, plus the GPS close-up; prints what the eye can see.
//   AGRO_URL=http://localhost:5173/ node test/m18cockpit.mjs <outDir> [tag]
import { chromium } from 'playwright';
import fs from 'node:fs';
const outDir = process.argv[2] || 'm18-cockpit', tag = process.argv[3] || 'x';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
for (const [w, hgt] of [[1280, 720], [1024, 768]]) {
  const page = await browser.newPage({ viewport: { width: w, height: hgt } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=medium', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
  await page.evaluate(() => {
    const g = window.__agro; g.frozen = true; g.noRender = true; g.menuAction('free'); g.screens.close();
    g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear'); g.selectAircraft('m18');
    const st = document.createElement('style'); st.textContent = '.overlay, .hud, .loading { display: none !important; }'; document.head.appendChild(st);
  });
  for (const where of ['parked', 'level', 'gps']) {
    const info = await page.evaluate((where) => {
      const g = window.__agro, ac = g.aircraft;
      if (where === 'parked') ac.placeAtPad(); else ac.placeAirborne(300, -270, Math.PI / 2, 60, 55);
      ac.fm.engine = 'running'; ac.fm.rpm = 1700;
      for (let i = 0; i < 30; i++) g.tick(1 / 60);
      g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac);
      if (where === 'gps') { g.rig.look.yaw = -0.62; g.rig.look.pitch = -0.5; g.rig.zoom.cockpit = 0.55; }
      for (let i = 0; i < 30; i++) g.rig.update(1 / 30, ac, { dx: 0, dy: 0, buttons: 0, wheel: 0 }, g.world.terrain);
      ac.model.pilot.visible = false;
      ac.panel.draw(ac.instruments()); ac._animate?.(1 / 60);
      for (let i = 0; i < 10; i++) g.world.update(g.camera, g.camera.position, 1 / 60, g.time);
      g.render();
      const q = ac.fm.quat, e = { x: 0, y: 0, z: 0 };
      return { fov: g.camera.fov.toFixed(1), pitch: (Math.asin(2 * (q.w * q.x - q.y * q.z)) * 57.3).toFixed(1), calls: g.renderer.info.render.calls };
    }, where);
    await page.waitForTimeout(60);
    await page.screenshot({ path: `${outDir}/${tag}_${where}_${w}.png` });
    console.log(w, where, JSON.stringify(info));
  }
  await page.close();
}
console.log('errors', errors);
await browser.close();
