// Art-direction check: renders a fixed set of viewpoints for side-by-side comparison.
// node scripts/artshots.mjs <outDir> [name,name]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out = 'playtest-output/art', filter = ''] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const VIEWS = {
  spawn: `g.teleportTo('city', -5, -13.6, -8)`,
  square: `g.teleportTo('city', 4, -6, -20)`,
  hills: `g.teleportTo('hills', 0, -12, 0)`,
  hillsview: `g.teleportTo('hills', -10, 2, 60)`,
  coast: `g.teleportTo('coast', -2, 3, 170)`,
  pier: `g.teleportTo('coast', 3, -6, 168)`,
  woods: `g.teleportTo('woods', 0, -14, 0)`,
  mining: `g.teleportTo('mining', -14, -6, 70)`,
  heights: `g.teleportTo('heights', 0, -19, 0)`,
  night: `g.lighting.time = 0.92; g.teleportTo('city', 3, -14, 0)`,
};
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto(process.env.URL ?? 'http://localhost:5173/');
await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 180000 });
await page.waitForTimeout(1500);
if (!filter || filter.includes('title')) await page.screenshot({ path: `${out}/title.png` });
await page.evaluate(() => { localStorage.clear(); window.__game.skipTitle(); window.__game.ui.showHud(false); });
for (const [name, code] of Object.entries(VIEWS)) {
  if (filter && !filter.split(',').includes(name)) continue;
  await page.evaluate(`(() => { const g = window.__game; g.lighting.time = 0.36; ${code}; g.simulate(1.0, 1/30); })()`);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/${name}.png` });
}
console.log(errs.join('\n') || 'no errors');
await browser.close();
