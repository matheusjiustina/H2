// Phase 3 verification: altitude sweep, terrain blocks on/off (must be pixel-identical),
// draw calls. Usage: AGRO_URL=... node test/p3verify.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] || 'p3v';
fs.mkdirSync(out, { recursive: true });
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(url + '?q=high', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });
await page.evaluate(() => {
  const g = window.__agro; g.frozen = true; g.noRender = true; g.menuAction('free'); g.screens.close();
  const st = document.createElement('style'); st.textContent = '.overlay,.hud,.loading{display:none!important}'; document.head.appendChild(st);
});
const ALTS = [4, 60, 250, 800, 1500, 2500, 4000, 6000];
const HDG = [Math.PI / 2, Math.PI];
for (const hdg of HDG) for (const agl of ALTS) {
  const tag = `h${hdg > 2 ? 'S' : 'E'}_a${agl}`;
  const info = await page.evaluate(({ agl, hdg }) => {
    const g = window.__agro;
    g.aircraft.placeAirborne(-1500, 200, hdg, agl, 46);
    g.cameraMode = 'chase'; g.rig.setMode('chase', g.aircraft);
    for (let i = 0; i < 40; i++) g.tick(1 / 60);
    for (let i = 0; i < 20; i++) g.world.update(g.camera, g.camera.position, 1 / 60, g.time);
    g.camera.updateMatrixWorld();
    g.render();
    const r = g.renderer;
    r.info.reset?.(); g.render();
    const T = g.world.terrainMesh;
    return { calls: r.info.render.calls, tris: r.info.render.triangles, blocksOn: T.blocks.filter((b) => b.mesh.visible).length, blocks: T.blocks.length, camY: +g.camera.position.y.toFixed(0) };
  }, { agl, hdg });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${out}/${tag}_blocks.png`, timeout: 180000 });
  const off = await page.evaluate(() => {
    const g = window.__agro, T = g.world.terrainMesh;
    window.__origUpdate = T.update; T.update = () => {};
    for (const b of T.blocks) b.mesh.visible = false;
    for (const o of T.group.children) if (o.isLOD) o.visible = true;
    g.render();
    const r = g.renderer; r.info.reset?.(); g.render();
    const calls = r.info.render.calls;
    return { calls };
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${out}/${tag}_noblocks.png`, timeout: 180000 });
  await page.evaluate(() => { window.__agro.world.terrainMesh.update = window.__origUpdate; });
  console.log(tag, JSON.stringify({ ...info, callsNoBlocks: off.calls }));
}
await browser.close();
