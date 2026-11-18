// Dumps the foliage atlas and the canopy texture (look-dev).
//   node test/atlasdump.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'atlas-out';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.goto((process.env.AGRO_URL || 'http://localhost:4173/') + '?q=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });
const imgs = await page.evaluate(() => {
  const v = window.__agro.world.vegetation;
  const out = { atlas: v.atlas.image.toDataURL('image/png') };
  const cm = v.group.children.find((o) => o.name.startsWith('forestCanopy'));
  if (cm) out.canopy = cm.material.map.image.toDataURL('image/png');
  return out;
});
for (const [k, u] of Object.entries(imgs)) fs.writeFileSync(`${outDir}/${k}.png`, Buffer.from(u.split(',')[1], 'base64'));
await browser.close();
