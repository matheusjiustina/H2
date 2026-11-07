// Phase 6: audio graph nodes created while switching aircraft / starting engines / toggling cameras (must not grow with the number of switches).
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
page.setDefaultTimeout(900000);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  const counts = {}; window.__audioCounts = counts;
  for (const k of Object.getOwnPropertyNames(BaseAudioContext.prototype)) {
    if (!/^create/.test(k)) continue;
    const f = BaseAudioContext.prototype[k];
    BaseAudioContext.prototype[k] = function (...a) { counts[k] = (counts[k] || 0) + 1; return f.apply(this, a); };
  }
  const ctxs = []; const AC = window.AudioContext;
  window.AudioContext = function (...a) { const c = new AC(...a); ctxs.push(c); return c; }; window.AudioContext.prototype = AC.prototype;
  window.__ctxs = ctxs;
});
await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
const res = await page.evaluate(async () => {
  const g = window.__agro; const ex = await import('/src/game/expansions.js'); ex.setEntitlementSource(() => true);
  g.career.tutorialDone = true; g.frozen = true; g.noRender = true;
  const total = () => Object.values(window.__audioCounts).reduce((a, b) => a + b, 0);
  g.audio.start?.(); g.audio.resume?.();
  const ids = Object.keys(g.fleet); const rows = [];
  const round = () => { for (const id of ids) { g.menuAction('title'); g.selectAircraft(id); g.menuAction('free'); g.screens.close(); g.input.press('KeyF'); for (let i = 0; i < 60; i++) g.tick(1 / 30); g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', g.aircraft); for (let i = 0; i < 10; i++) g.tick(1 / 30); } };
  rows.push({ round: 0, created: total(), ctx: window.__ctxs.length });
  for (let k = 1; k <= 3; k++) { round(); rows.push({ round: k, created: total(), ctx: window.__ctxs.length, byType: { ...window.__audioCounts } }); }
  return rows;
});
for (const r of res) console.log(JSON.stringify(r).slice(0, 400));
const d1 = res[2].created - res[1].created, d2 = res[3].created - res[2].created;
console.log(`nodes created per round of ${10} switches: round2 ${d1}, round3 ${d2}; AudioContexts: ${res[3].ctx}`, errors.length ? errors : 'no page errors');
await browser.close();
