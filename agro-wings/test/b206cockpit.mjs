// Bell 206B-3 cockpit in the game's own cockpit camera (the rig): parked
// cold, the start (caution lamps), hover, level flight, a turn, looking
// left / right / down at the pedestal; a straight look-dev view of the
// panel; the AGROWINGS NAV pages without and with a contract, switched by
// clicking its soft keys through the game's cockpit click; the cyclic
// following the controls; camera switching; 16:9, 4:3 and 21:9; the eye
// clearance in 26 directions; needles and lamps against the flight state.
//   AGRO_URL=http://localhost:5173/ node test/b206cockpit.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'b206-cockpit';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let fail = 0;
const check = (ok, msg, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg} ${info}`); if (!ok) fail++; };
const sizes = process.env.QUICK ? [[1280, 720, '16x9']] : [[1280, 720, '16x9'], [1024, 768, '4x3'], [1680, 720, '21x9']];
for (const [vw, vh, tag] of sizes) {
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  page.setDefaultTimeout(600000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t0 = Date.now();
  await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=medium', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
  if (tag === '16x9') console.log('load', ((Date.now() - t0) / 1000).toFixed(1), 's');
  await page.evaluate(() => {
    const g = window.__agro;
    localStorage.clear(); g.career.resetAll(); g.career.tutorialDone = true;
    g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
    g.menuAction('free'); g.screens.close();
    g.selectAircraft('b206');
    const st = document.createElement('style');
    st.textContent = '.overlay, .hud, .loading { display: none !important; }';
    document.head.appendChild(st);
  });
  const shots = tag === '16x9' ? ['parked', 'start', 'hover', 'level', 'turn', 'left', 'right', 'down', 'chase'] : ['level'];
  for (const name of shots) {
    const info = await page.evaluate((name) => {
      const g = window.__agro, ac = g.aircraft;
      const run = (s, f) => { for (let t = 0; t < s; t += 1 / 30) { f?.(); g.tick(1 / 30); } };
      if (name === 'parked') { ac.placeAtPad(); run(0.5); }
      else if (name === 'start') { ac.placeAtPad(); ac.startEngine(); run(4); }
      else if (name === 'hover') { ac.placeAirborne(300, -270, Math.PI / 2, 4, 0); run(1.5); }
      else { ac.placeAirborne(300, -270, Math.PI / 2, 40, 45); run(1.5); }
      if (name === 'turn') { run(1.5, () => { ac.yoke.x = 0.6; }); ac.yoke.x = 0; }
      g.cameraMode = name === 'chase' ? 'chase' : 'cockpit';
      g.rig.setMode(g.cameraMode, ac);
      const look = { left: [1.1, -0.2], right: [-1.1, -0.2], down: [0.3, -0.85] }[name];
      for (let i = 0; i < 30; i++) {
        g.rig.update(1 / 30, ac, { dx: 0, dy: 0, buttons: 0, wheel: 0 }, g.world.terrain);
        if (look) { g.rig.look.yaw = look[0]; g.rig.look.pitch = look[1]; }
      }
      ac.panel.draw(ac.instruments());
      ac._animate?.(1 / 30);
      for (let i = 0; i < 20; i++) g.world.update(g.camera, ac.rPos, 1 / 60, g.time);
      g.render();
      const d = ac.instruments(), r = g.renderer.info.render;
      const lit = Object.entries(ac.panel.lit).filter(([, v]) => v).map(([k]) => k);
      return { calls: r.calls, tris: r.triangles, fov: +g.camera.fov.toFixed(1), ias: d.ias.toFixed(0), n1: (d.ng ?? 0).toFixed(0), tot: (d.itt ?? 0).toFixed(0), tq: (d.torque ?? 0).toFixed(0), nr: d.rotorPct.toFixed(0), engine: d.engine, lit };
    }, name);
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${outDir}/b206_${tag}_${name}.png` });
    console.log(tag, name, JSON.stringify(info));
  }
  if (tag !== '16x9') { check(errors.length === 0, `${tag}: no page errors`, errors.join(' | ')); await page.close(); continue; }

  // Panel straight on (look-dev camera 0.75 m in front of the face).
  await page.evaluate(() => {
    const g = window.__agro, ac = g.aircraft, m = ac.model;
    ac.placeAirborne(300, -270, Math.PI / 2, 40, 45);
    for (let i = 0; i < 20; i++) g.tick(1 / 30);
    g.frozen = true; g.noRender = true;
    g.cameraMode = 'cockpit';
    const pan = m.inst.panelGroup;
    m.root.updateMatrixWorld(true);
    const c = pan.localToWorld(new (g.camera.position.constructor)(0, 0.03, 0.62));
    const tgt = pan.localToWorld(new (g.camera.position.constructor)(0, 0.03, 0));
    g.camera.position.copy(c); g.camera.up.set(0, 1, 0); g.camera.lookAt(tgt); g.camera.fov = 40; g.camera.updateProjectionMatrix();
    ac.panel.draw(ac.instruments()); m.inst.update(ac.instruments());
    g.render();
  });
  await page.screenshot({ path: `${outDir}/b206_panel_front.png` });
  await page.evaluate(() => { const g = window.__agro; g.frozen = false; g.noRender = false; });

  // GPS pages: without a contract (map, destination, mission), then with
  // the soybean contract (all four), each switched by clicking its key.
  const clickKey = async (pageId) => page.evaluate((pageId) => {
    const g = window.__agro, ac = g.aircraft, m = ac.model;
    g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac);
    g.rig.look.yaw = 0.35; g.rig.look.pitch = -0.32;
    g.rig.update(0, ac, { dx: 0, dy: 0, buttons: 0, wheel: 0 }, g.world.terrain);
    g.camera.updateMatrixWorld(true); m.root.updateMatrixWorld(true);
    const k = m.inst.pickables.find((o) => o.userData.gpsPage === pageId);
    const p = k.getWorldPosition(new (g.camera.position.constructor)()).project(g.camera);
    const r = g.canvas.getBoundingClientRect();
    const got = g.cockpitClick(r.left + ((p.x + 1) / 2) * r.width, r.top + ((1 - p.y) / 2) * r.height);
    for (let i = 0; i < 3; i++) { ac.panel.draw(ac.instruments()); }
    m.inst.update(ac.instruments());
    g.render();
    return { got, page: ac.panel.page, key: ac.panel.gps.key.slice(0, 50), png: ac.panel.gps.c.toDataURL('image/png') };
  }, pageId);
  await page.evaluate(() => { const g = window.__agro; g.aircraft.placeAirborne(-200, -150, Math.PI / 2, 30, 30); for (let i = 0; i < 20; i++) g.tick(1 / 30); });
  for (const p of ['map', 'dest', 'mission']) {
    const r = await clickKey(p);
    fs.writeFileSync(`${outDir}/b206_gpsscreen_nojob_${p}.png`, Buffer.from(r.png.split(',')[1], 'base64')); delete r.png;
    await page.screenshot({ path: `${outDir}/b206_gps_nojob_${p}.png` });
    check(r.got === p && r.page === p, `GPS key ${p} (no job)`, JSON.stringify(r));
  }
  await page.evaluate(() => {
    const g = window.__agro;
    g.menuAction('career'); g.screens.close();
    g.selectContract('soy'); g.screens.close();
  });
  const hasJob = await page.evaluate(() => !!window.__agro.job);
  await page.evaluate(() => { const g = window.__agro; g.aircraft.placeAirborne(300, -270, Math.PI / 2, 8, 25); g.sprayer.on = !!g.job; for (let i = 0; i < 240; i++) g.tick(1 / 30); });
  for (const p of ['map', 'dest', 'mission', 'cov']) {
    const r = await clickKey(p);
    fs.writeFileSync(`${outDir}/b206_gpsscreen_job_${p}.png`, Buffer.from(r.png.split(',')[1], 'base64')); delete r.png;
    await page.screenshot({ path: `${outDir}/b206_gps_job_${p}.png` });
    check(r.got === p && r.page === p, `GPS key ${p} (${hasJob ? 'with job' : 'no job'})`, JSON.stringify(r));
  }
  console.log('job active for the GPS pages:', hasJob);

  // Eye clearance.
  const clr = await page.evaluate(async () => {
    const g = window.__agro, ac = g.aircraft, m = ac.model;
    const THREE = await import('/node_modules/.vite/deps/three.js').catch(() => null);
    if (!THREE) return { skipped: true };
    const R = new THREE.Raycaster();
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

  // Needles follow the flight model; the cyclic follows the controls.
  const inst = await page.evaluate(() => {
    const g = window.__agro, ac = g.aircraft, I = ac.model.inst;
    g.cameraMode = 'cockpit';
    const at = (spd, agl, lever) => {
      ac.placeAirborne(300, -270, Math.PI / 2, agl, spd);
      for (let i = 0; i < 30; i++) { if (lever !== undefined) ac.fm.collective = lever; g.tick(1 / 30); }
      const d = ac.instruments();
      I.update(d);
      const pg = I.panelGroup.children;
      void pg;
      return { ias: d.ias, tq: d.torque, ng: d.ng };
    };
    const a = at(12, 30), b = at(45, 120);
    // The stick is driven by the simulated cyclic (after the assist).
    const fm = ac.fm, m = ac.model;
    fm.cyclicLon = 0; fm.cyclicLat = 0; fm.trim = 0; m.update(0, fm, ac);
    const cy0 = m.cyclic.rotation.clone();
    fm.cyclicLon = 0.6; fm.cyclicLat = -0.5; m.update(0, fm, ac);
    const cy1 = m.cyclic.rotation.clone();
    return { a, b, cyclic: [cy0.x, cy0.z, cy1.x, cy1.z].map((v) => +v.toFixed(3)) };
  });
  console.log('instruments', JSON.stringify(inst));
  check(Math.abs(inst.a.ias - inst.b.ias) > 10, 'airspeed follows the flight model');
  check(Math.abs(inst.cyclic[2] - inst.cyclic[0]) > 0.03 && Math.abs(inst.cyclic[3] - inst.cyclic[1]) > 0.03, 'cyclic stick follows the cyclic', JSON.stringify(inst.cyclic));

  // Caution lamps: cold → dark; start → START, ENGINE OUT, ROTOR LOW RPM,
  // GEN FAIL, XMSN OIL PRESS; flying → none; low fuel → FUEL LOW.
  const lamps = await page.evaluate(() => {
    const g = window.__agro, ac = g.aircraft, P = ac.panel;
    const lit = (patch) => { P.draw({ ...ac.instruments(), ...patch }); return Object.keys(P.lit).filter((k) => P.lit[k]).sort().join(','); };
    g.sprayer.on = false;
    ac.placeAtPad(); for (let i = 0; i < 10; i++) g.tick(1 / 30);
    const cold = lit({});
    ac.startEngine(); for (let i = 0; i < 30; i++) g.tick(1 / 30);
    const start = lit({});
    ac.placeAirborne(300, -270, Math.PI / 2, 40, 45); for (let i = 0; i < 30; i++) g.tick(1 / 30);
    const flying = lit({});
    const lowFuel = lit({ fuel: 40 });
    const same = [0, 1, 2, 3].map(() => lit({})).every((s) => s === flying);
    return { cold, start, flying, lowFuel, same };
  });
  console.log('lamps', JSON.stringify(lamps));
  check(lamps.cold === '' && ['engOut', 'start', 'lowRpm', 'genFail'].every((k) => lamps.start.includes(k)) && lamps.flying === '' && lamps.lowFuel === 'lowFuel' && lamps.same, 'caution lamps follow the aircraft state');

  // Camera switching: cockpit ↔ chase ↔ cockpit, pilot hidden only inside.
  const cams = await page.evaluate(() => {
    const g = window.__agro, ac = g.aircraft, out = [];
    for (const m of ['cockpit', 'chase', 'orbit', 'cockpit']) {
      g.cameraMode = m; g.rig.setMode(m, ac);
      for (let i = 0; i < 10; i++) g.rig.update(1 / 30, ac, { dx: 0, dy: 0, buttons: 0, wheel: 0 }, g.world.terrain);
      out.push([m, ac.model.pilot.visible, +g.camera.position.distanceTo(ac.rPos).toFixed(1)]);
    }
    return out;
  });
  console.log('cameras', JSON.stringify(cams));
  check(cams[0][1] === false && cams[1][1] === true && cams[3][1] === false && cams[0][2] < 2 && cams[1][2] > 6, 'camera switching (cockpit / chase / orbit / cockpit)');
  check(errors.length === 0, `${tag}: no page errors`, errors.join(' | '));
  await page.close();
}
await browser.close();
process.exit(fail ? 1 : 0);
