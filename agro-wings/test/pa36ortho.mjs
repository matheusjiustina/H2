// Piper PA-36 Pawnee Brave geometry inspection: near-orthographic views in
// the model's REFERENCE frame (on three wheels, the plan's frame: the
// stance group's axes) — a long lens 400 m away, under 0.5 % perspective
// across the aircraft — against the sky with fog off and every LOD at full
// detail: top, left, right, front, rear, under, a cabin close-up, plus the
// game's chase and pilot views and a parked three-quarter view as on the
// photographs. Each image is written with its scale (pixels per metre) and
// where the reference point (spinner tip / ground) falls, for the overlay
// with the plan.
//   AGRO_URL=http://localhost:5173/ node test/pa36ortho.mjs <outDir> [livery] [tag]
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'pa36-ortho';
const livery = +(process.argv[3] ?? 0);
const tag = process.argv[4] ?? 'now';
const only = process.env.VIEWS ? process.env.VIEWS.split(',') : null;
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const W = 1280, H = 720;
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (res) => { if (res.status() >= 400) errors.push(`HTTP ${res.status()} ${res.url()}`); });
await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=high', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
await page.evaluate((livery) => {
  const g = window.__agro;
  g.frozen = true; g.noRender = true;
  g.menuAction('free'); g.screens.close();
  g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
  g.selectAircraft('pa36');
  g.setAircraftOption('pa36Livery', livery);
  const st = document.createElement('style');
  st.textContent = '.overlay, .hud, .loading { display: none !important; }';
  document.head.appendChild(st);
}, livery);
const D = 400;
// [name, camera direction (reference frame), target, up, vertical extent m, hide wing]
const views = [
  ['left', [1, 0, 0], [0, -0.3, -1.6], [0, 1, 0], 5.0],
  ['right', [-1, 0, 0], [0, -0.3, -1.6], [0, 1, 0], 5.0],
  ['top', [0, 1, 0], [0, 0, -1.6], [0, 0, 1], 9.6],
  ['front', [0, 0, 1], [0, -0.2, 0], [0, 1, 0], 4.4],
  ['rear', [0, 0, -1], [0, -0.2, 0], [0, 1, 0], 4.4],
  ['under', [0, -1, 0], [0, 0, -1.6], [0, 0, 1], 9.6],
  ['cabinL', [1, 0, 0], [0, 0.3, -1.3], [0, 1, 0], 2.6],
  ['tailL', [1, 0, 0], [0, -0.2, -4.6], [0, 1, 0], 2.6],
  ['noseL', [1, 0, 0], [0, -0.1, 1.2], [0, 1, 0], 2.6],
  ['leftNW', [1, 0, 0], [0, -0.3, -1.6], [0, 1, 0], 5.0, true],
  ['topNW', [0, 1, 0], [0, 0, -1.6], [0, 0, 1], 4.6, true],
  ['frontNW', [0, 0, 1], [0, 0.0, 0], [0, 1, 0], 2.6, true],
  ['rearNW', [0, 0, -1], [0, 0.0, 0], [0, 1, 0], 2.6, true],
  ['q34', [0.62, 0.32, 0.72], [0, -0.3, -1.4], [0, 1, 0], 6.4],
  ['q34r', [-0.7, 0.36, -0.62], [0, -0.3, -1.6], [0, 1, 0], 6.4],
].filter((v) => !only || only.includes(v[0]));
const meta = {};
for (const [name, dir, tgt, up, ext, noWing] of views) {
  const info = await page.evaluate(({ dir, tgt, up, ext, D, noWing }) => {
    const g = window.__agro, ac = g.aircraft;
    const V3 = g.camera.position.constructor;
    ac.placeAirborne(300, -270, Math.PI / 2, 300, 0);
    for (let i = 0; i < 3; i++) g.tick(1 / 60);
    ac._animate?.(1 / 60);
    ac.model.pilot.visible = false; ac.model.cockpit.visible = true;
    const root = ac.model.root;
    root.updateMatrixWorld(true);
    root.traverse((o) => { if (o.isLOD) { o.autoUpdate = false; o.levels.forEach((l, i) => { l.object.visible = i === 0; }); } });
    const M = ac.model.M;
    root.traverse((o) => { if (o.isMesh && o.material === M.wing) o.visible = !noWing; });
    const f = g.scene.fog;
    if (f?.isFogExp2) f.density = 0; else if (f) { f.near = 1e5; f.far = 2e5; }
    // The stance group: the reference frame.
    const st = root.children.find((o) => o.isGroup && Math.abs(o.rotation.x - 0.15708) < 1e-3);
    const t = st.localToWorld(new V3(...tgt));
    const q = st.getWorldQuaternion(g.camera.quaternion.clone());
    const p = new V3(...dir).normalize().applyQuaternion(q).multiplyScalar(D).add(t);
    g.cameraMode = 'free';
    g.camera.position.copy(p);
    g.camera.up.copy(new V3(...up).applyQuaternion(q));
    g.camera.lookAt(t);
    g.camera.near = D - 30; g.camera.far = D + 30;
    g.camera.fov = (2 * Math.atan(ext / 2 / D) * 180) / Math.PI;
    g.camera.updateProjectionMatrix();
    g.render();
    // Screen position of the spinner tip and of the ground under the main wheel (reference frame).
    const proj = (v) => { const w = st.localToWorld(new V3(...v)).project(g.camera); return [(w.x + 1) / 2 * innerWidth, (1 - w.y) / 2 * innerHeight]; };
    return { tris: g.renderer.info.render.triangles, calls: g.renderer.info.render.calls, spinner: proj([0, 0.3, 2.45]), ground: proj([0, -1.42, 0.45]) };
  }, { dir, tgt, up, ext, D, noWing: !!noWing });
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${outDir}/${tag}_${name}.png` });
  meta[name] = { pxPerM: H / ext, centre: tgt, ...info };
  console.log('ortho', name, JSON.stringify(meta[name]));
}
if (!only || only.includes('chase')) for (const mode of ['chase', 'cockpit']) {
  await page.evaluate((mode) => {
    const g = window.__agro, ac = g.aircraft;
    ac.model.root.traverse((o) => { if (o.isLOD) o.autoUpdate = true; });
    g.camera.near = 0.3; g.camera.far = 6000;
    ac.placeAirborne(300, -270, Math.PI / 2, 60, 45);
    for (let i = 0; i < 30; i++) g.tick(1 / 60);
    g.cameraMode = mode; g.rig.setMode(mode, ac);
    for (let i = 0; i < 40; i++) g.rig.update(1 / 30, ac, { dx: 0, dy: 0, buttons: 0, wheel: 0 }, g.world.terrain);
    if (mode === 'cockpit') ac.panel.draw(ac.instruments());
    for (let i = 0; i < 10; i++) g.world.update(g.camera, g.camera.position, 1 / 60, g.time);
    g.render();
  }, mode);
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${outDir}/${tag}_${mode}.png` });
  console.log('view', mode);
}
fs.writeFileSync(`${outDir}/${tag}_meta.json`, JSON.stringify(meta, null, 1));
console.log('errors', errors);
await browser.close();
