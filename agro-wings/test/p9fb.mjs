// Fire Boss touch buttons: visible only for the Fire Boss in the air; no overlap; they drive gear / scoop.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [w, h, dpr] of [[844, 390, 3], [667, 375, 2], [390, 844, 3]]) {
  const c = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true }); const p = await c.newPage(); p.setDefaultTimeout(280000);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:5173/?q=low'); await p.waitForFunction(() => window.__agro && window.__agro.frames > 2);
  const r = await p.evaluate(async () => {
    const g = window.__agro; const ex = await import('/src/game/expansions.js'); ex.setEntitlementSource(() => true); g.career.tutorialDone = true;
    const vis = () => { g.touch.update(); return getComputedStyle(g.touch.el.querySelector('.t-fb')).display !== 'none'; };
    const o = {};
    g.selectAircraft('at802f'); g.menuAction('free'); g.screens.close(); g.tick(1 / 30); o.fbOnGround = vis();
    g.aircraft.placeAirborne(300, -280, Math.PI / 2, 150, 60); for (let i = 0; i < 10; i++) g.tick(1 / 30); o.fbAirborne = vis();
    const gear0 = g.aircraft.fm.gearCmd; const btn = g.touch.el.querySelector('[data-tap=gear]'); btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await new Promise((r) => setTimeout(r, 120)); for (let i = 0; i < 5; i++) g.tick(1 / 30);
    o.gear = [gear0, g.aircraft.fm.gearCmd];
    const sb = g.touch.el.querySelector('[data-tap=scoop]'); const p0 = g.aircraft.water.probesCmd; sb.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await new Promise((r) => setTimeout(r, 120)); for (let i = 0; i < 5; i++) g.tick(1 / 30);
    o.scoop = [p0, g.aircraft.water.probesCmd];
    const rect = (e) => e.getBoundingClientRect(); const fb = rect(g.touch.el.querySelector('.t-fb')); o.overlaps = [];
    for (const e of g.touch.el.querySelectorAll('.t-stick,.t-thr,.t-rud,.t-btns,.t-flaps,.t-trim,.t-top,.t-strip')) { const q = rect(e); if (getComputedStyle(e).display === 'none') continue; const a = Math.max(0, Math.min(fb.right, q.right) - Math.max(fb.left, q.left)) * Math.max(0, Math.min(fb.bottom, q.bottom) - Math.max(fb.top, q.top)); if (a > 0) o.overlaps.push(e.className); }
    for (const s of ['.readouts', '.minimap', '.jobcard']) { const e = document.querySelector(s); if (!e || getComputedStyle(e).display === 'none') continue; const q = rect(e); const a = Math.max(0, Math.min(fb.right, q.right) - Math.max(fb.left, q.left)) * Math.max(0, Math.min(fb.bottom, q.bottom) - Math.max(fb.top, q.top)); if (a > 0) o.overlaps.push(s); }
    g.selectAircraft('ipanema'); g.menuAction('free'); g.screens.close(); g.aircraft.placeAirborne(300, -280, Math.PI / 2, 150, 46); for (let i = 0; i < 5; i++) g.tick(1 / 30); o.otherAircraftAirborne = vis();
    return o;
  });
  console.log(w + 'x' + h, JSON.stringify(r), errs.length ? errs : 'no page errors');
  if (w === 844) { await p.evaluate(() => { const g = window.__agro; g.selectAircraft('at802f'); g.menuAction('free'); g.screens.close(); g.aircraft.placeAirborne(300, -280, Math.PI / 2, 150, 60); for (let i = 0; i < 5; i++) g.tick(1 / 30); g.touch.update(); }); await p.waitForTimeout(300); await p.screenshot({ path: '/tmp/fb_mobile.png' }); }
  await c.close();
}
await b.close();
