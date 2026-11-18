// World optimisation (phase 3): WebGL context loss and restore with the
// world's shared buffers (terrain block views, shared tree instance
// matrices, grown crop-plant buffers). Same views rendered before the loss
// and after the restore must match; no page or WebGL errors.
//   AGRO_URL=http://localhost:5173/ node test/worldctx.mjs [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const out = process.argv[2] || 'worldctx';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errs = []; let glErr = 0;
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (/WebGL: INVALID|GL_INVALID|does not belong/.test(m.text())) glErr++; });
await page.goto(url + '?mem=high&q=high', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 400000 });
await page.evaluate(() => { const g = window.__agro; g.frozen = true; g.noRender = true; g.menuAction('free'); g.screens.close(); g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear'); });
const VIEWS = {
  lowpass: [-200, 470, Math.PI / 2, 4],
  high250: [300, -280, Math.PI / 2, 250],
  forest: [1500, 1500, 0, 40],
  far: [-1500, 200, Math.PI, 1500], // terrain blocks in use
};
// Pose and camera are fixed once per view; the same pose is drawn again after the restore.
const shoot = (name) => page.evaluate((name) => {
  const g = window.__agro, w = g.world, st = (window.__poses ||= {});
  if (!st[name]) {
    const [x, z, hdg, agl] = window.__VIEWS[name];
    g.aircraft.placeAirborne(x, z, hdg, agl, 46); g.cameraMode = 'chase'; g.rig.setMode('chase', g.aircraft);
    for (let i = 0; i < 40; i++) g.tick(1 / 60);
    st[name] = { p: g.camera.position.clone(), q: g.camera.quaternion.clone(), t: g.time };
  }
  const s = st[name];
  g.cameraMode = 'free'; g.camera.position.copy(s.p); g.camera.quaternion.copy(s.q); g.camera.updateMatrixWorld();
  // The world alone is compared (the flown aircraft is not moved back after the restore).
  g.aircraft.model.root.visible = false; if (g.aircraft.contactShadow) g.aircraft.contactShadow.visible = false;
  for (let i = 0; i < 30; i++) w.update(g.camera, g.camera.position, 1 / 60, s.t);
  g.render();
  const r = g.renderer; r.info.reset?.(); g.render();
  return { png: r.domElement.toDataURL('image/png'), calls: r.info.render.calls, tris: r.info.render.triangles, blocks: w.terrainMesh.blocks.filter((b) => b.mesh.visible).length };
}, name);
await page.evaluate((V) => { window.__VIEWS = V; }, VIEWS);
const res = {};
for (const n of Object.keys(VIEWS)) {
  const r = await shoot(n);
  fs.writeFileSync(`${out}/${n}_before.png`, Buffer.from(r.png.split(',')[1], 'base64'));
  res[n] = { before: { calls: r.calls, tris: r.tris, blocks: r.blocks } };
}
res.restore = await page.evaluate(async () => {
  const g = window.__agro, gl = g.renderer.getContext(), ext = gl.getExtension('WEBGL_lose_context');
  const r0 = g.assets?.stats.rebuilds ?? 0;
  ext.loseContext(); await new Promise((r) => setTimeout(r, 500));
  ext.restoreContext();
  for (let i = 0; i < 300 && !((g.assets?.stats.rebuilds ?? 1e9) >= r0 + Object.keys(g.fleet).length); i++) await new Promise((r) => setTimeout(r, 100));
  return { lost: gl.isContextLost(), restored: g.lifecycle?.stats?.restored };
});
for (const n of Object.keys(VIEWS)) {
  const r = await shoot(n);
  fs.writeFileSync(`${out}/${n}_after.png`, Buffer.from(r.png.split(',')[1], 'base64'));
  res[n].after = { calls: r.calls, tris: r.tris, blocks: r.blocks };
}
console.log(JSON.stringify({ ...res, errs, glErr }));
await browser.close();
