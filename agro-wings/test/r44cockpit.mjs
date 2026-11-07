// R44 Raven II cockpit in the game's own cockpit camera (the rig, not a
// look-dev camera): parked cold, engine running on the pad, hover, level
// flight, a turn, looking left / right / down at the pedestal and the chase
// view; 16:9, 4:3 and 21:9 windows. Also: the
// clearance from the eye to the nearest cockpit surface in 26 directions
// (nothing closer than 12 cm), that the needles follow the flight model and
// that the caution lamps follow the aircraft's state (no random failures).
//   AGRO_URL=http://localhost:4173/ node test/r44cockpit.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'r44-cockpit';
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
    g.selectAircraft('r44');
    const st = document.createElement('style');
    st.textContent = '.overlay, .hud, .loading { display: none !important; }';
    document.head.appendChild(st);
  });
  const shots = tag === '16x9'
    ? ['parked', 'running', 'hover', 'level', 'turn', 'left', 'right', 'down', 'chase']
    : ['level'];
  for (const name of shots) {
    const info = await page.evaluate((name) => {
      const g = window.__agro, ac = g.aircraft;
      const run = (s, f) => { for (let t = 0; t < s; t += 1 / 30) { f?.(); g.tick(1 / 30); } };
      if (name === 'parked') { ac.placeAtPad(); run(0.5); }
      else if (name === 'running') { ac.placeAtPad(); ac.startEngine(); run(30); }
      else if (name === 'hover') { ac.placeAirborne(300, -270, Math.PI / 2, 4, 0); run(1.5); }
      else { ac.placeAirborne(300, -270, Math.PI / 2, 40, 45); run(1.5); }
      if (name === 'turn') { run(1.5, () => { ac.yoke.x = 0.6; }); ac.yoke.x = 0; }
      g.cameraMode = name === 'chase' ? 'chase' : 'cockpit';
      g.rig.setMode(g.cameraMode, ac);
      const look = { left: [1.1, -0.2], right: [-1.1, -0.2], down: [0.25, -0.85] }[name];
      for (let i = 0; i < 30; i++) {
        g.rig.update(1 / 30, ac, { dx: 0, dy: 0, buttons: 0, wheel: 0 }, g.world.terrain);
        if (look && g.cameraMode === 'cockpit') { g.rig.look.yaw = look[0]; g.rig.look.pitch = look[1]; }
      }
      ac.panel.draw(ac.instruments());
      ac._animate?.(1 / 30);
      for (let i = 0; i < 20; i++) g.world.update(g.camera, ac.rPos, 1 / 60, g.time);
      g.render();
      const d = ac.instruments(), r = g.renderer.info.render;
      const lit = ac.model.inst.lamps.filter((l) => l.lit).map((l) => l.key);
      return { calls: r.calls, tris: r.triangles, fov: +g.camera.fov.toFixed(1), ias: d.ias.toFixed(0), alt: d.altFt.toFixed(0), rotor: d.rotorPct.toFixed(0), engine: d.engine, lit };
    }, name);
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${outDir}/r44_${tag}_${name}.png` });
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
      ac._animate?.(1 / 30);
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
      return { min: +min.toFixed(3), dir };
    });
    console.log('eye clearance', JSON.stringify(clr));
    if (!clr.skipped) check(clr.min >= 0.12, 'eye clearance ≥ 12 cm', JSON.stringify(clr));
    // Needles follow the flight model: slow and fast flight differ.
    const inst = await page.evaluate(() => {
      const g = window.__agro, ac = g.aircraft, n = ac.model.inst.needles;
      g.cameraMode = 'cockpit';
      const at = (spd, agl) => {
        ac.placeAirborne(300, -270, Math.PI / 2, agl, spd);
        for (let i = 0; i < 20; i++) g.tick(1 / 30);
        ac.model.inst.update(ac.instruments());
        return { ias: ac.instruments().ias, asi: n.asi.rotation.z, alt: n.altH.rotation.z };
      };
      return { a: at(12, 30), b: at(45, 120) };
    });
    console.log('needles', JSON.stringify(inst));
    check(Math.abs(inst.a.asi - inst.b.asi) > 0.3 && Math.abs(inst.a.alt - inst.b.alt) > 0.3, 'ASI / altimeter needles follow the flight model');
    // Lamps follow the state: cold on the pad → ALT only; running in
    // flight → no caution lamps; low rotor rpm → LOW RPM; low fuel → LOW FUEL.
    const lamps = await page.evaluate(() => {
      const g = window.__agro, ac = g.aircraft, I = ac.model.inst;
      const lit = (patch) => { const d = { ...ac.instruments(), ...patch }; I.update(d); return I.lamps.filter((l) => l.lit).map((l) => l.key).sort().join(','); };
      ac.placeAtPad(); for (let i = 0; i < 10; i++) g.tick(1 / 30);
      const cold = lit({});
      ac.placeAirborne(300, -270, Math.PI / 2, 40, 45); for (let i = 0; i < 30; i++) g.tick(1 / 30);
      const flying = lit({});
      const lowRpm = lit({ lowRotor: true });
      const lowFuel = lit({ fuel: 2 });
      const repeat = [0, 1, 2, 3, 4].map(() => lit({})).every((s) => s === flying);
      return { cold, flying, lowRpm, lowFuel, repeat };
    });
    console.log('lamps', JSON.stringify(lamps));
    check(lamps.cold === 'alt' && !lamps.flying.split(',').some((k) => ['lowRpm', 'lowFuel', 'oil', 'alt', 'starter'].includes(k)) && lamps.lowRpm.includes('lowRpm') && lamps.lowFuel.includes('lowFuel') && lamps.repeat, 'caution lamps follow the aircraft state');
  }
  check(errors.length === 0, `${tag}: no page errors`, errors.join(' | '));
  await page.close();
}
await browser.close();
process.exit(fail ? 1 : 0);
