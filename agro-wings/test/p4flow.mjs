// Phase 4: per aircraft — select, enter, start the engine, run, change cameras, back to the title, repeat.
// Prints a deterministic reading per aircraft (engine state, rpm, fuel, gauges) so two builds can be diffed.
// Usage: AGRO_URL=... node test/p4flow.mjs out.json
import { chromium } from 'playwright';
import fs from 'node:fs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.setDefaultTimeout(600000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
await page.evaluate(async () => { const ex = await import('/src/game/expansions.js'); ex.setEntitlementSource(() => true); });
const res = await page.evaluate(() => {
  const g = window.__agro;
  localStorage.clear(); g.career.resetAll(); g.career.tutorialDone = true;
  const out = {};
  const sc = () => { let n = 0, vis = 0; g.scene.traverse(() => n++); return n; };
  for (let round = 0; round < 2; round++) for (const id of Object.keys(g.fleet)) {
    g.menuAction('title'); g.screens.close?.();
    g.selectAircraft(id);
    g.menuAction('free'); g.screens.close();
    for (let i = 0; i < 10; i++) g.tick(1 / 30);
    const ac = g.aircraft;
    const cams = [];
    for (const mode of ['cockpit', 'chase', 'orbit', 'cockpit']) {
      g.cameraMode = mode; g.rig.setMode(mode, ac);
      for (let i = 0; i < 3; i++) g.tick(1 / 30);
      cams.push([mode, ac.model.cockpit.visible, ac.model.pilot.visible]);
    }
    g.input.press('KeyF');
    for (let i = 0; i < 300; i++) g.tick(1 / 30);
    const fm = ac.fm, o = fm.out;
    const r = (v, d = 3) => (typeof v === 'number' ? +v.toFixed(d) : v);
    const key = `${id}#${round}`;
    out[key] = { engine: fm.engine, rpm: r(fm.rpm, 1), fuel: r(fm.fuel, 2), hopper: r(fm.hopper, 2), flaps: r(fm.flaps), onGround: o.onGround, cams };
  }
  const ids = Object.keys(g.fleet);
  out._nodesEnd = sc();
  out._assets = g.assets?.report();
  return out;
});
const { _nodesEnd, _assets, ...readings } = res;
let bad = 0;
for (const [k, v] of Object.entries(readings)) { if (v.engine !== 'running') { bad++; console.log('engine not running', k, v.engine); } }
console.log(Object.keys(readings).length, 'runs;', bad, 'without a running engine; nodes at end', _nodesEnd);
console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(readings, null, 1));
await browser.close();
process.exit(errors.length ? 1 : 0);
