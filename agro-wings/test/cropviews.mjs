// Crop look-dev: fixed views over soy, corn and cotton (and a hilly field) for
// before / after comparisons: chase and cockpit passes, ground-level rows,
// low and high aerial views.
//   node test/cropviews.mjs <outDir> [names,...]
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'crop-views';
const only = process.argv[3]?.split(',');
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.AGRO_URL || 'http://localhost:4173/';
const q = process.env.Q || 'medium';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url + '?q=' + q, { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });
const views = [
  ['soyChase', { plane: { x: 300, z: -270, hdg: Math.PI / 2, agl: 4, mode: 'chase' } }],
  ['soyCockpit', { plane: { x: 260, z: -300, hdg: Math.PI / 2, agl: 3.5, mode: 'cockpit' } }],
  ['cornCockpit', { plane: { x: -200, z: 470, hdg: Math.PI / 2, agl: 5, mode: 'cockpit' } }],
  ['cornChase', { plane: { x: -120, z: 420, hdg: Math.PI / 2, agl: 5, mode: 'chase' } }],
  ['cottonChase', { plane: { x: 1260, z: -20, hdg: Math.PI / 2, agl: 4, mode: 'chase' } }],
  ['soyGround', { cam: [420, 1.4, -300], target: [520, 0.4, -300] }],
  ['cornGround', { cam: [-60, 1.7, 480], target: [60, 1.2, 480] }],
  ['cottonGround', { cam: [1300, 1.5, 10], target: [1400, 0.5, 10] }],
  ['soyEdgeRoad', { cam: [455, 1.8, -126], target: [560, 0.6, -150] }],
  ['soyAerial', { cam: [200, 60, -60], target: [450, 0, -280] }],
  ['farmHigh', { cam: [-300, 320, 900], target: [500, 0, 0] }],
  ['hillSoy', { plane: { x: 2600, z: -2600, hdg: Math.PI / 2, agl: 5, mode: 'chase' } }],
].filter(([n]) => !only || only.includes(n));
// Extra look-dev views: VIEWS='[["name", {"cam": [...], "target": [...]}]]'.
if (process.env.VIEWS) views.splice(0, views.length, ...JSON.parse(process.env.VIEWS));
await page.evaluate(() => {
  const g = window.__agro;
  g.frozen = true; g.noRender = true;
  g.menuAction('free'); g.screens.close();
  g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'partly');
  const st = document.createElement('style');
  st.textContent = '.overlay, .hud, .loading { display: none !important; }';
  document.head.appendChild(st);
});
for (const [name, v] of views) {
  const info = await page.evaluate((v) => {
    const g = window.__agro, cam = g.camera, T = g.world.terrain;
    if (v.plane) {
      g.aircraft.placeAirborne(v.plane.x, v.plane.z, v.plane.hdg, v.plane.agl, 46);
      g.cameraMode = v.plane.mode; g.rig.setMode(v.plane.mode, g.aircraft);
      for (let i = 0; i < 40; i++) g.tick(1 / 60);
      for (let i = 0; i < 80; i++) g.world.update(cam, g.aircraft.rPos, 1 / 60, g.time);
    } else {
      g.aircraft.placeAtPad();
      for (let i = 0; i < 3; i++) g.tick(1 / 60);
      const V = cam.position.constructor;
      const [x, y, z] = v.cam, [tx, ty, tz] = v.target;
      cam.position.set(x, T.surfaceTop(x, z) + y, z);
      cam.up.set(0, 1, 0);
      cam.lookAt(new V(tx, T.surfaceTop(tx, tz) + ty, tz));
      cam.fov = 60; cam.near = 0.1; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      for (let i = 0; i < 80; i++) g.world.update(cam, new V(x, 0, z), 1 / 60, g.time);
    }
    cam.updateMatrixWorld();
    const t0 = performance.now();
    g.render();
    const i = g.renderer.info.render;
    return { calls: i.calls, tris: i.triangles, ms: Math.round(performance.now() - t0), plants: g.world.cropPlants?.count() };
  }, v);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 180000 });
  console.log('shot', name, JSON.stringify(info));
}
console.log('errors', JSON.stringify(errors));
await browser.close();
