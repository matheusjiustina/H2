// Air Tractor AT-802A / Fire Boss geometry inspection: near-orthographic views in the aircraft's own
// frame (a long lens 400 m away: under 0.5 % perspective across the
// aircraft), against the sky with fog off and every LOD at full detail —
// top, left, right, front, rear, a cabin close-up from the left — plus the
// game's own chase camera (three-quarter top) and the pilot's view. Each
// image is written with its scale (pixels per metre) for the comparison
// sheets.
//   AGRO_URL=http://localhost:5173/ node test/at802ortho.mjs <outDir> [at802|at802f] [tag]
// (The Fire Boss is a locked premium expansion: the test grants it through
// the entitlement hook, as the platform's premium system would.)
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'at802-ortho';
const acId = process.argv[3] ?? 'at802';
const tag = process.argv[4] ?? 'now';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const W = 1280, H = 720;
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=high', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
await page.evaluate(async (acId) => {
  const ex = await import('/src/game/expansions.js');
  ex.setEntitlementSource((id) => id === 'expansion.at802f-fireboss');
  const g = window.__agro;
  g.frozen = true; g.noRender = true;
  g.menuAction('free'); g.screens.close();
  g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
  g.selectAircraft(acId);
  const st = document.createElement('style');
  st.textContent = '.overlay, .hud, .loading { display: none !important; }';
  document.head.appendChild(st);
}, acId);
const D = 400;
// [name, camera offset (body frame, unit direction), target, up, vertical extent m]
const views = [
  ['top', [0, 1, 0], [0, 0, -1.6], [0, 0, 1], 12.0],
  ['left', [1, 0, 0], [0, 0.2, -1.6], [0, 1, 0], 6.6],
  ['right', [-1, 0, 0], [0, 0.2, -1.6], [0, 1, 0], 6.6],
  ['front', [0, 0, 1], [0, 0.0, 0], [0, 1, 0], 6.0],
  ['rear', [0, 0, -1], [0, 0.0, 0], [0, 1, 0], 6.0],
  ['below', [0, -1, 0], [0, 0, -1.6], [0, 0, 1], 12.0],
  ['cabinL', [1, 0, 0], [0, 1.1, -1.4], [0, 1, 0], 3.0],
  ['tailL', [1, 0, 0], [0, 1.2, -5.8], [0, 1, 0], 3.4],
  ['noseL', [1, 0, 0], [0, 0.1, 2.6], [0, 1, 0], 2.8],
  ['q34', [0.62, 0.42, 0.66], [0, 0.0, -1.0], [0, 1, 0], 9.5],
  ['q34r', [-0.6, 0.35, -0.72], [0, 0.0, -1.0], [0, 1, 0], 9.5],
];
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
    const M = ac.model.M, hide = [M.wing, M.accent, M.deck];
    root.traverse((o) => { if (o.isMesh && hide.includes(o.material)) o.visible = !noWing; });
    // Fog off for this frame (the atmosphere sets it again on every tick).
    const f = g.scene.fog;
    if (f?.isFogExp2) f.density = 0; else if (f) { f.near = 1e5; f.far = 2e5; }
    const t = root.localToWorld(new V3(...tgt));
    const q = root.getWorldQuaternion(g.camera.quaternion.clone());
    const p = new V3(...dir).applyQuaternion(q).multiplyScalar(D).add(t);
    g.cameraMode = 'free';
    g.camera.position.copy(p);
    g.camera.up.copy(new V3(...up).applyQuaternion(q));
    g.camera.lookAt(t);
    g.camera.near = D - 30; g.camera.far = D + 30;
    g.camera.fov = (2 * Math.atan(ext / 2 / D) * 180) / Math.PI;
    g.camera.updateProjectionMatrix();
    g.render();
    return { tris: g.renderer.info.render.triangles };
  }, { dir, tgt, up, ext, D, noWing: !!noWing });
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${outDir}/${tag}_${name}.png` });
  meta[name] = { pxPerM: H / ext, centre: tgt, tris: info.tris };
  console.log('ortho', name, JSON.stringify(meta[name]));
}
// The game's chase camera (three-quarter from above and behind) and the
// pilot's view, as the player sees them.
for (const mode of ['chase', 'cockpit']) {
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
