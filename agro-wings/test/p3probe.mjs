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
    const meas = () => { r.info.reset?.(); g.render(); return [r.info.render.calls, r.info.render.triangles]; };
    meas();
    const total = meas();
    const parts = {};
    const kids = g.scene.children.slice();
    kids.forEach((c, i) => {
      if (!c.visible) return;
      c.visible = false;
      const m = meas();
      c.visible = true;
      const key = `${i}:${c.type}:${c.name || c.constructor.name}:${c.children?.length ?? 0}`;
      if (total[0] - m[0] > 0 || total[1] - m[1] > 0) parts[key] = [total[0] - m[0], total[1] - m[1]];
    });
    return { total, parts, sceneChildren: kids.length };
  }, v);
  console.log(name, JSON.stringify(res[name].total));
  for (const [k, p] of Object.entries(res[name].parts).sort((a, b) => b[1][0] - a[1][0]).slice(0, 12)) console.log('   ', k, p.join(' calls / '));
}
if (out) fs.writeFileSync(out, JSON.stringify(res, null, 1));
await browser.close();
