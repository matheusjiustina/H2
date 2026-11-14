// Cessna A188B AgTruck on the ground (parked, physics contacts): world-level orthographic side / front / rear / top views
// and the 3/4 low view players see at the pad. Usage: AGRO_URL=... node test/a188ground.mjs <outDir> [livery] [tag]
import { chromium } from 'playwright';
import fs from 'node:fs';
const outDir = process.argv[2] || 'a188-ground'; const livery = +(process.argv[3] ?? 1); const tag = process.argv[4] ?? 'now';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const W = 1280, H = 720;
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=high', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
await page.evaluate((livery) => {
  const g = window.__agro; g.frozen = true; g.noRender = true; g.menuAction('free'); g.screens.close();
  g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
  g.selectAircraft('a188'); g.setAircraftOption('a188Livery', livery);
  const st = document.createElement('style'); st.textContent = '.overlay, .hud, .loading, .touch { display: none !important; }'; document.head.appendChild(st);
}, livery);
const info = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft;
  ac.placeAtPad(); for (let i = 0; i < 240; i++) g.tick(1 / 60);
  const root = ac.model.root; root.updateMatrixWorld(true);
  const V3 = g.camera.position.constructor;
  const box = new (Object.getPrototypeOf(g.scene).constructor === Object ? Object : Object)();
  // world-space extents of the visible model
  let min = new V3(1e9, 1e9, 1e9), max = new V3(-1e9, -1e9, -1e9);
  root.traverse((o) => { if (!o.isMesh || !o.visible) return; let v = o; while (v) { if (!v.visible) return; v = v.parent; } const gp = o.geometry.attributes.position; if (!gp) return; const p = new V3(); for (let i = 0; i < gp.count; i += 7) { p.fromBufferAttribute(gp, i).applyMatrix4(o.matrixWorld); min.min(p); max.max(p); } });
  const fm = ac.fm; const gr = g.world.terrain.heightAt(fm.pos.x, fm.pos.z);
  window.__a = { c: fm.pos.clone(), ground: gr, hdg: fm.heading() };
  return { pitchDeg: +(Math.asin(new V3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(g.camera.quaternion.clone())).y) * 57.2958).toFixed(2), heightAboveGround: +(max.y - gr).toFixed(3), lowest: +(min.y - gr).toFixed(3), lenXZ: +Math.hypot(max.x - min.x, max.z - min.z).toFixed(2) };
});
console.log('ground', JSON.stringify(info));
const views = [['gside', 'side', 5.2], ['gfront', 'front', 4.2], ['grear', 'rear', 4.2], ['gtop', 'top', 9.0], ['g34', 'q34', 0]];
for (const [name, kind, ext] of views) {
  await page.evaluate(({ kind, ext }) => {
    const g = window.__agro, a = window.__a, cam = g.camera, V3 = cam.position.constructor;
    const f = g.scene.fog; if (f?.isFogExp2) f.density = 0; else if (f) { f.near = 1e5; f.far = 2e5; }
    const fwd = new V3(Math.sin(a.hdg), 0, Math.cos(a.hdg)), left = new V3(fwd.z, 0, -fwd.x);
    const t = new V3(a.c.x, a.ground + 1.25, a.c.z).addScaledVector(fwd, -1.8);
    const D = 400; let dir = left, up = new V3(0, 1, 0);
    if (kind === 'front') { dir = fwd; t.copy(a.c).setY(a.ground + 1.3); }
    if (kind === 'rear') { dir = fwd.clone().negate(); t.copy(a.c).setY(a.ground + 1.3); }
    if (kind === 'top') { dir = new V3(0, 1, 0); up = fwd; }
    g.cameraMode = 'free';
    if (kind === 'q34') {
      cam.position.copy(a.c).addScaledVector(left, 9).addScaledVector(fwd, 4).setY(a.ground + 1.6); cam.up.set(0, 1, 0); cam.lookAt(t); cam.near = 0.1; cam.far = 3000; cam.fov = 50;
    } else {
      cam.position.copy(t).addScaledVector(dir, D); cam.up.copy(up); cam.lookAt(t); cam.near = D - 30; cam.far = D + 30; cam.fov = (2 * Math.atan(ext / 2 / D) * 180) / Math.PI;
    }
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(); g.render();
  }, { kind, ext });
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${outDir}/${tag}_${name}.png` });
}
console.log('errors', errors);
await browser.close();
