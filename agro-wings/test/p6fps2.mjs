// Phase 6: the simulation through the game's own pipeline must not depend on the rendered frame rate.
// Same start, same (empty) input, 20 s of flight at 144 / 60 / 30 / 15 fps: positions, speeds, rpm, fuel, hopper compared.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
page.setDefaultTimeout(900000);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
const res = await page.evaluate(async () => {
  const g = window.__agro; g.frozen = true; g.noRender = true;
  const ex = await import('/src/game/expansions.js'); ex.setEntitlementSource(() => true);
  g.career.tutorialDone = true;
  const out = {};
  for (const id of ['ipanema', 'at502', 'm18', 'r44', 'b206', 'at802']) {
    out[id] = [];
    for (const fps of [144, 60, 30, 15]) {
      g.selectAircraft(id); g.menuAction('freeAir'); g.screens.close();
      const ac = g.aircraft, fm = ac.fm;
      Math.random = (() => { let s = 7; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })();
      ac.placeAirborne(300, -280, Math.PI / 2, 300, ac.kind === 'heli' ? 30 : 48);
      fm.fuel = 120; fm.hopper = 300; fm.updateMass(); ac.simTime = 0; ac.acc = 0;
      let n = 0; const dt = 1 / fps;
      while (ac.simTime < 20 && n++ < 100000) g.tick(dt);
      out[id].push({ fps, simTime: +ac.simTime.toFixed(4), pos: [fm.pos.x, fm.pos.y, fm.pos.z].map((v) => +v.toFixed(3)), vel: [fm.vel.x, fm.vel.y, fm.vel.z].map((v) => +v.toFixed(3)), rpm: +fm.rpm.toFixed(2), fuel: +fm.fuel.toFixed(4), hopper: +fm.hopper.toFixed(3) });
    }
  }
  return out;
});
let worst = 0;
for (const [id, rows] of Object.entries(res)) {
  const b = rows[0];
  for (const r of rows) {
    // each run stops at the first whole frame after 20 s: bring the position back to t = 20 s along the velocity
    const corr = (q) => q.pos.map((v, i) => v - q.vel[i] * (q.simTime - 20));
    const cb = corr(b), cr = corr(r);
    const d = Math.max(...cr.map((v, i) => Math.abs(v - cb[i])));
    worst = Math.max(worst, d);
    console.log(id.padEnd(8), 'fps', String(r.fps).padStart(3), 'simT', r.simTime, 'pos', r.pos.join(','), 'rpm', r.rpm, 'fuel', r.fuel, '| diff vs 144 fps, both brought to t=20 s:', d.toFixed(3), 'm');
  }
}
console.log('worst position difference between frame rates', worst.toFixed(3), 'm over 20 s;', errors.length ? errors : 'no page errors');
await browser.close();
