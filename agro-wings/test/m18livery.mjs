// Dromader paint schemes: side, three-quarter from above and below, top, for
// each scheme. AGRO_URL=http://localhost:5173/ node test/m18livery.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] || 'm18-livery';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=medium');
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
await page.evaluate(() => { const g = window.__agro; g.frozen = true; g.noRender = true; g.menuAction('free'); g.screens.close(); g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear'); g.selectAircraft('m18');
  const st = document.createElement('style'); st.textContent = '.overlay, .hud, .loading { display: none !important; }'; document.head.appendChild(st); });
const V = [['side', 'pad', [-16, 1.5, -1.2], [0, 0.6, -1.2], 45], ['front34', 'air', [-11, 4, 9], [0, 0.3, -0.8], 45], ['rear34', 'air', [9, 2.5, -12], [0, 0.6, -1], 45], ['top', 'air', [0.01, 22, -1.5], [0, 0, -1.5], 50]];
for (const lv of [0, 1]) for (const [n, where, cam, tgt, fov] of V) {
  await page.evaluate(({ lv, where, cam, tgt, fov }) => {
    const g = window.__agro, ac = g.aircraft; g.setAircraftOption('m18Livery', lv);
    if (where === 'air') ac.placeAirborne(300, -270, Math.PI / 2, 60, 55); else ac.placeAtPad();
    for (let i = 0; i < 20; i++) g.tick(1 / 60);
    g.cameraMode = 'free'; const V3 = g.camera.position.constructor; ac.model.root.updateMatrixWorld(true);
    g.camera.position.copy(ac.model.root.localToWorld(new V3(...cam))); g.camera.up.set(0, 1, 0); g.camera.lookAt(ac.model.root.localToWorld(new V3(...tgt))); g.camera.fov = fov; g.camera.updateProjectionMatrix();
    ac.model.pilot.visible = true;
    for (let i = 0; i < 10; i++) g.world.update(g.camera, g.camera.position, 1 / 60, g.time); g.render();
  }, { lv, where, cam, tgt, fov });
  await page.screenshot({ path: `${out}/m18_${'AB'[lv]}_${n}.png` });
}
console.log('errors', errors);
await browser.close();
