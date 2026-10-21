// Expansion look-dev: water (açudes, lake, stream, bridges), field machinery
// and the worked ground, secondary farms from the air.
//   node test/expviews.mjs <outDir> [names,...]
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'exp-views';
const only = process.argv[3]?.split(',');
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.AGRO_URL || 'http://localhost:4173/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url + '?q=medium', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });
const views = [
  ['mataLow', { cam: [-1520, 38, -560], target: [-1800, 0, -650] }],
  ['mataEdge', { cam: [-1560, 2, -480], target: [-1640, 8, -520] }],
  ['mataHigh', { cam: [-1350, 260, -150], target: [-2000, 0, -700] }],
  ['cerrado', { cam: [-1900, 6, 500], target: [-2100, 3, 650] }],
  ['pondSede', { cam: [-700, 14, -350], target: [-800, 0, -420] }],
  ['lagoaSerra', { cam: [-2880, 30, 2620], target: [-3050, 0, 2770] }],
  ['creekBridge', { cam: [1590, 9, 175], target: [1648, 0, 140] }],
  ['valeStream', { cam: [3150, 35, 2330], target: [3250, 0, 2500] }],
  ['valeFarm', { cam: [3500, 160, 1950], target: [3000, 0, 2300] }],
  ['harrowT08', { unit: 0, off: [18, 6, 12] }],
  ['combineT16', { unit: 1, off: [-22, 9, 20] }],
  ['sprayerT13', { unit: 2, off: [25, 8, -15] }],
  ['aerialT16', { cam: [-1650, 260, 200], target: [-980, 0, 490] }],
  ['santaRitaAir', { cam: [-2500, 220, -700], target: [-3150, 0, -1050] }],
  ['serraAzulAir', { cam: [-2200, 200, 3250], target: [-2700, 0, 3600] }],
].filter(([n]) => !only || only.includes(n));
await page.evaluate(() => {
  const g = window.__agro;
  g.frozen = true; g.noRender = true;
  g.menuAction('free'); g.screens.close();
  const st = document.createElement('style');
  st.textContent = '.overlay, .hud, .loading { display: none !important; }';
  document.head.appendChild(st);
  g.time = 900; // the machines have worked a while
});
for (const [name, v] of views) {
  await page.evaluate((v) => {
    const g = window.__agro, cam = g.camera, T = g.world.terrain, V = cam.position.constructor;
    g.aircraft.placeAtPad();
    for (let i = 0; i < 3; i++) g.tick(1 / 60);
    let x, y, z, tx, ty, tz;
    if (v.unit !== undefined) {
      const u = g.world.activity.units[v.unit];
      cam.position.set(u.cx, 200, u.cz);
      g.world.update(cam, cam.position, 1 / 60, g.time);
      const p = u.model.root.position;
      [x, y, z] = [p.x + v.off[0], v.off[1], p.z + v.off[2]]; [tx, ty, tz] = [p.x, 1.5, p.z];
    } else { [x, y, z] = v.cam; [tx, ty, tz] = v.target; }
    cam.position.set(x, T.heightAt(x, z) + y, z);
    cam.up.set(0, 1, 0);
    cam.lookAt(new V(tx, T.heightAt(tx, tz) + ty, tz));
    cam.fov = 55; cam.near = 0.1; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = new V(x, T.heightAt(x, z), z);
    for (let i = 0; i < 60; i++) g.world.update(cam, focus, 1 / 60, g.time);
    cam.updateMatrixWorld();
    g.render();
  }, v);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 180000 });
  const info = await page.evaluate(() => { const i = window.__agro.renderer.info.render; return { calls: i.calls, tris: i.triangles }; });
  console.log('shot', name, JSON.stringify(info));
}
console.log('errors', JSON.stringify(errors));
await browser.close();
