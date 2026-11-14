// Turboprop reverse in the browser: PC (Ctrl at idle: tap, then press again
// and hold), the touch lever's reverse range, only with a wheel on the ground,
// none in the air or on a piston aircraft; HUD and audio follow.
//   node test/reverseflow.mjs
import { chromium } from 'playwright';
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(600000);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url + '?q=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
const res = [];
const check = (n, ok, i = '') => { res.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${i}`); };
const setup = (id) => page.evaluate((id) => {
  const g = window.__agro; g.selectAircraft(id); g.menuAction('free'); g.screens.close(); g.frozen = true;
  const A = g.aircraft; A.placeOnRunway('west'); A.fm.engine = 'running'; if (A.A.turbine) A.fm.ng = A.A.turbine.idleNg; A.fm.rpm = A.A.idleRpm ?? 900; A.fm.throttle = 0; A.fm.reverse = 0; A.revArmed = false;
  g.cameraMode = 'chase'; g.rig.setMode('chase', A);
}, id);
// Game time is advanced explicitly (software rendering is far slower than real time).
const run = (sec) => page.evaluate((sec) => { const g = window.__agro; for (let i = 0; i < sec * 30; i++) g.tick(1 / 30); }, sec);
const state = () => page.evaluate(() => { const g = window.__agro, A = g.aircraft; return { rev: +(A.fm.reverse ?? 0).toFixed(2), thr: +A.fm.throttle.toFixed(2), ok: !!A.reverseOk, ng: Math.round(A.fm.ng ?? 0), hud: document.querySelector('.r-pwr .l')?.textContent, audio: !!g.audio?.revGain }; });
await page.mouse.click(640, 360);
// AT-502 on the strip, engine at idle.
await setup('at502');
await page.waitForTimeout(800);
// Hold Ctrl at idle (no reverse), then tap and press-and-hold.
await page.keyboard.down('Control'); await run(0.4); await page.keyboard.up('Control'); await run(0.1);
check('a single Ctrl at idle does not reverse', (await state()).rev === 0, JSON.stringify(await state()));
await run(0.6);
await page.keyboard.down('Control'); await run(1 / 15); await page.keyboard.up('Control');
await page.waitForTimeout(100);
await page.keyboard.down('Control'); await run(1.0);
let s = await state();
check('tap + press-and-hold Ctrl: reverse rises', s.rev > 0.5 && s.ok, JSON.stringify(s));
await run(1.5); await page.keyboard.up('Control'); await run(0.5);
s = await state();
check('held long enough: 100 % reverse; released, it stays', s.rev >= 0.99, JSON.stringify(s));
await run(3);
s = await state();
check('gas generator up, HUD reads Reverse', s.ng > 70 && /Revers/.test(s.hud ?? ''), JSON.stringify(s));
await page.keyboard.down('Shift'); await run(1.3); await page.keyboard.up('Shift'); await run(0.1);
s = await state();
check('Shift brings the lever out of reverse', s.rev === 0, JSON.stringify(s));
// In the air: no reverse.
await page.evaluate(() => { const g = window.__agro, A = g.aircraft; A.placeAirborne(0, 0, 0, 200, 50); A.fm.throttle = 0; });
await run(0.5);
await page.keyboard.down('Control'); await run(1 / 15); await page.keyboard.up('Control'); await page.waitForTimeout(100);
await page.keyboard.down('Control'); await run(1.2); await page.keyboard.up('Control');
s = await state();
check('no reverse in the air', s.rev === 0 && !s.ok, JSON.stringify(s));
// Touch lever: the reverse range is shown only on the ground in a turboprop.
await setup('at502'); await run(0.5);
const tz = await page.evaluate(() => { const g = window.__agro; g.touch.enable(); g.touch?.update?.(1 / 60); g.tick(1 / 30); g.touch?.update?.(1 / 60); const el = document.querySelector('.t-thr'); g.input.virtual.throttle = 0; g.input.virtual.reverse = 0.8; return { cls: el?.classList.contains('rev-ok'), touch: !!g.touch }; });
await run(0.6);
s = await state();
check('touch: reverse range on the ground, lever below idle reverses', tz.cls && s.rev > 0.7, JSON.stringify({ tz, s }));
await page.evaluate(() => { const v = window.__agro.input.virtual; v.throttle = null; v.reverse = null; });
// Piston aircraft: never.
await setup('ipanema'); await run(0.5);
await page.keyboard.down('Control'); await run(1 / 15); await page.keyboard.up('Control'); await page.waitForTimeout(100);
await page.keyboard.down('Control'); await run(1.2); await page.keyboard.up('Control');
s = await state();
const pz = await page.evaluate(() => { const g = window.__agro; g.tick(1 / 30); g.touch.update(); return document.querySelector('.t-thr')?.classList.contains('rev-ok'); });
check('piston (EMB-202): no reverse, no reverse range on the touch lever', s.rev === 0 && !s.ok && !pz, JSON.stringify({ s, pz }));
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`${res.filter(Boolean).length}/${res.length} passed`);
await browser.close(); process.exit(res.every(Boolean) ? 0 : 1);
