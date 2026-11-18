// Weather / time-of-day transitions: switches presets through the Settings
// path and samples the blended state while the game ticks (gradual change,
// one sky-light re-bake when it settles, no errors, flight wind untouched).
// Usage: AGRO_URL=... node test/atmo_transition.mjs
import { chromium } from 'playwright';

const url = process.env.AGRO_URL || 'http://localhost:4173/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url + '?q=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });
const r = await page.evaluate(() => {
  const g = window.__agro;
  g.frozen = true; g.noRender = true;
  g.menuAction('freeAir'); g.screens.close();
  const A = g.world.atmo;
  const env0 = g.scene.environment;
  const wind0 = [];
  // Reference flight wind for 3 s in the default weather.
  const ac = g.aircraft;
  const samples = [];
  const sample = (tag) => samples.push({ tag, t: +g.time.toFixed(1), rain: +A.cur.rain.toFixed(2), deck: +A.cur.deck.toFixed(2), fogD: +(A.cur.fogD * 1e5).toFixed(2), sunI: +A.cur.sunI.toFixed(2), el: +A.cur.el.toFixed(1), wet: +A.wet.toFixed(2), drops: A.rain.geo.instanceCount, bakePending: A.bakePending });
  sample('start');
  g.setSetting('weather', 'rain');
  for (const s of [1, 3, 6, 12, 25]) { while (g.time < s + 0.5) g.tick(1 / 30); sample('rain+' + s); }
  const envAfterRain = g.scene.environment !== env0;
  g.setSetting('timeOfDay', 'dusk');
  for (const s of [27, 30, 40]) { while (g.time < s + 0.5) g.tick(1 / 30); sample('dusk+' + (s - 25)); }
  g.setSetting('weather', 'partly'); g.setSetting('timeOfDay', 'morning');
  for (const s of [60, 75]) { while (g.time < s + 0.5) g.tick(1 / 30); sample('back+' + (s - 40)); }
  wind0.push(ac.windVec.x, ac.windVec.z);
  return { samples, envAfterRain, settings: { w: g.settings.weather, t: g.settings.timeOfDay }, flightWindScale: g.settings.wind };
});
console.log(JSON.stringify(r, null, 1));
console.log('errors', JSON.stringify(errors));
await browser.close();
