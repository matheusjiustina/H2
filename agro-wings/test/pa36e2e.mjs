// Piper PA-36 Pawnee Brave in the real game (browser): the functional checks
// of Prompt 01 — hangar/menu card, both paint schemes, dimensions, open
// faces / wrong winding (back faces seen from outside), cabin volume,
// intersections (deployed flaps vs the boom, wheels vs the wing), wheels on
// the ground, parked stability, propeller pivot, spray points and spraying,
// cockpit camera clearance, the fleet parked without overlaps, memory over
// repeated switches and paint changes, the model's draw cost against the
// AgTruck's, page errors.
//   AGRO_URL=http://localhost:5173/ node test/pa36e2e.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const outDir = process.argv[2] || 'pa36-e2e';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(600000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (res) => { if (res.status() >= 400) console.log('   HTTP', res.status(), res.url()); });
await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=medium', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
const results = {};
const ok = (k, v, info) => { results[k] = { pass: !!v, info }; console.log(v ? 'PASS' : 'FAIL', k, info ?? ''); };
const shot = async (n) => { await page.waitForTimeout(80); await page.screenshot({ path: `${outDir}/${n}.png` }); };

// 1. Hangar / menu: the aircraft card, the paint selector, the office name.
let r = await page.evaluate(async () => {
  const g = window.__agro;
  const card = document.querySelector('[data-ac="pa36"]');
  const office = await import('/src/ui/office.js').catch(() => null);
  return { card: !!card, text: card?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120), fleet: Object.keys(g.fleet) };
});
ok('1 hangar/menu: Brave card in the aircraft selection, in the fleet', r.card && r.fleet.includes('pa36'), r.text);
await page.evaluate(() => { const st = document.createElement('style'); st.id = 'hideui'; st.textContent = '.overlay.title { display: none !important; }'; document.head.appendChild(st); });
r = await page.evaluate(() => {
  const g = window.__agro;
  const sel = g.selectAircraft('pa36');
  g.menuAction('free'); g.screens.close();
  g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
  g.frozen = true;
  return { sel, id: g.aircraftId, reg: g.aircraft.type.reg, name: g.aircraft.type.name };
});
ok('1 select the Brave, free flight on the pad', r.id === 'pa36', JSON.stringify(r));

// 2. Both paint schemes through the game setting (saved), textures swapped.
r = await page.evaluate(() => {
  const g = window.__agro, m = g.aircraft.model;
  const out = [];
  for (const k of [1, 0, 1]) {
    const map0 = m.M.livery.map;
    g.setAircraftOption('pa36Livery', k);
    out.push({ k, livery: m.livery, setting: g.settings.pa36Livery, swapped: m.M.livery.map !== map0 || k === 0 && out.length === 0 });
  }
  return out;
});
ok('2 paint schemes A/B switch and persist', r.every((o) => o.livery === o.k && o.setting === o.k), JSON.stringify(r));
for (const k of [0, 1]) {
  await page.evaluate((k) => {
    const g = window.__agro, ac = g.aircraft;
    g.setAircraftOption('pa36Livery', k);
    ac.fm.settleOnGround(-352, -64, Math.PI / 2, ac.env);
    for (let i = 0; i < 60; i++) g.tick(1 / 60);
    g.cameraMode = 'free';
    g.camera.position.set(-352 + 9, ac.fm.pos.y + 2.2, -64 + 11); g.camera.lookAt(-352, ac.fm.pos.y - 0.3, -64);
    g.camera.fov = 45; g.camera.near = 0.3; g.camera.updateProjectionMatrix();
    for (let i = 0; i < 6; i++) g.world.update(g.camera, g.camera.position, 1 / 60, g.time);
    g.render();
  }, k);
  await shot(`02_livery_${k ? 'B' : 'A'}`);
}
await page.evaluate(() => window.__agro.setAircraftOption('pa36Livery', 0));

// 3, 7, 8. On the ground: dimensions from the rendered geometry, wheels on
// the ground, parked stability.
r = await page.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const g = window.__agro, ac = g.aircraft, m = ac.model, fm = ac.fm;
  fm.settleOnGround(-352, -64, Math.PI / 2, ac.env);
  fm.parkBrake = true;
  for (let i = 0; i < 60; i++) g.tick(1 / 60);
  const p0 = fm.pos.clone();
  for (let i = 0; i < 60 * 10; i++) g.tick(1 / 60);
  m.root.updateMatrixWorld(true);
  // Bounds of the airframe (no prop disc, no wire antennas): heading east,
  // so the span runs along world z and the length along world x.
  const box = new THREE.Box3(), b2 = new THREE.Box3();
  // (The blades are left out — one standing up would set the height — and
  // so are the fine details: the whip antenna, the wires.)
  const skip = (o) => { for (let q = o; q; q = q.parent) if (q === m.blades || q === m.disc || q.isLOD) return true; return false; };
  m.root.traverse((o) => { if (o.isMesh && o.visible && !skip(o)) { o.geometry.computeBoundingBox(); b2.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.union(b2); } });
  const gy = g.world.terrain.heightAt(fm.pos.x, fm.pos.z);
  const wheels = ['mainL', 'mainR', 'tail'].map((k) => {
    const gg = m.gear[k], R = ac.A.gear.find((q) => q.name === k).radius;
    const w = gg.wheel.getWorldPosition(new THREE.Vector3());
    return { k, gap: +(w.y - R - g.world.terrain.heightAt(w.x, w.z)).toFixed(3) };
  });
  const att = fm.constructor.attitude(fm, {});
  return {
    span: +(box.max.z - box.min.z).toFixed(3), length: +(box.max.x - box.min.x).toFixed(3), height: +(box.max.y - gy).toFixed(3),
    wheels, onGround: fm.out.wheelsOnGround, drift: +(fm.pos.distanceTo(p0) * 100).toFixed(2), pitch: +(att.pitch * 57.2958).toFixed(2),
  };
});
ok('3 dimensions from the geometry: span 11.8, length 8.2, height ≈ 2.3 m', Math.abs(r.span - 11.8) < 0.08 && Math.abs(r.length - 8.2) < 0.12 && r.height > 2.2 && r.height < 2.5, JSON.stringify({ span: r.span, length: r.length, height: r.height }));
ok('7 wheels on the ground (visual tyre bottoms within 3 cm of the terrain)', r.onGround === 3 && r.wheels.every((w) => Math.abs(w.gap) < 0.03), JSON.stringify(r.wheels));
ok('8 parked stability: 10 s with the brake, three-point ≈ 9°, drift < 5 cm', r.drift < 5 && r.pitch > 7.5 && r.pitch < 10, JSON.stringify({ drift_cm: r.drift, pitch: r.pitch }));

// 4. Open faces / wrong winding: the model drawn twice in flat white against
// black, once with every face double-sided and once with front faces only
// (the glass double-sided in both). Pixels only the first draws are back
// faces seen from outside: a hole or a face turned the wrong way.
r = await page.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const g = window.__agro, ac = g.aircraft, m = ac.model;
  ac.placeAirborne(300, -270, Math.PI / 2, 300, 0);
  for (let i = 0; i < 3; i++) g.tick(1 / 60);
  m.pilot.visible = false; m.cockpit.visible = true; m.disc.visible = false;
  m.root.traverse((o) => { if (o.isLOD) { o.autoUpdate = false; o.levels.forEach((l, i) => { l.object.visible = i === 0; }); } });
  m.root.updateMatrixWorld(true);
  const W = 960, H = 540;
  const rt = new THREE.WebGLRenderTarget(W, H);
  const cam = new THREE.PerspectiveCamera(30, W / H, 1, 200);
  const both = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const front = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.FrontSide });
  const glassy = (mat) => mat && (mat.transparent || mat.side === THREE.DoubleSide);
  const meshes = []; m.root.traverse((o) => { if (o.isMesh) meshes.push([o, o.material]); });
  const draw = (useFront) => {
    for (const [o, mat] of meshes) o.material = useFront && !glassy(mat) ? front : both;
    const rd = g.renderer, bg = g.scene.background;
    rd.setRenderTarget(rt); rd.setClearColor(0x000000, 1); rd.clear();
    rd.render(m.root, cam);
    rd.setRenderTarget(null);
    const px = new Uint8Array(W * H * 4); rd.readRenderTargetPixels(rt, 0, 0, W, H, px);
    return px;
  };
  const c = m.root.localToWorld(new THREE.Vector3(0, -0.2, -1.6));
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 0.6, 1], [-1, 0.6, 1], [1, 0.6, -1], [-1, -0.6, -1], [1, -0.6, 1], [-1, 0.4, -0.2]];
  const q = m.root.getWorldQuaternion(new THREE.Quaternion());
  const out = []; let worst = null;
  for (const d of dirs) {
    const v = new THREE.Vector3(...d).normalize().applyQuaternion(q);
    cam.position.copy(c).addScaledVector(v, 17); cam.up.set(0, 1, 0); if (Math.abs(v.y) > 0.9) cam.up.set(1, 0, 0);
    cam.lookAt(c); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const A = draw(false), B = draw(true);
    let n = 0, sil = 0; const at = [];
    for (let i = 0; i < A.length; i += 4) { if (A[i] > 128) { sil++; if (B[i] < 128) { n++; if (at.length < 6) at.push(i / 4); } } }
    // What is seen there: the first surface hit (double-sided), by material.
    const names = new Map([...Object.entries(m.M).map(([k, v]) => [v, k]), ...m.bladeMats.map((v) => [v, 'blade'])]);
    const R = new THREE.Raycaster(), what = [];
    for (const [o, mat] of meshes) o.material = both;
    for (const i of at) {
      const x = i % W, y = Math.floor(i / W);
      R.setFromCamera(new THREE.Vector2((x + 0.5) / W * 2 - 1, (y + 0.5) / H * 2 - 1), cam);
      const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
      const h = R.intersectObjects(meshes.map((q) => q[0]).filter(shown), false)[0];
      if (h) { const orig = meshes.find((q) => q[0] === h.object)[1]; what.push(`${names.get(orig) ?? h.object.name ?? '?'}@${m.root.worldToLocal(h.point.clone()).toArray().map((v) => v.toFixed(2)).join(',')}`); }
    }
    out.push({ d: d.join(','), holes: n, silhouette: sil, pct: +((100 * n) / Math.max(1, sil)).toFixed(3), what });
    if (!worst || n > worst.n) {
      // Image of the worst view (holes in red).
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const cx = cv.getContext('2d'), im = cx.createImageData(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = ((H - 1 - y) * W + x) * 4, t = (y * W + x) * 4; const a = A[s] > 128, b = B[s] > 128; im.data[t] = a && !b ? 255 : a ? 120 : 0; im.data[t + 1] = a && !b ? 0 : a ? 120 : 0; im.data[t + 2] = a && !b ? 0 : a ? 120 : 0; im.data[t + 3] = 255; }
      cx.putImageData(im, 0, 0); worst = { n, png: cv.toDataURL('image/png'), d: d.join(',') };
    }
  }
  for (const [o, mat] of meshes) o.material = mat;
  m.disc.visible = true;
  m.root.traverse((o) => { if (o.isLOD) o.autoUpdate = true; });
  rt.dispose(); both.dispose(); front.dispose();
  return { out, worst: { n: worst.n, d: worst.d, png: worst.png } };
});
fs.writeFileSync(`${outDir}/04_backfaces_worst.png`, Buffer.from(r.worst.png.split(',')[1], 'base64'));
const totalHoles = r.out.reduce((s, o) => s + o.holes, 0), maxPct = Math.max(...r.out.map((o) => o.pct));
ok('4 no open faces / wrong winding (back faces seen from outside, 12 views)', maxPct < 0.05, JSON.stringify({ totalHoles, maxPct, worst: r.worst.d }));
console.log('   per view:', r.out.map((o) => `${o.d}:${o.holes}/${o.silhouette}`).join('  '));
for (const o of r.out) if (o.what.length) console.log('   ', o.d, o.what.join('  '));

// 5. Cabin volume (reference frame, from the model's own sections).
r = await page.evaluate(async () => {
  const mod = await import('/src/aircraft/pa36Model.js');
  const C = mod.PA36_CABIN, hx = mod.pa36HalfX;
  const z = C.eye[2];
  return {
    shoulderWidth: +(2 * hx(-1.6, 0.42)).toFixed(3), hipWidth: +(2 * hx(-1.6, -0.1)).toFixed(3), floorToRoof: +(C.roof[1] - C.floorY).toFixed(3),
    eyeToRoof: +(C.roof[1] - C.eye[1]).toFixed(3), eyeToPanel: +Math.hypot(C.panel[1] - C.eye[1], C.panel[2] - C.eye[2]).toFixed(3),
    seatToStick: +Math.hypot(C.stick[1] - C.seat[1], C.stick[2] - C.seat[2]).toFixed(3), seatToPedals: +(C.pedals[2] - C.seat[2]).toFixed(3),
    cabinLength: +(C.wsBaseZ - C.rearFrameZ).toFixed(3), z,
  };
});
ok('5 cabin volume: single-seat cabin with room for the pilot (shoulders ≥ 0.75 m, eye 0.2–0.35 m under the roof, panel 0.6–0.9 m from the eye)',
  r.shoulderWidth >= 0.75 && r.eyeToRoof > 0.2 && r.eyeToRoof < 0.35 && r.eyeToPanel > 0.6 && r.eyeToPanel < 0.95, JSON.stringify(r));

// 6. Intersections: full flaps vs the spray boom; the main wheels at full
// compression vs the wing's lower surface.
r = await page.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const g = window.__agro, ac = g.aircraft, m = ac.model, fm = ac.fm;
  ac.placeAirborne(300, -270, Math.PI / 2, 300, 40);
  fm.flaps = fm.flapsCmd = 1;
  ac._animate(1 / 60);
  m.root.updateMatrixWorld(true);
  const toLocal = (v) => m.root.worldToLocal(v.clone());
  // Boom segment (body frame) from the nozzles: the outermost on each side.
  const nz = m.nozzles;
  let minD = 9;
  for (const side of [1, -1]) {
    const pts = nz.filter((p) => Math.sign(p.x) === side).sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
    const a = pts[0].clone().add(new THREE.Vector3(0, 0.12, 0.03)), b = pts[pts.length - 1].clone().add(new THREE.Vector3(0, 0.12, 0.03));
    const seg = new THREE.Line3(a, b), tmp = new THREE.Vector3();
    const flap = m.flaps[side > 0 ? 0 : 1];
    flap.traverse((o) => {
      if (!o.isMesh) return;
      const p = o.geometry.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i += 3) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); const l = toLocal(v); seg.closestPointToPoint(l, true, tmp); minD = Math.min(minD, tmp.distanceTo(l) - 0.024); }
    });
  }
  fm.flaps = fm.flapsCmd = 0; ac._animate(1 / 60);
  // Wheel top at full travel vs the wing's lower surface above it (reference frame).
  const mod = await import('/src/aircraft/pa36Model.js');
  const cfg = ac.A.gear.find((q) => q.name === 'mainL');
  const ref = (p) => { const S = Math.sin(mod.PA36_STANCE), Cc = Math.cos(mod.PA36_STANCE); return [p[0], p[1] * Cc + p[2] * S, -p[1] * S + p[2] * Cc]; };
  const pr = ref(cfg.p);
  const wheelTop = pr[1] + 2 * cfg.radius + cfg.travel;
  const wingLow = mod.pa36WingY(pr[0], pr[2]) - 0.11;
  return { flapBoomClear: +minD.toFixed(3), wheelTop: +wheelTop.toFixed(3), wingLow: +wingLow.toFixed(3) };
});
ok('6 no intersections: full flaps clear the boom, compressed wheels clear the wing', r.flapBoomClear > 0.02 && r.wheelTop < r.wingLow - 0.05, JSON.stringify(r));

// 9. Propeller pivot: both blade tips on the shaft axis' circle (radius =
// propRadius) at any rotation; the spinner tip on the axis.
r = await page.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const g = window.__agro, ac = g.aircraft, m = ac.model;
  m.root.updateMatrixWorld(true);
  const axis0 = m.prop.localToWorld(new THREE.Vector3(0, 0, 0)), axis1 = m.prop.localToWorld(new THREE.Vector3(0, 0, 1));
  const ax = new THREE.Line3(axis0, axis1), tmp = new THREE.Vector3();
  const radii = [];
  for (const rot of [0, 0.7, 1.9, 3.3]) {
    m.blades.rotation.z = rot; m.root.updateMatrixWorld(true);
    m.blades.children.forEach((bl) => {
      // The farthest vertex of each blade from the axis.
      let best = 0;
      bl.traverse((o) => { if (!o.isMesh) return; const p = o.geometry.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); ax.closestPointToPoint(v, false, tmp); best = Math.max(best, tmp.distanceTo(v)); } });
      radii.push(+best.toFixed(3));
    });
  }
  const spinTip = m.root.worldToLocal(m.prop.localToWorld(new THREE.Vector3(0, 0, 0.28)));
  return { radii, R: ac.A.propRadius, spinTip: spinTip.toArray().map((v) => +v.toFixed(3)) };
});
ok('9 propeller pivot on the shaft axis (blade tips at the prop radius at every angle)', r.radii.every((x) => Math.abs(x - r.R) < 0.02), JSON.stringify(r));

// 10. Spray points and spraying.
r = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft, m = ac.model;
  const nz = m.nozzles;
  const L = nz.filter((p) => p.x > 0).length, R = nz.filter((p) => p.x < 0).length;
  const maxX = Math.max(...nz.map((p) => Math.abs(p.x)));
  ac.placeAirborne(300, -280, Math.PI / 2, 4, 50); ac.fm.hopper = 600; ac.fm.updateMass();
  g.sprayer.toggle();
  for (let i = 0; i < 120; i++) g.tick(1 / 60);
  const res = { n: nz.length, L, R, maxX: +maxX.toFixed(2), on: g.sprayer.on, flow: g.sprayer.flowNow, hopper: +ac.fm.hopper.toFixed(1), boom: ac.type.spray.boom.map((v) => +v.toFixed(2)) };
  g.sprayer.on = false;
  return res;
});
ok('10 spray points: 17 nozzles a side on the booms, spraying empties the hopper', r.L === 17 && r.R === 17 && r.on && r.flow > 0 && r.hopper < 600, JSON.stringify(r));
for (const mode of ['chase', 'cockpit']) {
  await page.evaluate((mode) => { const g = window.__agro, ac = g.aircraft; ac.placeAirborne(300, -280, Math.PI / 2, 5, 50); g.sprayer.on = true; g.cameraMode = mode; g.rig.setMode(mode, ac); for (let i = 0; i < 40; i++) g.tick(1 / 60); ac.panel.draw(ac.instruments()); g.render(); }, mode);
  await shot(`10_spraying_${mode}`);
}
await page.evaluate(() => { window.__agro.sprayer.on = false; });

// 11. Cockpit camera: nothing of the airframe nearer than the near plane
// around the eye (rays in 26 directions; the pilot figure is hidden there).
r = await page.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const g = window.__agro, ac = g.aircraft, m = ac.model;
  ac.placeAirborne(300, -280, Math.PI / 2, 80, 45);
  g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac);
  for (let i = 0; i < 20; i++) g.tick(1 / 60);
  m.root.updateMatrixWorld(true);
  const eye = m.root.localToWorld(m.eye.clone());
  const meshes = []; m.root.traverse((o) => { if (o.isMesh && o.visible && !(m.pilot && isIn(o, m.pilot)) && o !== m.disc) meshes.push(o); });
  function isIn(o, p) { for (let q = o; q; q = q.parent) if (q === p) return true; return false; }
  const R = new THREE.Raycaster(); let min = 9, at = null;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    if (!a && !b && !c) continue;
    const d = new THREE.Vector3(a, b, c).normalize();
    R.set(eye, d); R.far = 2;
    const h = R.intersectObjects(meshes, false)[0];
    if (h && h.distance < min) { min = h.distance; at = [a, b, c].join(','); }
  }
  const camEye = g.camera.position.distanceTo(eye);
  return { near: g.camera.near, minDist: +min.toFixed(3), dir: at, cameraAtEye: +camEye.toFixed(3) };
});
ok('11 cockpit camera clear of the airframe (nearest surface beyond the near plane)', r.minDist > r.near + 0.02, JSON.stringify(r));
await shot('11_cockpit');

// Fleet parked (a helicopter flown): the Brave on its own spot, no overlaps.
r = await page.evaluate(() => {
  const g = window.__agro;
  g.selectAircraft('r44');
  for (let i = 0; i < 30; i++) g.tick(1 / 60);
  const P = Object.values(g.fleet).filter((a) => a.parked && a.kind !== 'heli').map((a) => ({ id: a.type.id, x: +a.fm.pos.x.toFixed(1), z: +a.fm.pos.z.toFixed(1), span: a.A.span ?? 0, len: 10 }));
  const clash = [];
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const a = P[i], b = P[j];
    if (Math.abs(a.x - b.x) < 11 && Math.abs(a.z - b.z) < (a.span + b.span) / 2 + 1) clash.push(`${a.id}/${b.id}`);
  }
  const pa = P.find((p) => p.id === 'pa36');
  return { pa, clash, hits: Object.values(g.fleet).some((a) => a.state !== 'ok') };
});
ok('fleet parked: the Brave on parking9, no overlapping spans, nobody damaged', r.pa && Math.abs(r.pa.x + 441) < 1.5 && Math.abs(r.pa.z + 104) < 1.5 && r.clash.length === 0 && !r.hits, JSON.stringify(r));
await page.evaluate(() => { const g = window.__agro; g.frozen = true; g.noRender = true; g.cameraMode = 'free'; g.camera.position.set(-420, 55, -165); g.camera.lookAt(-440, 0, -80); g.camera.near = 0.3; g.camera.fov = 55; g.camera.updateProjectionMatrix(); for (let i = 0; i < 6; i++) g.world.update(g.camera, g.camera.position, 1 / 60, g.time); g.render(); });
await shot('12_fleet_parked');

// 13. Memory: switch aircraft and paint repeatedly.
r = await page.evaluate(() => {
  const g = window.__agro, mem = () => ({ geo: g.renderer.info.memory.geometries, tex: g.renderer.info.memory.textures });
  const seq = ['pa36', 'ipanema', 'pa36', 'a188', 'pa36'];
  for (const id of seq) { g.selectAircraft(id); for (let i = 0; i < 10; i++) g.tick(1 / 60); g.render(); }
  const m0 = mem();
  for (let k = 0; k < 3; k++) for (const id of seq) { g.selectAircraft(id); for (let i = 0; i < 10; i++) g.tick(1 / 60); g.render(); }
  const m1 = mem();
  for (let k = 0; k < 10; k++) { g.setAircraftOption('pa36Livery', k % 2); g.render(); }
  g.setAircraftOption('pa36Livery', 0); g.render();
  const m2 = mem();
  return { afterWarmup: m0, afterSwitches: m1, afterPaints: m2, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null };
});
ok('13 memory: no growth over 15 switches and 10 paint changes', r.afterSwitches.geo <= r.afterWarmup.geo + 2 && r.afterSwitches.tex <= r.afterWarmup.tex + 2 && r.afterPaints.tex <= r.afterSwitches.tex + 1, JSON.stringify(r));

// 14. Draw cost of the model against the AgTruck's (same counting): meshes
// (≈ draw calls), triangles near (every LOD) and far (fine parts dropped),
// texture pixels of its own canvases. Each model is built afresh from its
// type (a parked aircraft is kept light — cockpit released, stage-1
// memory — so the live fleet would not compare like with like).
r = await page.evaluate(() => {
  const g = window.__agro;
  const cost = (id) => {
    const ty = g.fleet[id].type, reg = ty.reg;
    const m = ty.createModel(ty.createPanel({ reg }), { envMap: g.scene.environment, reg });
    let meshes = 0, tris = 0, fineTris = 0, texPx = 0; const seen = new Set();
    m.root.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      const n = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      tris += n;
      for (let q = o.parent; q; q = q.parent) if (q.isLOD) { fineTris += n; break; }
      for (const k of ['map', 'bumpMap']) { const t = o.material?.[k]; if (t && !seen.has(t) && t.image?.width) { seen.add(t); texPx += t.image.width * t.image.height; } }
    });
    return { meshes, tris: Math.round(tris), farTris: Math.round(tris - fineTris), texMPx: +(texPx / 1e6).toFixed(2) };
  };
  return { pa36: cost('pa36'), a188: cost('a188'), e203: cost('e203') };
});
ok('14 draw cost in line with the other piston types (meshes and triangles within 1.3× the AgTruck)', r.pa36.meshes <= r.a188.meshes * 1.3 && r.pa36.tris <= r.a188.tris * 1.3, JSON.stringify(r));

ok('no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 5)));
fs.writeFileSync(`${outDir}/results.json`, JSON.stringify(results, null, 1));
await browser.close();
