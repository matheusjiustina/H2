// Dialogue framing check: node scripts/talkshots.mjs <outDir> node,nova,luna (needs a running dev server).
import { chromium } from 'playwright';
const [out, ids] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/');
await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 180000 });
await page.evaluate(() => { localStorage.clear(); window.__game.skipTitle(); });
for (const id of ids.split(',')) {
  const info = await page.evaluate((id) => {
    const g = window.__game;
    const n = g.npcs.byId(id);
    // Approach from the first free direction, starting in front of the resident.
    const up = n.position.clone().normalize();
    let ok = false;
    const angles = [0, 70, -70, 100, -100, 140, -140, 180];
    for (let k = 0; k < angles.length && !ok; k++) {
      const f = n.facing.clone().applyAxisAngle(up, (angles[k] * Math.PI) / 180);
      const want = n.position.clone().addScaledVector(f, 1.9).normalize();
      g.player.teleport(want, f.clone().negate());
      g.simulate(0.15, 1 / 30);
      ok = g.player.dir.angleTo(want) * 70 < 0.25 && Math.abs(g.player.feet - g.world.groundHeight(g.player.dir)) < 0.3 &&
        !g.sightBlocked(g.player.visualPosition().addScaledVector(g.player.dir, 1.3), n.headPosition(), 0.3);
    }
    g.cam.reset(g.followTarget(0));
    g.lighting.resetFrame(g.player.dir);
    g.simulate(0.6, 1 / 30);
    g.input.press('interact');
    g.simulate(1.2, 1 / 30);
    return { mode: g.mode, npcFacingToPlayer: n.facing.dot(g.player.visualPosition().clone().sub(n.position).normalize()) };
  }, id);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/talk-${id}.png` });
  console.log(id, JSON.stringify(info));
  await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 80 && g.mode === 'dialogue'; i++) { g.input.press('skip'); g.simulate(0.1, 1/30); g.input.press('c1'); g.simulate(0.1, 1/30); } });
}
console.log(errs.join('\n'));
await browser.close();
