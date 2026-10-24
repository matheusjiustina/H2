import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
await page.goto('http://localhost:4173/?q=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });
await page.evaluate(() => { localStorage.clear(); const g = window.__agro; g.career.tutorialDone = true; g.menuAction('free'); });
for (const id of ['santarita', 'valedorio', 'serraazul']) {
  await page.evaluate((id) => {
    const g = window.__agro;
    const site = g.sites.find((s) => s.id === id);
    g.service.setSite(site); g.aircraft.placeAtPad(site);
    g.simulate(1, 1 / 30);
    g.cameraMode = 'orbit'; g.rig.setMode('orbit', g.aircraft); g.rig.orbit.yaw = 2.4; g.rig.orbit.dist = 60; g.rig.orbit.pitch = 0.35;
    g.simulate(0.3, 1 / 30); g.tick(1 / 60); g.render();
  }, id);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/farm-${id}.png` });
  await page.evaluate(() => { const g = window.__agro; g.rig.orbit.dist = 400; g.rig.orbit.pitch = 0.5; g.rig.orbit.yaw = 1.9; g.simulate(0.3, 1/30); g.tick(1/60); g.render(); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/farm-${id}-far.png` });
  console.log(id, await page.evaluate(() => { const g = window.__agro; return JSON.stringify({ pos: g.aircraft.fm.pos, site: g.site.id, inZone: g.service.inZone(), surf: g.world.terrain.surfaceAt(g.aircraft.fm.pos.x, g.aircraft.fm.pos.z) }); }));
}
console.log('errors', errs.slice(0, 10));
await browser.close();
