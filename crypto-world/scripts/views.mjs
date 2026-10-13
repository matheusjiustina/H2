// Renders named viewpoints: node scripts/views.mjs <outDir> [filter]
import { chromium } from 'playwright';
import fs from 'node:fs';

const [outDir = 'playtest-output', filter = ''] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const VIEWS = {
  city: `g.teleportTo('city', -4, -16, 20)`,
  square: `g.teleportTo('city', 4, -6, -20); g.cam.pitch = 0.55`,
  citynorth: `g.teleportTo('city', 3, 12, 0)`,
  hills: `g.teleportTo('hills', 0, -12, 0)`,
  cabin: `g.teleportTo('hills', -4, 2, -100)`,
  observatory: `g.teleportTo('hills', 6, 9, 45)`,
  memorial: `g.teleportTo('hills', -9, 8, -50)`,
  coast: `g.teleportTo('coast', -2, 3, 170)`,
  gallery: `g.teleportTo('coast', -8, 5, -20)`,
  pier: `g.teleportTo('coast', 3, -6, 168)`,
  mining: `g.teleportTo('mining', -20, -3, 90)`,
  farm: `g.teleportTo('mining', 6, -5, 170)`,
  heights: `g.teleportTo('heights', 0, -19, 0)`,
  plateau: `g.teleportTo('heights', 0, 3, 0)`,
  woods: `g.teleportTo('woods', 0, -14, 0)`,
  grotto: `g.teleportTo('woods', -4, -1, -30)`,
  south: `g.teleportTo('south', 1, -10, 0)`,
};
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(process.env.URL ?? 'http://localhost:5173/');
await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 120000 });
await page.evaluate(() => window.__game.skipTitle());
await page.waitForTimeout(1500);
for (const [name, code] of Object.entries(VIEWS)) {
  if (filter && !filter.split(',').includes(name)) continue;
  const info = await page.evaluate(`(() => { const g = window.__game; ${code}; g.simulate(1.2); return g.debugState(); })()`);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(name, JSON.stringify(info));
}
console.log(logs.filter((l) => !l.includes('vite')).slice(-20).join('\n'));
await browser.close();
