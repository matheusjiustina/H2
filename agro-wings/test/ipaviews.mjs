// Look-dev: fixed views of the PR-AGW Ipanema for before / after comparisons
// (exterior from the four quarters, side, top, cowling and cabin close-ups,
// flaps down, in-flight chase, the pilot's view and the instrument panel).
//   node test/ipaviews.mjs <outDir> [names,...]
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'ipa-views';
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
await page.evaluate(() => {
  const g = window.__agro;
  g.frozen = true; g.noRender = true;
  g.menuAction('free'); g.screens.close();
  g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
  if (g.aircraft.type.id !== 'ipanema') g.selectAircraft('ipanema');
  const st = document.createElement('style');
  st.textContent = '.overlay, .hud, .loading { display: none !important; }';
  document.head.appendChild(st);
});
// [name, state, camera, target, fov, flaps] in the aircraft's own frame
// (x left wing, y up, z nose); state 'cockpit' / 'chase' use the game rig.
const views = [
  ['front34', 'pad', [4.4, 1.1, 6.8], [0, 0.15, 0.2], 45],
  ['rear34', 'pad', [-5.2, 2.2, -7.6], [0, 0.25, -0.8], 45],
  ['side', 'pad', [10.8, 0.6, -0.45], [0, 0.25, -0.45], 40],
  ['top', 'pad', [0.0, 13.5, -0.6], [0, 0, -0.55], 45],
  ['lowFront', 'pad', [0.6, -0.2, 7.2], [0, 0.35, 0], 45],
  ['cowl', 'pad', [1.8, 0.4, 4.7], [0, 0.0, 2.55], 45],
  ['cabin', 'pad', [2.6, 1.35, 1.3], [0, 0.85, -0.25], 45],
  ['flapsDown', 'pad', [3.4, 0.4, -4.6], [2.0, -0.4, -0.6], 50, 1],
  ['chase', 'chase'],
  ['cockpit', 'cockpit'],
  ['panel', 'air', [0, 0.93, -0.32], [0, 0.45, 0.34], 52],
].filter(([n]) => !only || only.includes(n));
for (const [name, state, c, tg, fov, flaps] of views) {
  const info = await page.evaluate(({ state, c, tg, fov, flaps }) => {
    const g = window.__agro;
    const ac = g.aircraft;
    const cam = g.camera;
    if (state === 'pad') {
      ac.placeAtPad();
      ac.fm.flaps = ac.fm.flapsCmd = flaps ?? 0;
      for (let i = 0; i < 3; i++) g.tick(1 / 60);
      ac.fm.flaps = ac.fm.flapsCmd = flaps ?? 0;
    } else {
      ac.placeAirborne(-200, -280, Math.PI / 2, 40, 46);
      ac.fm.hopper = 600; ac.fm.fuel = 200;
      g.sprayer.on = state === 'chase';
      const mode = state === 'air' ? 'cockpit' : state;
      g.cameraMode = mode; g.rig.setMode(mode, ac);
      for (let i = 0; i < 90; i++) g.tick(1 / 60);
    }
    ac._animate(0);
    ac.panel.draw(ac.instruments());
    const r = ac.model.root;
    r.updateMatrixWorld(true);
    if (c) {
      const V = r.position.constructor;
      cam.position.copy(r.localToWorld(new V(...c)));
      if (state === 'pad' && c[1] > 10) cam.up.copy(new V(0, 0, 1).applyQuaternion(r.quaternion));
      else cam.up.set(0, 1, 0);
      cam.lookAt(r.localToWorld(new V(...tg)));
      cam.fov = fov; cam.near = 0.03; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      ac.model.pilot.visible = state !== 'air';
      ac.model.cockpit.visible = true;
    }
    for (let i = 0; i < 20; i++) g.world.update(cam, ac.rPos, 1 / 60, g.time);
    g.render();
    const inf = g.renderer.info.render;
    cam.up.set(0, 1, 0);
    return { calls: inf.calls, tris: inf.triangles };
  }, { state, c, tg, fov, flaps });
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 180000 });
  console.log('shot', name, JSON.stringify(info));
}
// Draw calls / triangles of the aircraft alone (scene minus the world).
const own = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft;
  let tris = 0, meshes = 0;
  ac.model.root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    meshes++;
    const gg = o.geometry;
    tris += (gg.index ? gg.index.count : gg.attributes.position.count) / 3;
  });
  return { meshes, tris: Math.round(tris) };
});
console.log('model', JSON.stringify(own));
console.log('errors', JSON.stringify(errors));
await browser.close();
