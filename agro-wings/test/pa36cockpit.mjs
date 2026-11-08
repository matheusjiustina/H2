// Piper PA-36 Brave cockpit (Prompt 02) in the real game (browser): the
// view framed as the cockpit reference (parked, from the pilot's eye,
// looking down at the panel; PITCH / VFOV / EYE_DY tune it), blended with
// the reference for the comparison; the game's own cockpit camera on the
// ground and in flight; close-ups of the pod, the lower panel, the floor,
// the door and the left console; page errors.
//   AGRO_URL=http://localhost:5173/ node test/pa36cockpit.mjs <outDir> [ref.png]
import { chromium } from 'playwright';
import fs from 'node:fs';
const outDir = process.argv[2] || 'pa36-cockpit';
const ref = process.argv[3] || null;
const only = process.env.VIEWS ? process.env.VIEWS.split(',') : null;
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const W = +(process.env.W || 1920), H = +(process.env.H || 1080);
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=high', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
await page.evaluate((tod) => {
  const g = window.__agro;
  g.frozen = true; g.noRender = true;
  g.menuAction('free'); g.screens.close();
  g.setSetting('timeOfDay', tod);
  g.setSetting('weather', 'clear');
  g.selectAircraft('pa36');
  const st = document.createElement('style');
  st.textContent = '.overlay, .hud, .loading, .touch, #touch, button { display: none !important; }';
  document.head.appendChild(st);
}, process.env.TOD ?? 'morning');
const shot = async (n) => { await page.waitForTimeout(60); await page.screenshot({ path: `${outDir}/${n}.png` }); };
// A camera at the pilot's eye (+ dEye in the cabin frame), its look
// direction given in the cabin's reference frame: yaw (left +), pitch (deg).
const view = (name, o) => page.evaluate(async (o) => {
  const g = window.__agro, ac = g.aircraft, m = ac.model;
  const THREE = await import('/node_modules/.vite/deps/three.js');
  if (o.air) { ac.placeAirborne(300, -280, Math.PI / 2, 80, 48); for (let i = 0; i < 20; i++) g.tick(1 / 60); }
  else { ac.fm.settleOnGround(-352, -64, Math.PI / 2, ac.env); ac.fm.engine = o.engine ?? 'off'; ac.fm.hopper = o.hopper ?? 520; ac.fm.fuel = 250; ac.fm.updateMass(); for (let i = 0; i < 40; i++) g.tick(1 / 60); }
  if (o.engine === 'running') { ac.fm.engine = 'running'; ac.fm.rpm = 1000; ac.fm.mp = 16; ac.fm.oilP = 60; ac.fm.oilT = 70; for (let i = 0; i < 20; i++) g.tick(1 / 60); }
  g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac);
  for (let i = 0; i < 10; i++) g.tick(1 / 60);
  ac.panel.draw(ac.instruments());
  ac._animate?.(1 / 60); m.update?.(0.5, ac.fm, ac);
  m.pilot.visible = false; m.cockpit.visible = true;
  m.root.updateMatrixWorld(true);
  const st = m.root.children.find((c) => c.isGroup && Math.abs(c.rotation.x - 0.15708) < 1e-3);
  if (o.cam) {
    // Outside, as on a photograph: the camera and its target in the cabin's
    // reference frame, the pilot figure in his seat.
    m.pilot.visible = true;
    const c = st.localToWorld(new THREE.Vector3(...o.cam)), t = st.localToWorld(new THREE.Vector3(...o.at));
    g.cameraMode = 'free';
    g.camera.position.copy(c); g.camera.up.set(0, 1, 0); g.camera.lookAt(t);
    g.camera.fov = o.vfov ?? 40; g.camera.near = 0.05; g.camera.far = 6000; g.camera.updateProjectionMatrix();
  } else if (!o.game) {
    const eye = st.localToWorld(new THREE.Vector3(o.ex ?? 0, 0.645 + (o.dy ?? 0), -1.72 + (o.dz ?? 0)));
    const q = st.getWorldQuaternion(new THREE.Quaternion());
    const p = (o.pitch ?? 0) * Math.PI / 180, y = (o.yaw ?? 0) * Math.PI / 180;
    const dir = new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)).applyQuaternion(q);
    // Horizon-relative pitch when asked (the reference frame on the ground
    // is ~level anyway).
    g.cameraMode = 'free';
    g.camera.position.copy(eye);
    g.camera.up.set(0, 1, 0);
    g.camera.lookAt(eye.clone().add(dir));
    g.camera.fov = o.vfov ?? 60; g.camera.near = 0.03; g.camera.far = 6000;
    g.camera.updateProjectionMatrix();
  }
  for (let i = 0; i < 6; i++) g.world.update(g.camera, g.camera.position, 1 / 60, g.time);
  g.render();
  return { fov: g.camera.fov, pos: g.camera.position.toArray().map((v) => +v.toFixed(3)) };
}, o);
const PITCH = +(process.env.PITCH ?? -27), VFOV = +(process.env.VFOV ?? 70), DY = +(process.env.EYE_DY ?? 0), DZ = +(process.env.EYE_DZ ?? 0);
const V = [
  ['photo', { pitch: PITCH, vfov: VFOV, dy: DY, dz: DZ }],
  ['game_ground', { game: true }],
  ['game_air', { game: true, air: true, engine: 'running' }],
  ['pod', { pitch: -9, vfov: 22, dy: 0 }],
  ['lower', { pitch: -30, vfov: 28 }],
  ['floor', { pitch: -52, vfov: 60 }],
  ['right', { pitch: -18, yaw: -70, vfov: 70 }],
  ['left', { pitch: -40, yaw: 55, vfov: 70 }],
  ['gps', { pitch: -15, yaw: 26, vfov: 20 }],
  ['up', { pitch: 35, vfov: 80 }],
  ['ext181', { cam: [-11.5, -0.35, 1.2], at: [0, -0.15, -1.9], vfov: 38, hopper: 0 }],
  ['ext182', { cam: [9, -3.2, 6], at: [0, 0, -1.6], vfov: 40, air: true, engine: 'running' }],
  ['ext183', { cam: [1.2, -0.9, 13], at: [0, 0.0, -0.8], vfov: 46, engine: 'running' }],
  ['roofL', { pitch: 25, yaw: 35, vfov: 50 }],
  ['roofR', { pitch: 25, yaw: -35, vfov: 50 }],
].filter((v) => !only || only.includes(v[0]));
for (const [name, o] of V) { const r = await view(name, o); await shot(name); console.log(name, JSON.stringify(r)); }
console.log('errors', errors);
await browser.close();
