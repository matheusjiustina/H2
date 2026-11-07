// Runs the in-game benchmark (src/core/bench.js) in headless Chromium and
// writes the JSON result. NOTE: in this container Chromium renders with
// SwiftShader (CPU), so frame times are NOT GPU figures — use the same
// script on a machine with a real GPU, or open  <url>?bench  on real PC and
// mobile devices (see the README section "Benchmark").
//   AGRO_URL=http://localhost:5173/ node test/bench.mjs <out.json> [quality] [seconds] [onlyScenarios,comma]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const out = process.argv[2] || 'bench-result.json';
const quality = process.argv[3] || 'high';
const dur = +(process.argv[4] || 10);
const only = process.argv[5] ? process.argv[5].split(',') : null;
const url = (process.env.AGRO_URL || 'http://localhost:5173/').replace(/\/?$/, '/');
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(0);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const t0 = Date.now();
await page.goto(`${url}?q=${quality}&bench&nopanel`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__bench, null, { timeout: 600000 });
const loadSeconds = (Date.now() - t0) / 1000;
const result = await page.evaluate((o) => window.__bench.run(o), { dur, only });
let rev = null; try { rev = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* no git */ }
result.build = rev;
result.loadSeconds = +loadSeconds.toFixed(1);
result.pageErrors = errors;
fs.writeFileSync(out, JSON.stringify(result, null, 1));
console.log('written', out, 'load', result.loadSeconds, 's, errors', errors.length);
for (const [k, s] of Object.entries(result.scenarios)) {
  if (s.error) { console.log(k.padEnd(10), s.error); continue; }
  console.log(k.padEnd(10), `avg ${s.frameMs.avg}ms p95 ${s.frameMs.p95} p99 ${s.frameMs.p99} | fps ${s.fps.avg} low1% ${s.fps.low1pct} | calls ${s.render.calls} tris ${s.render.triangles}`);
}
await browser.close();
