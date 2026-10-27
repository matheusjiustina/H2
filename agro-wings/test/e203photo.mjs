// EMB-203 against the reference photographs: the aircraft parked on the pad
// in its three-point attitude, seen from cameras placed where the photos
// were taken (estimated: body-frame position and aim point, vertical field
// of view, image aspect). Used for the before / after comparison sheets.
//   AGRO_URL=http://localhost:5173/ node test/e203photo.mjs <outDir> [tag] [livery]
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'e203-photo';
const tag = process.argv[3] ?? 'now';
const livery = +(process.argv[4] ?? 0);
fs.mkdirSync(outDir, { recursive: true });
// [name, viewport w, h, camera (body frame, m; y above the ground), aim, vertical fov]
const SHOTS = [
  ['dir', 800, 532, [6.2, 5.6, 5.2], [0.4, 0.75, -1.2], 42], // PS-DIR, high front-left three-quarter
  ['bya', 984, 586, [6.4, 2.45, 0.2], [0, 1.1, -1.7], 46], // PS-BYA, side from the left wing root
  ['wbm', 447, 447, [5.5, 1.7, -8.5], [0, 1.3, -1.6], 44], // PS-WBM, rear left three-quarter
  ['front34', 1250, 900, [6.5, 1.1, 15.1], [0.15, 1.3, -0.6], 18], // spraying 203, front right
];
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const only = process.argv[5]?.split(',');
for (const [name, w, h, cam, aim, fov] of SHOTS.filter(([n]) => !only || only.includes(n))) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=high', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
  await page.evaluate(({ cam, aim, fov, livery }) => {
    const g = window.__agro;
    g.frozen = true; g.noRender = true;
    g.menuAction('free'); g.screens.close();
    g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
    g.selectAircraft('e203');
    g.setAircraftOption('e203Livery', livery);
    const st = document.createElement('style');
    st.textContent = '.overlay, .hud, .loading { display: none !important; }';
    document.head.appendChild(st);
    const ac = g.aircraft;
    ac.placeAtPad();
    for (let i = 0; i < 120; i++) g.tick(1 / 60);
    ac.model.pilot.visible = false;
    const V3 = g.camera.position.constructor;
    // Body frame with y measured from the ground under the CG.
    const root = ac.model.root;
    root.updateMatrixWorld(true);
    const q = root.getWorldQuaternion(g.camera.quaternion.clone());
    const yaw = new V3(0, 0, 1).applyQuaternion(q); yaw.y = 0; yaw.normalize();
    const left = new V3(yaw.z, 0, -yaw.x);
    const base = root.getWorldPosition(new V3());
    base.y = ac.env.ground(base.x, base.z);
    const at = (p) => base.clone().addScaledVector(left, p[0]).add(new V3(0, p[1], 0)).addScaledVector(yaw, p[2]);
    g.cameraMode = 'free';
    g.camera.position.copy(at(cam));
    g.camera.up.set(0, 1, 0);
    g.camera.lookAt(at(aim));
    g.camera.fov = fov; g.camera.updateProjectionMatrix();
    for (let i = 0; i < 10; i++) g.world.update(g.camera, g.camera.position, 1 / 60, g.time);
    g.render();
  }, { cam, aim, fov, livery });
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${outDir}/${tag}_${name}.png` });
  console.log('photo', name);
  await page.close();
}
await browser.close();
