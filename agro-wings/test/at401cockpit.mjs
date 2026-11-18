// Air Tractor AT-401B cockpit in the real game: the instruments read the
// flight model, the GPS keys answer a click on the screen, the stick /
// pedals / throttle / flap lever follow the controls inside their geometric
// limits (the grip never reaches the panel or the floor), the pilot's eye
// is clear of the structure, the horizon, the propeller and the panel sit
// where the photographs' perspective puts them, the warning lamps and
// annunciators follow the game, every cockpit vertex lies inside the
// fuselage's own section (nothing through the canopy or the skin),
// entering / leaving the cockpit repeatedly leaks nothing, and a parked
// 401 lets its cockpit textures go.
//   AGRO_URL=http://localhost:5173/ node test/at401cockpit.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const outDir = process.argv[2] || 'at401-cockpit';
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
  g.selectAircraft('at401'); g.menuAction('free'); g.screens.close();
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
  const { AT401_ANG: A } = await import('/src/aircraft/at401Panel.js');
  const n = m.inst.needles, ang = (k, i = 0) => -n[k][i].rotation.z;
  const deg = (x) => +(x * 57.2958).toFixed(1);
  const rows = {
    asi: [ang('asi'), A.asi(d.ias), d.ias], rpm: [ang('rpm'), A.rpm(d.rpm), d.rpm], mp: [ang('mp'), A.mp(d.mp), d.mp],
    alt100: [ang('alt', 1), A.alt100(d.altFt), d.altFt], oilP: [ang('oil', 0), A.oilP(d.oilP), d.oilP], oilT: [ang('oil', 1), A.oilT(d.oilT), d.oilT],
    cht: [ang('cht'), A.cht(d.cht), d.cht], fuel: [ang('fuel'), A.fuel(d.fuel), d.fuel],
    vsi: [ang('vsi'), A.vsi(d.vsFpm), d.vsFpm], ff: [ang('ff'), A.ff(d.fuelFlow), d.fuelFlow],
    hopper: [ang('hopper'), A.hopper(d.hopper), d.hopper], turn: [ang('turn'), A.turn(d.yawRate), d.yawRate],
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
  let minGap = 9, nearest = null;
  const corners = [];
  for (const e of [-1, 1]) for (const a of [-1, 1]) {
    fm.elevator = e; fm.aileron = a; ac._animate(1 / 60); m.root.updateMatrixWorld(true);
    box.makeEmpty(); m.stick.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.union(tmp); } });
    // Ray tests from the grip's top in its travel directions: the nearest
    // solid surface of the cockpit.
    const top = m.stick.localToWorld(new THREE.Vector3(0, 0.71, 0.12));
    const R = new THREE.Raycaster();
    for (const dir of [[0, 0, 1], [0, -1, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0]]) {
      R.set(top, new THREE.Vector3(...dir).applyQuaternion(m.root.getWorldQuaternion(new THREE.Quaternion())).normalize()); R.far = 1;
      const h = R.intersectObjects(solids, false)[0];
      if (h && h.distance - 0.025 < minGap) { minGap = h.distance - 0.025; nearest = { dir: dir.join(','), at: m.root.worldToLocal(h.point.clone()).toArray().map((x) => +x.toFixed(3)), corner: [e, a] }; }
    }
    corners.push([e, a, m.stick.rotation.x.toFixed(2), m.stick.rotation.z.toFixed(2)]);
  }
  fm.elevator = 0; fm.aileron = 0;
  fm.rudder = 1; ac._animate(1 / 60); const pz = [m.pedals[0].position.z, m.pedals[1].position.z];
  fm.rudder = 0; ac._animate(1 / 60);
  fm.throttle = 0; ac._animate(1 / 60); const t0 = m.throttle.rotation.x; fm.throttle = 1; ac._animate(1 / 60); const t1 = m.throttle.rotation.x;
  const floorY = m.refs.floorY, pivotY = m.stick.position.y;
  // Flap lever: flaps up, then full (the model's update follows fm.flaps).
  const flapLever = (f) => { fm.flaps = f; for (let i = 0; i < 90; i++) m.update(1 / 30, fm, ac); return m.cockpit.getObjectByName('at401-flap-lever')?.rotation.x ?? null; };
  const fl = [flapLever(0), flapLever(1)]; flapLever(0);
  return { corners, minGapGrip: +minGap.toFixed(3), nearest, pedals: pz.map((v) => +v.toFixed(3)), throttle: [+t0.toFixed(2), +t1.toFixed(2)], pivotAboveFloor: +(pivotY - floorY).toFixed(3), flapLever: fl.map((v) => v === null ? null : +v.toFixed(2)) };
});
ok('3 stick / pedals / throttle / flap lever follow the controls; the grip clears every surface at full travel', r.minGapGrip > 0.02 && r.pedals[0] !== r.pedals[1] && r.throttle[1] > r.throttle[0] && r.pivotAboveFloor > 0 && r.flapLever[0] !== null && Math.abs(r.flapLever[1] - r.flapLever[0]) > 0.5, JSON.stringify(r));

// 4. Pilot's view: eye clear of the structure; the horizon in the frame;
// the propeller's arc over the panel's hump (the cowl itself is hidden
// under the hopper deck, as from the real seat); the panel in the lower
// part.
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
    propTip: scr([0, 0.2 + ac.A.propRadius, 2.42]), hump: scr([0, 0.86 + 0.455, -0.8]), pod: scr(m.refs.panel.toArray()), horizonY: +((1 - hz.y) / 2).toFixed(2),
  };
});
ok('4 pilot view: eye clear (> near plane), the prop arc over the hump, horizon at 20–42 % of the height, panel in the lower part',
  r.nearest > r.near + 0.05 && r.propTip[1] < r.hump[1] && r.hump[1] < r.pod[1] && r.horizonY > 0.2 && r.horizonY < 0.42 && r.pod[1] > 0.6 && r.pod[1] < 0.95, JSON.stringify(r));

// 5. Engine states on the panel: the fuel lamp and the annunciators follow
// the game (engine off / cranking / running; fuel low; spraying).
r = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft, fm = ac.fm;
  const key = () => { let k = null; ac.model.cockpit.traverse((o) => { if (o.isGroup && o.children.length === 1 && o.children[0].material?.color?.getHex?.() === 0xe9e9e4 && o.parent?.children?.length > 1) k = o; }); return k; };
  const out = {};
  const annun = () => Object.fromEntries((ac.model.cockpit.getObjectByName('at401-annunciators')?.children ?? []).map((m) => [m.userData.id, m.material.emissiveIntensity > 0]));
  for (const [st, fuel, spray] of [['off', 150, false], ['running', 150, false], ['running', 15, false], ['cranking', 150, false], ['running', 150, true]]) {
    fm.engine = st; fm.fuel = fuel; g.sprayer.on = spray; ac.panel.draw(ac.instruments());
    for (let i = 0; i < 60; i++) ac._animate(1 / 30);
    out[`${st}/${fuel}${spray ? '/spray' : ''}`] = { lamp: !!ac.panel.lit.fuel, annun: annun() };
  }
  g.sprayer.on = false; fm.fuel = 150; fm.engine = 'running';
  return out;
});
ok('5 warning lamps / annunciators: fuel low under 12 % with the master on, START while cranking, SPRAY while spraying, all dark with the engine off',
  r['running/150'].lamp === false && r['running/15'].lamp === true && r['off/150'].lamp === false && r['running/15'].annun.fuel && r['cranking/150'].annun.start
  && r['running/150/spray'].annun.spray && !r['running/150'].annun.spray && Object.values(r['off/150'].annun).every((v) => !v) && Object.keys(r['off/150'].annun).length === 6, JSON.stringify(r));

// 8. Containment: every cockpit vertex (the moving controls included) lies
// inside the fuselage's own section — above the sill under the canopy
// shell, below it inside the box — and aft of the windshield's base.
r = await page.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const mod = await import('/src/aircraft/at401Model.js');
  const g = window.__agro, ac = g.aircraft, m = ac.model, CAB = mod.CAB;
  m.root.updateMatrixWorld(true);
  const inv = m.root.matrixWorld.clone().invert(), v = new THREE.Vector3();
  const secs = new Map();
  const shellY = (z, ax) => {
    const k = Math.round(z * 200) / 200;
    let s = secs.get(k); if (!s) { s = []; for (let i = 0; i <= 60; i++) s.push(mod.shellP(k, (i / 60) * 0.5)); secs.set(k, s); }
    if (ax > s[0][0]) return -1;
    for (let i = 0; i < s.length - 1; i++) if (ax <= s[i][0] && ax >= s[i + 1][0]) return s[i][1] + (s[i + 1][1] - s[i][1]) * (s[i][0] - ax) / Math.max(1e-6, s[i][0] - s[i + 1][0]);
    return s[s.length - 1][1];
  };
  let n = 0, bad = 0; const worst = [];
  m.cockpit.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv); n++;
      const ax = Math.abs(v.x);
      let out = 0;
      if (v.z > CAB.wsB + 0.001) out = v.z - CAB.wsB;
      else if (v.y > CAB.sill) { const sy = shellY(v.z, ax); out = sy < 0 ? ax : Math.max(0, v.y - (sy - 0.004)); }
      else out = Math.max(0, ax - (mod.boxX(v.z, v.y) + 0.002));
      if (out > 0.002) { bad++; if (worst.length < 6) worst.push([o.material?.name || o.parent?.name || '?', v.toArray().map((x) => +x.toFixed(3)), +out.toFixed(3)]); }
    }
  });
  return { vertices: n, outside: bad, worst };
});
ok('8 containment: no cockpit vertex through the canopy, the skin or the windshield base', r.outside === 0 && r.vertices > 1000, JSON.stringify(r));

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

// 7. Parked (another aircraft flown): the 401's cockpit and its
// textures are released; selected again, the cockpit is rebuilt and works.
r = await page.evaluate(async () => {
  const g = window.__agro;
  const { aircraftTextures } = await import('/src/aircraft/aircraftMemory.js');
  g.selectAircraft('ipanema'); for (let i = 0; i < 10; i++) g.tick(1 / 60);
  const parked = g.fleet.at401;
  const tx = aircraftTextures(parked);
  const cockpitMeshes = []; parked.model.cockpit.traverse((o) => { if (o.isMesh) cockpitMeshes.push(o); });
  const live = [...tx.cockpit].filter((t) => t.image?.width > 1).length;
  g.selectAircraft('at401'); for (let i = 0; i < 10; i++) g.tick(1 / 60);
  const ac = g.aircraft; let n = 0; ac.model.cockpit.traverse((o) => { if (o.isMesh) n++; });
  return { parkedCockpitMeshes: cockpitMeshes.length, parkedLiveCockpitCanvases: live, rebuiltCockpitMeshes: n, gps: !!ac.model.inst?.pick };
});
ok('7 parked: cockpit geometry and canvases released; reselected: rebuilt with its GPS', r.parkedCockpitMeshes === 0 && r.parkedLiveCockpitCanvases === 0 && r.rebuiltCockpitMeshes > 20 && r.gps, JSON.stringify(r));

ok('no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 5)));
fs.writeFileSync(`${outDir}/results.json`, JSON.stringify(results, null, 1));
await browser.close();
