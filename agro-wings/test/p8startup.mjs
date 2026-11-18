// Phase 8: start-up timing (page load → first frame, → menu action 'free' finished), N runs. Same viewport, same quality.
// Usage: AGRO_URL=... node test/p8startup.mjs [runs] [out.json]
import { chromium } from 'playwright';
import fs from 'node:fs';
const runs = +(process.argv[2] || 2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const rows = [];
for (let i = 0; i < runs; i++) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.setDefaultTimeout(600000);
  const t0 = Date.now(); await p.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=high', { waitUntil: 'load' });
  const tLoad = Date.now() - t0;
  await p.waitForFunction(() => window.__agro && window.__agro.frames > 2);
  const tFrame = Date.now() - t0;
  const start = await p.evaluate(() => { const g = window.__agro; const t = performance.now(); g.menuAction('free'); g.screens.close(); const ms = performance.now() - t; const m = performance.memory; return { startFlightMs: +ms.toFixed(0), heapMB: m ? +(m.usedJSHeapSize / 1048576).toFixed(0) : null }; });
  rows.push({ run: i + 1, loadEventMs: tLoad, firstFramesMs: tFrame, ...start });
  console.log(JSON.stringify(rows.at(-1)));
  await p.close();
}
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(rows));
await b.close();
