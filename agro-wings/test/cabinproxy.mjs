// Cabin seen from outside, every aircraft: the detailed cockpit only from the
// cockpit view or inside ~9.5 m (kept to 11 m); beyond it the one-mesh cabin
// stand-in is drawn (never an empty, see-through canopy), light and cheap.
//   node test/cabinproxy.mjs
import { chromium } from 'playwright';
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.setDefaultTimeout(600000);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url + '?q=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
const res = [];
const check = (n, ok, i = '') => { res.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${i}`); };
for (const id of ['ipanema', 'at502', 'm18', 'thrush', 'e203', 'a188', 'pa36', 'agcat', 'e201', 'at401', 'at802', 'at802f', 'r44', 'b206']) {
  const r = await page.evaluate((id) => {
    const g = window.__agro; localStorage.clear(); g.career.resetAll(); g.career.tutorialDone = true;
    g.selectAircraft(id); g.menuAction('free'); g.screens.close(); g.frozen = true;
    const A = g.aircraft; A.placeAirborne(-300, 400, Math.PI / 2, 60, 46); A.fm.vel.set(0, 0, 0);
    const step = (mode, d) => {
      g.cameraMode = mode; g.rig.setMode(mode, A); if (mode === 'orbit') g.rig.orbit.dist = d;
      for (let i = 0; i < 12; i++) { g.rig.update(1 / 30, A, { dx: 0, dy: 0, buttons: 0, wheel: 0 }, g.world.terrain); A.model.update(1 / 30, A.fm, A); A._animate(1 / 30); }
      return { ck: A.model.cockpit.visible, px: !!A.model.cabinProxy?.visible, pilot: A.model.pilot.visible };
    };
    const o = {};
    o.near = step('orbit', 7); o.far = step('orbit', 14); o.chase = step('chase', 0); o.in = step('cockpit', 0);
    // Hysteresis: 10.5 m keeps whatever it was (full coming from near, stand-in coming from far).
    step('orbit', 7); o.hysNear = step('orbit', 10.5); step('orbit', 14); o.hysFar = step('orbit', 10.5);
    const c = A.model.cabinProxy; o.tris = c ? c.geometry.index.count / 3 : -1; o.drawn = !!c;
    return o;
  }, id);
  const ok = r.drawn && r.near.ck && !r.near.px && !r.far.ck && r.far.px && !r.chase.ck && r.chase.px && r.in.ck && !r.in.px && r.hysNear.ck && !r.hysFar.ck && r.hysFar.px && r.tris > 0 && r.tris < 200;
  check(`${id}: full cockpit near/inside, stand-in beyond, hysteresis`, ok, JSON.stringify({ near: r.near.ck, far: [r.far.ck, r.far.px], chase: [r.chase.ck, r.chase.px], in: r.in.ck, hys: [r.hysNear.ck, r.hysFar.ck], tris: r.tris }));
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`${res.filter(Boolean).length}/${res.length} passed`);
await browser.close(); process.exit(res.every(Boolean) ? 0 : 1);
