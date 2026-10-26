// Switching aircraft from the menu after flying far away: every aircraft,
// started on the ground and in the air, must be drawn (it may have been
// hidden by the parked-aircraft distance cull while it waited), with its
// cockpit and pilot shown as the camera mode needs.
//   AGRO_URL=http://localhost:4173/ node test/fleetswitch.mjs
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.setDefaultTimeout(600000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.AGRO_URL || 'http://localhost:4173/') + '?q=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
const res = await page.evaluate(() => {
  const g = window.__agro;
  localStorage.clear(); g.career.resetAll(); g.career.tutorialDone = true;
  const ids = Object.keys(g.fleet);
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const out = [];
  for (const from of ids) for (const to of ids) {
    if (from === to) continue;
    for (const start of ['freeAir', 'free']) {
      // Fly `from` far from the base so the parked ones get culled.
      g.selectAircraft(from);
      g.menuAction('freeAir'); g.screens.close();
      g.aircraft.placeAirborne(2600, -2600, Math.PI / 2, 150, 50);
      for (let i = 0; i < 20; i++) g.frame ? g.tick(1 / 30) : 0;
      g.tick(1 / 30, false);
      // Back to the title, pick `to`, start.
      g.menuAction('title'); g.screens.close?.();
      g.selectAircraft(to);
      g.menuAction(start); g.screens.close();
      for (let i = 0; i < 5; i++) g.tick(1 / 30);
      const ac = g.aircraft;
      out.push({ from, to, start, root: shown(ac.model.root), id: ac.type.id === to });
    }
  }
  return out;
});
const bad = res.filter((r) => !r.root || !r.id);
console.log(`${res.length} switches, ${bad.length} with the flown aircraft hidden`, JSON.stringify(bad.slice(0, 6)));
console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
await browser.close();
process.exit(bad.length || errors.length ? 1 : 0);
