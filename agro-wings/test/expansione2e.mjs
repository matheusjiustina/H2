// World Expansion 2.0 in the real game (browser): the new regions stream in
// and out with the camera (nothing built at start, everything released when
// far, no growth over repeated passes), their colliders answer, the strips
// and the water are drawn, the original farms' scenery is unchanged in
// counts, and no page error.
//   AGRO_URL=http://localhost:5173/ node test/expansione2e.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const outDir = process.argv[2] || 'expansion-e2e';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.setDefaultTimeout(900000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=high', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 400000 });
const results = {};
const ok = (k, v, info) => { results[k] = { pass: !!v, info }; console.log(v ? 'PASS' : 'FAIL', k, info ?? ''); };
await page.evaluate(() => {
  const g = window.__agro; g.frozen = true; g.menuAction('free'); g.screens.close();
  g.setSetting('weather', 'clear'); g.setSetting('timeOfDay', 'morning');
  const st = document.createElement('style'); st.textContent = '.overlay, .hud, .loading, .toast { display: none !important; }'; document.head.appendChild(st);
});

// 1. At the main base: no expansion region built (nothing loaded at start).
let r = await page.evaluate(() => {
  const g = window.__agro; g.aircraft.placeAtPad();
  for (let i = 0; i < 30; i++) g.tick(1 / 60);
  return g.world.expansion.stats();
});
ok('1 at the main base no new region is built (only data at start)', r.live === 0, JSON.stringify(r));

// 2. Fly a loop over the five regions twice: regions build near and release
// far; geometries / textures do not grow from the first loop to the second.
const loop = [[-2600, -4600], [-4800, 2600], [2600, 5200], [5000, 1500], [4700, -2700], [0, 0]];
const fly = () => page.evaluate((loop) => {
  const g = window.__agro, ac = g.aircraft, w = g.world, seen = {};
  for (const [x, z] of loop) {
    ac.placeAirborne(x, z, 0, 120, 50);
    g.cameraMode = 'chase'; g.rig.setMode('chase', ac);
    for (let i = 0; i < 90; i++) g.tick(1 / 30);
    for (let i = 0; i < 8; i++) w.update(g.camera, g.camera.position, 0.3, g.time);
    g.render();
    seen[`${x},${z}`] = w.expansion.stats().live;
  }
  window.gc?.();
  const m = g.renderer.info.memory;
  return { seen, geo: m.geometries, tex: m.textures, heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576), stats: w.expansion.stats() };
}, loop);
const a = await fly(), b = await fly(), c = await fly();
ok('2 regions stream in and out; no growth over repeated loops', Object.values(a.seen).slice(0, 5).every((n) => n >= 1) && a.seen['0,0'] === 0 && c.geo <= b.geo + 2 && c.tex <= b.tex,
  JSON.stringify({ first: a, second: { geo: b.geo, tex: b.tex, heapMB: b.heapMB }, third: { geo: c.geo, tex: c.tex, heapMB: c.heapMB, stats: c.stats } }));

// 3. Colliders: the sítio house, the radio mast; clear air above the strips.
r = await page.evaluate(async () => {
  const E = await import('/src/world/expansion.js');
  const w = window.__agro.world, T = w.terrain;
  const hit = (x, z, dy) => w.obstacleAt(x, T.heightAt(x, z) + dy, z);
  const strips = E.AUX_STRIPS.map((s) => {
    let blocked = 0;
    for (let u = -s.len / 2; u <= s.len / 2; u += 10) for (const dy of [0.5, 3, 8]) { const x = s.c[0] + u * s.ax, z = s.c[1] + u * s.az; if (hit(x, z, dy)) blocked++; }
    return [s.id, blocked];
  });
  return { house: hit(-3040, -4380, 2), mast: hit(5350, -3300, 30), strips };
});
ok('3 colliders: house and mast are obstacles, every strip and its air are clear', r.house === 'house' && r.mast === 'radio mast' && r.strips.every(([, n]) => n === 0), JSON.stringify(r));

// 4. Strips and water drawn: a strip ribbon per strip, the falls and pools.
r = await page.evaluate(() => {
  const g = window.__agro, w = g.world;
  w.expansion.buildAll();
  let ribbons = 0, falls = 0;
  w.expansion.group.traverse((o) => { if (o.isMesh && o.material?.map && o.renderOrder === 2) ribbons++; if (o.isMesh && o.renderOrder === 3) falls++; });
  const water = w.water.children.filter((o) => o.isMesh).length;
  return { ribbons, falls, water };
});
ok('4 six strip surfaces, two waterfalls (sheet + foam each), the original 13 water meshes plus the new lagoons and rivers merged into 3 (one per region with water)', r.ribbons === 6 && r.falls === 4 && r.water === 16, JSON.stringify(r));

// Shots of the new regions.
for (const [name, cam, at] of [['serra', [4420, 60, -3120], [4680, -3020]], ['cerrado', [-3400, 45, -4500], [-2700, -4660]], ['mata', [-4250, 40, 2620], [-4850, 2600]], ['varzea', [1900, 40, 5300], [2450, 5420]]]) {
  await page.evaluate(({ cam, at }) => {
    const g = window.__agro, T = g.world.terrain;
    g.cameraMode = 'free';
    g.camera.position.set(cam[0], T.heightAt(cam[0], cam[2]) + cam[1], cam[2]); g.camera.lookAt(at[0], T.heightAt(at[0], at[1]) + 5, at[1]);
    g.camera.fov = 55; g.camera.updateProjectionMatrix();
    for (let i = 0; i < 20; i++) g.world.update(g.camera, g.camera.position, 1 / 30, g.time);
    g.render();
  }, { cam, at });
  await page.screenshot({ path: `${outDir}/${name}.png` });
}

ok('no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 5)));
fs.writeFileSync(`${outDir}/results.json`, JSON.stringify(results, null, 1));
await browser.close();
