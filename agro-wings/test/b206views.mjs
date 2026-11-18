// Bell 206B-3 look-dev: the twelve inspection views of the brief — left and
// right side, front, rear, top, underside, front three-quarter, side in
// flight, with and without the spray kit, the cockpit view and parked on
// its helipad — plus the three paint schemes. Cameras in the aircraft's own
// frame (x left, y up, z nose).
//   AGRO_URL=http://localhost:5173/ node test/b206views.mjs <outDir> [names,...]
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'b206-views';
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
  g.selectAircraft('b206');
  const st = document.createElement('style');
  st.textContent = '.overlay, .hud, .loading { display: none !important; }';
  document.head.appendChild(st);
});
// [name, where, camera, target, fov, { kit, livery, rotor }]
const V = [
  ['01_left', 'pad', [12, 0.6, -1.9], [0, 0.3, -1.9], 50],
  ['02_right', 'pad', [-12, 0.6, -1.9], [0, 0.3, -1.9], 50],
  ['03_front', 'pad', [0, 0.5, 10], [0, 0.1, 0], 45],
  ['04_rear', 'pad', [0, 1.6, -14], [0, 0.4, -2], 45],
  ['05_top', 'pad', [0.01, 16, -1.8], [0, 0, -1.8], 50],
  ['06_under', 'air', [0.01, -7, 0.2], [0, 0, -0.6], 70],
  ['07_front34', 'pad', [-6.5, 1.4, 7], [0, 0, -0.3], 45],
  ['08_flight_side', 'air', [11, 0.5, -1.6], [0, 0.2, -1.6], 50, { spin: true }],
  ['09_kit', 'pad', [6.2, 0.4, 5.8], [0, -0.6, 0.4], 45],
  ['10_nokit', 'pad', [6.2, 0.4, 5.8], [0, -0.6, 0.4], 45, { kit: false }],
  ['11_cockpit', 'cockpit'],
  ['12_parked', 'pad', [9, 4, 11], [0, 0, -1], 45, { far: true }],
  ['13_livery_green', 'pad', [6.5, 1.0, 6.5], [0, 0, -0.5], 45, { livery: 1 }],
  ['14_livery_red', 'pad', [-6.5, 0.8, -5.5], [0, 0.2, -1.5], 45, { livery: 2 }],
].filter(([n]) => !only || only.some((o) => n.includes(o)));
for (const [name, where, cam, tgt, fov, o = {}] of V) {
  const info = await page.evaluate(({ name, where, cam, tgt, fov, o }) => {
    const g = window.__agro, ac = g.aircraft;
    g.setAircraftOption('b206Kit', o.kit !== false);
    g.setAircraftOption('b206Livery', o.livery ?? 0);
    const V3 = g.camera.position.constructor;
    if (where === 'air' || where === 'cockpit') { ac.placeAirborne(300, -270, Math.PI / 2, where === 'cockpit' ? 30 : 22, where === 'cockpit' ? 40 : o.spin ? 30 : 0); }
    else ac.placeAtPad();
    for (let i = 0; i < 40; i++) g.tick(1 / 60);
    if (where === 'cockpit') {
      g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac);
      for (let i = 0; i < 20; i++) g.rig.update(1 / 30, ac, { dx: 0, dy: 0, buttons: 0, wheel: 0 }, g.world.terrain);
      ac.panel.draw(ac.instruments());
    } else {
      g.cameraMode = 'free';
      ac.model.root.updateMatrixWorld(true);
      const c = ac.model.root.localToWorld(new V3(...cam));
      const t = ac.model.root.localToWorld(new V3(...tgt));
      g.camera.position.copy(c); g.camera.up.set(0, 1, 0); g.camera.lookAt(t); g.camera.fov = fov; g.camera.updateProjectionMatrix();
      ac.model.pilot.visible = true;
    }
    ac._animate?.(1 / 60);
    for (let i = 0; i < 25; i++) g.world.update(g.camera, g.camera.position, 1 / 60, g.time);
    g.render();
    const r = g.renderer.info.render;
    return { calls: r.calls, tris: r.triangles };
  }, { name, where, cam, tgt, fov, o });
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${outDir}/b206_${name}.png` });
  console.log('shot', name, JSON.stringify(info));
}
// Contact: all four skid points on the ground on the pad, the boom tips and
// the tank clear of it, the skids clear of the tank.
const contact = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft, fm = ac.fm;
  g.setAircraftOption('b206Kit', true);
  ac.placeAtPad();
  for (let i = 0; i < 120; i++) g.tick(1 / 60);
  const V3 = g.camera.position.constructor;
  const gh = (p) => { const w = new V3(...p).applyQuaternion(fm.quat).add(fm.pos); return +(w.y - ac.env.ground(w.x, w.z)).toFixed(3); };
  return { skids: fm.out.wheelsOnGround, onGround: fm.out.onGround, boomTip: gh([5.35, -0.98 - 0.022, 0.82]), tank: gh([0, -1.1, 0]), nozzle: gh([5.2, -1.09, 0.83]) };
});
console.log('contact', JSON.stringify(contact));
console.log('errors', errors);
await browser.close();
process.exit(errors.length || contact.skids !== 4 || contact.boomTip < 0.2 || contact.tank < 0.1 ? 1 : 0);
