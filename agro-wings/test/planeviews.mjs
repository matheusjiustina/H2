// Aircraft look-dev: renders the aircraft from fixed body-frame camera
// positions (exterior close-ups, cockpit) into <outDir>.
// Usage: node test/planeviews.mjs <outDir> [name,name,...]
// Views: cam/target in the aircraft body frame (+Z nose, +Y up, +X left wing).
// LOOKDEV_VIEWS=<json file> replaces the view list; a view's optional `post`
// (JS source, `g` = game) runs after the settle ticks, before the render.
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

const H = Math.PI / 2;
const views = (process.env.LOOKDEV_VIEWS ? JSON.parse(fs.readFileSync(process.env.LOOKDEV_VIEWS, 'utf8')) : [
  // name, { place: 'pad' | {hdg, agl}, cam, target, fov, mode, look, rpm }
  ['side', { place: 'pad', cam: [10, 0.8, -0.6], target: [0, 0.35, -0.6], fov: 48 }],
  ['front34', { place: 'pad', cam: [5.2, 1.3, 6.4], target: [0, 0.2, 0.0], fov: 50 }],
  ['rear34', { place: 'pad', cam: [-5.6, 2.2, -7.0], target: [0, 0.3, -0.8], fov: 50 }],
  ['top', { place: 'pad', cam: [3, 15, -2.5], target: [0, 0, -0.4], fov: 48 }],
  ['nose', { place: 'pad', cam: [2.6, 0.7, 5.4], target: [0, 0.0, 2.5], fov: 38 }],
  ['gear', { place: 'pad', cam: [3.6, -0.55, 2.6], target: [1.25, -0.85, 0.6], fov: 38 }],
  ['tail', { place: 'pad', cam: [3.8, 1.5, -7.2], target: [0, 0.7, -3.8], fov: 40 }],
  ['cabinExt', { place: 'pad', cam: [2.1, 1.75, 1.9], target: [0, 0.85, -0.3], fov: 42 }],
  ['wingtip', { place: 'pad', cam: [7.8, 0.5, 2.3], target: [5.5, -0.1, -0.3], fov: 40 }],
  ['under', { place: { hdg: H, agl: 80 }, cam: [3.5, -2.2, 5.2], target: [0, -0.5, -0.4], fov: 45, rpm: 2400 }],
  ['sunBack', { place: { hdg: 1.25, agl: 80 }, cam: [7, 1.2, 8], target: [0, 0.2, 0], fov: 45, rpm: 2400 }],
  ['sunSide', { place: { hdg: -0.35, agl: 80 }, cam: [-9, 1.5, 4], target: [0, 0.2, -0.3], fov: 45, rpm: 2400 }],
  ['cockpit', { place: 'pad', mode: 'cockpit', look: [-0.32, 0] }],
  ['cockpitLeft', { place: 'pad', mode: 'cockpit', look: [-0.35, 1.0] }],
  ['cockpitPanel', { place: 'pad', mode: 'cockpit', look: [-0.62, 0], fov: 55 }],
]).filter(([n]) => !only || only.includes(n));

if (process.env.LOOKDEV_EVAL) await page.evaluate(process.env.LOOKDEV_EVAL);
for (const [name, v] of views) {
  await page.evaluate((v) => {
    const g = window.__agro;
    g.frozen = true;
    g.noRender = true;
    if (!g._lookdev) {
      g.menuAction('free'); g.screens.close(); g._lookdev = true;
      const hud = document.querySelector('.hud'); if (hud) hud.style.visibility = 'hidden';
    }
    if (v.place === 'pad') g.aircraft.placeAtPad();
    else g.aircraft.placeAirborne(300, -300, v.place.hdg, v.place.agl, 46);
    const fm = g.aircraft.fm;
    if (v.rpm) { fm.engine = 'running'; fm.rpm = v.rpm; }
    const mode = v.mode || 'orbit';
    g.cameraMode = mode; g.rig.setMode(mode, g.aircraft);
    for (let i = 0; i < 30; i++) {
      if (v.look) { g.rig.look.pitch = v.look[0]; g.rig.look.yaw = v.look[1]; }
      if (v.rpm) fm.rpm = v.rpm;
      g.tick(1 / 60);
    }
    const cam = g.camera;
    if (v.cam) {
      const ac = g.aircraft;
      const q = ac.rQuat, p = ac.rPos;
      const V = cam.position.constructor;
      const c = new V(...v.cam).applyQuaternion(q).add(p);
      const t = new V(...v.target).applyQuaternion(q).add(p);
      cam.position.copy(c);
      cam.up.set(0, 1, 0);
      cam.lookAt(t);
    }
    if (v.post) new Function('g', v.post)(g);
    if (v.fov) cam.fov = v.fov;
    cam.near = 0.05;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    g.render();
  }, v);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 120000 });
  console.log('shot', name);
}
await browser.close();
