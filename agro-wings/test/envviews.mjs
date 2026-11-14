// Atmosphere look-dev: renders fixed views for each (time of day, weather)
// pair into <outDir>/<time>_<weather>_<view>.png.
// Usage: AGRO_URL=... node test/envviews.mjs <outDir> [times] [weathers] [views]
//   times/weathers/views: comma lists (default: all times x partly, + all weathers x morning).
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'env-out';
const list = (i, d) => (process.argv[i] ? process.argv[i].split(',') : d);
const times = list(3, null), weathers = list(4, null), viewsSel = list(5, null);
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.AGRO_URL || 'http://localhost:4173/';
const q = process.env.Q || 'medium';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.type(), m.text().slice(0, 300)); });
await page.goto(url + '?q=' + q, { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });

const VIEWS = {
  apron: { cam: [-330, 1.7, -44], target: [-372, 3, -100], fov: 60 },
  hangar: { cam: [-372, 1.8, -100], target: [-386, 2.5, -128], fov: 60 },
  hangarIn: { cam: [-378, 1.7, -121], target: [-390, 1.6, -134], fov: 70 },
  truckBay: { cam: [-318, 2.0, -88], target: [-334, 1.2, -98], fov: 55 },
  tractor: { follow: 'tractor' },
  field: { cam: [260, 4.5, -270], target: [520, 1.5, -300], fov: 60 },
  aerial: { cam: [-150, 120, 300], target: [400, 0, -250], fov: 55 },
  sunward: { cam: [-150, 60, 300], target: [600, 40, -500], fov: 60 },
  chase: { plane: { x: 300, z: -280, hdg: Math.PI / 2, agl: 4, mode: 'chase' } },
  cockpit: { plane: { x: -200, z: 470, hdg: Math.PI / 2, agl: 6, mode: 'cockpit' } },
  spray: { plane: { x: 300, z: -280, hdg: Math.PI / 2, agl: 3.5, mode: 'orbit', spray: true } },
};
const combos = [];
if (times || weathers) {
  for (const t of times || ['morning']) for (const w of weathers || ['partly']) combos.push([t, w]);
} else {
  for (const t of ['dawn', 'morning', 'noon', 'golden', 'dusk']) combos.push([t, 'partly']);
  for (const w of ['clear', 'overcast', 'rain', 'mist']) combos.push(['morning', w]);
}
const views = Object.entries(VIEWS).filter(([n]) => !viewsSel || viewsSel.includes(n));

await page.evaluate(() => {
  const g = window.__agro;
  g.frozen = true; g.noRender = true;
  g.menuAction('free'); g.screens.close();
  const st = document.createElement('style');
  st.textContent = '.overlay, .hud, .loading { display: none !important; }';
  document.head.appendChild(st);
});
for (const [t, w] of combos) {
  for (const [name, v] of views) {
    const ms = await page.evaluate(({ v, t, w }) => {
      const g = window.__agro;
      const t0 = performance.now();
      g.world.atmo?.set(t, w, true);
      g.world.structures.hangar?.update(30, { light: g.world.atmo?.cur.light ?? 1 });
      const bake = performance.now() - t0;
      const cam = g.camera;
      const T = g.world.terrain;
      if (v.follow) {
        const p = g.world.farm.pose(g.time);
        const V = cam.position.constructor;
        const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
        cam.position.set(p.x + fz * 14 + fx * 10, T.heightAt(p.x, p.z) + 4, p.z - fx * 14 + fz * 10);
        cam.up.set(0, 1, 0);
        cam.lookAt(new V(p.x, T.heightAt(p.x, p.z) + 1.2, p.z));
        cam.fov = 50; cam.near = 0.1; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
        for (let i = 0; i < 90; i++) { g.world.update(cam, cam.position, 1 / 60, g.time); g.dust.update(1 / 60, g.aircraft.windVec, (x, z) => T.heightAt(x, z)); }
      } else if (v.plane) {
        g.aircraft.placeAirborne(v.plane.x, v.plane.z, v.plane.hdg, v.plane.agl, 46 * (g.aircraft.A.assistSpeedScale ?? 1));
        g.cameraMode = v.plane.mode; g.rig.setMode(v.plane.mode, g.aircraft);
        if (v.plane.spray) {
          g.sprayer.on = true; g.aircraft.fm.hopper = 600;
          g.rig.orbit.yaw = -2.2; g.rig.orbit.pitch = 0.12; g.rig.orbit.dist = 26;
        }
        for (let i = 0; i < (v.plane.spray ? 150 : 40); i++) g.tick(1 / 60);
      } else {
        g.aircraft.placeAtPad();
        for (let i = 0; i < 3; i++) g.tick(1 / 60);
        const V = cam.position.constructor;
        const [x, y, z] = v.cam, [tx, ty, tz] = v.target;
        cam.position.set(x, T.heightAt(x, z) + y, z);
        cam.up.set(0, 1, 0);
        cam.lookAt(new V(tx, T.heightAt(tx, tz) + ty, tz));
        cam.fov = v.fov || 55; cam.near = 0.1; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
        const focus = new V(x, T.heightAt(x, z), z);
        for (let i = 0; i < 30; i++) g.world.update(cam, focus, 1 / 60, g.time);
      }
      cam.updateMatrixWorld();
      g.render();
      return bake;
    }, { v, t, w });
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${outDir}/${t}_${w}_${name}.png`, timeout: 180000 });
    const info = await page.evaluate(() => { const i = window.__agro.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, programs: i.programs.length }; });
    console.log('shot', t, w, name, JSON.stringify({ ...info, bakeMs: +ms.toFixed(1) }));
  }
}
await browser.close();
