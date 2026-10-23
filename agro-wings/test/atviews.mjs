// Look-dev for the AT-502B exterior: fixed cameras in the aircraft's own
// frame (parked on the pad), flaps down, an in-flight chase and the cockpit
// view, plus the model's own triangle / mesh count.
//   node test/atviews.mjs <outDir> [names,...]
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'at-views';
const only = process.argv[3]?.split(',');
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
const stats = await page.evaluate(() => {
  const g = window.__agro;
  g.frozen = true; g.noRender = true;
  g.menuAction('free'); g.screens.close();
  g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
  const st = document.createElement('style');
  st.textContent = '.overlay, .hud, .loading { display: none !important; }';
  document.head.appendChild(st);
  if (g.aircraft.type.id !== 'at502') g.selectAircraft('at502');
  let tris = 0, meshes = 0, fineTris = 0;
  g.aircraft.model.root.traverse((o) => {
    if (!o.isMesh) return;
    const n = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    tris += n; meshes++;
    let p = o.parent, fine = false;
    while (p) { if (p.isLOD) fine = true; p = p.parent; }
    if (fine) fineTris += n;
  });
  return { tris: Math.round(tris), meshes, fineTris: Math.round(fineTris) };
});
console.log('model', JSON.stringify(stats));
// [name, camera, target, flaps] in the body frame; or a flight view.
const views = [
  ['side', [-14, 0.4, -0.4], [0, 0.35, -0.6], 0],
  ['sideTele', [-40, 0.5, -0.6], [0, 0.5, -0.6], 0, 16],
  ['sideL', [14, 0.4, -0.4], [0, 0.35, -0.6], 0],
  ['front34', [-7.5, 1.0, 9.5], [0, 0.4, -0.2], 0],
  ['front', [0, -0.15, 13], [0, 0.45, 0], 0],
  ['rear34', [7, 2.3, -10], [0, 0.5, -1.2], 0],
  ['top', [0.01, 18, -0.6], [0, 0, -0.6], 0],
  ['low', [-5.5, -1.05, 3.2], [0, 0.2, -0.8], 0],
  ['cabin', [-4.2, 1.35, -0.4], [0, 1.0, -0.7], 0],
  ['belly', [-3.2, -1.2, 2.4], [0, -0.6, 0.6], 0],
  ['tail', [-4.5, 1.2, -7.6], [0, 0.9, -5.0], 0],
  ['nose', [-1.9, 0.5, 6.4], [0, 0.15, 3.5], 0],
  ['flapsDown', [3.5, 0.4, -6.1], [2.9, -0.8, -0.9], 1],
  ['chase', 'chase'],
  ['cockpit', 'cockpit'],
].filter(([n]) => !only || only.includes(n));
for (const [name, c, tg, flaps, fov = 45] of views) {
  const info = await page.evaluate(({ c, tg, flaps, fov }) => {
    const g = window.__agro, cam = g.camera, ac = g.aircraft;
    if (typeof c === 'string') {
      ac.placeAirborne(300, -270, Math.PI / 2, 6, 52);
      ac.fm.hopper = 900; ac.fm.updateMass();
      g.cameraMode = c; g.rig.setMode(c, ac);
      for (let i = 0; i < 40; i++) g.tick(1 / 60);
      for (let i = 0; i < 60; i++) g.world.update(cam, ac.rPos, 1 / 60, g.time);
    } else {
      ac.placeAtPad();
      ac.fm.flaps = ac.fm.flapsCmd = flaps;
      for (let i = 0; i < 3; i++) g.tick(1 / 60);
      ac.fm.flaps = ac.fm.flapsCmd = flaps;
      ac._animate(0);
      ac.model.pilot.visible = true; ac.model.cockpit.visible = true;
      const r = ac.model.root;
      r.updateMatrixWorld(true);
      const V = r.position.constructor;
      cam.position.copy(r.localToWorld(new V(...c)));
      cam.up.set(0, 1, 0);
      cam.lookAt(r.localToWorld(new V(...tg)));
      cam.fov = fov; cam.near = 0.05; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      for (let i = 0; i < 20; i++) g.world.update(cam, ac.rPos, 1 / 60, g.time);
    }
    cam.updateMatrixWorld();
    g.render();
    const i = g.renderer.info.render;
    return { calls: i.calls, tris: i.triangles };
  }, { c, tg, flaps, fov });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 180000 });
  console.log('shot', name, JSON.stringify(info));
}
console.log('errors', JSON.stringify(errors));
await browser.close();
