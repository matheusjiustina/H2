// EMB-203 look-dev: the inspection views of the brief — side, top, front,
// rear, underside, three-quarters, in flight — for both paint schemes, plus
// the winglet close-ups and the provisional cockpit view. Cameras in the
// aircraft's own frame (x left, y up, z nose).
//   AGRO_URL=http://localhost:5173/ node test/e203views.mjs <outDir> [names,...]
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'e203-views';
const only = process.argv[3]?.split(',');
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=medium', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
await page.evaluate(() => {
  const g = window.__agro;
  g.frozen = true; g.noRender = true;
  g.menuAction('free'); g.screens.close();
  g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
  g.selectAircraft('e203');
  const st = document.createElement('style');
  st.textContent = '.overlay, .hud, .loading { display: none !important; }';
  document.head.appendChild(st);
});
// [name, where, camera, target, fov, { livery, spin }]
const base = [
  ['side', 'pad', [-48, 0.6, -1.4], [0, 0.2, -1.4], 12.5],
  ['sideL', 'air', [48, 0.4, -1.4], [0, 0.2, -1.4], 12.5],
  ['top', 'air', [0.01, 19, -1.2], [0, 0, -1.2], 45],
  ['front', 'air', [0, 0.4, 14], [0, 0.1, 0], 50],
  ['rear', 'air', [0, 1.2, -16], [0, 0.3, -2], 50],
  ['under', 'air', [0.01, -11, -0.6], [0, 0, -0.6], 60],
  ['front34', 'pad', [-7.5, 1.8, 8], [0, 0.2, -0.8], 45],
  ['top34', 'air', [-6, 7, 6], [0, 0, -1], 50],
  ['flight', 'air', [9, 1.5, 6], [0, 0.2, -1.2], 45, { spin: true }],
  ['winglet', 'air', [-9.5, 1.6, 2.4], [-6.5, 0.6, -0.6], 38],
  ['wingletTop', 'air', [-6.4, 3.4, 1.5], [-6.5, 0.6, -0.6], 40],
  ['parked', 'pad', [9, 4, 11], [0, 0, -1], 45],
];
const V = [];
for (const lv of [0, 1]) for (const v of base) V.push([`${lv + 1}_${v[0]}`, v[1], v[2], v[3], v[4], { ...(v[5] ?? {}), livery: lv }]);
V.push(['1_cockpit', 'cockpit', null, null, null, { livery: 0 }]);
for (const [name, where, cam, tgt, fov, o] of V.filter(([n]) => !only || only.some((x) => n.includes(x)))) {
  const info = await page.evaluate(({ where, cam, tgt, fov, o }) => {
    const g = window.__agro, ac = g.aircraft;
    g.setAircraftOption('e203Livery', o.livery ?? 0);
    const V3 = g.camera.position.constructor;
    if (where === 'air' || where === 'cockpit') ac.placeAirborne(300, -270, Math.PI / 2, 40, o.spin ? 45 : 0);
    else ac.placeAtPad();
    if (o.spin) { ac.fm.engine = 'running'; ac.fm.rpm = 2600; }
    for (let i = 0; i < 40; i++) g.tick(1 / 60);
    if (where === 'cockpit') {
      g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac);
      for (let i = 0; i < 20; i++) g.rig.update(1 / 30, ac, { dx: 0, dy: 0, buttons: 0, wheel: 0 }, g.world.terrain);
      ac.panel.draw(ac.instruments());
    } else {
      g.cameraMode = 'free';
      ac.model.root.updateMatrixWorld(true);
      g.camera.position.copy(ac.model.root.localToWorld(new V3(...cam)));
      g.camera.up.set(0, 1, 0); g.camera.lookAt(ac.model.root.localToWorld(new V3(...tgt)));
      g.camera.fov = fov; g.camera.updateProjectionMatrix();
      ac.model.pilot.visible = true; ac.model.cockpit.visible = true;
    }
    ac._animate?.(1 / 60);
    for (let i = 0; i < 20; i++) g.world.update(g.camera, g.camera.position, 1 / 60, g.time);
    g.render();
    const r = g.renderer.info.render;
    return { calls: r.calls, tris: r.triangles };
  }, { where, cam, tgt, fov, o });
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${outDir}/e203_${name}.png` });
  console.log('shot', name, JSON.stringify(info));
}
const contact = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft, fm = ac.fm;
  ac.placeAtPad();
  for (let i = 0; i < 120; i++) g.tick(1 / 60);
  const V3 = g.camera.position.constructor;
  const gh = (p) => { const w = new V3(...p).applyQuaternion(fm.quat).add(fm.pos); return +(w.y - ac.env.ground(w.x, w.z)).toFixed(3); };
  return { wheels: fm.out.wheelsOnGround, prop: gh([0, -0.94, 2.25]), boomTip: gh([5.55, -0.42 + 5.05 * 0.114 - 0.36, -1.12]), winglet: gh([6.65, 0.83, -1.2]), fin: gh([0, 1.135, -4.95]), roof: gh([0, 1.025, -1.45]) };
});
console.log('contact', JSON.stringify(contact));
console.log('errors', errors);
await browser.close();
