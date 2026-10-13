// Render statistics at representative viewpoints: node scripts/perfstats.mjs
// Note: headless Chromium uses a software rasteriser here, so frame times are not representative of a
// real GPU; draw calls, triangles and visible-object counts are.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(process.env.URL ?? 'http://localhost:5173/');
const t0 = Date.now();
await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 180000 });
const build = Date.now() - t0;
await page.evaluate(() => { localStorage.clear(); window.__game.skipTitle(); });
const views = [
  ['title orbit', null],
  ['city square', `g.teleportTo('city', 4, -6, -20)`],
  ['city north', `g.teleportTo('city', 3, 12, 0)`],
  ['hills', `g.teleportTo('hills', 0, -12, 0)`],
  ['coast pier', `g.teleportTo('coast', 3, -6, 168)`],
  ['mining', `g.teleportTo('mining', -20, -3, 90)`],
  ['heights', `g.teleportTo('heights', 0, -19, 0)`],
  ['woods', `g.teleportTo('woods', 0, -14, 0)`],
];
console.log(`world build (load → ready): ${(build / 1000).toFixed(1)} s`);
for (const [name, code] of views) {
  const r = await page.evaluate(`(() => { const g = window.__game;
    ${code ? code + '; g.simulate(0.5, 1/30);' : "g.mode = 'title'; g.simulate(0.2, 1/30);"}
    g.renderer.info.autoReset = false; g.renderer.info.reset();
    const t = performance.now(); g.renderer.render(g.scene, g.camera); const ms = performance.now() - t;
    const i = g.renderer.info; const out = { calls: i.render.calls, tris: i.render.triangles, visible: g.culler.visibleCount, total: g.culler.count, geos: i.memory.geometries, tex: i.memory.textures, cpuMs: +ms.toFixed(1) };
    g.renderer.info.autoReset = true; ${code ? '' : "g.mode = 'play';"} return out; })()`);
  console.log(`${name.padEnd(12)} draw calls ${String(r.calls).padStart(4)}  triangles ${String(Math.round(r.tris / 1000)).padStart(4)}k  culled-visible ${r.visible}/${r.total}  geometries ${r.geos}  textures ${r.tex}`);
}
const heap = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null));
console.log(`JS heap: ${heap} MB`);
await browser.close();
