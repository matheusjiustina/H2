// Robinson R44 exterior inspection: near-orthographic views in the
// helicopter's own frame (a long lens 400 m away), fog off, every LOD at
// full detail, rotor stopped — left, right, front, rear, top, underside —
// plus front and rear three-quarter views, the game's chase camera and the
// cockpit view. Each image is written with its scale (pixels per metre).
//   AGRO_URL=http://localhost:5173/ node test/r44ortho.mjs <outDir> [livery] [tag] [names,...]
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'r44-ortho';
const livery = +(process.argv[3] ?? 0);
const tag = process.argv[4] ?? 'now';
const only = process.argv[5]?.split(',');
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
await page.evaluate((livery) => {
  const g = window.__agro;
  g.frozen = true; g.noRender = true;
  g.menuAction('free'); g.screens.close();
  g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
  g.selectAircraft('r44');
  g.setAircraftOption?.('r44Livery', livery);
  const st = document.createElement('style');
  st.textContent = '.overlay, .hud, .loading, .toast { display: none !important; }';
  document.head.appendChild(st);
}, livery);
const D = 400;
// [name, direction (body frame), target, up, vertical extent m, perspective camera?]
const views = [
  ['left', [1, 0, 0], [0, 0.3, -1.8], [0, 1, 0], 5.2],
  ['right', [-1, 0, 0], [0, 0.3, -1.8], [0, 1, 0], 5.2],
  ['front', [0, 0, 1], [0, 0.4, 0], [0, 1, 0], 3.6],
  ['rear', [0, 0, -1], [0, 0.4, 0], [0, 1, 0], 3.6],
  ['top', [0, 1, 0], [0, 0, -1.8], [0, 0, 1], 6.5],
  ['bottom', [0, -1, 0], [0, 0, -1.8], [0, 0, 1], 6.5],
  ['cabin', [1, 0, 0], [0, 0, 1.0], [0, 1, 0], 2.8],
  ['front34', [0.62, 0.28, 0.73], [0, 0.2, -0.6], [0, 1, 0], 5.6],
  ['rear34', [0.62, 0.3, -0.73], [0, 0.2, -1.6], [0, 1, 0], 5.6],
  ['frontLow', [0.35, -0.3, 0.89], [0, 0.0, 0.2], [0, 1, 0], 4.2],
];
const meta = {};
for (const [name, dir, tgt, up, ext] of views.filter(([n]) => !only || only.includes(n))) {
  const info = await page.evaluate(({ dir, tgt, up, ext, D }) => {
    const g = window.__agro, ac = g.aircraft;
    const V3 = g.camera.position.constructor;
    ac.placeAirborne(300, -270, Math.PI / 2, 300, 0);
    for (let i = 0; i < 3; i++) g.tick(1 / 60);
    ac.model.pilot.visible = true; ac.model.cockpit.visible = true;
    const root = ac.model.root;
    ac.model.update?.(1 / 60, ac.fm, ac);
    root.updateMatrixWorld(true);
    root.traverse((o) => { if (o.isLOD) { o.autoUpdate = false; o.levels.forEach((l, i) => { l.object.visible = i === 0; }); } });
    const f = g.scene.fog;
    if (f?.isFogExp2) f.density = 0; else if (f) { f.near = 1e5; f.far = 2e5; }
    const t = root.localToWorld(new V3(...tgt));
    const q = root.getWorldQuaternion(g.camera.quaternion.clone());
    const d = new V3(...dir).normalize();
    const p = d.clone().applyQuaternion(q).multiplyScalar(D).add(t);
    g.cameraMode = 'free';
    g.camera.position.copy(p);
    g.camera.up.copy(new V3(...up).applyQuaternion(q));
    g.camera.lookAt(t);
    g.camera.near = D - 30; g.camera.far = D + 30;
    g.camera.fov = (2 * Math.atan(ext / 2 / D) * 180) / Math.PI;
    g.camera.updateProjectionMatrix();
    g.render();
    const r = g.renderer.info.render;
    return { tris: r.triangles, calls: r.calls };
  }, { dir, tgt, up, ext, D });
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${outDir}/${tag}_${name}.png` });
  meta[name] = { pxPerM: H / ext, centre: tgt, ...info };
  console.log('ortho', name, JSON.stringify(meta[name]));
}
if (!only || only.includes('chase') || only.includes('cockpit')) {
  for (const mode of ['chase', 'cockpit']) {
    await page.evaluate((mode) => {
      const g = window.__agro, ac = g.aircraft;
      ac.model.root.traverse((o) => { if (o.isLOD) o.autoUpdate = true; });
      g.camera.near = 0.3; g.camera.far = 6000;
      ac.placeAirborne(300, -270, Math.PI / 2, 30, 20);
      ac.fm.engine = 'running';
      for (let i = 0; i < 30; i++) g.tick(1 / 60);
      g.cameraMode = mode; g.rig.setMode(mode, ac);
      for (let i = 0; i < 40; i++) g.rig.update(1 / 30, ac, { dx: 0, dy: 0, buttons: 0, wheel: 0 }, g.world.terrain);
      for (let i = 0; i < 10; i++) g.world.update(g.camera, g.camera.position, 1 / 60, g.time);
      g.render();
    }, mode);
    await page.waitForTimeout(60);
    await page.screenshot({ path: `${outDir}/${tag}_${mode}.png` });
    console.log('view', mode);
  }
}
fs.writeFileSync(`${outDir}/${tag}_meta.json`, JSON.stringify(meta, null, 1));
console.log('errors', errors);
await browser.close();
