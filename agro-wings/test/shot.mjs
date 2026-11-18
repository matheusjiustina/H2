// Screenshot helper: node test/shot.mjs <url-query> <out.png> [waitMs] [w] [h]
import { chromium } from 'playwright';

const [, , query = '', out = 'shot.png', wait = '4000', w = '1280', h = '720'] = process.argv;
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url + (query ? '?' + query : ''), { waitUntil: 'load' });
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
const info = await page.evaluate(() => {
  const g = window.__agro;
  if (!g || !g.renderer) return null;
  const i = g.renderer.info;
  return { calls: i.render.calls, tris: i.render.triangles, frames: g.frames, time: g.time?.toFixed(1), depth: g.depthMode };
});
console.log(JSON.stringify(info));
for (const l of logs.slice(-25)) console.log(l);
await browser.close();
