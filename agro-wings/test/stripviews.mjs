// Views of the airstrips-expansion farms: close orbit at the pad, wide orbit,
// and a low approach view along each strip. Usage: node test/stripviews.mjs <outdir> [ids]
import { chromium } from 'playwright';
const out = process.argv[2];
const only = process.argv[3]?.split(',');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
const t0 = Date.now();
await page.goto('http://localhost:4173/?q=' + (process.env.Q || 'low'), { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 240000 });
console.log('load s', ((Date.now() - t0) / 1000).toFixed(1));
await page.evaluate(() => { localStorage.clear(); const g = window.__agro; g.career.tutorialDone = true; g.menuAction('free'); });
const ids = only ?? ['horizonte', 'doislagos', 'serradocedro', 'mataalta', 'ipeamarelo', 'valeverde', 'terravermelha', 'chapada'];
for (const id of ids) {
  const shot = async (name, fn) => {
    await page.evaluate(fn, id);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/${id}-${name}.png` });
  };
  await shot('pad', (id) => {
    const g = window.__agro;
    const site = g.sites.find((s) => s.id === id);
    g.service.setSite(site); g.aircraft.placeAtPad(site);
    g.simulate(1, 1 / 30);
    g.cameraMode = 'orbit'; g.rig.setMode('orbit', g.aircraft); g.rig.orbit.yaw = 2.4; g.rig.orbit.dist = 70; g.rig.orbit.pitch = 0.3;
    g.simulate(0.3, 1 / 30); g.tick(1 / 60); g.render();
  });
  await shot('wide', () => { const g = window.__agro; g.rig.orbit.dist = 520; g.rig.orbit.pitch = 0.42; g.rig.orbit.yaw = 2.0; g.simulate(0.3, 1 / 30); g.tick(1 / 60); g.render(); });
  // Final approach to runway 09 (from the west), 1.2 km out at ~70 m.
  await shot('final', (id) => {
    const g = window.__agro;
    const site = g.sites.find((s) => s.id === id), r = site.runway;
    const y = g.world.terrain.heightAt(r.x0 - 900, r.z);
    g.aircraft.placeAirborne(r.x0 - 900, r.z, Math.PI / 2, Math.max(60, site.y0 + 60 - y), 45);
    g.cameraMode = 'chase'; g.rig.setMode('chase', g.aircraft); g.rig.initialized = false;
    g.simulate(0.4, 1 / 60); g.tick(1 / 60); g.render();
  });
  console.log(id, await page.evaluate((id) => { const g = window.__agro; const s = g.sites.find((q) => q.id === id); return JSON.stringify({ y0: s.y0, site: g.site.id, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles }); }, id));
}
console.log('errors', errs.slice(0, 10));
await browser.close();
