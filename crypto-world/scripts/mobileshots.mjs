// Phone-landscape layout + desktop panels: node scripts/mobileshots.mjs <outDir>
import { chromium, devices } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
// Phone (landscape), then desktop panels.
const phone = await browser.newContext({ ...devices['iPhone 13 landscape'] });
const page = await phone.newPage();
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/');
await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/m-title.png` });
await page.tap('text=PLAY');
for (let i = 0; i < 6; i++) await page.evaluate(() => window.__game.simulate(0.75, 1 / 30));
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/m-play.png` });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/m-play.png` });
// Walk to Node and talk via the TALK button.
await page.evaluate(() => { const g = window.__game; const n = g.npcs.byId('node'); const f = n.facing.clone(); g.player.teleport(n.position.clone().addScaledVector(f, 1.8).normalize(), f.clone().negate()); g.cam.reset(g.followTarget(0)); g.simulate(0.4, 1/30); });
await page.waitForTimeout(500);
await page.tap('.tbtn.act');
await page.evaluate(() => window.__game.simulate(1.2, 1 / 30));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/m-dialogue.png` });
await phone.close();

const desk = await browser.newPage({ viewport: { width: 1280, height: 720 } });
desk.on('pageerror', (e) => errs.push(e.message));
await desk.goto('http://localhost:5173/');
await desk.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 180000 });
await desk.evaluate(() => { localStorage.clear(); window.__game.skipTitle(); window.__game.simulate(0.5, 1/30); });
await desk.keyboard.press('Escape');
await desk.waitForTimeout(1200);
await desk.screenshot({ path: `${out}/d-settings.png` });
await desk.keyboard.press('Escape');
await desk.waitForTimeout(500);
await desk.keyboard.press('KeyJ');
await desk.waitForTimeout(1200);
await desk.screenshot({ path: `${out}/d-journal.png` });
console.log(errs.join('\n') || 'no errors');
await browser.close();
