// Look-dev for a cockpit from the pilot's seat: in flight (default look,
// straight ahead, panel close-up, left / right), parked on the pad (straight
// ahead) and a wide view, with the cockpit's draw calls / triangles.
//   node test/cockpitviews.mjs <outDir> [aircraftId] [names,...]
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'cockpit-views';
const acId = process.argv[3] || 'at502';
const only = process.argv[4]?.split(',');
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
await page.evaluate((id) => {
  const g = window.__agro;
  g.frozen = true; g.noRender = true;
  g.menuAction('free'); g.screens.close();
  g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
  const st = document.createElement('style');
  st.textContent = '.overlay, .hud, .loading { display: none !important; }';
  document.head.appendChild(st);
  if (g.aircraft.type.id !== id) g.selectAircraft(id);
}, acId);
// [name, where, look yaw, look pitch, zoom]
const views = [
  ['default', 'air', 0, null, 1],
  ['ahead', 'air', 0, -0.06, 1],
  ['wide', 'air', 0, -0.12, 1.12],
  ['panel', 'air', 0, -0.42, 0.62],
  ['left', 'air', 0.95, -0.25, 1],
  ['right', 'air', -0.95, -0.25, 1],
  ['ground', 'pad', 0, -0.02, 1],
  ['groundWide', 'pad', 0, -0.12, 1.12],
].filter(([n]) => !only || only.includes(n));
for (const [name, where, yaw, pitch, zoom] of views) {
  const info = await page.evaluate(({ where, yaw, pitch, zoom }) => {
    const g = window.__agro, cam = g.camera, ac = g.aircraft;
    if (where === 'air') { ac.placeAirborne(300, -270, Math.PI / 2, 6, 52); ac.fm.hopper = 900; ac.fm.updateMass(); }
    else ac.placeAtPad();
    g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac);
    g.rig.zoom.cockpit = zoom;
    for (let i = 0; i < 40; i++) g.tick(1 / 60);
    g.rig.look.yaw = yaw;
    if (pitch !== null) g.rig.look.pitch = pitch;
    cam.fov = 70 * zoom;
    g.rig.update(0, ac, { buttons: 0, dx: 0, dy: 0, wheel: 0 }, g.world.terrain);
    cam.fov = 70 * zoom; cam.updateProjectionMatrix();
    for (let i = 0; i < 30; i++) g.world.update(cam, ac.rPos, 1 / 60, g.time);
    ac.panel.draw(ac.instruments());
    g.render();
    const i = g.renderer.info.render;
    return { calls: i.calls, tris: i.triangles };
  }, { where, yaw, pitch, zoom });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${outDir}/${acId}_${name}.png`, timeout: 180000 });
  console.log('shot', name, JSON.stringify(info));
}
const stats = await page.evaluate(() => {
  let tris = 0, meshes = 0;
  window.__agro.aircraft.model.cockpit.traverse((o) => {
    if (!o.isMesh) return;
    tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; meshes++;
  });
  return { meshes, tris: Math.round(tris) };
});
console.log('cockpit', JSON.stringify(stats));
console.log('errors', errors);
await browser.close();
