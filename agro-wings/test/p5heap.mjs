// Steady heap after forced GC right after boot (3 samples). Usage: AGRO_URL=... node test/p5heap.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc', '--enable-precise-memory-info'] });
const out = [];
for (let k = 0; k < 3; k++) {
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
  await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=high', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__agro && window.__agro.frames > 4, null, { timeout: 300000 });
  out.push(await page.evaluate(async () => { for (let i = 0; i < 4; i++) { gc(); await new Promise((r) => setTimeout(r, 200)); } const g = window.__agro; return { heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), veg: g.world.vegetation.stats?.().built, fine: g.world.terrainMesh.fineStats?.().built }; }));
  await page.close();
}
console.log(JSON.stringify(out));
await browser.close();
