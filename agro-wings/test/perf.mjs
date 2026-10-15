// Performance probe: per-view CPU tick time, render submit time, draw calls and
// triangles for each quality preset. NOTE: in this container Chromium renders
// with SwiftShader (CPU rasteriser), so render times are NOT representative of
// a desktop GPU; tick (game logic) times and scene complexity are.
import { chromium } from 'playwright';

const url = process.env.AGRO_URL || 'http://localhost:4173/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const views = {
  base: `g.aircraft.placeAtPad(); g.cameraMode='chase'; g.rig.setMode('chase', g.aircraft);`,
  lowSoy: `g.aircraft.placeAirborne(300, -280, Math.PI/2, 4, 46 * (g.aircraft.A.assistSpeedScale ?? 1)); g.sprayer.on = true; g.aircraft.fm.hopper = 500; g.cameraMode='chase'; g.rig.setMode('chase', g.aircraft);`,
  cockpitCorn: `g.aircraft.placeAirborne(-200, 470, Math.PI/2, 6, 46 * (g.aircraft.A.assistSpeedScale ?? 1)); g.cameraMode='cockpit'; g.rig.setMode('cockpit', g.aircraft);`,
  high: `g.aircraft.placeAirborne(500, 0, Math.PI/2, 400, 50); g.cameraMode='chase'; g.rig.setMode('chase', g.aircraft);`,
};
for (const q of ['low', 'medium', 'high']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url + '?q=' + q, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });
  // AC=at502 measures with the Air Tractor flown (the other aircraft parked).
  if (process.env.AC) await page.evaluate((id) => window.__agro.selectAircraft(id), process.env.AC);
  for (const [name, setup] of Object.entries(views)) {
    const r = await page.evaluate((setup) => {
      const g = window.__agro;
      g.frozen = true;
      g.menuAction('free');
      // eslint-disable-next-line no-new-func
      new Function('g', setup)(g);
      for (let i = 0; i < 6; i++) { g.tick(1 / 60); g.render(); }
      let tick = 0, render = 0;
      const N = 8;
      for (let i = 0; i < N; i++) {
        const a = performance.now();
        g.tick(1 / 60);
        const b = performance.now();
        g.render();
        const c = performance.now();
        tick += b - a; render += c - b;
      }
      const info = g.renderer.info.render;
      return { tickMs: +(tick / N).toFixed(2), renderMs: +(render / N).toFixed(1), calls: info.calls, tris: info.triangles };
    }, setup);
    console.log(q.padEnd(7), name.padEnd(12), JSON.stringify(r));
  }
  await page.close();
}
await browser.close();
