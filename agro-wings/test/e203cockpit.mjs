// EMB-203 cockpit checks in Chromium: the pilot's view at three screen
// shapes, looking left / right / up / down, the panel from in front, the
// instruments and the GPS zoomed, the GPS page keys (clicked through the
// same ray as the game), the needles against the flight model (engine off,
// cranking, running in flight), the stick's travel, the exterior views
// with both paints, and the page errors.
//   AGRO_URL=http://localhost:5173/ node test/e203cockpit.mjs <outDir> [names,...]
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'e203-cockpit';
const only = process.argv[3]?.split(',');
fs.mkdirSync(outDir, { recursive: true });
let fail = 0;
const check = (ok, msg, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg} ${info}`); if (!ok) fail++; };
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const sizes = process.env.QUICK ? [[1280, 720, '16x9']] : [[1280, 720, '16x9'], [1024, 768, '4x3'], [1680, 720, '21x9']];
for (const [W, H, tag] of sizes) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
  await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=high', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
  await page.evaluate(() => {
    const g = window.__agro;
    g.frozen = true; g.noRender = true;
    g.menuAction('free'); g.screens.close();
    g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
    g.selectAircraft('e203');
    const st = document.createElement('style');
    st.textContent = '.overlay, .hud, .loading, .toast { display: none !important; }';
    document.head.appendChild(st);
  });
  // [name, setup, look {yaw, pitch, zoom}, camera override]
  const views = [
    ['pilot', 'air', { yaw: 0, pitch: null, zoom: 1 }],
    ['ground', 'pad', { yaw: 0, pitch: null, zoom: 1 }],
    ...(tag === '16x9' ? [
      ['left', 'air', { yaw: 1.15, pitch: -0.25, zoom: 1 }],
      ['right', 'air', { yaw: -1.15, pitch: -0.25, zoom: 1 }],
      ['up', 'air', { yaw: 0.2, pitch: 0.75, zoom: 1 }],
      ['down', 'air', { yaw: 0, pitch: -0.75, zoom: 1 }],
      ['downPad', 'pad', { yaw: 0.05, pitch: -0.5, zoom: 1.15 }],
      ['downLeft', 'pad', { yaw: 0.55, pitch: -0.65, zoom: 1.1 }],
      ['downRight', 'pad', { yaw: -0.55, pitch: -0.65, zoom: 1.1 }],
      ['doorLow', 'pad', { yaw: 1.15, pitch: -0.7, zoom: 1 }],
      ['back', 'air', { yaw: 2.4, pitch: -0.1, zoom: 1 }],
      ['instruments', 'air', { yaw: 0.2, pitch: -0.42, zoom: 0.42 }],
      ['gps', 'air', { yaw: -0.38, pitch: -0.44, zoom: 0.4 }],
      ['hopper', 'air', { yaw: -0.05, pitch: -0.36, zoom: 0.45 }],
      ['panelFront', 'cam', null, [0, 0.42, -1.05], [0, 0.38, -0.75], 52],
      ['stickSide', 'cam', null, [-0.3, 0.55, -1.25], [0.05, 0.05, -0.95], 60],
      ['extCabin', 'cam', null, [2.2, 1.5, -0.2], [0, 0.6, -1.0], 50],
      ['extFront', 'cam', null, [0.6, 1.3, 3.2], [0, 0.75, -0.8], 40],
    ] : []),
  ];
  for (const [name, where, look, cam, aim, fov] of views.filter(([n]) => !only || only.includes(n))) {
    const info = await page.evaluate(({ where, look, cam, aim, fov }) => {
      const g = window.__agro, ac = g.aircraft;
      if (where === 'pad') ac.placeAtPad(); else ac.placeAirborne(300, -270, Math.PI / 2, 60, 46);
      if (where !== 'pad') { ac.fm.engine = 'running'; ac.fm.rpm = 2650; ac.fm.throttle = 0.75; }
      for (let i = 0; i < 40; i++) g.tick(1 / 60);
      if (cam) {
        g.cameraMode = 'free';
        const V3 = g.camera.position.constructor, root = ac.model.root;
        root.updateMatrixWorld(true);
        g.camera.position.copy(root.localToWorld(new V3(...cam)));
        g.camera.up.set(0, 1, 0).applyQuaternion(root.getWorldQuaternion(g.camera.quaternion.clone()));
        g.camera.lookAt(root.localToWorld(new V3(...aim)));
        g.camera.fov = fov; g.camera.near = 0.02; g.camera.updateProjectionMatrix();
        ac.model.pilot.visible = false;
        ac.panel.draw(ac.instruments());
        for (let i = 0; i < 4; i++) ac.model.update(1 / 30, ac.fm, ac);
      } else {
        g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac);
        if (look.pitch !== null) g.rig.look.pitch = look.pitch;
        g.rig.look.yaw = look.yaw;
        g.rig.zoom.cockpit = look.zoom;
        for (let i = 0; i < 30; i++) { g.rig.update(1 / 30, ac, { dx: 0, dy: 0, buttons: 0, wheel: 0 }, g.world.terrain); ac.panel.draw(ac.instruments()); ac.model.update(1 / 30, ac.fm, ac); }
      }
      for (let i = 0; i < 10; i++) g.world.update(g.camera, g.camera.position, 1 / 60, g.time);
      g.render();
      const r = g.renderer.info.render;
      return { calls: r.calls, tris: r.triangles, fov: Math.round(g.camera.fov) };
    }, { where, look, cam, aim, fov });
    await page.waitForTimeout(60);
    await page.screenshot({ path: `${outDir}/${tag}_${name}.png` });
    console.log(tag, name, JSON.stringify(info));
  }
  if (tag === '16x9' && !only) {
    // GPS keys, through the same picking ray as a click in the game.
    for (const pg of ['dest', 'mission', 'cov', 'map']) {
      const r = await page.evaluate((pg) => {
        const g = window.__agro, ac = g.aircraft;
        g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac); g.rig.look.yaw = -0.38; g.rig.look.pitch = -0.44; g.rig.zoom.cockpit = 0.4;
        for (let i = 0; i < 30; i++) g.rig.update(1 / 30, ac, { dx: 0, dy: 0, buttons: 0, wheel: 0 }, g.world.terrain);
        g.camera.updateMatrixWorld();
        const k = ac.model.inst.pickables.find((o) => o.userData.gpsPage === pg);
        const p = k.getWorldPosition(g.camera.position.clone()).project(g.camera);
        const rc = g.canvas.getBoundingClientRect();
        const got = g.cockpitClick(rc.left + ((p.x + 1) / 2) * rc.width, rc.top + ((1 - p.y) / 2) * rc.height);
        ac.panel.draw(ac.instruments()); ac.panel.draw(ac.instruments());
        return { got, page: ac.panel.page };
      }, pg);
      check(r.got === pg && r.page === pg, `GPS key ${pg}`, JSON.stringify(r));
    }
    // Needles against the flight model: off on the ground, cranking, running
    // in flight; the stick's travel.
    const inst = await page.evaluate(() => {
      const g = window.__agro, ac = g.aircraft, P = ac.panel;
      g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac);
      const read = () => { P.draw(ac.instruments()); for (let i = 0; i < 90; i++) ac.model.update(1 / 30, ac.fm, ac); const lit = Object.keys(P.lit).filter((k) => P.lit[k]).sort().join(','); return { ias: Math.round(ac.instruments().ias), rpm: Math.round(ac.fm.rpm), lit, gps: P.gps.key.slice(0, 24) }; };
      ac.placeAtPad(); for (let i = 0; i < 20; i++) g.tick(1 / 30);
      const off = read();
      ac.startEngine(); for (let i = 0; i < 20; i++) g.tick(1 / 30);
      const crank = read();
      ac.placeAirborne(300, -270, Math.PI / 2, 60, 46); ac.fm.engine = 'running'; ac.fm.rpm = 2650; for (let i = 0; i < 30; i++) g.tick(1 / 30);
      const fly = read();
      const s0 = [ac.model.stick.rotation.x, ac.model.stick.rotation.z];
      ac.fm.elevator = 0.8; ac.fm.aileron = -0.7; ac._animate?.(1 / 60);
      const s1 = [ac.model.stick.rotation.x, ac.model.stick.rotation.z];
      return { off, crank, fly, s0, s1 };
    });
    console.log('instruments', JSON.stringify(inst));
    check(inst.off.lit === '' && inst.crank.lit.includes('start') && inst.crank.lit.includes('alt') && !inst.fly.lit.includes('alt'), 'lamps follow the engine (off / cranking / running)', `${inst.off.lit} | ${inst.crank.lit} | ${inst.fly.lit}`);
    check(inst.fly.ias > 60 && inst.fly.rpm > 2000, 'flight state reaches the instruments', JSON.stringify(inst.fly));
    check(Math.abs(inst.s1[0] - inst.s0[0]) > 0.1 && Math.abs(inst.s1[1] - inst.s0[1]) > 0.1, 'stick follows pitch and roll', JSON.stringify([inst.s0, inst.s1]));
    // Look keys through the game's own input: held Num 7 turns the head
    // left, Num 2 down, Num + zooms the lens; Num 0 brings the type's view
    // back. The eye itself must not move (nothing passes through the panel).
    const lk = await page.evaluate(() => {
      const g = window.__agro, ac = g.aircraft, I = g.input;
      g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac); g.rig.zoom.cockpit = 1;
      const run = (n) => { for (let i = 0; i < n; i++) g.tick(1 / 30); };
      const eye = () => g.camera.position.clone().sub(ac.rPos).applyQuaternion(ac.rQuat.clone().invert());
      run(5);
      const e0 = eye(), y0 = g.rig.look.yaw, p0 = g.rig.look.pitch;
      I.pressAction('lookLeft'); run(20); I.releaseAction('lookLeft');
      const yL = g.rig.look.yaw;
      I.pressAction('lookDown'); run(15); I.releaseAction('lookDown');
      const pD = g.rig.look.pitch;
      I.pressAction('zoomIn'); run(20); I.releaseAction('zoomIn');
      const z = g.rig.zoom.cockpit, moved = eye().distanceTo(e0);
      I.pressAction('lookReset'); run(1); I.releaseAction('lookReset'); run(1);
      const r = (v) => +v.toFixed(3);
      return { y0: r(y0), yL: r(yL), p0: r(p0), pD: r(pD), z: r(z), yR: r(g.rig.look.yaw), pR: r(g.rig.look.pitch), zR: g.rig.zoom.cockpit, moved: r(moved) };
    });
    check(lk.yL > lk.y0 + 0.5 && lk.pD < lk.p0 - 0.2 && lk.z < 0.8 && lk.yR === 0 && lk.pR === lk.p0 && lk.zR === 1 && lk.moved < 0.02, 'look keys: left, down, zoom, reset (eye fixed)', JSON.stringify(lk));
    // Pilot eye height with real key events: Shift + Up held raises the
    // eye (a taller pilot) without adding power or pitching, Shift + Down
    // lowers it, both within the range; the height is kept in the settings.
    const eyeAt = () => page.evaluate(() => {
      const g = window.__agro, ac = g.aircraft;
      for (let i = 0; i < 3; i++) g.tick(1 / 30);
      const e = g.camera.position.clone().sub(ac.rPos).applyQuaternion(ac.rQuat.clone().invert());
      return { y: +e.y.toFixed(3), h: +g.rig.eyeHeight.toFixed(3), thr: +ac.fm.throttle.toFixed(3), saved: g.settings.eyeHeight };
    });
    const hold = async (keys, n) => {
      for (const k of keys) await page.keyboard.down(k);
      await page.evaluate((n) => { for (let i = 0; i < n; i++) window.__agro.tick(1 / 30); }, n);
      for (const k of keys.slice().reverse()) await page.keyboard.up(k);
    };
    await page.evaluate(() => { const g = window.__agro; g.setSetting('shake', 0); g.rig.eyeHeight = 0; g.setSetting('eyeHeight', 0); g.aircraft.fm.throttle = 0.3; });
    const ey0 = await eyeAt();
    // 15 cm/s at 30 ticks/s: 10 ticks = 5 cm.
    await hold(['Shift', 'ArrowUp'], 10);
    const eyU = await eyeAt();
    await hold(['Shift', 'ArrowUp'], 60);
    const eyMax = await eyeAt();
    await hold(['Shift', 'ArrowDown'], 90);
    const eyMin = await eyeAt();
    await hold(['Shift', 'ArrowUp'], 30);
    const eyBack = await eyeAt();
    const eyInfo = JSON.stringify({ ey0, eyU, eyMax, eyMin, eyBack });
    check(Math.abs(eyU.h - 0.05) < 0.005 && Math.abs(eyU.y - ey0.y - eyU.h) < 0.005 && eyU.thr === ey0.thr && eyU.saved === eyU.h, 'Shift + Up: eye higher, power untouched, height saved', eyInfo);
    check(eyMax.h === 0.15 && eyMin.h === -0.15 && Math.abs(eyBack.h) < 0.005 && Math.abs(eyMin.y - ey0.y + 0.15) < 0.005, 'Shift + Up / Down: within ±15 cm, back to the middle', eyInfo);
    await page.evaluate(() => { const g = window.__agro; g.rig.eyeHeight = 0; g.setSetting('eyeHeight', 0); g.setSetting('shake', 1); });
  }
  check(errors.length === 0, `${tag}: no page errors`, errors.slice(0, 3).join(' | '));
  await page.close();
}
console.log(fail ? `${fail} FAILED` : 'all checks passed');
await browser.close();
process.exit(fail ? 1 : 0);
