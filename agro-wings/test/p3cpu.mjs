// Phase 3 probe: draw calls / triangles per scene root child for fixed views.
// Usage: AGRO_URL=http://localhost:5173/ node test/p3probe.mjs [q=high] [out.json]
import { chromium } from 'playwright';
import fs from 'node:fs';
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const q = process.argv[2] || 'high';
const out = process.argv[3];
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(url + '?q=' + q, { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });
const VIEWS = {
  lowpass: { x: -200, z: 470, hdg: Math.PI / 2, agl: 4, mode: 'chase' },
  high: { x: 300, z: -280, hdg: Math.PI / 2, agl: 250, mode: 'chase' },
  cockpitLow: { x: -200, z: 470, hdg: Math.PI / 2, agl: 6, mode: 'cockpit' },
  strip: { strip: true },
};
const res = {};
await page.evaluate(() => { const g = window.__agro; g.frozen = true; g.noRender = true; g.menuAction('free'); g.screens.close(); });
for (const [name, v] of Object.entries(VIEWS)) {
  res[name] = await page.evaluate((v) => {
    const g = window.__agro;
    if (v.strip) {
      const s = g.sites.find((x) => x.id === 'mataalta') ?? g.sites.find((x) => !x.main) ?? g.sites[0];
      if (s !== g.site) g.service.setSite?.(s);
      g.aircraft.placeAirborne(s.runway.x0 - 600, s.runway.z, Math.PI / 2, 60, 45);
      g.cameraMode = 'chase'; g.rig.setMode('chase', g.aircraft);
    } else {
      g.aircraft.placeAirborne(v.x, v.z, v.hdg, v.agl, 46);
      g.cameraMode = v.mode; g.rig.setMode(v.mode, g.aircraft);
    }
    for (let i = 0; i < 40; i++) g.tick(1 / 60);
    for (let i = 0; i < 30; i++) g.world.update(g.camera, g.camera.position, 1 / 60, g.time);
    const r = g.renderer;
    const T = (fn, n) => { const t = performance.now(); for (let i = 0; i < n; i++) fn(); return +((performance.now() - t) / n).toFixed(3); };
    const cpu = {};
    cpu.worldUpdateMs = T(() => g.world.update(g.camera, g.camera.position, 1 / 60, g.time), 60);
    cpu.matrixWorldMs = T(() => g.scene.updateMatrixWorld(), 40);
    let nodes = 0; g.scene.traverse(() => nodes++);
    cpu.sceneNodes = nodes;
    r.info.reset?.(); g.render();
    const total = [r.info.render.calls, r.info.render.triangles];
    cpu.renderCallMs = T(() => g.render(), 3);
    const parts = {};
    return { total, cpu, parts, sceneChildren: g.scene.children.length };
  }, v);
  console.log(name, JSON.stringify(res[name]));
}
if (out) fs.writeFileSync(out, JSON.stringify(res, null, 1));
await browser.close();
