// Air Tractor AT-802A parked on the ground (physics contacts, three-point
// attitude): world-level near-orthographic side / front / rear / top views,
// the cabin from the side, and three-quarter views from the front and the
// rear at eye height (on the runway, clear of the pad's props), the left
// side facing the camera with the nose to the right, as in the photographs.
//   AGRO_URL=http://localhost:5173/ node test/at802ground.mjs <outDir> [at802|at802f] [tag]
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'at802-ground';
const acId = process.argv[3] ?? 'at802';
const tag = process.argv[4] ?? 'now';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const W = 1280, H = 720;
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=high', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
await page.evaluate(async (acId) => {
  const ex = await import('/src/game/expansions.js');
  ex.setEntitlementSource((id) => id === 'expansion.at802f-fireboss');
  const g = window.__agro; g.frozen = true; g.noRender = true; g.menuAction('free'); g.screens.close();
  g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
  g.selectAircraft(acId);
  const st = document.createElement('style'); st.textContent = '.overlay, .hud, .loading, .touch { display: none !important; }'; document.head.appendChild(st);
}, acId);
const info = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft;
  ac.placeOnRunway('west'); for (let i = 0; i < 240; i++) g.tick(1 / 60);
  const root = ac.model.root; root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.isLOD) { o.autoUpdate = false; o.levels.forEach((l, i) => { l.object.visible = i === 0; }); } });
  const V3 = g.camera.position.constructor;
  const min = new V3(1e9, 1e9, 1e9), max = new V3(-1e9, -1e9, -1e9);
  root.traverse((o) => { if (!o.isMesh) return; let v = o; while (v) { if (!v.visible) return; v = v.parent; } const gp = o.geometry.attributes.position; if (!gp) return; const p = new V3(); for (let i = 0; i < gp.count; i += 5) { p.fromBufferAttribute(gp, i).applyMatrix4(o.matrixWorld); min.min(p); max.max(p); } });
  const fm = ac.fm; const gr = g.world.terrain.heightAt(fm.pos.x, fm.pos.z);
  window.__a = { c: fm.pos.clone(), ground: gr, hdg: fm.heading() };
  return { pitchDeg: +(Math.asin(new V3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(g.camera.quaternion.clone())).y) * 57.2958).toFixed(2), heightAboveGround: +(max.y - gr).toFixed(3), lowest: +(min.y - gr).toFixed(3), lenXZ: +Math.hypot(max.x - min.x, max.z - min.z).toFixed(2) };
});
console.log('ground', JSON.stringify(info));
// [name, kind, vertical extent m (orthographic) | 0 (perspective)]
const views = [['gside', 'side', 6.6], ['gfront', 'front', 5.0], ['grear', 'rear', 5.0], ['gtop', 'top', 12.0], ['gcab', 'cab', 3.2], ['g34f', 'q34f', 0], ['g34r', 'q34r', 0]];
for (const [name, kind, ext] of views) {
  await page.evaluate(({ kind, ext }) => {
    const g = window.__agro, a = window.__a, cam = g.camera, V3 = cam.position.constructor;
    g.aircraft.model.pilot && (g.aircraft.model.pilot.visible = true);
    const f = g.scene.fog; if (f?.isFogExp2) f.density = 0; else if (f) { f.near = 1e5; f.far = 2e5; }
    const fwd = new V3(Math.sin(a.hdg), 0, Math.cos(a.hdg)), left = new V3(fwd.z, 0, -fwd.x);
    const t = new V3(a.c.x, a.ground + 1.75, a.c.z).addScaledVector(fwd, -1.6);
    const D = 400; let dir = left.clone().negate(), up = new V3(0, 1, 0);
    if (kind === 'front') { dir = fwd; t.copy(a.c).setY(a.ground + 1.6); }
    if (kind === 'rear') { dir = fwd.clone().negate(); t.copy(a.c).setY(a.ground + 1.6); }
    if (kind === 'top') { dir = new V3(0, 1, 0); up = fwd; }
    if (kind === 'cab') { t.copy(a.c).addScaledVector(fwd, -1.7).setY(a.ground + 2.6); }
    g.cameraMode = 'free';
    if (kind === 'q34f' || kind === 'q34r') {
      const s = kind === 'q34f' ? 1 : -1;
      cam.position.copy(a.c).addScaledVector(left, -9.5).addScaledVector(fwd, s * 7.5).setY(a.ground + 2.2);
      cam.up.set(0, 1, 0); cam.lookAt(new V3(a.c.x, a.ground + 1.4, a.c.z).addScaledVector(fwd, -1.2)); cam.near = 0.1; cam.far = 3000; cam.fov = 50;
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
