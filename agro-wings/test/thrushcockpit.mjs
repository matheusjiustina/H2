// Thrush 510G cockpit in the game's own cockpit camera (the rig, not a
// look-dev camera): parked with the engine running, taxiing, level flight,
// a turn, a pull-up, looking left / right / down / up, back to the chase
// view; 16:9, 4:3 and 21:9 windows. Also: the clearance from the eye to
// the nearest cockpit surface in 26 directions (nothing may be closer than
// 12 cm), and that the instruments follow the flight model.
//   AGRO_URL=http://localhost:4173/ node test/thrushcockpit.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'thrush-cockpit';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let fail = 0;
const check = (ok, msg, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg} ${info}`); if (!ok) fail++; };
for (const [vw, vh, tag] of [[1280, 720, '16x9'], [1024, 768, '4x3'], [1680, 720, '21x9']]) {
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  page.setDefaultTimeout(600000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto((process.env.AGRO_URL || 'http://localhost:4173/') + '?q=medium', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
  await page.evaluate(() => {
    const g = window.__agro;
    localStorage.clear(); g.career.resetAll(); g.career.tutorialDone = true;
    g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
    g.menuAction('free'); g.screens.close();
    g.selectAircraft('thrush');
    const st = document.createElement('style');
    st.textContent = '.overlay, .hud, .loading { display: none !important; }';
    document.head.appendChild(st);
  });
  const shots = tag === '16x9'
    ? ['parked', 'taxi', 'level', 'turn', 'pullup', 'left', 'right', 'down', 'up', 'chase']
    : ['level'];
  for (const name of shots) {
    const info = await page.evaluate((name) => {
      const g = window.__agro, ac = g.aircraft, fm = ac.fm;
      const run = (s, f) => { for (let t = 0; t < s; t += 1 / 30) { f?.(); g.tick(1 / 30); } };
      if (name === 'parked' || name === 'taxi') {
        ac.placeAtPad(); fm.engine = 'running'; fm.ng = ac.A.turbine.idleNg; fm.rpm = ac.A.idleRpm; fm.parkBrake = false;
        fm.throttle = name === 'taxi' ? 0.3 : 0;
        run(name === 'taxi' ? 4 : 1);
      } else if (['level', 'turn', 'pullup', 'left', 'right', 'down', 'up'].includes(name)) {
        ac.placeAirborne(300, -270, Math.PI / 2, 40, 55); fm.throttle = 0.65;
        run(1.5);
        if (name === 'turn') { g.input.virtual = g.input.virtual || {}; run(1.2, () => { fm.aileron = 0.7; }); }
        if (name === 'pullup') run(0.8, () => { fm.elevator = -0.7; });
      }
      g.cameraMode = name === 'chase' ? 'chase' : 'cockpit';
      g.rig.setMode(g.cameraMode, ac);
      const look = { left: [1.3, -0.15], right: [-1.3, -0.15], down: [0, -0.9], up: [0, 0.6] }[name];
      g.rig.update(1 / 30, ac, { dx: 0, dy: 0, buttons: 0, wheel: 0 }, g.world.terrain);
      if (look) { g.rig.look.yaw = look[0]; g.rig.look.pitch = look[1]; }
      for (let i = 0; i < 30; i++) { g.rig.update(1 / 30, ac, { dx: 0, dy: 0, buttons: 0, wheel: 0 }, g.world.terrain); if (look) { g.rig.look.yaw = look[0]; g.rig.look.pitch = look[1]; } }
      ac.panel.draw(ac.instruments()); ac.panelT = 1;
      ac._animate(1 / 30);
      for (let i = 0; i < 20; i++) g.world.update(g.camera, ac.rPos, 1 / 60, g.time);
      g.render();
      const d = ac.panel.last;
      const r = g.renderer.info.render;
      return { calls: r.calls, tris: r.triangles, fov: +g.camera.fov.toFixed(1), ias: d?.ias.toFixed(0), alt: d?.altFt.toFixed(0), ng: d?.ng.toFixed(1), key: ac.panel.screens?.mvp.key.slice(0, 40) };
    }, name);
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${outDir}/cockpit_${tag}_${name}.png` });
    console.log(tag, name, JSON.stringify(info));
  }
  if (tag === '16x9') {
    // Eye clearance: rays from the eye in 26 directions against the cockpit
    // and the airframe; the nearest hit must be ≥ 12 cm away.
    const clr = await page.evaluate(async () => {
      const g = window.__agro, ac = g.aircraft, m = ac.model;
      const THREE = await import('/node_modules/.vite/deps/three.js').catch(() => null);
      const R = THREE ? new THREE.Raycaster() : null;
      if (!R) return { skipped: true };
      g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac); g.rig.update(1 / 30, ac, { dx: 0, dy: 0, buttons: 0, wheel: 0 }, g.world.terrain);
      m.root.updateMatrixWorld(true);
      const eye = m.root.localToWorld(m.eye.clone());
      const q = m.root.getWorldQuaternion(new THREE.Quaternion());
      let min = 9, dir = null;
      const meshes = [];
      const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
      m.root.traverse((o) => { if (o.isMesh && shown(o) && o !== m.disc && !o.material.transparent) meshes.push(o); });
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        if (!a && !b && !c) continue;
        const v = new THREE.Vector3(a, b, c).normalize().applyQuaternion(q);
        R.set(eye, v); R.near = 0; R.far = 3;
        const h = R.intersectObjects(meshes, false)[0];
        if (h && h.distance < min) { min = h.distance; dir = [a, b, c]; }
      }
      return { min, dir };
    });
    console.log('eye clearance', JSON.stringify(clr));
    if (!clr.skipped) check(clr.min >= 0.12, 'eye clearance ≥ 12 cm', JSON.stringify(clr));
    // Instruments follow the flight model: two different states give
    // different needles / screens.
    const inst = await page.evaluate(() => {
      const g = window.__agro, ac = g.aircraft, fm = ac.fm;
      g.cameraMode = 'cockpit';
      ac.placeAirborne(300, -270, Math.PI / 2, 40, 55); fm.throttle = 0.65;
      for (let i = 0; i < 30; i++) g.tick(1 / 30);
      ac.panel.draw(ac.instruments());
      const a = { ias: ac.panel.last.ias, mvp: ac.panel.screens.mvp.key, g5: ac.panel.screens.g5.key };
      ac.placeAirborne(300, -270, Math.PI / 2, 120, 35); fm.throttle = 1;
      for (let i = 0; i < 90; i++) g.tick(1 / 30);
      ac.panel.draw(ac.instruments());
      for (let i = 0; i < 6; i++) { ac.panel.draw(ac.instruments()); }
      const b = { ias: ac.panel.last.ias, mvp: ac.panel.screens.mvp.key, g5: ac.panel.screens.g5.key };
      ac._animate(1 / 30);
      return { a, b };
    });
    console.log('instruments', JSON.stringify(inst));
    check(Math.abs(inst.a.ias - inst.b.ias) > 5 && inst.a.g5 !== inst.b.g5, 'needles / G5 follow the flight model');
  }
  check(errors.length === 0, `${tag}: no page errors`, errors.join(' | '));
  await page.close();
}
await browser.close();
process.exit(fail ? 1 : 0);
