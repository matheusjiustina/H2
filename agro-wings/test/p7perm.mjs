// Phase 7: iOS-style motion permission (DeviceOrientationEvent.requestPermission) — denied → stick fallback, granted → tilt.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const c = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await c.newPage(); p.setDefaultTimeout(280000);
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.addInitScript(() => { window.DeviceOrientationEvent = class extends Event { static async requestPermission() { window.__asked = (window.__asked || 0) + 1; return window.__grant === false ? 'denied' : 'granted'; } }; });
await p.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=low', { waitUntil: 'load' });
await p.waitForFunction(() => window.__agro && window.__agro.frames > 2);
console.log('PERMISSION', JSON.stringify(await p.evaluate(async () => {
  const g = window.__agro; g.menuAction('free'); g.screens.close(); const T = g.touch; const o = {};
  window.__grant = false; g.setSetting('touchMode', 'tilt'); await new Promise((r) => setTimeout(r, 50)); o.beforeTap = T.tiltState; // needs a tap on iOS
  await T.startTilt(true); o.denied = T.tiltState; T.update(); o.fallbackCls = [...T.el.classList].filter((x) => x.startsWith('m-')).join();
  window.__grant = true; T._tiltOn = false; await T.startTilt(true); o.granted = T.tiltState; o.asked = window.__asked;
  return o;
})), errs.length ? errs : 'no page errors');
await b.close();
