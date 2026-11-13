// The title screen with every aircraft selected (turboprops included): the
// aircraft idles on the pad behind the menu; no page error may appear.
//   node test/menuturbo.mjs
import { chromium } from 'playwright';
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(600000);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url + '?q=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
const ids = ['ipanema', 'at502', 'r44', 'm18', 'thrush', 'b206', 'e203', 'a188', 'pa36', 'agcat', 'e201', 'at401', 'at802', 'at802f'];
for (const id of ids) {
  await page.evaluate((id) => { const g = window.__agro; g.selectAircraft(id); g.menuAction('title'); for (let i = 0; i < 30; i++) g.tick(1 / 30); }, id);
  await page.waitForTimeout(300);
}
// Fly one and come back to the title (the path the player takes).
await page.evaluate(() => { const g = window.__agro; g.selectAircraft('at802'); g.menuAction('free'); for (let i = 0; i < 20; i++) g.tick(1 / 30); g.menuAction('title'); for (let i = 0; i < 30; i++) g.tick(1 / 30); });
await page.waitForTimeout(1000);
console.log(errors.length ? `FAIL page errors: ${errors.slice(0, 3).join(' | ')}` : 'PASS title screen with all 14 aircraft: no page errors');
await browser.close(); process.exit(errors.length ? 1 : 0);
