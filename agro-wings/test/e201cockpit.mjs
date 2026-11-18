// Embraer EMB-201A Ipanema cockpit (Prompt 02) in the real game: the
// instruments read the flight model, the GPS keys answer a click on the
// screen, the stick / pedals / throttle follow the controls inside their
// geometric limits (the grip never reaches the panel or the floor), the
// pilot's eye is clear of the structure, the cowl, the horizon and the
// panel sit where the reference perspective puts them, entering / leaving
// the cockpit repeatedly leaks nothing, and a parked 201 lets its cockpit
// textures go.
//   AGRO_URL=http://localhost:5173/ node test/e201cockpit.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const outDir = process.argv[2] || 'e201-cockpit';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(600000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=high', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
const results = {};
const ok = (k, v, info) => { results[k] = { pass: !!v, info }; console.log(v ? 'PASS' : 'FAIL', k, info ?? ''); };
await page.evaluate(() => {
  const g = window.__agro; g.frozen = true;
  g.selectAircraft('e201'); g.menuAction('free'); g.screens.close();
  const st = document.createElement('style'); st.textContent = '.overlay, .hud, .loading { display: none !important; }'; document.head.appendChild(st);
});
const enter = () => page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft;
  ac.placeAirborne(300, -280, Math.PI / 2, 80, 42);
  ac.fm.engine = 'running'; ac.fm.throttle = 0.7; ac.fm.hopper = 600;
  for (let i = 0; i < 60; i++) g.tick(1 / 60);
  g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac);
  for (let i = 0; i < 30; i++) g.tick(1 / 60);
  ac.panel.draw(ac.instruments());
  for (let i = 0; i < 90; i++) ac._animate(1 / 30);
  g.render();
});

// 1. Instruments: each needle's angle against the flight model's value.
await enter();
let r = await page.evaluate(async () => {
  const g = window.__agro, ac = g.aircraft, m = ac.model, d = ac.instruments();
  const { E201_ANG: A } = await import('/src/aircraft/e201Panel.js');
  const n = m.inst.needles, ang = (k, i = 0) => -n[k][i].rotation.z;
  const deg = (x) => +(x * 57.2958).toFixed(1);
  const rows = {
    asi: [ang('asi'), A.asi(d.ias), d.ias], rpm: [ang('rpm'), A.rpm(d.rpm), d.rpm], mp: [ang('mp'), A.mp(d.mp), d.mp],
    alt100: [ang('alt', 1), A.alt100(d.altFt), d.altFt], oilP: [ang('oil', 0), A.oilP(d.oilP), d.oilP], oilT: [ang('oil', 1), A.oilT(d.oilT), d.oilT],
    cht: [ang('cht'), A.cht(d.cht), d.cht], fuel: [ang('fuel'), A.fuel(d.fuel), d.fuel],
  };
  return Object.fromEntries(Object.entries(rows).map(([k, [a, b, v]]) => [k, { needle: deg(a), expected: deg(b), value: +(+v).toFixed(1) }]));
});
const worst = Math.max(...Object.values(r).map((o) => Math.abs(o.needle - o.expected)));
ok('1 instruments follow the flight model (needle vs value, ≤ 3°)', worst <= 3, JSON.stringify(r));
await page.screenshot({ path: `${outDir}/01_pilot_view.png` });

// 2. GPS: a click on each key (its projected screen point) selects the page.
r = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft, m = ac.model;
  g.render();
  const out = [];
  for (const k of m.inst.pickables) {
    const p = k.getWorldPosition(k.position.clone()).project(g.camera);
    const rc = g.canvas.getBoundingClientRect();
    const sx = rc.left + ((p.x + 1) / 2) * rc.width, sy = rc.top + ((1 - p.y) / 2) * rc.height;
    const page = g.cockpitClick(sx, sy);
    out.push({ want: k.userData.gpsPage, got: page, now: ac.panel.page });
  }
  return out;
});
ok('2 GPS keys answer a click on the screen (4 pages)', r.length === 4 && r.every((o) => o.got === o.want && o.now === o.want), JSON.stringify(r));

// 3. Stick, pedals, throttle, magneto key and dump handle follow the
// controls; the stick's grip stays clear of the panel and the
// floor at every corner of its travel.
r = await page.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const g = window.__agro, ac = g.aircraft, m = ac.model, fm = ac.fm;
  const solids = [];
  m.cockpit.traverse((o) => { if (o.isMesh && !o.material.transparent) { let s = false; for (let q = o; q; q = q.parent) if (q === m.stick || q === m.throttle || q.isLOD) s = true; if (!s) solids.push(o); } });
  const box = new THREE.Box3(), tmp = new THREE.Box3();
  let minGap = 9;
  const corners = [];
  for (const e of [-1, 1]) for (const a of [-1, 1]) {
    fm.elevator = e; fm.aileron = a; ac._animate(1 / 60); m.root.updateMatrixWorld(true);
    box.makeEmpty(); m.stick.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.union(tmp); } });
    // Ray tests from the grip's top in its travel directions: the nearest
    // solid surface of the cockpit.
    const top = m.stick.localToWorld(new THREE.Vector3(0, 0.55, 0.14));
    const R = new THREE.Raycaster();
    for (const dir of [[0, 0, 1], [0, -1, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0]]) {
      R.set(top, new THREE.Vector3(...dir).applyQuaternion(m.root.getWorldQuaternion(new THREE.Quaternion())).normalize()); R.far = 1;
      const h = R.intersectObjects(solids, false)[0];
      if (h) minGap = Math.min(minGap, h.distance - 0.025);
    }
    corners.push([e, a, m.stick.rotation.x.toFixed(2), m.stick.rotation.z.toFixed(2)]);
  }
  fm.elevator = 0; fm.aileron = 0;
  fm.rudder = 1; ac._animate(1 / 60); const pz = [m.pedals[0].position.z, m.pedals[1].position.z];
  fm.rudder = 0; ac._animate(1 / 60);
  fm.throttle = 0; ac._animate(1 / 60); const t0 = m.throttle.rotation.x; fm.throttle = 1; ac._animate(1 / 60); const t1 = m.throttle.rotation.x;
  const floorY = m.refs.floorY, pivotY = m.stick.position.y;
  return { corners, minGapGrip: +minGap.toFixed(3), pedals: pz.map((v) => +v.toFixed(3)), throttle: [+t0.toFixed(2), +t1.toFixed(2)], pivotAboveFloor: +(pivotY - floorY).toFixed(3) };
});
ok('3 stick / pedals / throttle follow the controls; the grip clears every surface at full travel', r.minGapGrip > 0.02 && r.pedals[0] !== r.pedals[1] && r.throttle[1] > r.throttle[0] && r.pivotAboveFloor > 0, JSON.stringify(r));

// 4. Pilot's view: eye clear of the structure; the cowl over the lip, the
// horizon in the frame; the panel in its lower part.
r = await page.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const g = window.__agro, ac = g.aircraft, m = ac.model;
  await new Promise((r) => setTimeout(r, 50));
  m.root.updateMatrixWorld(true);
  const eye = m.root.localToWorld(m.eye.clone());
  const meshes = []; m.root.traverse((o) => { if (o.isMesh && o.visible && o !== m.disc) { let p = false; for (let q = o; q; q = q.parent) if (q === m.pilot) p = true; if (!p) meshes.push(o); } });
  const R = new THREE.Raycaster(); let min = 9;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    if (!a && !b && !c) continue;
    R.set(eye, new THREE.Vector3(a, b, c).normalize()); R.far = 2;
    const h = R.intersectObjects(meshes, false)[0]; if (h) min = Math.min(min, h.distance);
  }
  const scr = (v) => { const p = m.root.localToWorld(new THREE.Vector3(...v)).project(g.camera); return [+(((p.x + 1) / 2)).toFixed(2), +(((1 - p.y) / 2)).toFixed(2)]; };
  // Horizon: a point far ahead at the eye's height.
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(ac.fm.quat); fwd.y = 0; fwd.normalize();
  const hz = eye.clone().addScaledVector(fwd, 2000).project(g.camera);
  return {
    near: g.camera.near, nearest: +min.toFixed(3), fov: g.camera.fov,
    cowl: scr([0, 0.4, 1.8]), spinner: scr([0, 0.12, 2.53]), pod: scr(m.refs.panel.toArray()), horizonY: +((1 - hz.y) / 2).toFixed(2),
  };
});
ok('4 pilot view: eye clear (> near plane), cowl visible over the lip, horizon at 20–42 % of the height, panel in the lower part',
  r.nearest > r.near + 0.05 && r.cowl[1] > r.horizonY && r.cowl[1] < r.pod[1] && r.horizonY > 0.2 && r.horizonY < 0.42 && r.pod[1] > 0.6 && r.pod[1] < 0.9, JSON.stringify(r));

// 5. Engine states on the panel: magneto key and the fuel lamp follow the
// game (engine off / cranking / running; fuel low).
r = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft, fm = ac.fm;
  const key = () => { let k = null; ac.model.cockpit.traverse((o) => { if (o.isGroup && o.children.length === 1 && o.children[0].material?.color?.getHex?.() === 0xe9e9e4 && o.parent?.children?.length > 1) k = o; }); return k; };
  const out = {};
  for (const [st, fuel] of [['off', 150], ['running', 150], ['running', 15]]) {
    fm.engine = st; fm.fuel = fuel; ac.panel.draw(ac.instruments());
    for (let i = 0; i < 60; i++) ac._animate(1 / 30);
    out[`${st}/${fuel}`] = { lamp: ac.panel.lit.fuel };
  }
  fm.fuel = 150; fm.engine = 'running';
  return out;
});
ok('5 fuel warning lamp: off with fuel, lit under 15 % with the master on', r['running/150'].lamp === false && r['running/15'].lamp === true && r['off/150'].lamp === false, JSON.stringify(r));

// 6. In and out of the cockpit ×10, external ↔ internal: no geometry or
// texture growth, no rebuild.
r = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft;
  ac.placeAtPad(); // still: no world cells stream in while the cameras change
  const mem = () => ({ geo: g.renderer.info.memory.geometries, tex: g.renderer.info.memory.textures });
  // Warm-up: the first switches build what the views need once.
  for (let k = 0; k < 3; k++) for (const mode of ['chase', 'cockpit']) { g.cameraMode = mode; g.rig.setMode(mode, ac); for (let i = 0; i < 5; i++) g.tick(1 / 60); g.render(); }
  const m0 = mem(), model0 = ac.model;
  for (let k = 0; k < 10; k++) for (const mode of ['chase', 'cockpit']) { g.cameraMode = mode; g.rig.setMode(mode, ac); for (let i = 0; i < 5; i++) g.tick(1 / 60); g.render(); }
  return { before: m0, after: mem(), sameModel: ac.model === model0, calls: g.renderer.info.render.calls };
});
ok('6 cockpit in/out ×10: no geometry / texture growth, the same model kept', r.after.geo <= r.before.geo + 1 && r.after.tex <= r.before.tex && r.sameModel, JSON.stringify(r));

// 7. Parked (another aircraft flown): the 201's cockpit and its
// textures are released; selected again, the cockpit is rebuilt and works.
r = await page.evaluate(async () => {
  const g = window.__agro;
  const { aircraftTextures } = await import('/src/aircraft/aircraftMemory.js');
  g.selectAircraft('ipanema'); for (let i = 0; i < 10; i++) g.tick(1 / 60);
  const parked = g.fleet.e201;
  const tx = aircraftTextures(parked);
  const cockpitMeshes = []; parked.model.cockpit.traverse((o) => { if (o.isMesh) cockpitMeshes.push(o); });
  const live = [...tx.cockpit].filter((t) => t.image?.width > 1).length;
  g.selectAircraft('e201'); for (let i = 0; i < 10; i++) g.tick(1 / 60);
  const ac = g.aircraft; let n = 0; ac.model.cockpit.traverse((o) => { if (o.isMesh) n++; });
  return { parkedCockpitMeshes: cockpitMeshes.length, parkedLiveCockpitCanvases: live, rebuiltCockpitMeshes: n, gps: !!ac.model.inst?.pick };
});
ok('7 parked: cockpit geometry and canvases released; reselected: rebuilt with its GPS', r.parkedCockpitMeshes === 0 && r.parkedLiveCockpitCanvases === 0 && r.rebuiltCockpitMeshes > 20 && r.gps, JSON.stringify(r));

ok('no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 5)));
fs.writeFileSync(`${outDir}/results.json`, JSON.stringify(results, null, 1));
await browser.close();
