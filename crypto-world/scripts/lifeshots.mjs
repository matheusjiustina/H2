// Ambient life close-ups (critters, birds, fireflies): node scripts/lifeshots.mjs <outDir>
import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto('http://localhost:5173/');
await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 180000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/life-title.png` });
await page.evaluate(() => { localStorage.clear(); window.__game.skipTitle(); });
const views = {
  dog: `const d = g.life.critters[0]; const f = d.facing.clone(); g.player.teleport(d.dir.clone().addScaledVector(f, 3/70).normalize(), f.clone().negate()); g.cam.reset(g.followTarget(0)); g.simulate(2, 1/30); closeUp(d);`,
  dogpet: `const d = g.life.critters[0]; g.focus = { kind: 'object', it: g.life.interactables[0] }; g.activate(g.focus); g.simulate(0.4, 1/30); closeUp(d);`,
  cat: `const d = g.life.critters[1]; const f = d.facing.clone(); g.player.teleport(d.dir.clone().addScaledVector(f, 2.6/70).normalize(), f.clone().negate()); g.cam.reset(g.followTarget(0)); g.simulate(1, 1/30); closeUp(d);`,
  gulls: `g.teleportTo('coast', 2, -6, 168); g.cam.pitch = 0.05; g.simulate(1, 1/30);`,
  birdshills: `g.teleportTo('hills', -10, 2, 60); g.cam.pitch = 0.1; g.simulate(1, 1/30);`,
  fireflies: `g.lighting.time = 0.95; g.teleportTo('woods', 2, -6, 0); g.simulate(1.5, 1/30);`,
};
const closeUp = `const closeUp = (d) => { const up = d.dir.clone(); const side = new up.constructor().crossVectors(up, d.facing).normalize(); const p = d.dir.clone().multiplyScalar(70 + d.feet); const pos = p.clone().addScaledVector(side, 2.2).addScaledVector(d.facing, 1.2).addScaledVector(up, 1.0); g.cam.setSpecial({ position: pos, look: p.clone().addScaledVector(up, 0.35), up }, 50); g.simulate(0.2, 1/30); };`;
for (const [name, code] of Object.entries(views)) {
  await page.evaluate(`(() => { const g = window.__game; ${closeUp} g.cam.setSpecial(null, 50); ${code} })()`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/life-${name}.png` });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/life-${name}.png` });
}
console.log(errs.join('\n') || 'no errors');
await browser.close();
