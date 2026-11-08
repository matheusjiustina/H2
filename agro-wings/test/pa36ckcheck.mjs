// Piper PA-36 Brave cockpit (Prompt 02): the flight-phase checks in the real
// game (browser), flown through the game's own inputs — the keyboard on the
// desktop page, the touch controls (input.virtual) and a tap on the GPS on a
// phone-sized page:
//   1 parked · 2 engine start · 3 taxi on the dirt strip · 4 take-off ·
//   5 steady flight · 6 turns and attitude changes · 7 approach and landing ·
//   8 fixed camera · 9 free look · 10 outside ↔ inside · 11 GPS · 12 desktop
//   and mobile controls.
// At each phase: the camera at the eye (offset, jitter), nothing of the
// airframe inside the near plane, the needles against the instruments'
// data, the stick clear of the panel at full deflection, back faces seen
// from the eye (holes in the cabin), a screenshot; page errors.
//   AGRO_URL=http://localhost:5173/ node test/pa36ckcheck.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const outDir = process.argv[2] || 'pa36-ckcheck';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const results = {};
const ok = (k, v, info) => { results[k] = { pass: !!v, info }; console.log(v ? 'PASS' : 'FAIL', k, info ?? ''); };
const URL = (process.env.AGRO_URL || 'http://localhost:5173/') + '?q=medium';

async function open(viewport, mobile = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.setDefaultTimeout(600000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
  await page.evaluate(() => {
    const g = window.__agro;
    g.frozen = true; g.noRender = true;
    g.menuAction('free'); g.screens.close();
    g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
    g.setSetting('keyScheme', 'classic');
    g.selectAircraft('pa36');
    const ac = g.aircraft;
    ac.fm.settleOnGround(-385, 0, Math.PI / 2, ac.env);
    ac.fm.engine = 'off'; ac.fm.hopper = 400; ac.fm.fuel = 250; ac.fm.updateMass();
    g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac);
  });
  return { page, errors };
}

// In-page probe: camera vs eye, near-plane clearance, needles vs data.
const PROBE = async (o = {}) => {
  const g = window.__agro, ac = g.aircraft, m = ac.model, fm = ac.fm;
  const THREE = await import('/node_modules/.vite/deps/three.js');
  m.root.updateMatrixWorld(true);
  const eyeW = m.root.localToWorld(m.eye.clone()).add(new THREE.Vector3(0, g.rig.eyeHeight, 0).applyQuaternion(ac.rQuat));
  const camOff = g.camera.position.distanceTo(eyeW);
  // Nearest airframe surface around the camera (the pilot is hidden).
  const shown = (o2) => { for (let q = o2; q; q = q.parent) if (!q.visible) return false; return true; };
  const meshes = []; m.root.traverse((x) => { if (x.isMesh && shown(x) && x !== m.disc) meshes.push(x); });
  const R = new THREE.Raycaster(); let near = 9;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    if (!a && !b && !c) continue;
    R.set(g.camera.position, new THREE.Vector3(a, b, c).normalize()); R.far = 1;
    const h = R.intersectObjects(meshes, false)[0];
    if (h) near = Math.min(near, h.distance);
  }
  // Needles: the damped readings settle on the data; compare angles.
  const d = ac.instruments(), N = m.inst.needles;
  const P = await import('/src/aircraft/pa36Panel.js');
  const A = P.PA36_ANG;
  const ang = (mesh) => -mesh.rotation.z;
  const deg = (r) => +(r * 180 / Math.PI).toFixed(1);
  const err = {
    asi: deg(ang(N.asi[0]) - A.asi(d.ias)), rpm: deg(ang(N.rpm[0]) - A.rpm(d.rpm)), mp: deg(ang(N.mp[0]) - A.mp(d.mp)),
    oilT: deg(ang(N.oilT[0]) - A.oilT(d.oilT)), oilP: deg(ang(N.eng[0]) - A.oilP(d.oilP)),
    fuel: deg(ang(N.fuel[0]) - A.fuel(d.engine === 'off' ? 0 : d.fuel / 3.785)),
  };
  const att = fm.constructor.attitude(fm, {});
  return {
    camOff: +camOff.toFixed(3), near: +near.toFixed(3), camNear: g.camera.near, err,
    ias: +d.ias.toFixed(1), rpm: Math.round(d.rpm), mp: +d.mp.toFixed(1), agl: +fm.out.agl.toFixed(1), gs: +fm.out.groundSpeed.toFixed(1),
    pitch: deg(att.pitch), bank: deg(att.bank), engine: fm.engine, onGround: fm.out.onGround, page: ac.panel.page,
  };
};
const run = (page, s, fn) => page.evaluate(async ({ s, fnSrc }) => {
  const g = window.__agro, ac = g.aircraft, fm = ac.fm;
  const step = new Function('g', 'ac', 'fm', 'i', fnSrc);
  const n = Math.round(s * 60);
  for (let i = 0; i < n; i++) { step(g, ac, fm, i); g.tick(1 / 60); }
  ac.panel.draw(ac.instruments());
  for (let i = 0; i < 30; i++) g.tick(1 / 60); // let the needles settle
  g.render();
  return true;
}, { s, fnSrc: fn ?? '' });
const probe = (page, o) => page.evaluate(PROBE, o);
const shot = async (page, n) => { await page.waitForTimeout(60); await page.screenshot({ path: `${outDir}/${n}.png` }); };
const needlesOk = (r, tol = 4) => Object.values(r.err).every((e) => Math.abs(e) <= tol);

// ===================================================== desktop (keyboard)
{
  const { page, errors } = await open({ width: 1280, height: 720 });
  const key = async (k, held, s = 0, fn) => { await page.keyboard.down(k); if (s) await run(page, s, fn); if (!held) await page.keyboard.up(k); };
  const phase = async (id) => {
    await page.evaluate(() => { const g = window.__agro; if (g.cameraMode !== 'cockpit') { g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', g.aircraft); } for (let i = 0; i < 4; i++) g.tick(1 / 60); g.render(); });
    const r = await probe(page); r.state = await page.evaluate(() => window.__agro.aircraft.state); await shot(page, id); return r;
  };

  // 1 parked.
  await run(page, 1);
  let r = await phase('01_parked');
  ok('1 parked: camera at the eye, clear of the airframe, needles at rest', r.camOff < 0.02 && r.near > r.camNear && needlesOk(r) && r.rpm === 0, JSON.stringify(r));
  // 2 engine start (hold F).
  await key('KeyF', false, 2.4);
  await run(page, 4);
  r = await phase('02_engine');
  ok('2 engine start by key: running, tachometer and engine needles on the data', r.engine === 'running' && r.rpm > 400 && needlesOk(r), JSON.stringify(r));
  // 3 taxi: a little power, released brakes; camera jitter over 2 s.
  await key('ShiftLeft', false, 0.5);
  await run(page, 5);
  const jit = await page.evaluate(async () => {
    const g = window.__agro, ac = g.aircraft, m = ac.model;
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const off = [];
    for (let i = 0; i < 120; i++) { g.tick(1 / 60); m.root.updateMatrixWorld(true); const e = m.root.localToWorld(m.eye.clone()); off.push(g.camera.position.clone().sub(e).applyQuaternion(ac.rQuat.clone().invert())); }
    const mean = off.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(off.length);
    const rms = Math.sqrt(off.reduce((a, v) => a + v.distanceToSquared(mean), 0) / off.length);
    return { rmsMm: +(rms * 1000).toFixed(2), gs: +ac.fm.out.groundSpeed.toFixed(1), surface: ac.fm.out.surface };
  });
  r = await phase('03_taxi');
  ok('3 taxi on the strip: the eye shakes a little (engine and ground), the view stays put', r.onGround && jit.gs > 2 && jit.rmsMm < 6 && r.near > r.camNear, JSON.stringify({ ...jit, near: r.near }));
  // 4 take-off: full power (Shift), stick back from 55 kt (Arrow Down).
  await page.keyboard.down('ShiftLeft');
  await run(page, 3);
  await page.keyboard.up('ShiftLeft');
  // (The touch controls hold the centreline with the rudder — the speed's
  // sideways part — and, from 27 m/s, lift the nose; then a 11° climb.)
  await run(page, 20, 'const v = g.input.virtual; v.active = true; const a = fm.constructor.attitude(fm, {}); const sp = Math.hypot(fm.vel.x, fm.vel.z); v.yaw = sp > 1 ? Math.max(-1, Math.min(1, -3 * fm.vel.z / sp + 0.5 * fm.omega.y)) : 0; if (fm.out.airspeed > 27) { v.pitch = fm.out.onGround ? 0.45 : Math.max(-0.6, Math.min(0.6, (0.2 - a.pitch) * 4 + fm.omega.x)); v.roll = Math.max(-1, Math.min(1, -a.bank * 2)); }');
  r = await phase('04_takeoff');
  ok('4 take-off: airborne, stick and needles following, camera at the eye', !r.onGround && r.agl > 2 && needlesOk(r, 6) && r.camOff < 0.07, JSON.stringify(r));
  // 5 steady climb / level flight (touch controls holding the nose).
  await run(page, 16, 'g.input.virtual.active = true; const a = fm.constructor.attitude(fm, {}); g.input.virtual.yaw = 0; const tgt = fm.out.agl < 90 ? 0.2 : 0.04; g.input.virtual.pitch = Math.max(-0.6, Math.min(0.6, (tgt - a.pitch) * 4 + fm.omega.x)); g.input.virtual.roll = Math.max(-1, Math.min(1, -a.bank * 2));');
  r = await phase('05_cruise');
  ok('5 steady flight: needles on the data (airspeed, rpm, manifold, oil, fuel)', !r.onGround && needlesOk(r), JSON.stringify(r));
  // 6 turns: 40° bank left then right (keys), pitch changes.
  await run(page, 5, 'g.input.virtual.active = true; const a = fm.constructor.attitude(fm, {}); g.input.virtual.roll = Math.max(-1, Math.min(1, (-0.7 - a.bank) * 2)); g.input.virtual.pitch = 0.25;');
  r = await phase('06_turn_left');
  const turnL = r;
  await run(page, 6, 'g.input.virtual.active = true; const a = fm.constructor.attitude(fm, {}); g.input.virtual.roll = Math.max(-1, Math.min(1, (0.7 - a.bank) * 2)); g.input.virtual.pitch = 0.25;');
  r = await phase('06_turn_right');
  ok('6 turns and attitude changes: camera stays at the eye, nothing in the near plane', Math.abs(turnL.bank) > 20 && Math.abs(r.bank) > 20 && turnL.camOff < 0.07 && r.camOff < 0.07 && r.near > r.camNear, JSON.stringify({ bankL: turnL.bank, bankR: r.bank, camOff: [turnL.camOff, r.camOff], near: r.near }));
  // 7 approach and landing: short final to the strip (west of the
  // threshold, 22 m up), power back, a steady descent, the flare, touch
  // down and roll out on the brakes.
  await page.evaluate(() => { const g = window.__agro, ac = g.aircraft; ac.placeAirborne(-760, 0, Math.PI / 2, 20, 33); ac.fm.flapsCmd = ac.fm.flaps = 0.5; });
  await run(page, 30, 'const v = g.input.virtual; v.active = true; const a = fm.constructor.attitude(fm, {}); const agl = fm.out.agl; const sp = Math.hypot(fm.vel.x, fm.vel.z); v.yaw = sp > 1 ? Math.max(-1, Math.min(1, -3 * fm.vel.z / sp + 0.5 * fm.omega.y)) : 0; if (!fm.out.onGround) { v.throttle = agl > 3 ? 0.2 : 0; v.pitch = agl > 3 ? Math.max(-0.7, Math.min(0.8, (-2.5 - fm.vel.y) * 0.3 + fm.omega.x)) : Math.max(-0.7, Math.min(0.8, (0.15 - a.pitch) * 4 + fm.omega.x)); v.roll = Math.max(-1, Math.min(1, -a.bank * 2)); v.brake = false; } else { v.throttle = 0; v.pitch = 0.6; v.roll = 0; v.brake = fm.out.groundSpeed > 2 && fm.out.groundSpeed < 9 && a.pitch > 0.1; }');
  r = await phase('07_landing');
  ok('7 approach and landing: on the ground, the aircraft whole, camera at the eye', r.onGround && (await page.evaluate(() => window.__agro.aircraft.state)) === 'ok' && r.camOff < 0.07, JSON.stringify(r));
  await page.evaluate(() => { window.__agro.input.virtual.active = false; });
  // Stick at full deflection: the segment pivot → top hits nothing.
  const stick = await page.evaluate(async () => {
    const g = window.__agro, ac = g.aircraft, m = ac.model;
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const s = m.stick, keep = [s.rotation.x, s.rotation.z];
    const others = []; m.root.traverse((x) => { if (!x.isMesh) return; for (let q = x; q; q = q.parent) if (q === s || q === m.pilot) return; others.push(x); });
    const out = [];
    for (const ex of [-0.25, 0, 0.25]) for (const ez of [-0.25, 0, 0.25]) {
      s.rotation.x = ex; s.rotation.z = ez; m.root.updateMatrixWorld(true);
      let hit = null;
      for (const [y0, y1] of [[0.12, 0.63], [0.39, 0.63]]) {
        const a = s.localToWorld(new THREE.Vector3(0, y0, 0.0)), b = s.localToWorld(new THREE.Vector3(0, y1, 0.05));
        for (const dx of [-0.025, 0, 0.025]) for (const dz of [-0.025, 0, 0.025]) {
          const o = s.localToWorld(new THREE.Vector3(dx, y0, dz)), e = s.localToWorld(new THREE.Vector3(dx, y1, 0.05 + dz));
          const R = new THREE.Raycaster(o, e.clone().sub(o).normalize(), 0, o.distanceTo(e));
          const h = R.intersectObjects(others, false)[0];
          if (h && !hit) hit = h.object.material?.name || h.object.parent?.name || 'mesh';
        }
        void a; void b;
      }
      out.push({ ex, ez, hit });
    }
    s.rotation.x = keep[0]; s.rotation.z = keep[1];
    return out;
  });
  ok('stick: full forward / back / left / right clear of the panel, the sight window, the seat', stick.every((q) => !q.hit), JSON.stringify(stick.filter((q) => q.hit)));
  // 8 fixed camera (the default cockpit view) and 9 free look (head turns).
  await page.evaluate(() => { const g = window.__agro; g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', g.aircraft); for (let i = 0; i < 20; i++) g.tick(1 / 60); g.render(); });
  r = await phase('08_fixed');
  ok('8 fixed cockpit camera (default view): at the eye, clear', r.camOff < 0.03 && r.near > r.camNear, JSON.stringify({ camOff: r.camOff, near: r.near }));
  const looks = [['09_look_left', 1.3, -0.25], ['09_look_right', -1.3, -0.25], ['09_look_up', 0, 0.6], ['09_look_down', 0, -1.0], ['09_look_back_left', 2.4, 0]];
  const lk = [];
  for (const [n, yaw, pitch] of looks) {
    await page.evaluate(({ yaw, pitch }) => { const g = window.__agro; g.rig.look.yaw = yaw; g.rig.look.pitch = pitch; for (let i = 0; i < 4; i++) g.tick(1 / 60); g.render(); }, { yaw, pitch });
    const q = await probe(page); lk.push({ n, near: q.near }); await shot(page, n);
  }
  ok('9 free look round the cabin (left, right, up, down, back): clear of the near plane', lk.every((q) => q.near > 0.05), JSON.stringify(lk));
  // Holes in the cabin: from the eye, back faces seen (double-sided vs
  // front-only, the glass double-sided in both), 14 directions.
  const holes = await page.evaluate(async () => {
    const g = window.__agro, ac = g.aircraft, m = ac.model;
    const THREE = await import('/node_modules/.vite/deps/three.js');
    m.pilot.visible = false; m.disc.visible = false;
    m.root.updateMatrixWorld(true);
    const W = 480, H = 360, rt = new THREE.WebGLRenderTarget(W, H);
    const cam = new THREE.PerspectiveCamera(90, W / H, 0.02, 60);
    const both = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), front = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.FrontSide });
    const glassy = (mat) => mat && (mat.transparent || mat.side === THREE.DoubleSide);
    const meshes = []; m.root.traverse((o) => { if (o.isMesh) meshes.push([o, o.material]); });
    const draw = (useFront) => {
      for (const [o, mat] of meshes) o.material = useFront && !glassy(mat) ? front : both;
      const rd = g.renderer; rd.setRenderTarget(rt); rd.setClearColor(0x000000, 1); rd.clear(); rd.render(m.root, cam); rd.setRenderTarget(null);
      const px = new Uint8Array(W * H * 4); rd.readRenderTargetPixels(rt, 0, 0, W, H, px); return px;
    };
    const eye = m.root.localToWorld(m.eye.clone());
    const q = ac.rQuat.clone();
    const out = []; let worst = null;
    const names = new Map(Object.entries(m.M).map(([k, v]) => [v, k]));
    for (const [yaw, pitch] of [[0, -0.3], [0, -0.8], [0, 0.3], [0.9, -0.4], [-0.9, -0.4], [1.6, -0.2], [-1.6, -0.2], [1.6, -0.9], [-1.6, -0.9], [2.6, 0], [-2.6, 0], [0, 1.2], [0.5, -1.2], [-0.5, -1.2]]) {
      const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).applyQuaternion(q);
      cam.position.copy(eye); cam.up.set(0, 1, 0).applyQuaternion(q); cam.lookAt(eye.clone().add(dir)); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      const A = draw(false), B = draw(true);
      let n = 0, sil = 0; const at = [];
      for (let i = 0; i < A.length; i += 4) if (A[i] > 128) { sil++; if (B[i] < 128) { n++; if (at.length < 4) at.push(i / 4); } }
      const what = [];
      for (const [o, mat] of meshes) o.material = both;
      const Rc = new THREE.Raycaster();
      for (const i of at) {
        Rc.setFromCamera(new THREE.Vector2(((i % W) + 0.5) / W * 2 - 1, (Math.floor(i / W) + 0.5) / H * 2 - 1), cam);
        const h = Rc.intersectObjects(meshes.map((x) => x[0]).filter((x) => { for (let p = x; p; p = p.parent) if (!p.visible) return false; return true; }), false)[0];
        if (h) { const orig = meshes.find((x) => x[0] === h.object)[1]; what.push(`${names.get(orig) ?? orig?.map ? 'tex' : '?'}@${m.root.worldToLocal(h.point.clone()).toArray().map((v) => v.toFixed(2)).join(',')}`); }
      }
      out.push({ yaw, pitch, holes: n, pct: +(100 * n / Math.max(1, sil)).toFixed(3), what });
    }
    for (const [o, mat] of meshes) o.material = mat;
    m.disc.visible = true;
    rt.dispose(); both.dispose(); front.dispose();
    return out;
  });
  const maxPct = Math.max(...holes.map((h) => h.pct));
  ok('cabin closed: back faces seen from the eye (14 directions) under 0.05 %', maxPct < 0.05, JSON.stringify(holes.map((h) => `${h.yaw},${h.pitch}:${h.holes}`)));
  for (const h of holes) if (h.what.length) console.log('    ', h.yaw, h.pitch, h.what.join('  '));
  // 10 outside ↔ inside.
  const sw = [];
  for (const mode of ['chase', 'cockpit', 'orbit', 'cockpit']) {
    const q = await page.evaluate((mode) => { const g = window.__agro, ac = g.aircraft; g.cameraMode = mode; g.rig.setMode(mode, ac); for (let i = 0; i < 30; i++) g.tick(1 / 60); g.render(); return { mode, pilot: ac.model.pilot.visible, cockpit: ac.model.cockpit.visible, kids: ac.model.cockpit.children.filter((c) => c.visible).length }; }, mode);
    sw.push(q); await shot(page, `10_${sw.length}_${mode}`);
  }
  ok('10 outside ↔ inside: pilot figure only outside, cockpit drawn inside', sw[1].pilot === false && sw[3].pilot === false && sw[0].pilot === true && sw[1].kids > 5, JSON.stringify(sw));
  // 11 GPS: clicks on its keys in the cockpit, the G key.
  const gps = [];
  for (let i = 0; i < 4; i++) {
    const pt = await page.evaluate((i) => {
      const g = window.__agro, ac = g.aircraft;
      g.rig.look.yaw = 0.3; g.rig.look.pitch = -0.3; for (let k = 0; k < 3; k++) g.tick(1 / 60);
      const THREE_V = g.camera.position.constructor;
      const k = ac.model.inst.pickables[i];
      const p = k.getWorldPosition(new THREE_V()).project(g.camera), r = g.canvas.getBoundingClientRect();
      return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height, want: k.userData.gpsPage };
    }, i);
    const got = await page.evaluate(({ x, y }) => window.__agro.cockpitClick(x, y), pt);
    gps.push({ want: pt.want, got });
  }
  await page.evaluate(() => { const g = window.__agro; for (let i = 0; i < 30; i++) g.tick(1 / 60); g.aircraft.panel.draw(g.aircraft.instruments()); g.render(); });
  await shot(page, '11_gps');
  ok('11 GPS: each soft key picked in the cockpit selects its page', gps.every((q) => q.got === q.want), JSON.stringify(gps));
  ok('desktop: no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
  await page.context().close();
}

// ===================================================== mobile (touch)
{
  const { page, errors } = await open({ width: 844, height: 390 }, true);
  // Start, power and pitch through the touch controls' state.
  const r0 = await page.evaluate(() => {
    const g = window.__agro, ac = g.aircraft, fm = ac.fm;
    // The touch ENG button (held): input.virtual.engine.
    g.input.virtual.active = true; g.input.virtual.engine = true;
    for (let i = 0; i < 60 * 2.4; i++) g.tick(1 / 60);
    g.input.virtual.engine = false;
    for (let i = 0; i < 60 * 3; i++) g.tick(1 / 60);
    g.input.virtual.throttle = 1;
    for (let i = 0; i < 60 * 20; i++) { const a = fm.constructor.attitude(fm, {}); g.input.virtual.pitch = fm.out.airspeed > 27 ? (fm.out.onGround ? 0.45 : Math.max(-0.6, Math.min(0.6, (0.12 - a.pitch) * 3 + fm.omega.x))) : 0; g.input.virtual.roll = Math.max(-1, Math.min(1, -a.bank * 2)); g.tick(1 / 60); }
    g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac);
    for (let i = 0; i < 30; i++) g.tick(1 / 60);
    ac.panel.draw(ac.instruments()); g.render();
    return { engine: fm.engine, airborne: !fm.out.onGround, stickX: ac.model.stick.rotation.x, thr: +fm.throttle.toFixed(2) };
  });
  await shot(page, '12_mobile_cockpit');
  // Tap a GPS key on the touch screen.
  const pt = await page.evaluate(() => {
    const g = window.__agro, ac = g.aircraft;
    g.rig.look.yaw = 0.3; g.rig.look.pitch = -0.3; for (let k = 0; k < 3; k++) g.tick(1 / 60);
    const V = g.camera.position.constructor, k = ac.model.inst.pickables[2];
    const p = k.getWorldPosition(new V()).project(g.camera), r = g.canvas.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height, want: k.userData.gpsPage };
  });
  const got = await page.evaluate(({ x, y }) => window.__agro.cockpitClick(x, y), pt);
  ok('12 mobile: touch controls start, power and fly; GPS key by tap point', r0.engine === 'running' && r0.airborne && got === pt.want, JSON.stringify({ ...r0, gps: got }));
  ok('mobile: no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
  await page.context().close();
}
fs.writeFileSync(`${outDir}/results.json`, JSON.stringify(results, null, 1));
await browser.close();
