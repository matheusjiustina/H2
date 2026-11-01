// AT-802A / Fire Boss cockpit views (browser): the pilot's view, the panel
// head-on, close-ups (engine monitor, GPS, right-hand instruments, console,
// footwell), the stick from the side; plus checks: the GPS soft keys and
// the Fire Boss switches by raycast, needles and screens following the
// simulation, gear lamps.
//   AGRO_URL=http://localhost:5173/ node test/at802cockpit.mjs <outDir> [at802|at802f]
import { chromium } from 'playwright';
import fs from 'node:fs';
const outDir = process.argv[2] || 'at802-cockpit';
const acId = process.argv[3] ?? 'at802';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(600000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=medium', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
const res = await page.evaluate(async (acId) => {
  const ex = await import('/src/game/expansions.js');
  ex.setEntitlementSource((id) => id === 'expansion.at802f-fireboss');
  const g = window.__agro;
  g.menuAction('free'); g.screens.close();
  g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
  g.selectAircraft(acId);
  g.frozen = true;
  const st = document.createElement('style');
  st.textContent = '.overlay, .hud, .loading, .touch { display: none !important; }';
  document.head.appendChild(st);
  const ac = g.aircraft;
  ac.placeAirborne(300, -280, Math.PI / 2, 60, 55);
  ac.fm.hopper = acId === 'at802f' ? 1800 : 1500; ac.fm.updateMass();
  if (ac.water) { ac.fm.gearDown = 0; ac.fm.gearCmd = false; }
  else g.sprayer.on = true;
  g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac);
  for (let i = 0; i < 60; i++) g.tick(1 / 60);
  return { id: g.aircraftId };
}, acId);
console.log('aircraft', res.id);
const prep = () => page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft;
  for (let i = 0; i < 4; i++) g.tick(1 / 60);
  ac.panel.draw(ac.instruments());
  ac.model.update(1 / 60, ac.fm, ac);
});
const shot = async (n) => { await page.waitForTimeout(60); await page.screenshot({ path: `${outDir}/${acId}_${n}.png` }); };
// 1. The pilot's view (the game's cockpit camera).
await prep();
await page.evaluate(() => window.__agro.render());
await shot('pilot');
// Clicks from the pilot's view, as the mouse does (game.cockpitClick).
const clicks = (lookPitch) => page.evaluate((lookPitch) => {
  const g = window.__agro, ac = g.aircraft, inst = ac.model.inst;
  if (lookPitch != null) { g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac); g.rig.look.pitch = lookPitch; for (let i = 0; i < 30; i++) g.rig.update(1 / 30, ac, { dx: 0, dy: 0, buttons: 0, wheel: 0 }, g.world.terrain); g.camera.updateMatrixWorld(); }
  const V3 = g.camera.position.constructor;
  const r = g.canvas.getBoundingClientRect();
  const before = { page: ac.panel.page, gear: ac.fm.gearCmd, probes: ac.water?.probesCmd, drop: ac.water?.dropping, spray: g.sprayer.on };
  const picked = [];
  for (const p of inst.pickables) {
    const w = p.getWorldPosition(new V3()).project(g.camera);
    if (Math.abs(w.x) > 1 || Math.abs(w.y) > 1 || w.z > 1) { picked.push('offscreen'); continue; }
    const x = r.left + ((w.x + 1) / 2) * r.width, y = r.top + ((1 - w.y) / 2) * r.height;
    picked.push(g.cockpitClick(x, y));
  }
  const after = { page: ac.panel.page, gear: ac.fm.gearCmd, probes: ac.water?.probesCmd, drop: ac.water?.dropping, spray: g.sprayer.on };
  for (let i = 0; i < 30; i++) g.tick(1 / 60);
  ac.panel.draw(ac.instruments());
  const d = ac.panel.last;
  return { n: inst.pickables.length, picked, before, after, data: { ias: Math.round(d.ias), alt: Math.round(d.altFt), ng: +d.ng.toFixed(1), tq: Math.round(d.torque), hopper: Math.round(d.hopper) }, lit: Object.entries(ac.panel.lit).filter(([, v]) => v).map(([k]) => k) };
}, lookPitch);
const chk = await clicks(null);
console.log('clicks', JSON.stringify(chk));
console.log('clicksDown', JSON.stringify(await clicks(-0.85)));

await page.evaluate(() => { const g = window.__agro, ac = g.aircraft; g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac); for (let i = 0; i < 10; i++) g.tick(1 / 60); ac.panel.draw(ac.instruments()); ac.model.update(1 / 60, ac.fm, ac); g.render(); });
await shot('pilot2');
// Custom views: camera placed in the body frame of the aircraft.
const view = async (name, eye, target, fov) => {
  await page.evaluate(({ eye, target, fov }) => {
    const g = window.__agro, ac = g.aircraft, root = ac.model.root;
    g.rig.mode = 'free'; g.cameraMode = 'free';
    root.updateMatrixWorld(true);
    const V3 = g.camera.position.constructor;
    g.camera.position.copy(root.localToWorld(new V3(...eye)));
    g.camera.up.set(0, 1, 0).applyQuaternion(root.quaternion);
    g.camera.lookAt(root.localToWorld(new V3(...target)));
    g.camera.fov = fov; g.camera.near = 0.02; g.camera.updateProjectionMatrix();
    ac.model.cockpit.visible = true; ac.model.pilot.visible = false;
    g.render();
  }, { eye, target, fov });
  await shot(name);
};
await view('panelFront', [0, 1.3, -1.87], [0, 0.98, -1.17], 62);
await view('ems', [0.22, 1.12, -1.54], [0.25, 0.93, -1.23], 38);
await view('gps', [0, 1.14, -1.54], [0, 0.97, -1.12], 40);
await view('right', [-0.22, 1.12, -1.54], [-0.26, 0.92, -1.24], 40);
await view('console', [0, 0.98, -1.72], [0, 0.64, -1.32], 58);
await view('stickSide', [-0.42, 0.95, -1.75], [0.05, 0.6, -1.3], 70);
await view('footwell', [0, 0.95, -1.62], [0, 0.4, -1.0], 66);
await view('cabinRear', [0, 1.45, -1.05], [0, 1.0, -2.3], 80);

console.log('errors', JSON.stringify(errors));
await browser.close();
