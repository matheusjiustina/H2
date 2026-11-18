// AT-802A / Fire Boss pilot's views with the game's own cockpit camera: on
// the ground at the runway threshold (default look, level look at the
// horizon, left and right side), taxiing/take-off roll look, and in low
// flight — the views the player gets.
//   AGRO_URL=http://localhost:5173/ node test/at802pilotview.mjs <outDir> [at802|at802f] [tag]
import { chromium } from 'playwright';
import fs from 'node:fs';
const outDir = process.argv[2] || 'at802-pilot';
const acId = process.argv[3] ?? 'at802';
const tag = process.argv[4] ?? 'now';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(600000);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=high', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
await page.evaluate(async (acId) => {
  const ex = await import('/src/game/expansions.js');
  ex.setEntitlementSource((id) => id === 'expansion.at802f-fireboss');
  const g = window.__agro; g.frozen = true; g.noRender = true; g.menuAction('free'); g.screens.close();
  g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
  g.selectAircraft(acId);
  const st = document.createElement('style'); st.textContent = '.overlay, .hud, .loading, .touch, .minimap { display: none !important; }'; document.head.appendChild(st);
}, acId);
// [name, placement, yaw, pitch (null = the type's default)]
const views = [
  ['ground', 'runway', 0, null], ['groundLevel', 'runway', 0, 0], ['groundLeft', 'runway', 1.25, -0.15], ['groundRight', 'runway', -1.25, -0.15],
  ['takeoff', 'runway', 0, -0.12], ['flight', 'air', 0, null], ['flightLevel', 'air', 0, -0.05],
];
let placed = null;
for (const [name, where, yaw, pitch] of views) {
  const info = await page.evaluate(({ where, yaw, pitch, again }) => {
    const g = window.__agro, ac = g.aircraft;
    if (!again) {
      if (where === 'runway') { ac.placeOnRunway('west'); for (let i = 0; i < 240; i++) g.tick(1 / 60); }
      else { ac.placeAirborne(300, -270, Math.PI / 2, 25, 55); for (let i = 0; i < 20; i++) g.tick(1 / 60); }
    }
    g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac);
    for (let i = 0; i < 2; i++) g.tick(1 / 60); // (the model switches its interior on in its update)
    const def = g.rig.look.pitch;
    g.rig.look.yaw = yaw; g.rig.look.pitch = pitch ?? def;
    for (let i = 0; i < 40; i++) g.rig.update(1 / 30, ac, { dx: 0, dy: 0, buttons: 0, wheel: 0 }, g.world.terrain);
    g.rig.look.yaw = yaw; g.rig.look.pitch = pitch ?? def;
    for (let i = 0; i < 4; i++) g.rig.update(1 / 30, ac, { dx: 0, dy: 0, buttons: 0, wheel: 0 }, g.world.terrain);
    ac.panel?.draw?.(ac.instruments());
    for (let i = 0; i < 10; i++) g.world.update(g.camera, g.camera.position, 1 / 60, g.time);
    g.render();
    const e = ac.model.root.worldToLocal(g.camera.position.clone());
    return { eye: [e.x, e.y, e.z].map((v) => +v.toFixed(3)), pitch: +g.rig.look.pitch.toFixed(3), fov: +g.camera.fov.toFixed(1), tris: g.renderer.info.render.triangles };
  }, { where, yaw, pitch, again: placed === where });
  placed = where;
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${outDir}/${tag}_${name}.png` });
  console.log(name, JSON.stringify(info));
}
console.log('errors', errors);
await browser.close();
