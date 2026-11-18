// Phase 6: CPU profile of the game logic (g.tick, no rendering) per scenario; top self-time functions + ms per tick.
// Usage: AGRO_URL=... node test/p6prof.mjs [out.json]
import { chromium } from 'playwright';
import fs from 'node:fs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=high', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
await page.evaluate(async () => { const ex = await import('/src/game/expansions.js'); ex.setEntitlementSource(() => true); const g = window.__agro; g.frozen = true; g.noRender = true; g.menuAction('free'); g.screens.close(); });
const SC = {
  ipanemaChase: { id: 'ipanema', cam: 'chase', spray: false, x: -200, z: 470, agl: 150 },
  ipanemaSpray: { id: 'ipanema', cam: 'chase', spray: true, x: 300, z: -280, agl: 4 },
  b206Cockpit: { id: 'b206', cam: 'cockpit', spray: false, x: 300, z: -280, agl: 120 },
  at802Cockpit: { id: 'at802', cam: 'cockpit', spray: false, x: 300, z: -280, agl: 120 },
  r44Hover: { id: 'r44', cam: 'orbit', spray: false, x: 300, z: -280, agl: 40 },
};
const c = await page.context().newCDPSession(page);
const res = {};
for (const [name, s] of Object.entries(SC)) {
  await page.evaluate((s) => {
    const g = window.__agro; g.selectAircraft(s.id); g.menuAction('free'); g.screens.close();
    g.aircraft.placeAirborne(s.x, s.z, Math.PI / 2, s.agl, 46); g.cameraMode = s.cam; g.rig.setMode(s.cam, g.aircraft);
    if (s.spray) { g.aircraft.fm.hopper = 700; g.aircraft.fm.updateMass(); g.sprayer.on = true; }
    for (let i = 0; i < 120; i++) g.tick(1 / 60); // warm up (JIT)
  }, s);
  await c.send('Profiler.enable'); await c.send('Profiler.setSamplingInterval', { interval: 200 }); await c.send('Profiler.start');
  const ms = await page.evaluate(() => { const g = window.__agro; const t0 = performance.now(); for (let i = 0; i < 600; i++) { g.aircraft.placeAirborne?.call; g.tick(1 / 60); } return (performance.now() - t0) / 600; });
  const { profile } = await c.send('Profiler.stop');
  const self = new Map(); const dt = profile.timeDeltas; const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/').replace(/\?.*/, '')}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); });
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${(v / 600 / 1000).toFixed(3)}ms/tick ${k}`);
  res[name] = { msPerTick: +ms.toFixed(3), top };
  console.log(name, 'tick', ms.toFixed(3), 'ms\n  ' + top.join('\n  '));
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(res, null, 1));
await browser.close();
