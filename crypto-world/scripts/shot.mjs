// Quick visual check: node scripts/shot.mjs <url> <out.png> [waitMs] [script-file-to-eval]
import { chromium } from 'playwright';
import fs from 'node:fs';

const [url = 'http://localhost:5173/', out = 'shot.png', waitMs = '4000', scriptFile] = process.argv.slice(2);
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(Number(waitMs));
if (scriptFile) {
  const code = fs.readFileSync(scriptFile, 'utf8');
  const res = await page.evaluate(code);
  if (res !== undefined) console.log('EVAL:', JSON.stringify(res));
}
await page.screenshot({ path: out });
console.log(logs.slice(-30).join('\n'));
await browser.close();
