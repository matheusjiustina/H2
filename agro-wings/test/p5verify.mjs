// Phase 5: streamed world vs everything resident, same page, same camera (pixel diff + noise floor A/A).
// Usage: AGRO_URL=... node test/p5verify.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] || 'p5v'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=high', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
await page.evaluate(() => { const g = window.__agro; g.frozen = true; g.noRender = true; g.menuAction('free'); g.screens.close(); const st = document.createElement('style'); st.textContent = '.overlay,.hud,.loading{display:none!important}'; document.head.appendChild(st); });
const VIEWS = { lowpass: [-200, 470, Math.PI / 2, 4], cruise: [300, -280, Math.PI / 2, 150], high: [-1500, 200, Math.PI, 1500], far: [2600, -2600, Math.PI / 2, 60] };
for (const [name, [x, z, hdg, agl]] of Object.entries(VIEWS)) {
  const r = await page.evaluate(({ x, z, hdg, agl }) => {
    const g = window.__agro, w = g.world;
    g.aircraft.placeAirborne(x, z, hdg, agl, 46); g.cameraMode = 'chase'; g.rig.setMode('chase', g.aircraft);
    for (let i = 0; i < 40; i++) g.tick(1 / 60);
    for (let i = 0; i < 30; i++) w.update(g.camera, g.camera.position, 1 / 60, g.time);
    g.camera.updateMatrixWorld();
    const before = { veg: w.vegetation.stats().built, fine: w.terrainMesh.fineStats().built, missingV: w.vegetation.missing(g.camera.position), missingT: w.terrainMesh.fineMissing(g.camera.position) };
    g.render();
    return before;
  }, { x, z, hdg, agl });
  await page.waitForTimeout(100); await page.screenshot({ path: `${out}/${name}_stream.png`, timeout: 180000 });
  await page.waitForTimeout(100); await page.screenshot({ path: `${out}/${name}_stream2.png`, timeout: 180000 });
  const all = await page.evaluate(() => {
    const g = window.__agro, w = g.world; w.streaming.enabled = false;
    for (const c of w.vegetation.cells) if (!c.built) w.vegetation.build(c);
    w.terrainMesh.stream([{ x: g.camera.position.x, y: g.camera.position.y, z: g.camera.position.z, extra: 1e7 }], { maxPrefetch: 0, keep: 1e9 });
    w.vegetation.update(g.camera); g.render();
    return { veg: w.vegetation.stats().built, fine: w.terrainMesh.fineStats().built };
  });
  await page.waitForTimeout(100); await page.screenshot({ path: `${out}/${name}_all.png`, timeout: 180000 });
  await page.evaluate(() => { window.__agro.world.streaming.enabled = true; });
  console.log(name, JSON.stringify(r), 'all-resident', JSON.stringify(all));
}
await browser.close();
