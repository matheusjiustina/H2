// World look-dev: renders fixed world-space views (ground level, low passes,
// aerial) into <outDir>. Usage: node test/worldviews.mjs <outDir> [name,...]
// AGRO_URL selects the server (default dev server). Each view moves the
// camera, streams crops/vegetation around it, then renders once.
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'world-out';
const only = process.argv[3] ? process.argv[3].split(',') : null;
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const q = process.env.Q || 'high';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(url + '?q=' + q, { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });

// [name, { cam: [x,y,z] (y relative to ground unless abs), target, fov, plane }]
const views = [
  ['apron', { cam: [-330, 1.7, -44], target: [-372, 3, -100], fov: 60 }],
  ['service', { cam: [-338, 2.2, -58], target: [-365, 1.5, -80], fov: 55 }],
  ['vehicles', { cam: [-404, 2.0, -68], target: [-422, 1.2, -88], fov: 55 }],
  ['pickup', { cam: [-318, 1.7, -68], target: [-327, 0.9, -77], fov: 50 }],
  ['store', { cam: [-360, 2.0, -82], target: [-372, 0.8, -92], fov: 55 }],
  ['hqMachines', { cam: [-1110, 3, -350], target: [-1110, 2, -380], fov: 65 }],
  ['strip', { cam: [-396, 1.8, 3], target: [100, 0, 0], fov: 55 }],
  ['stripAir', { cam: [-1000, 70, 30], target: [-100, 0, -20], fov: 50 }],
  ['soyLow', { cam: [260, 4.5, -270], target: [520, 1.5, -300], fov: 60 }],
  ['soyEdge', { cam: [133, 1.7, -300], target: [180, 0.6, -180], fov: 60 }],
  ['cornLow', { cam: [-140, 6, 470], target: [100, 2, 480], fov: 60 }],
  ['cottonLow', { cam: [1240, 4.5, 30], target: [1460, 1, 0], fov: 60 }],
  ['forest', { cam: [-1540, 2, -600], target: [-1640, 8, -700], fov: 60 }],
  ['creek', { cam: [1560, 18, -380], target: [1650, 4, -150], fov: 55 }],
  ['hq', { cam: [-1120, 30, -130], target: [-1060, 4, -300], fov: 55 }],
  ['fieldAir', { cam: [250, 70, -60], target: [450, 0, -300], fov: 55 }],
  ['aerial120', { cam: [-150, 120, 300], target: [400, 0, -250], fov: 55 }],
  ['aerial400', { cam: [-900, 420, 900], target: [500, 0, -200], fov: 55 }],
  ['chaseSpray', { plane: { x: 300, z: -280, hdg: Math.PI / 2, agl: 4, mode: 'chase' } }],
  ['cockpitCorn', { plane: { x: -200, z: 470, hdg: Math.PI / 2, agl: 6, mode: 'cockpit' } }],
].filter(([n]) => !only || only.includes(n));

await page.evaluate(() => {
  const g = window.__agro;
  g.frozen = true; g.noRender = true;
  g.menuAction('free'); g.screens.close();
  const st = document.createElement('style');
  st.textContent = '.overlay, .hud, .loading { display: none !important; }';
  document.head.appendChild(st);
});
for (const [name, v] of views) {
  await page.evaluate((v) => {
    const g = window.__agro;
    const cam = g.camera;
    const T = g.world.terrain;
    if (v.plane) {
      g.aircraft.placeAirborne(v.plane.x, v.plane.z, v.plane.hdg, v.plane.agl, 46);
      g.cameraMode = v.plane.mode; g.rig.setMode(v.plane.mode, g.aircraft);
      for (let i = 0; i < 40; i++) g.tick(1 / 60);
      for (let i = 0; i < 60; i++) g.world.update(cam, g.aircraft.rPos, 1 / 60, g.time);
    } else {
      g.aircraft.placeAtPad();
      for (let i = 0; i < 3; i++) g.tick(1 / 60);
      const V = cam.position.constructor;
      const [x, y, z] = v.cam, [tx, ty, tz] = v.target;
      cam.position.set(x, T.heightAt(x, z) + y, z);
      cam.up.set(0, 1, 0);
      cam.lookAt(new V(tx, T.heightAt(tx, tz) + ty, tz));
      cam.fov = v.fov || 55;
      cam.near = 0.1;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      const focus = new V(x, T.heightAt(x, z), z);
      for (let i = 0; i < 60; i++) g.world.update(cam, focus, 1 / 60, g.time);
    }
    cam.updateMatrixWorld();
    g.render();
  }, v);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 180000 });
  const info = await page.evaluate(() => { const i = window.__agro.renderer.info.render; return { calls: i.calls, tris: i.triangles }; });
  console.log('shot', name, JSON.stringify(info));
}
await browser.close();
