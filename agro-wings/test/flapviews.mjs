// Look-dev: flaps fully down on the Ipanema and the AT-502B, close views of
// the trailing edge, spray boom and hangers (rear, side, from below).
//   node test/flapviews.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'flap-views';
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.AGRO_URL || 'http://localhost:4173/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url + '?q=medium', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });
await page.evaluate(() => {
  const g = window.__agro;
  g.frozen = true; g.noRender = true;
  g.menuAction('free'); g.screens.close();
  g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
  const st = document.createElement('style');
  st.textContent = '.overlay, .hud, .loading { display: none !important; }';
  document.head.appendChild(st);
});
// Camera and target in the aircraft's own frame (x right wing, y up, z nose),
// scaled by the wing size (1 Ipanema, 1.33 AT-502B).
const views = [
  ['rear', [2.6, 0.3, -4.6], [2.2, -0.6, -0.7]],
  ['side', [3.6, -0.85, -2.4], [2.2, -0.75, -0.8]],
  ['below', [2.2, -1.75, -2.0], [2.2, -0.6, -0.6]],
  ['rearWide', [0, 1.2, -9], [0, -0.3, 0]],
  ['aboveRear', [2.4, 1.5, -3.6], [2.2, -0.6, -0.7]],
];
for (const [id, k] of [['ipanema', 1], ['at502', 1.33]]) {
  for (const flaps of [0, 1]) {
    for (const [name, c, tg] of views) {
      await page.evaluate(({ id, k, flaps, c, tg }) => {
        const g = window.__agro;
        if (g.aircraft.type.id !== id) g.selectAircraft(id);
        const ac = g.aircraft;
        ac.placeAtPad();
        ac.fm.flaps = ac.fm.flapsCmd = flaps;
        for (let i = 0; i < 3; i++) g.tick(1 / 60);
        ac.fm.flaps = ac.fm.flapsCmd = flaps;
        ac._animate(0);
        const r = ac.model.root;
        r.updateMatrixWorld(true);
        const V = r.position.constructor;
        const cam = g.camera;
        cam.position.copy(r.localToWorld(new V(c[0] * k, c[1] * k, c[2] * k)));
        cam.up.set(0, 1, 0);
        cam.lookAt(r.localToWorld(new V(tg[0] * k, tg[1] * k, tg[2] * k)));
        cam.fov = 50; cam.near = 0.05; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
        for (let i = 0; i < 20; i++) g.world.update(cam, ac.rPos, 1 / 60, g.time);
        g.render();
      }, { id, k, flaps, c, tg });
      await page.waitForTimeout(100);
      await page.screenshot({ path: `${outDir}/${id}_${flaps ? 'flapsDown' : 'flapsUp'}_${name}.png`, timeout: 180000 });
      console.log('shot', id, flaps, name);
    }
  }
}
console.log('errors', JSON.stringify(errors));
await browser.close();
