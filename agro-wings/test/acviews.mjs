// Look-dev for one aircraft parked at the pad (and one in-flight chase view):
// side, front / rear three-quarter, top, low front, engine close-up, straight
// front and rear, cabin close-up, wheels on the ground, cockpit
// (pilot's eye) and panel close-up, flaps down. Cameras are given in the
// aircraft's own frame (x left wing, y up, z nose) so the same views work
// for every type.
//   node test/acviews.mjs <outDir> [aircraftId] [names,...]
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'ac-views';
const acId = process.argv[3] || 'm18';
const only = process.argv[4]?.split(',');
// SCALE=0.7 brings the outside cameras closer (smaller aircraft). VIEWS adds
// views as JSON in the same form ([name, camera, target, fov, flaps], ...).
const SC = +process.env.SCALE || 1;
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
  if (g.aircraft.type.id !== id) g.selectAircraft(id);
  const st = document.createElement('style');
  st.textContent = '.overlay, .hud, .loading { display: none !important; }';
  document.head.appendChild(st);
}, acId);
// [name, camera (body frame), target (body frame), fov, flaps]
const views = [
  ['side', [-26, 0.4, -1.6], [0, 0.4, -1.6], 30, 0],
  ['front34', [-9, 1.6, 10], [0, 0.2, 0], 50, 0],
  ['rear34', [8, 2.6, -12], [0, 0.3, -1], 50, 0],
  ['top', [0.01, 22, -1.5], [0, 0, -1.5], 55, 0],
  ['lowFront', [-2.5, -0.6, 8.5], [0, 0.5, 0], 55, 0],
  ['engine', [-1.8, 0.9, 4.3], [0, 0.4, 2.0], 45, 0],
  // Straight front and rear at about eye height (the cameras are in the
  // tail-down body frame).
  ['front', [0, -1.2, 7.4], [0, 0.3, 0], 84, 0],
  ['rear', [0, 6, -26], [0, 0.6, -1.5], 32, 0],
  ['cabin', [-2.8, 1.6, 1.0], [0, 0.7, -0.8], 45, 0],
  ['ground', [-13, -0.7, -1.5], [0, -0.7, -1.5], 36, 0],
  ['left34', [7.2, 0.7, 6.8], [0, 0.15, -0.8], 34, 0],
  ['flapsDown', [-6, 1.6, -7], [-3, -0.6, -1], 45, 1],
  ['cockpit', 'eye', [0, 1.1, 6], 70, 0],
  ['panel', 'eye', [0, -0.3, 1.0], 50, 0],
].concat(JSON.parse(process.env.VIEWS || '[]')).filter(([n]) => !only || only.includes(n));
for (let [name, c, tg, fov, flaps] of views) {
  if (c !== 'eye') c = c.map((v, i) => tg[i] + (v - tg[i]) * SC);
  const info = await page.evaluate(({ c, tg, fov, flaps, name }) => {
    const g = window.__agro;
    const ac = g.aircraft;
    ac.placeAtPad();
    ac.fm.flaps = ac.fm.flapsCmd = flaps;
    for (let i = 0; i < 3; i++) g.tick(1 / 60);
    ac.fm.flaps = ac.fm.flapsCmd = flaps;
    const inside = c === 'eye';
    g.cameraMode = inside ? 'cockpit' : 'chase';
    ac.model.pilot.visible = !inside;
    ac.model.cockpit.visible = true;
    ac._animate(0);
    const r = ac.model.root;
    r.updateMatrixWorld(true);
    const V = r.position.constructor;
    const cam = g.camera;
    cam.position.copy(inside ? r.localToWorld(ac.model.eye.clone()) : r.localToWorld(new V(...c)));
    cam.up.set(0, 1, 0);
    cam.lookAt(inside ? r.localToWorld(ac.model.eye.clone().add(new V(...tg))) : r.localToWorld(new V(...tg)));
    cam.fov = fov; cam.near = inside ? 0.05 : 0.1; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    for (let i = 0; i < 20; i++) g.world.update(cam, ac.rPos, 1 / 60, g.time);
    if (inside) ac.panel.draw(ac.instruments());
    g.render();
    const i = g.renderer.info.render;
    return { calls: i.calls, tris: i.triangles };
  }, { c, tg, fov, flaps, name });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${outDir}/${acId}_${name}.png`, timeout: 180000 });
  console.log('shot', name, JSON.stringify(info));
}
// In flight: chase camera over a field.
if (!only || only.includes('chase')) {
  const info = await page.evaluate(() => {
    const g = window.__agro, cam = g.camera;
    g.aircraft.placeAirborne(300, -270, Math.PI / 2, 6, 50);
    g.cameraMode = 'chase'; g.rig.setMode('chase', g.aircraft);
    g.aircraft.model.pilot.visible = true;
    for (let i = 0; i < 40; i++) g.tick(1 / 60);
    for (let i = 0; i < 60; i++) g.world.update(cam, g.aircraft.rPos, 1 / 60, g.time);
    g.render();
    const i = g.renderer.info.render;
    return { calls: i.calls, tris: i.triangles };
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${outDir}/${acId}_chase.png`, timeout: 180000 });
  console.log('shot chase', JSON.stringify(info));
}
console.log('errors', JSON.stringify(errors));
await browser.close();
