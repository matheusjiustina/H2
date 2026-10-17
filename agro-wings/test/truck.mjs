// Service truck validation: request a full service with the aircraft on the
// pad and follow the truck (drive in, park, hoses, back out, return to bay).
// Reports timings, the closest the truck footprint came to the aircraft and
// whether the fuel/hopper were loaded; saves top-down snapshots.
// Usage: AGRO_URL=... AC=ipanema|at502|r44 node test/truck.mjs <outDir> [padOffsetX] [padOffsetZ] [headingDeg]
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'truck-out';
const off = [+(process.argv[3] || 0), +(process.argv[4] || 0), process.argv[5] !== undefined ? +process.argv[5] : null];
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.AGRO_URL || 'http://localhost:4173/';
const AC = process.env.AC || 'ipanema';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) console.log('console', m.text().slice(0, 300)); });
await page.goto(url + '?q=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });

const setup = await page.evaluate(({ AC, off }) => {
  const g = window.__agro;
  g.frozen = true; g.noRender = true;
  if (g.fleet[AC]) g.selectAircraft(AC);
  g.menuAction('free'); g.screens.close();
  const st = document.createElement('style');
  st.textContent = '.overlay, .hud, .loading { display: none !important; }';
  document.head.appendChild(st);
  const ac = g.aircraft;
  ac.fm.fuel = 40; ac.fm.hopper = 0; ac.fm.updateMass();
  if (off[0] || off[1] || off[2] !== null) {
    // Park somewhere else inside the pad zone (heading in radians, game convention).
    const pad = ac.type.servicePad ?? { x: -352, z: -64 };
    ac.placeParked(pad.x + off[0], pad.z + off[1], off[2] !== null ? (off[2] * Math.PI) / 180 : Math.PI / 2);
  }
  for (let i = 0; i < 60; i++) g.tick(1 / 60);
  return { ready: g.service.ready(), pos: [ac.fm.pos.x, ac.fm.pos.z], hdg: ac.fm.heading() };
}, { AC, off });
console.log('setup', JSON.stringify(setup));

async function snap(name) {
  await page.evaluate(() => {
    const g = window.__agro;
    const cam = g.camera;
    const t = g.service.truck;
    const cx = (t.x + g.aircraft.fm.pos.x) / 2, cz = (t.z + g.aircraft.fm.pos.z) / 2;
    cam.position.set(cx, 62, cz + 0.01);
    cam.up.set(0, 0, -1);
    cam.lookAt(cx, 0, cz);
    cam.fov = 50; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    g.world.update(cam, cam.position, 1 / 60, g.time);
    g.render();
    cam.up.set(0, 1, 0);
  });
  await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 120000 });
}

await snap('0_before');
await page.evaluate(() => {
  const g = window.__agro;
  const ac = g.aircraft, svc = g.service, t = svc.truck;
  const R = window.__run = { fuel0: ac.fm.fuel, hop0: ac.fm.hopper, log: [], minClear: 1e9, prev: '', t: 0, arrive: null, leave: null, home: null, done: null, wall0: performance.now() };
  g.requestService(ac.A.fuelCapacity * 0.8, ac.A.hopperCapacity * 0.6);
  window.__step = (until) => {
    const clearOf = () => {
      let m = 1e9;
      for (const b of ac.type.bounds) for (const lx of [b[0], b[1], (b[0] + b[1]) / 2]) for (const lz of [b[4], b[5], (b[4] + b[5]) / 2]) {
        const w = ac.toWorld({ x: lx, y: 0, z: lz, isVector3: true }, new ac.fm.pos.constructor());
        m = Math.min(m, t.rectDistance(w.x, w.z));
      }
      return m;
    };
    const dt = 1 / 30;
    for (let i = 0; i < 30 * 600; i++) {
      g.tick(dt, true);
      R.t += dt;
      if (t.state !== "home") { const c = clearOf(); if (c < R.minClear) { R.minClear = c; R.minAt = [+R.t.toFixed(1), t.state, +t.x.toFixed(1), +t.z.toFixed(1)]; } }
      const s = t.state + '/' + t.purpose + '/' + svc.state;
      if (s !== R.prev) { R.log.push([+R.t.toFixed(1), s, +t.x.toFixed(1), +t.z.toFixed(1), +(t.yaw * 57.3).toFixed(0)]); R.prev = s; }
      if (R.arrive === null && t.parkedAtStand) R.arrive = R.t;
      if (R.arrive !== null && R.leave === null && t.state === 'driving' && t.purpose === 'home') R.leave = R.t;
      if (R.leave !== null && R.home === null && t.state === 'home') R.home = R.t;
      if (R.done === null && svc.state === 'idle') R.done = R.t;
      if (until(R, svc, t)) break;
    }
  };
});
// Mid-service: hoses connected (liquid transfer under way).
await page.evaluate(() => window.__step((R, svc) => svc.connected === 'mix' && svc.pumpOn));
await snap('5_service');
await page.evaluate(() => window.__step((R) => R.done !== null && R.home !== null));
const res = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft, t = g.service.truck, R = window.__run;
  return {
    minAt: R.minAt, arrive: R.arrive, leave: R.leave, home: R.home, done: R.done, minClear: +R.minClear.toFixed(2), useTruck: g.service.useTruck,
    fuel: [+R.fuel0.toFixed(0), +ac.fm.fuel.toFixed(0)], hopper: [+R.hop0.toFixed(0), +ac.fm.hopper.toFixed(0)],
    final: [+t.x.toFixed(2), +t.z.toFixed(2), +(t.yaw * 57.3).toFixed(1)], log: R.log, wallMs: Math.round(performance.now() - R.wall0),
    toasts: (g.toastLog || []).slice(-6),
  };
});
console.log(JSON.stringify(res, null, 1));
await snap('9_after');
await browser.close();
