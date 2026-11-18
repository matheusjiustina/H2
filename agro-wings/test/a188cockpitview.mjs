// Cessna A188B AgTruck cockpit renders: the pilot's default view parked and in flight (16:9 and phone landscape),
// a look down at the panel, a look left/right, and a three-quarter view through the open door (like the photographs).
// Usage: AGRO_URL=... node test/a188cockpitview.mjs <outDir> [tag] [livery]
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] || 'a188-ck'; const tag = process.argv[3] || 'now'; const livery = +(process.argv[4] ?? 1);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
for (const [vw, vh, suffix] of [[1280, 720, ''], [844, 390, '_phone']]) {
  const p = await b.newPage({ viewport: { width: vw, height: vh } }); p.setDefaultTimeout(600000);
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=high', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
  await p.evaluate((livery) => { const g = window.__agro; g.frozen = true; g.noRender = true; g.menuAction('free'); g.screens.close(); g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear'); g.selectAircraft('a188'); g.setAircraftOption('a188Livery', livery);
    const st = document.createElement('style'); st.textContent = '.overlay,.hud,.loading,.touch{display:none!important}'; document.head.appendChild(st); }, livery);
  const shots = suffix ? [['default', 0, 0, 'ground']] : [['default', 0, 0, 'ground'], ['air', 0, 0, 'air'], ['down', 0, -0.35, 'ground'], ['left', 0.9, -0.15, 'ground'], ['right', -0.9, -0.15, 'ground'], ['door', 0, 0, 'door']];
  for (const [name, yaw, pitch, where] of shots) {
    const r = await p.evaluate(({ yaw, pitch, where }) => {
      const g = window.__agro, ac = g.aircraft;
      if (where === 'air') ac.placeAirborne(300, -280, Math.PI / 2, 60, 45); else ac.placeAtPad();
      for (let i = 0; i < 60; i++) g.tick(1 / 60);
      g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac);
      for (let i = 0; i < 30; i++) g.rig.update(1 / 30, ac, { dx: 0, dy: 0, buttons: 0, wheel: 0 }, g.world.terrain);
      if (yaw || pitch) { g.rig.look.yaw = yaw; g.rig.look.pitch = (ac.type.camera.cockpitPitch ?? 0) + pitch; for (let i = 0; i < 30; i++) g.rig.update(1 / 30, ac, { dx: 0, dy: 0, buttons: 0, wheel: 0 }, g.world.terrain); }
      if (where === 'door') {
        // From outside the open left door, looking in at the panel (as the cabin photographs).
        const cam = g.camera, V = cam.position.constructor, root = ac.model.root;
        root.updateMatrixWorld(true);
        cam.position.copy(root.localToWorld(new V(0.95, 0.75, -1.75))); cam.up.set(0, 1, 0); cam.lookAt(root.localToWorld(new V(0, 0.42, -1.15)));
        cam.fov = 55; cam.near = 0.05; cam.updateProjectionMatrix();
      }
      ac.panel.draw(ac.instruments());
      for (let i = 0; i < 6; i++) g.world.update(g.camera, g.camera.position, 1 / 60, g.time);
      g.camera.updateMatrixWorld(); g.render();
      return { fov: g.camera.fov, eye: g.camera.position.toArray().map((v) => +v.toFixed(2)) };
    }, { yaw, pitch, where });
    await p.waitForTimeout(80);
    await p.screenshot({ path: `${out}/${tag}_${name}${suffix}.png` });
    console.log(name + suffix, JSON.stringify(r));
  }
  await p.close();
}
console.log('errors', errors);
await b.close();
